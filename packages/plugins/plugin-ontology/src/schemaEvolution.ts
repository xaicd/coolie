/**
 * What a schema edit does to the data underneath it.
 *
 * Changing a key in `properties_schema` used to leave every existing instance
 * holding the old key: nothing renamed, coerced or even reported it, so the
 * instances silently stopped matching their own type. This module is the part of
 * the fix that is pure logic — which keys a schema edit removes, and whether the
 * author's declared renames account for them.
 *
 * The store applies the outcome (it owns the SQL); the worker reports it (it
 * owns the response). Neither of them decides what a rename *means*.
 */

/** Flat `field -> descriptor` maps, the plugin's canonical schema shape. */
type SchemaMap = Record<string, unknown>;

function keysOf(schema: SchemaMap | null | undefined): string[] {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return [];
  return Object.keys(schema);
}

export interface PropertySchemaDiff {
  /** Keys the edit removed: present before, absent after. */
  removed: string[];
  /** Keys the edit added: absent before, present after. */
  added: string[];
}

export function diffPropertySchemas(
  before: SchemaMap | null | undefined,
  after: SchemaMap | null | undefined,
): PropertySchemaDiff {
  const beforeKeys = keysOf(before);
  const afterKeys = new Set(keysOf(after));
  const beforeSet = new Set(beforeKeys);
  return {
    removed: beforeKeys.filter((key) => !afterKeys.has(key)),
    // Ordered by the new schema, which is the order a reader sees.
    added: keysOf(after).filter((key) => !beforeSet.has(key)),
  };
}

export interface RenamePlan {
  /** old key → new key, for renames the author declared and the diff allowed. */
  applied: Array<{ from: string; to: string }>;
  /**
   * Removed keys with no declared destination. Their instance values are
   * orphaned by the edit — not deleted, but no longer reachable through the
   * type, which is worse than deleted because nothing looks wrong.
   */
  orphaned: string[];
  /**
   * A declared rename whose source was not actually removed, or whose
   * destination was not actually added. Ignored rather than applied: renaming a
   * key that still exists would move data out from under a field that the caller
   * believes is intact.
   */
  ignored: Array<{ from: string; to: string }>;
}

/**
 * Decide which renames to perform.
 *
 * A rename can only be applied when the diff agrees with it at both ends: the
 * source disappeared and the destination appeared. Sending a mapping the schema
 * does not support is a caller bug, and honouring it would move data that the
 * caller did not intend to move.
 */
export function planPropertyRenames(
  diff: PropertySchemaDiff,
  renames: Record<string, string> | null | undefined,
): RenamePlan {
  const removed = new Set(diff.removed);
  const added = new Set(diff.added);
  const plan: RenamePlan = { applied: [], orphaned: [], ignored: [] };

  const claimed = new Set<string>();
  for (const [from, to] of Object.entries(renames ?? {})) {
    if (typeof to !== "string" || to === "" || to === from) {
      plan.ignored.push({ from, to: String(to) });
      continue;
    }
    if (!removed.has(from) || !added.has(to)) {
      plan.ignored.push({ from, to });
      continue;
    }
    plan.applied.push({ from, to });
    claimed.add(from);
  }

  plan.orphaned = diff.removed.filter((key) => !claimed.has(key));
  return plan;
}

/** One line a caller can show or log, or undefined when nothing was orphaned. */
export function describeOrphans(orphaned: string[], instanceCount: number): string | undefined {
  if (orphaned.length === 0) return undefined;
  const fields = orphaned.join(", ");
  if (instanceCount === 0) {
    return `字段 ${fields} 已从类型移除(尚无实例数据受影响)`;
  }
  return `字段 ${fields} 已从类型移除,${instanceCount} 个实例上的这些值失去归属(未删除,但已不可达)`;
}
