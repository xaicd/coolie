/**
 * Match descriptions mined from a legacy source (DDL comments, OpenAPI field
 * descriptions) onto the properties of an existing ontology domain.
 *
 * The two sides rarely agree on spelling: a table may be `t_order` where the
 * object type is `order`, and a column `cust_nm` where the property is
 * `custNm`. Names are therefore compared in a normalised form, and matching
 * degrades in steps rather than giving up on the first miss.
 *
 * Pure functions only, so the matching rules are unit-testable.
 */

export type SourceKind = "ddl" | "openapi";

export interface SourceField {
  name: string;
  description?: string;
}

export interface SourceEntity {
  typeName: string;
  description?: string;
  properties?: SourceField[];
}

export interface SourceIndex {
  kind: SourceKind;
  /** normalised type name → normalised field name → description */
  byType: Map<string, Map<string, string>>;
  /** normalised field name → distinct descriptions seen anywhere in the source */
  byField: Map<string, Set<string>>;
  /** normalised type name → description */
  typeDescriptions: Map<string, string>;
}

export interface TargetType {
  key: string;
  /** Property names that need a description. */
  fields: string[];
}

export interface MatchedDescription {
  description: string;
  from: SourceKind;
  /** Matched by field name alone (the type name did not line up). */
  weak: boolean;
}

export interface MatchResult {
  /** keyed `${typeKey}.${field}` */
  matched: Map<string, MatchedDescription>;
  unmatched: Array<{ typeKey: string; field: string }>;
  /** Table/entity level descriptions keyed by the target type's key. */
  typeDescriptions: Map<string, string>;
}

/** Table prefixes that carry no meaning once the model is built. */
const STRIPPABLE_PREFIXES = ["t_", "tb_", "tbl_", "sys_", "biz_", "dim_", "ods_"];
const STRIPPABLE_SUFFIXES = ["_tb", "_table", "_info", "_entity"];

/** Drop everything that is not a letter or digit, so spellings compare equal. */
function stripSeparators(value: string): string {
  return value.replace(/[^a-z0-9]/g, "");
}

/**
 * Fold a name to its comparable core: peel a conventional table prefix/suffix
 * (matched on the separator-preserving form, so `t_order` still reads as a `t_`
 * table), then lowercase and drop separators. `t_order` and `order` both become
 * `order`; `cust_nm` and `custNm` both become `custnm`.
 */
export function normalizeName(raw: string): string {
  const lower = raw.trim().toLowerCase();
  if (lower === "") return "";

  for (const prefix of STRIPPABLE_PREFIXES) {
    if (lower.startsWith(prefix) && lower.length > prefix.length + 2) {
      return stripSeparators(lower.slice(prefix.length));
    }
  }
  for (const suffix of STRIPPABLE_SUFFIXES) {
    if (lower.endsWith(suffix) && lower.length > suffix.length + 2) {
      return stripSeparators(lower.slice(0, -suffix.length));
    }
  }
  return stripSeparators(lower);
}

/** Build the lookup tables for one parsed source. */
export function buildSourceIndex(entities: SourceEntity[], kind: SourceKind): SourceIndex {
  const byType = new Map<string, Map<string, string>>();
  const byField = new Map<string, Set<string>>();
  const typeDescriptions = new Map<string, string>();

  for (const entity of entities) {
    const typeKey = normalizeName(entity.typeName);
    if (typeKey === "") continue;
    if (entity.description) typeDescriptions.set(typeKey, entity.description);

    const fields = byType.get(typeKey) ?? new Map<string, string>();
    for (const property of entity.properties ?? []) {
      const description = property.description?.trim();
      if (!description) continue;
      const fieldKey = normalizeName(property.name);
      if (fieldKey === "") continue;
      // First writer wins so a later duplicate cannot silently replace a match.
      if (!fields.has(fieldKey)) fields.set(fieldKey, description);

      const seen = byField.get(fieldKey) ?? new Set<string>();
      seen.add(description);
      byField.set(fieldKey, seen);
    }
    if (fields.size > 0) byType.set(typeKey, fields);
  }

  return { kind, byType, byField, typeDescriptions };
}

/**
 * Match source descriptions onto target properties.
 *
 * Order of preference:
 *   1. same normalised type name + same normalised field name
 *   2. field name that appears exactly once in the whole source (weak — the
 *      type names did not line up, so the caller should surface it for review)
 *   3. no match
 */
export function matchDescriptions(input: {
  nodeTypes: TargetType[];
  index: SourceIndex;
}): MatchResult {
  const { nodeTypes, index } = input;
  const matched = new Map<string, MatchedDescription>();
  const unmatched: Array<{ typeKey: string; field: string }> = [];
  const typeDescriptions = new Map<string, string>();

  for (const nodeType of nodeTypes) {
    const normalizedType = normalizeName(nodeType.key);
    const typeLevel = index.typeDescriptions.get(normalizedType);
    if (typeLevel) typeDescriptions.set(nodeType.key, typeLevel);

    const sourceFields = index.byType.get(normalizedType);

    for (const field of nodeType.fields) {
      const normalizedField = normalizeName(field);
      if (normalizedField === "") continue;

      const exact = sourceFields?.get(normalizedField);
      if (exact) {
        matched.set(`${nodeType.key}.${field}`, {
          description: exact,
          from: index.kind,
          weak: false,
        });
        continue;
      }

      const candidates = index.byField.get(normalizedField);
      if (candidates && candidates.size === 1) {
        matched.set(`${nodeType.key}.${field}`, {
          description: [...candidates][0]!,
          from: index.kind,
          weak: true,
        });
        continue;
      }

      unmatched.push({ typeKey: nodeType.key, field });
    }
  }

  return { matched, unmatched, typeDescriptions };
}
