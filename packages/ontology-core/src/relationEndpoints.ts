/**
 * Where a relation *type* runs between two object types.
 *
 * `ontology_relation_types` has no endpoint columns — only `key`, `display_name`
 * and `cardinality`. The endpoints exist because an importer derived them
 * (`AstExtractor` from DDL foreign keys and from Java/proto fields typed as
 * another scanned type, the wizard from `sourceType`/`targetType`), and they are
 * written into the row's `metadata` bag.
 *
 * Nothing read that bag back, so the plugin could not draw a type-level
 * structure graph — the view the user actually asked for ("图谱主要还是显示结构
 * 关系"). This module is the single reader, so the store's mapping and the view
 * resolver agree on the shape, and a hand-edited or older row degrades to "no
 * endpoints" instead of throwing.
 */

/** Keys an importer writes. Kept in one place: writers and readers drift easily. */
export const ENDPOINT_KEYS = {
  source: "sourceNodeTypeKey",
  target: "targetNodeTypeKey",
} as const;

export interface RelationEndpoints {
  sourceNodeTypeKey?: string;
  targetNodeTypeKey?: string;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export function relationEndpoints(metadata: unknown): RelationEndpoints {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return {};
  const bag = metadata as Record<string, unknown>;
  const source = asString(bag[ENDPOINT_KEYS.source]);
  const target = asString(bag[ENDPOINT_KEYS.target]);
  return {
    ...(source ? { sourceNodeTypeKey: source } : {}),
    ...(target ? { targetNodeTypeKey: target } : {}),
  };
}

/** The bag an importer writes for a relation type. */
export function buildRelationMetadata(
  sourceNodeTypeKey: string | undefined,
  targetNodeTypeKey: string | undefined,
  extra: Record<string, unknown> = {},
): Record<string, unknown> | undefined {
  const source = asString(sourceNodeTypeKey);
  const target = asString(targetNodeTypeKey);
  if (!source && !target && Object.keys(extra).length === 0) return undefined;
  return {
    ...extra,
    ...(source ? { [ENDPOINT_KEYS.source]: source } : {}),
    ...(target ? { [ENDPOINT_KEYS.target]: target } : {}),
  };
}
