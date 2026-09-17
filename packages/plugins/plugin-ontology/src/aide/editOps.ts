/**
 * Edit-mode ops for the cockpit. The cockpit's "Edit schema" mode asks the
 * LLM to return a single JSON object describing proposed schema mutations —
 * inspired by DigitalStaff's `OntologyChatEditor.js` (which uses a 9-op enum
 * and a one-shot JSON-patch pattern, not a tool-calling loop).
 *
 * Flow:
 *   1. Worker streams tokens. Once `finalMessage` resolves we strip the JSON
 *      fence (`parseEditResponse`) and emit a single `edit_result` event.
 *   2. UI shows an EditCard with ops + confidence + warnings.
 *   3. On Apply, `applyOperations` resolves each op against the current
 *      `DescribeDomainResult` (so we know `key → nodeTypeId`) and produces
 *      a sequence of action calls. The UI then iterates and dispatches via
 *      `usePluginAction(...)`.
 *
 * Property-level ops (`addProperty | removeProperty | updateProperty`) don't
 * have their own CRUD action — we compute the new full `propertiesSchema`
 * via `propertiesSchemaFor` and emit a single `update-node-type` call.
 */
import type { DescribeDomainResult } from "@paperclipai/ontology-core/graph/GraphStore.js";

/* ------------------------------------------------------------------ */
/*  Op schema — what the LLM is asked to return                        */
/* ------------------------------------------------------------------ */

/** One of the nine ops defined by DigitalStaff's chat editor. We accept all
 *  nine for schema compatibility; `remove*` ops and relationType updates
 *  share the same apply path (a delete / update action call). */
export type EditOperation =
  | {
      op: "addNodeType";
      typeKey: string;
      displayName: string;
      description?: string;
      layer?: string;
      propertiesSchema?: Record<string, unknown>;
    }
  | {
      op: "updateNodeType";
      typeKey: string;
      displayName?: string;
      description?: string | null;
      layer?: string;
    }
  | { op: "removeNodeType"; typeKey: string }
  | {
      op: "addRelationType";
      typeKey: string;
      displayName: string;
      description?: string;
      sourceTypeKey?: string;
      targetTypeKey?: string;
      directed?: boolean;
      cardinality?: string;
    }
  | {
      op: "updateRelationType";
      typeKey: string;
      displayName?: string;
      description?: string | null;
      directed?: boolean;
      cardinality?: string;
    }
  | { op: "removeRelationType"; typeKey: string }
  | {
      op: "addProperty";
      typeKey: string;
      group?: "required" | "optional";
      property: { name: string; type: string; description?: string; format?: string; enum?: unknown[] };
    }
  | { op: "removeProperty"; typeKey: string; propertyName: string }
  | {
      op: "updateProperty";
      typeKey: string;
      propertyName: string;
      description?: string;
      type?: string;
      format?: string;
      enum?: unknown[];
    };

export interface CockpitEditResult {
  intent: string;
  operations: EditOperation[];
  summary: string;
  confidence: number;
  warnings: string[];
}

/** JSON-fence parse result — either the result, or a human-readable error.
 *  The UI surfaces the error string in the EditCard so the user knows
 *  whether to retry, rephrase, or report a bug. */
export type ParseEditResult =
  | { ok: true; result: CockpitEditResult }
  | { ok: false; error: string };

/** A mutation the UI should dispatch. We resolve keys → ids using the
 *  current `DescribeDomainResult` so the UI can call the actions directly
 *  without re-resolving. */
export type MutationCall =
  | { action: "create-node-type"; body: Record<string, unknown> }
  | { action: "update-node-type"; params: { nodeTypeId: string }; body: Record<string, unknown> }
  | { action: "delete-node-type"; params: { nodeTypeId: string }; body: Record<string, unknown> }
  | { action: "create-relation-type"; body: Record<string, unknown> }
  | { action: "update-relation-type"; params: { relationTypeId: string }; body: Record<string, unknown> }
  | { action: "delete-relation-type"; params: { relationTypeId: string }; body: Record<string, unknown> };

export interface ApplyOutcome {
  calls: MutationCall[];
  /** Ops that couldn't be resolved (key not found, etc.) — surfaced in
   *  the UI as warnings so the user sees what got skipped. */
  skipped: { op: EditOperation; reason: string }[];
}

/* ------------------------------------------------------------------ */
/*  JSON-fence parsing                                                 */
/* ------------------------------------------------------------------ */

/**
 * Strip the markdown code fence and parse the inner JSON. Mirrors DS's
 * `_parseLLMResponse` pattern (OntologyChatEditor.js:246-254). Three cases:
 *
 *   1. ` ```json { ... } ``` `  → strip the fence, parse.
 *   2. ` ```   { ... }   ``` ` → same, language tag optional.
 *   3. Raw JSON (no fence)     → try parsing directly.
 *
 * Returns `{ok: false, error}` on any failure — never throws.
 */
export function parseEditResponse(raw: string): ParseEditResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "LLM 返回为空" };
  }

  // Pull the first fenced block if present, otherwise fall through to raw.
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/u.exec(trimmed);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `JSON 解析失败:${message}` };
  }

  const validation = validateCockpitEdit(parsed);
  if (!validation.ok) return validation;
  return { ok: true, result: validation.result };
}

/* ------------------------------------------------------------------ */
/*  Validation — shape check                                           */
/* ------------------------------------------------------------------ */

interface ValidationOk { ok: true; result: CockpitEditResult }
interface ValidationErr { ok: false; error: string }

function validateCockpitEdit(value: unknown): ValidationOk | ValidationErr {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "返回内容不是 JSON 对象" };
  }
  const obj = value as Record<string, unknown>;
  if (typeof obj.intent !== "string") {
    return { ok: false, error: "缺少 intent 字段(string)" };
  }
  if (typeof obj.summary !== "string") {
    return { ok: false, error: "缺少 summary 字段(string)" };
  }
  if (!Array.isArray(obj.operations)) {
    return { ok: false, error: "operations 字段必须是数组" };
  }
  if (typeof obj.confidence !== "number") {
    return { ok: false, error: "confidence 字段必须是数字 (0..1)" };
  }
  if (obj.confidence < 0 || obj.confidence > 1) {
    return { ok: false, error: "confidence 超出 0..1 范围" };
  }
  if (obj.warnings != null && !Array.isArray(obj.warnings)) {
    return { ok: false, error: "warnings 字段必须是字符串数组" };
  }

  const ops: EditOperation[] = [];
  const seenOpIdx = new Set<number>();
  for (let i = 0; i < obj.operations.length; i++) {
    const raw = obj.operations[i];
    const parsed = parseOperation(raw);
    if (!parsed.ok) {
      return { ok: false, error: `operations[${i}]: ${parsed.error}` };
    }
    seenOpIdx.add(i);
    ops.push(parsed.op);
  }

  return {
    ok: true,
    result: {
      intent: obj.intent,
      operations: ops,
      summary: obj.summary,
      confidence: obj.confidence,
      warnings: Array.isArray(obj.warnings)
        ? (obj.warnings.filter((w) => typeof w === "string") as string[])
        : [],
    },
  };
}

function parseOperation(raw: unknown): { ok: true; op: EditOperation } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "不是对象" };
  }
  const obj = raw as Record<string, unknown>;
  const op = obj.op;
  if (typeof op !== "string") return { ok: false, error: "缺少 op 字段" };

  switch (op) {
    case "addNodeType":
      return parseAddNodeType(obj);
    case "updateNodeType":
      return parseUpdateNodeType(obj);
    case "removeNodeType":
      return parseRemoveType(obj, "typeKey", "removeNodeType");
    case "addRelationType":
      return parseAddRelationType(obj);
    case "updateRelationType":
      return parseUpdateRelationType(obj);
    case "removeRelationType":
      return parseRemoveType(obj, "typeKey", "removeRelationType");
    case "addProperty":
      return parseAddProperty(obj);
    case "removeProperty":
      return parseRemoveProperty(obj);
    case "updateProperty":
      return parseUpdateProperty(obj);
    default:
      return { ok: false, error: `未知 op: ${op}` };
  }
}

function reqString(obj: Record<string, unknown>, key: string, opName: string): { ok: true; value: string } | { ok: false; error: string } {
  const v = obj[key];
  if (typeof v !== "string" || v.length === 0) {
    return { ok: false, error: `${opName}: 缺少 ${key} (string)` };
  }
  return { ok: true, value: v };
}

function optString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" ? v : undefined;
}

function optBool(obj: Record<string, unknown>, key: string): boolean | undefined {
  const v = obj[key];
  return typeof v === "boolean" ? v : undefined;
}

function optRecord(obj: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const v = obj[key];
  if (v == null) return undefined;
  if (typeof v !== "object" || Array.isArray(v)) return undefined;
  return v as Record<string, unknown>;
}

function parseAddNodeType(obj: Record<string, unknown>): { ok: true; op: EditOperation } | { ok: false; error: string } {
  const k = reqString(obj, "typeKey", "addNodeType");
  if (!k.ok) return k;
  const d = reqString(obj, "displayName", "addNodeType");
  if (!d.ok) return d;
  const schema = optRecord(obj, "propertiesSchema");
  return {
    ok: true,
    op: {
      op: "addNodeType",
      typeKey: k.value,
      displayName: d.value,
      description: optString(obj, "description"),
      layer: optString(obj, "layer"),
      propertiesSchema: schema,
    },
  };
}

function parseUpdateNodeType(obj: Record<string, unknown>): { ok: true; op: EditOperation } | { ok: false; error: string } {
  const k = reqString(obj, "typeKey", "updateNodeType");
  if (!k.ok) return k;
  return {
    ok: true,
    op: {
      op: "updateNodeType",
      typeKey: k.value,
      displayName: optString(obj, "displayName"),
      description: obj.description == null
        ? null
        : typeof obj.description === "string"
          ? obj.description
          : undefined,
      layer: optString(obj, "layer"),
    },
  };
}

function parseRemoveType(
  obj: Record<string, unknown>,
  key: string,
  opName: "removeNodeType" | "removeRelationType",
): { ok: true; op: EditOperation } | { ok: false; error: string } {
  const k = reqString(obj, key, opName);
  if (!k.ok) return k;
  return { ok: true, op: { op: opName, typeKey: k.value } as EditOperation };
}

function parseAddRelationType(obj: Record<string, unknown>): { ok: true; op: EditOperation } | { ok: false; error: string } {
  const k = reqString(obj, "typeKey", "addRelationType");
  if (!k.ok) return k;
  const d = reqString(obj, "displayName", "addRelationType");
  if (!d.ok) return d;
  return {
    ok: true,
    op: {
      op: "addRelationType",
      typeKey: k.value,
      displayName: d.value,
      description: optString(obj, "description"),
      sourceTypeKey: optString(obj, "sourceTypeKey"),
      targetTypeKey: optString(obj, "targetTypeKey"),
      directed: optBool(obj, "directed"),
      cardinality: optString(obj, "cardinality"),
    },
  };
}

function parseUpdateRelationType(obj: Record<string, unknown>): { ok: true; op: EditOperation } | { ok: false; error: string } {
  const k = reqString(obj, "typeKey", "updateRelationType");
  if (!k.ok) return k;
  return {
    ok: true,
    op: {
      op: "updateRelationType",
      typeKey: k.value,
      displayName: optString(obj, "displayName"),
      description: obj.description == null
        ? null
        : typeof obj.description === "string"
          ? obj.description
          : undefined,
      directed: optBool(obj, "directed"),
      cardinality: optString(obj, "cardinality"),
    },
  };
}

function parseAddProperty(obj: Record<string, unknown>): { ok: true; op: EditOperation } | { ok: false; error: string } {
  const k = reqString(obj, "typeKey", "addProperty");
  if (!k.ok) return k;
  const propRaw = obj.property;
  if (!propRaw || typeof propRaw !== "object") {
    return { ok: false, error: "addProperty: 缺少 property 字段" };
  }
  const prop = propRaw as Record<string, unknown>;
  const name = reqString(prop, "name", "addProperty.property");
  if (!name.ok) return name;
  const type = reqString(prop, "type", "addProperty.property");
  if (!type.ok) return type;
  const property: {
    name: string;
    type: string;
    description?: string;
    format?: string;
    enum?: unknown[];
  } = {
    name: name.value,
    type: type.value,
    description: optString(prop, "description"),
    format: optString(prop, "format"),
    enum: Array.isArray(prop.enum) ? (prop.enum as unknown[]) : undefined,
  };
  const group = obj.group === "required" || obj.group === "optional" ? obj.group : undefined;
  return { ok: true, op: { op: "addProperty", typeKey: k.value, group, property } };
}

function parseRemoveProperty(obj: Record<string, unknown>): { ok: true; op: EditOperation } | { ok: false; error: string } {
  const k = reqString(obj, "typeKey", "removeProperty");
  if (!k.ok) return k;
  const p = reqString(obj, "propertyName", "removeProperty");
  if (!p.ok) return p;
  return { ok: true, op: { op: "removeProperty", typeKey: k.value, propertyName: p.value } };
}

function parseUpdateProperty(obj: Record<string, unknown>): { ok: true; op: EditOperation } | { ok: false; error: string } {
  const k = reqString(obj, "typeKey", "updateProperty");
  if (!k.ok) return k;
  const p = reqString(obj, "propertyName", "updateProperty");
  if (!p.ok) return p;
  return {
    ok: true,
    op: {
      op: "updateProperty",
      typeKey: k.value,
      propertyName: p.value,
      description: optString(obj, "description"),
      type: optString(obj, "type"),
      format: optString(obj, "format"),
      enum: Array.isArray(obj.enum) ? (obj.enum as unknown[]) : undefined,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  propertiesSchema computation                                       */
/* ------------------------------------------------------------------ */

/** Compute the merged `propertiesSchema` after applying add/remove/update
 *  property ops to a single nodeType. Used to collapse property-level
 *  ops into one `update-node-type` call so we don't need a per-property
 *  CRUD action. */
export function propertiesSchemaFor(
  ops: Extract<EditOperation, { op: "addProperty" | "removeProperty" | "updateProperty" }>[],
  currentSchema: Record<string, unknown> | null,
): Record<string, unknown> {
  // Shallow clone so we don't mutate the caller's reference. The LLM's
  // schemas are tiny (≤20 keys per type) so a plain Object.assign is fine.
  const next: Record<string, unknown> = currentSchema ? { ...currentSchema } : {};

  for (const op of ops) {
    switch (op.op) {
      case "addProperty": {
        // The `group` field is informational — we don't preserve the
        // required/optional split in storage; everything lives as one
        // flat dict. Still record it in the property's metadata if asked.
        const prop: Record<string, unknown> = { type: op.property.type };
        if (op.property.format) prop.format = op.property.format;
        if (op.property.description) prop.description = op.property.description;
        if (op.property.enum) prop.enum = op.property.enum;
        if (op.group) prop.group = op.group;
        next[op.property.name] = prop;
        break;
      }
      case "removeProperty": {
        delete next[op.propertyName];
        break;
      }
      case "updateProperty": {
        const existing = next[op.propertyName];
        const cur = existing && typeof existing === "object"
          ? { ...(existing as Record<string, unknown>) }
          : {} as Record<string, unknown>;
        if (op.type != null) cur.type = op.type;
        if (op.format != null) cur.format = op.format;
        if (op.description != null) cur.description = op.description;
        if (op.enum != null) cur.enum = op.enum;
        next[op.propertyName] = cur;
        break;
      }
    }
  }
  return next;
}

/* ------------------------------------------------------------------ */
/*  Apply — convert ops to action calls                                */
/* ------------------------------------------------------------------ */

/**
 * Resolve each op against the current domain snapshot and produce the
 * sequence of action calls the UI should dispatch via `usePluginAction`.
 *
 * Op resolution rules:
 *
 *   - `addNodeType` → `create-node-type` body. If a node-type with the
 *     same `typeKey` already exists, we surface it as skipped (UI shows
 *     the reason) so the user knows the LLM tried to overwrite.
 *   - `updateNodeType` / property ops / `removeNodeType` → look up by
 *     `typeKey`. If not found, skipped.
 *   - `addRelationType` / `updateRelationType` / `removeRelationType` →
 *     same pattern for relation types.
 *   - Property ops targeting the same nodeType collapse into a single
 *     `update-node-type` call with the merged `propertiesSchema`.
 */
export function applyOperations(
  operations: EditOperation[],
  snapshot: DescribeDomainResult,
  domainId: string,
): ApplyOutcome {
  const calls: MutationCall[] = [];
  const skipped: { op: EditOperation; reason: string }[] = [];

  // Bucket property ops per nodeType so we collapse them into one call.
  const propsByTypeKey = new Map<
    string,
    Extract<EditOperation, { op: "addProperty" | "removeProperty" | "updateProperty" }>[]
  >();

  for (const op of operations) {
    switch (op.op) {
      case "addNodeType": {
        const exists = snapshot.nodeTypes.some((n) => n.key === op.typeKey);
        if (exists) {
          skipped.push({ op, reason: `对象类型 ${op.typeKey} 已存在,请用 updateNodeType` });
          break;
        }
        calls.push({
          action: "create-node-type",
          body: {
            domainId,
            key: op.typeKey,
            displayName: op.displayName,
            description: op.description ?? null,
            propertiesSchema: op.propertiesSchema ?? {},
          },
        });
        break;
      }

      case "updateNodeType": {
        const found = snapshot.nodeTypes.find((n) => n.key === op.typeKey);
        if (!found) {
          skipped.push({ op, reason: `对象类型 ${op.typeKey} 不存在` });
          break;
        }
        // We only forward fields the LLM explicitly set; `updateNodeType`
        // treats undefined as "leave alone".
        const body: Record<string, unknown> = {};
        if (op.displayName != null) body.displayName = op.displayName;
        if (op.description !== undefined) body.description = op.description;
        calls.push({
          action: "update-node-type",
          params: { nodeTypeId: found.id },
          body,
        });
        break;
      }

      case "removeNodeType": {
        const found = snapshot.nodeTypes.find((n) => n.key === op.typeKey);
        if (!found) {
          skipped.push({ op, reason: `对象类型 ${op.typeKey} 不存在` });
          break;
        }
        calls.push({
          action: "delete-node-type",
          params: { nodeTypeId: found.id },
          body: {},
        });
        break;
      }

      case "addRelationType": {
        const exists = snapshot.relationTypes.some((r) => r.key === op.typeKey);
        if (exists) {
          skipped.push({ op, reason: `关系类型 ${op.typeKey} 已存在` });
          break;
        }
        const body: Record<string, unknown> = {
          domainId,
          key: op.typeKey,
          displayName: op.displayName,
          description: op.description ?? null,
        };
        if (op.directed != null) body.directed = op.directed;
        if (op.cardinality != null) body.cardinality = op.cardinality;
        calls.push({ action: "create-relation-type", body });
        break;
      }

      case "updateRelationType": {
        const found = snapshot.relationTypes.find((r) => r.key === op.typeKey);
        if (!found) {
          skipped.push({ op, reason: `关系类型 ${op.typeKey} 不存在` });
          break;
        }
        const body: Record<string, unknown> = {};
        if (op.displayName != null) body.displayName = op.displayName;
        if (op.description !== undefined) body.description = op.description;
        if (op.directed != null) body.directed = op.directed;
        if (op.cardinality != null) body.cardinality = op.cardinality;
        calls.push({
          action: "update-relation-type",
          params: { relationTypeId: found.id },
          body,
        });
        break;
      }

      case "removeRelationType": {
        const found = snapshot.relationTypes.find((r) => r.key === op.typeKey);
        if (!found) {
          skipped.push({ op, reason: `关系类型 ${op.typeKey} 不存在` });
          break;
        }
        calls.push({
          action: "delete-relation-type",
          params: { relationTypeId: found.id },
          body: {},
        });
        break;
      }

      case "addProperty":
      case "removeProperty":
      case "updateProperty": {
        const list = propsByTypeKey.get(op.typeKey) ?? [];
        list.push(op);
        propsByTypeKey.set(op.typeKey, list);
        break;
      }
    }
  }

  // Flush property ops as collapsed `update-node-type` calls. The merge
  // applies ops in order so a `removeProperty("foo")` followed by an
  // `addProperty({name:"foo",...})` correctly replaces the property.
  for (const [typeKey, propOps] of propsByTypeKey) {
    const found = snapshot.nodeTypes.find((n) => n.key === typeKey);
    if (!found) {
      for (const op of propOps) {
        skipped.push({ op, reason: `对象类型 ${typeKey} 不存在` });
      }
      continue;
    }
    const mergedSchema = propertiesSchemaFor(propOps, found.propertiesSchema);
    calls.push({
      action: "update-node-type",
      params: { nodeTypeId: found.id },
      body: { propertiesSchema: mergedSchema },
    });
  }

  return { calls, skipped };
}

/* ------------------------------------------------------------------ */
/*  System prompt suffix — appended in edit mode                       */
/* ------------------------------------------------------------------ */
/*  affectedKeys — for diff coloring in the schema preview pane       */
/* ------------------------------------------------------------------ */

/** Diff kinds the preview pane can paint. Matches the three DS uses
 *  (add / remove / update); each maps to a Tailwind color family. */
export type AffectedKind = "add" | "remove" | "update";

/** A single row the preview pane will color. The `kind` decides the
 *  color, the `target` carries enough identifier to look up the row
 *  in the DescribeDomainResult snapshot. */
export type AffectedKey =
  | { kind: AffectedKind; target: "nodeType"; typeKey: string }
  | { kind: AffectedKind; target: "relationType"; typeKey: string }
  | { kind: AffectedKind; target: "property"; typeKey: string; propertyName: string };

/**
 * Project an op list onto the rows the schema tree will visibly touch.
 *
 * Per-row kind rules (matches the visual story the EditCard apply flow
 * tells the user):
 *
 *   - `addNodeType`          → nodeType add
 *   - `updateNodeType`       → nodeType update
 *   - `removeNodeType`       → nodeType remove
 *   - `addRelationType`      → relationType add
 *   - `updateRelationType`   → relationType update
 *   - `removeRelationType`   → relationType remove
 *   - `addProperty`          → nodeType update + property add
 *   - `removeProperty`       → nodeType update + property remove
 *   - `updateProperty`       → nodeType update + property update
 *
 * Property ops always tag the parent nodeType as `update` because the
 * apply path is "compute new full propertiesSchema → update-node-type
 * with the merged schema" — the whole schema gets rewritten, so the
 * row band is the update color, not the property's individual color.
 * The inner property line still gets its own add/remove/update color.
 *
 * Multiple ops targeting the same row collapse into one entry; the
 * latest kind wins (so `addProperty` then `removeProperty` for the
 * same field yields a single remove). Callers don't need the full
 * ordering — they just need "is this row colored, and how".
 */
export function affectedKeys(operations: EditOperation[]): AffectedKey[] {
  // Use a Map keyed by `${target}:${typeKey}[:${propertyName}]` so we
  // collapse repeats and keep the latest kind for each row.
  const map = new Map<string, AffectedKey>();
  const set = (key: string, value: AffectedKey) => {
    map.set(key, value);
  };
  for (const op of operations) {
    switch (op.op) {
      case "addNodeType":
        set(`nodeType:${op.typeKey}`, { kind: "add", target: "nodeType", typeKey: op.typeKey });
        break;
      case "updateNodeType":
        set(`nodeType:${op.typeKey}`, { kind: "update", target: "nodeType", typeKey: op.typeKey });
        break;
      case "removeNodeType":
        set(`nodeType:${op.typeKey}`, { kind: "remove", target: "nodeType", typeKey: op.typeKey });
        break;
      case "addRelationType":
        set(`relationType:${op.typeKey}`, { kind: "add", target: "relationType", typeKey: op.typeKey });
        break;
      case "updateRelationType":
        set(`relationType:${op.typeKey}`, { kind: "update", target: "relationType", typeKey: op.typeKey });
        break;
      case "removeRelationType":
        set(`relationType:${op.typeKey}`, { kind: "remove", target: "relationType", typeKey: op.typeKey });
        break;
      case "addProperty":
        set(`nodeType:${op.typeKey}`, { kind: "update", target: "nodeType", typeKey: op.typeKey });
        set(
          `property:${op.typeKey}:${op.property.name}`,
          { kind: "add", target: "property", typeKey: op.typeKey, propertyName: op.property.name },
        );
        break;
      case "removeProperty":
        set(`nodeType:${op.typeKey}`, { kind: "update", target: "nodeType", typeKey: op.typeKey });
        set(
          `property:${op.typeKey}:${op.propertyName}`,
          { kind: "remove", target: "property", typeKey: op.typeKey, propertyName: op.propertyName },
        );
        break;
      case "updateProperty":
        set(`nodeType:${op.typeKey}`, { kind: "update", target: "nodeType", typeKey: op.typeKey });
        set(
          `property:${op.typeKey}:${op.propertyName}`,
          { kind: "update", target: "property", typeKey: op.typeKey, propertyName: op.propertyName },
        );
        break;
    }
  }
  return Array.from(map.values());
}

/** Convenience: count the affected rows by kind. Used by the pane's
 *  DiffSummary header (mirrors DS's "+N / ~N / −N" counter). */
export function affectedCounts(operations: EditOperation[]): {
  add: number;
  update: number;
  remove: number;
} {
  const list = affectedKeys(operations);
  let add = 0, update = 0, remove = 0;
  for (const k of list) {
    if (k.kind === "add") add++;
    else if (k.kind === "remove") remove++;
    else update++;
  }
  return { add, update, remove };
}

/* ------------------------------------------------------------------ */

/** Append this to the regular aide system prompt when `mode === "edit"`.
 *  Tells the LLM to return a single JSON object (no markdown prose) with
 *  the 9-op enum and the fixed schema. Mirrors DS's `OntologyChatEditor`
 *  prompt fragment (OntologyChatEditor.js:25-66). */
export const EDIT_SYSTEM_PROMPT_SUFFIX = `

你正在「驾驶舱 · 编辑模式」。用户希望你按下面的 JSON schema 直接编辑当前域的 schema,而不是回答问题。

返回规则(严格遵守):
1. 整个回复只输出一个 JSON 对象,前后不要包 markdown 围栏 (\`\`\`),不要解释、不要补充说明。
2. 顶层字段:
   - "intent" (string): 用户请求的一句话概述 (中文)
   - "operations" (array): 1..N 个操作,按依赖顺序排列
   - "summary" (string): 一句话中文摘要,告诉用户改了什么
   - "confidence" (number): 0..1,你对这组操作是否反映用户真实意图的把握
   - "warnings" (array of string,可选):潜在风险,例如"会删除已有数据"
3. 每个 operation 必须有 "op" 字段,取值只能是以下九个之一:
   - "addNodeType":新建对象类型。必填 typeKey, displayName;可选 description, layer, propertiesSchema (object)。
   - "updateNodeType":修改已有对象类型。必填 typeKey;可选 displayName, description (string 或 null 表示清空), layer。
   - "removeNodeType":删除对象类型。必填 typeKey。
   - "addRelationType":新建关系类型。必填 typeKey, displayName;可选 description, sourceTypeKey, targetTypeKey, directed (bool), cardinality。
   - "updateRelationType":修改已有关系类型。必填 typeKey;可选 displayName, description, directed, cardinality。
   - "removeRelationType":删除关系类型。必填 typeKey。
   - "addProperty":给已有对象类型加字段。必填 typeKey, property: { name, type } (可选 description, format, enum, group)。
   - "removeProperty":删除已有字段。必填 typeKey, propertyName。
   - "updateProperty":修改已有字段定义。必填 typeKey, propertyName;可选 type, format, description, enum。
4. typeKey 只能用小写字母、数字、下划线、短横线,且在本域内唯一。
5. 如果用户的需求不明确或与 schema 无关,返回 confidence < 0.5,operations 为空数组,warnings 解释原因。
6. property 的 type 取值 (JSON Schema 子集): "string" | "number" | "integer" | "boolean" | "array" | "object"。
7. 不要发明 schema 中没有的概念。如果本域没有合适的对象类型承接用户的想法,在 warnings 里说,而不是凭空 addNodeType。`;