/**
 * Snapshot helpers for the cockpit edit-mode history drawer.
 *
 * A snapshot is a frozen copy of the schema shape `DescribeDomainResult`
 * returns — `nodeTypes`, `relationTypes`, `actionTypes`. We store it as
 * JSONB in the DB so we never have to join against live tables, and the
 * restore path can read it back without round-tripping through the
 * graph store.
 *
 * Two pure helpers exposed:
 *   - `serializeDomain(domain)` → storable JSON (deep-clones the three
 *      entity arrays, drops the `domain` / `counts` / `businessSystems`
 *      / `subProjects` / `recentNodes` envelope — the restore path does
 *      not need them).
 *   - `diffDomain(prev, next)` → flat list of `SchemaDiffEntry` rows
 *      keyed by entity + property. Used both by the snapshot drawer's
 *      Diff affordance and by the restore path (which uses it to build
 *      the inverse ops).
 *
 * Round-trip + diff are the two tested behaviors (see snapshots.spec.ts).
 */

/** Structural minimum `serializeDomain` needs from a describe-domain
 *  result. Declared here as an interface (instead of importing
 *  `DescribeDomainResult`) so worker-side code can pass the narrower
 *  GraphStore shape — which omits the `configured` envelope that the
 *  UI's data handler adds on top. */
import type { DescribeDomainResult } from "../graph/GraphStore.js";

export interface DescribeDomainLike {
  nodeTypes: DescribeDomainResult["nodeTypes"];
  relationTypes: DescribeDomainResult["relationTypes"];
  actionTypes: DescribeDomainResult["actionTypes"];
}

/* ------------------------------------------------------------------ */
/*  Snapshot type — only the schema parts that mutations touch         */
/* ------------------------------------------------------------------ */

export interface SchemaSnapshot {
  nodeTypes: DescribeDomainResult["nodeTypes"];
  relationTypes: DescribeDomainResult["relationTypes"];
  actionTypes: DescribeDomainResult["actionTypes"];
}

/** Just enough context to label a snapshot in the drawer. */
export interface SnapshotMetadata {
  id: number;
  version: number;
  label: string;
  intent: string;
  summary: string;
  opCount: number;
  createdAt: string;
  createdBy: string;
}

export interface SnapshotRecord extends SnapshotMetadata {
  schema: SchemaSnapshot;
}

/* ------------------------------------------------------------------ */
/*  Serialize — describe-domain result → storable snapshot             */
/* ------------------------------------------------------------------ */

export function serializeDomain(domain: DescribeDomainLike): SchemaSnapshot {
  return {
    nodeTypes: domain.nodeTypes.map((nt) => ({
      id: nt.id,
      key: nt.key,
      displayName: nt.displayName,
      description: nt.description,
      layer: nt.layer,
      propertiesSchema:
        nt.propertiesSchema && typeof nt.propertiesSchema === "object"
          ? { ...nt.propertiesSchema }
          : null,
      instanceCount: nt.instanceCount,
    })),
    relationTypes: domain.relationTypes.map((rt) => ({
      id: rt.id,
      key: rt.key,
      displayName: rt.displayName,
      description: rt.description,
      directed: rt.directed,
      cardinality: rt.cardinality,
      instanceCount: rt.instanceCount,
    })),
    actionTypes: domain.actionTypes.map((at) => ({
      id: at.id,
      key: at.key,
      displayName: at.displayName,
      kind: at.kind,
      status: at.status,
    })),
  };
}

/* ------------------------------------------------------------------ */
/*  Diff — two snapshots → flat list of changes                        */
/* ------------------------------------------------------------------ */

export type SchemaDiffEntry =
  | { kind: "addNodeType"; typeKey: string }
  | { kind: "removeNodeType"; typeKey: string }
  | { kind: "updateNodeType"; typeKey: string; fields: string[] }
  | { kind: "addRelationType"; typeKey: string }
  | { kind: "removeRelationType"; typeKey: string }
  | { kind: "updateRelationType"; typeKey: string; fields: string[] }
  | { kind: "addProperty"; typeKey: string; propertyName: string }
  | { kind: "removeProperty"; typeKey: string; propertyName: string }
  | { kind: "updateProperty"; typeKey: string; propertyName: string };

/**
 * Compute a flat, deterministic diff between two snapshots. Output is
 * sorted (nodeType keys, then relationType keys, then property names)
 * so the UI can render directly without re-sorting. The order also
 * matters for stable snapshot tests.
 */
export function diffDomain(
  prev: SchemaSnapshot,
  next: SchemaSnapshot,
): SchemaDiffEntry[] {
  const out: SchemaDiffEntry[] = [];

  // Node-type diffs (incl. property-level children).
  const prevNtByKey = new Map(prev.nodeTypes.map((nt) => [nt.key, nt]));
  const nextNtByKey = new Map(next.nodeTypes.map((nt) => [nt.key, nt]));
  for (const key of sortedUnionKeys(prevNtByKey, nextNtByKey)) {
    const a = prevNtByKey.get(key);
    const b = nextNtByKey.get(key);
    if (a && !b) {
      out.push({ kind: "removeNodeType", typeKey: key });
      continue;
    }
    if (!a && b) {
      out.push({ kind: "addNodeType", typeKey: key });
      continue;
    }
    if (!a || !b) continue;
    const fields = nodeTypeChangedFields(a, b);
    if (fields.length > 0) {
      out.push({ kind: "updateNodeType", typeKey: key, fields });
    }
    for (const e of propertyDiffs(a, b, key)) out.push(e);
  }

  // Relation-type diffs (no children — flat shape).
  const prevRtByKey = new Map(prev.relationTypes.map((rt) => [rt.key, rt]));
  const nextRtByKey = new Map(next.relationTypes.map((rt) => [rt.key, rt]));
  for (const key of sortedUnionKeys(prevRtByKey, nextRtByKey)) {
    const a = prevRtByKey.get(key);
    const b = nextRtByKey.get(key);
    if (a && !b) {
      out.push({ kind: "removeRelationType", typeKey: key });
      continue;
    }
    if (!a && b) {
      out.push({ kind: "addRelationType", typeKey: key });
      continue;
    }
    if (!a || !b) continue;
    const fields: string[] = [];
    if (a.displayName !== b.displayName) fields.push("displayName");
    if (a.description !== b.description) fields.push("description");
    if (a.directed !== b.directed) fields.push("directed");
    if (a.cardinality !== b.cardinality) fields.push("cardinality");
    if (fields.length > 0) {
      out.push({ kind: "updateRelationType", typeKey: key, fields });
    }
  }

  return out;
}

function sortedUnionKeys<K, V>(
  a: Map<K, V>,
  b: Map<K, V>,
): K[] {
  const all = new Set<K>([...a.keys(), ...b.keys()]);
  return Array.from(all).sort() as K[];
}

function nodeTypeChangedFields(
  a: SchemaSnapshot["nodeTypes"][number],
  b: SchemaSnapshot["nodeTypes"][number],
): string[] {
  const fields: string[] = [];
  if (a.displayName !== b.displayName) fields.push("displayName");
  if (a.description !== b.description) fields.push("description");
  if (a.layer !== b.layer) fields.push("layer");
  return fields;
}

function propertyDiffs(
  a: SchemaSnapshot["nodeTypes"][number],
  b: SchemaSnapshot["nodeTypes"][number],
  typeKey: string,
): SchemaDiffEntry[] {
  const aProps = a.propertiesSchema ?? {};
  const bProps = b.propertiesSchema ?? {};
  const allNames = new Set<string>([...Object.keys(aProps), ...Object.keys(bProps)]);
  const out: SchemaDiffEntry[] = [];
  for (const name of Array.from(allNames).sort()) {
    const inA = Object.prototype.hasOwnProperty.call(aProps, name);
    const inB = Object.prototype.hasOwnProperty.call(bProps, name);
    if (inA && !inB) {
      out.push({ kind: "removeProperty", typeKey, propertyName: name });
    } else if (!inA && inB) {
      out.push({ kind: "addProperty", typeKey, propertyName: name });
    } else if (
      JSON.stringify(aProps[name]) !== JSON.stringify(bProps[name])
    ) {
      out.push({ kind: "updateProperty", typeKey, propertyName: name });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Counts — used by the drawer's header chip                          */
/* ------------------------------------------------------------------ */

export interface DiffCounts {
  add: number;
  update: number;
  remove: number;
}

export function countDiff(entries: SchemaDiffEntry[]): DiffCounts {
  let add = 0;
  let update = 0;
  let remove = 0;
  for (const e of entries) {
    switch (e.kind) {
      case "addNodeType":
      case "addRelationType":
      case "addProperty":
        add++;
        break;
      case "removeNodeType":
      case "removeRelationType":
      case "removeProperty":
        remove++;
        break;
      case "updateNodeType":
      case "updateRelationType":
        if (e.fields.length > 0) update++;
        break;
      case "updateProperty":
        update++;
        break;
    }
  }
  return { add, update, remove };
}
