/**
 * "智能补全" — propose standard fields for an object type.
 *
 * The reference workbench offers this from its schema right-click menu, but
 * there it only fires a toast with a hardcoded list of field names and never
 * writes anything. Ours is real: the model proposes fields, the parser drops
 * anything malformed or already present, and the result is handed to the
 * existing schema editor so the user reviews the merge before it is saved
 * through `update-node-type`.
 *
 * Prompt assembly and parsing live here as pure functions so they can be
 * tested without the Anthropic SDK or a worker.
 */

export interface SuggestFieldsInput {
  domainSlug: string;
  domainName: string;
  typeKey: string;
  displayName: string;
  description?: string | null;
  /** The type's current `propertiesSchema` — used to avoid re-proposing. */
  existingProperties: Record<string, unknown> | null;
  /** Other object type keys in the domain, for context. */
  siblingTypeKeys: string[];
  maxFields?: number;
}

export interface SuggestFieldsOk {
  ok: true;
  fields: Record<string, unknown>;
}

export interface SuggestFieldsErr {
  ok: false;
  error: string;
}

export type SuggestFieldsResult = SuggestFieldsOk | SuggestFieldsErr;

const DESCRIPTOR_KEYS = ["type", "format", "enum", "description", "required", "default"] as const;

/** Build the system prompt. The only acceptable output is a fenced JSON block. */
export function buildSuggestFieldsPrompt(input: SuggestFieldsInput): string {
  const maxFields = input.maxFields ?? 8;
  const existing = Object.keys(input.existingProperties ?? {});
  const lines: string[] = [];

  lines.push(
    `你是「本体建模助手」。当前域 ${input.domainSlug} (${input.domainName}) 里有一个对象类型 ${input.typeKey}(${input.displayName})。`,
  );
  if (input.description) {
    lines.push(`该类型的说明:${input.description}`);
  }
  lines.push("");
  lines.push(`任务:为这个对象类型补充一组**企业系统里通常会有的标准字段**,最多 ${maxFields} 个。`);
  lines.push("");
  lines.push("已经存在的字段(不要重复提出):");
  lines.push(existing.length === 0 ? "  (无)" : `  ${existing.join(", ")}`);
  lines.push("");
  lines.push("本域已有的其他对象类型(仅供参考,不要为它们生成字段):");
  lines.push(
    input.siblingTypeKeys.length === 0 ? "  (无)" : `  ${input.siblingTypeKeys.join(", ")}`,
  );
  lines.push("");
  lines.push("要求:");
  lines.push("1. 字段名用 lowerCamelCase,语义清晰,贴合这个对象类型在本域里的实际业务含义。");
  lines.push("2. 只提**确实有用**的字段,不要凑数;宁少勿滥。");
  lines.push(`3. 最多 ${maxFields} 个。`);
  lines.push("4. 每个字段的值是一个 JSON Schema 风格的描述对象,可用键:type / format / enum / description / required。");
  lines.push("   type 只取:string | number | boolean | array | object | datetime | enum。");
  lines.push("5. 不要提出已经存在的字段。");
  lines.push("");
  lines.push("输出格式:");
  lines.push("- 只输出一个 ```json``` 块,不要任何额外文字。");
  lines.push('- 块内结构: { "properties": { "<字段名>": { "type": "...", "description": "..." } } }');
  lines.push("");
  lines.push("样例形状(内容按该类型调整):");
  lines.push("```json");
  lines.push("{");
  lines.push('  "properties": {');
  lines.push('    "code": { "type": "string", "description": "业务编码" },');
  lines.push('    "status": { "type": "enum", "enum": ["active", "archived"] },');
  lines.push('    "updatedAt": { "type": "datetime" }');
  lines.push("  }");
  lines.push("}");
  lines.push("```");

  return lines.join("\n");
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Keep only the descriptor keys we understand, so the stored schema stays uniform. */
function normaliseDescriptor(raw: unknown): Record<string, unknown> | null {
  if (!isPlainObject(raw)) return null;
  const out: Record<string, unknown> = {};
  for (const key of DESCRIPTOR_KEYS) {
    if (!(key in raw)) continue;
    const value = raw[key];
    if (key === "enum") {
      if (Array.isArray(value) && value.length > 0) out.enum = value;
      continue;
    }
    if (key === "required") {
      if (typeof value === "boolean") out.required = value;
      continue;
    }
    if (typeof value === "string" && value.trim() !== "") out[key] = value.trim();
  }
  if (Object.keys(out).length === 0) return null;
  return out;
}

/**
 * Parse the model's fenced JSON block. Fields that are malformed, unnamed, or
 * already present on the type are dropped rather than failing the whole batch —
 * a partial suggestion is still useful, and the user reviews the merge anyway.
 */
export function parseSuggestedFields(
  text: string,
  existingKeys: string[],
  maxFields = 8,
): SuggestFieldsResult {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced ? (fenced[1] ?? "").trim() : text.trim();
  if (body.length === 0) {
    return { ok: false, error: "模型输出为空" };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `模型输出不是合法 JSON:${reason}` };
  }
  if (!isPlainObject(raw)) {
    return { ok: false, error: "模型输出的顶层必须是 JSON object" };
  }

  // Accept both { properties: {...} } and a bare { field: {...} } map.
  const container = isPlainObject(raw.properties) ? raw.properties : raw;
  const taken = new Set(existingKeys);
  const fields: Record<string, unknown> = {};

  for (const [name, descriptor] of Object.entries(container)) {
    if (Object.keys(fields).length >= maxFields) break;
    const key = name.trim();
    if (key.length === 0) continue;
    if (taken.has(key)) continue;
    const normalised = normaliseDescriptor(descriptor);
    if (!normalised) continue;
    fields[key] = normalised;
    taken.add(key);
  }

  if (Object.keys(fields).length === 0) {
    return { ok: false, error: "模型没有给出可用的新字段" };
  }
  return { ok: true, fields };
}
