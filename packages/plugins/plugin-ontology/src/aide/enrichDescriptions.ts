/**
 * 属性中文说明补全 — the LLM fallback for fields that the deterministic
 * matcher could not resolve from DDL comments or interface descriptions.
 *
 * Two jobs, in priority order, decided per field by what the caller passes:
 *   - translate an existing description into Chinese, or
 *   - infer a short Chinese description from the field name, its object type
 *     and the domain, so a bare `custNm` still ends up documented.
 *
 * Prompt assembly and parsing are pure so they can be unit-tested without the
 * Anthropic SDK or a worker.
 */

export interface EnrichTarget {
  typeKey: string;
  /** Display name of the owning object type, for context. */
  typeDisplayName?: string;
  field: string;
  /** Existing description — often English, sometimes a note. Translate it. */
  existing?: string;
}

export interface EnrichPromptInput {
  domainSlug: string;
  domainName: string;
  /** Every object type key in the domain, for the "business context" sentence. */
  typeKeys: string[];
  targets: EnrichTarget[];
  maxLength?: number;
}

export interface EnrichOk {
  ok: true;
  /** keyed `${typeKey}.${field}` */
  descriptions: Record<string, string>;
}

export interface EnrichErr {
  ok: false;
  error: string;
}

export type EnrichParseResult = EnrichOk | EnrichErr;

/** Ceiling on how much of one description we keep — these are field notes, not prose. */
const MAX_DESCRIPTION_LENGTH = 60;

export function buildEnrichPrompt(input: EnrichPromptInput): string {
  const maxLength = input.maxLength ?? 20;
  const lines: string[] = [];

  lines.push(
    `你是本体建模助手。当前本体域是 ${input.domainSlug}(${input.domainName})。`,
  );
  if (input.typeKeys.length > 0) {
    lines.push(`本域的对象类型有:${input.typeKeys.join("、")}。`);
  }
  lines.push("");
  lines.push(
    `请为下面 ${input.targets.length} 个属性各写一句**中文**说明,用于本体模型里字段的业务释义。`,
  );
  lines.push("");
  lines.push("规则:");
  lines.push(
    `1. 如果给了「现有说明」,以它为准**翻译/改写为中文**,不要改变它的含义,也不要补充它没说的事。`,
  );
  lines.push(
    "2. 没有现有说明时,结合属性名、所属对象类型和本域的业务语境推断它最可能表示什么。",
  );
  lines.push(`3. 每条尽量不超过 ${maxLength} 个字,像数据字典里的字段释义那样简洁。`);
  lines.push("4. 不要写「该字段表示」「用于存储」这类废话,直接写业务含义。");
  lines.push("5. 只输出下面列出的属性,不要新增、不要遗漏。");
  lines.push("");
  lines.push("待处理属性:");
  for (const target of input.targets) {
    const owner = target.typeDisplayName
      ? `${target.typeKey}(${target.typeDisplayName})`
      : target.typeKey;
    const existing = target.existing?.trim();
    lines.push(
      `- ${target.typeKey}.${target.field} | 对象类型: ${owner}${existing ? ` | 现有说明: ${existing}` : ""}`,
    );
  }
  lines.push("");
  lines.push("输出格式:");
  lines.push("- 只输出一个 ```json``` 块,不要任何额外文字。");
  lines.push('- 块内结构: { "<对象类型key>.<属性名>": "<中文说明>" }');
  lines.push("");
  lines.push("样例形状:");
  lines.push("```json");
  lines.push("{");
  lines.push('  "customer.custNm": "客户姓名",');
  lines.push('  "order.totalAmount": "订单总额"');
  lines.push("}");
  lines.push("```");

  return lines.join("\n");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parse the model's mapping. Only keys that were asked for are kept, so a model
 * that invents extra fields cannot smuggle them into the schema.
 */
export function parseEnrichResponse(
  text: string,
  requestedKeys: string[],
): EnrichParseResult {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced ? (fenced[1] ?? "").trim() : text.trim();
  if (body === "") return { ok: false, error: "模型输出为空" };

  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `模型输出不是合法 JSON:${reason}` };
  }
  if (!isPlainObject(raw)) return { ok: false, error: "模型输出的顶层必须是 JSON object" };

  const wanted = new Set(requestedKeys);
  const descriptions: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!wanted.has(key)) continue;
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed === "") continue;
    descriptions[key] =
      trimmed.length > MAX_DESCRIPTION_LENGTH
        ? `${trimmed.slice(0, MAX_DESCRIPTION_LENGTH)}…`
        : trimmed;
  }

  if (Object.keys(descriptions).length === 0) {
    return { ok: false, error: "模型没有给出可用的说明" };
  }
  return { ok: true, descriptions };
}
