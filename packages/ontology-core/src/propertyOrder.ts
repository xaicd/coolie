/**
 * The order an object type's properties are shown in.
 *
 * `ontology_node_types.properties_schema` is `jsonb`, and Postgres `jsonb` does
 * not preserve object key order — it stores keys in its own order. So every
 * reader that walks the map gets an arbitrary sequence, and the Schema page has
 * never shown the order the source declared. The extractors know it
 * (`ExtractedProperty[]` is an ordered array); it survives in
 * `ontology_node_types.property_order` (`text[]`, which does keep order).
 *
 * This module is the single place the order is *decided*, so the document
 * exporter and the workbench cannot sequence the same schema differently. The
 * rule for a partial declaration is the one that matters: declared names that
 * are present come first, and the remainder is **sorted**, never left in map
 * order. `jsonb` returns keys in no particular order, so leaving them as-is
 * would present an arbitrary sequence as if it were the source's — the exact
 * dishonesty this module exists to prevent.
 */
/** `declared` means we were told; `sorted` means we never knew and said so. */
export type PropertyOrderSource = "declared" | "sorted";

/**
 * The only surface this module needs off a node-type row. Declared here rather
 * than imported so the store can use the helpers without a cycle.
 */
export interface PropertyOrderRow {
  property_order?: unknown;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((name): name is string => typeof name === "string" && name !== "");
}

/**
 * Read an order vector off a row, tolerating anything: a row written before the
 * column existed (`null`), a hand-edited value, or a driver that hands back a
 * JSON string instead of a `text[]`.
 */
export function readPropertyOrder(row: PropertyOrderRow | null | undefined): string[] {
  return dedupe(asStringArray(row?.property_order));
}

function dedupe(names: string[]): string[] {
  return [...new Set(names)];
}

/**
 * The order to present `names` in.
 *
 * A partial or stale declaration is honoured as a prefix and the rest is sorted:
 * a name the declaration does not mention cannot be placed, and guessing where
 * it went would be inventing an order.
 */
export function orderPropertyNames(names: readonly string[], declared: readonly string[]): string[] {
  const present = new Set(names);
  const declaredSet = new Set(declared);
  const prefix = dedupe(declared.filter((name) => present.has(name)));
  const rest = names.filter((name) => !declaredSet.has(name)).sort();
  return [...prefix, ...rest];
}

/** `orderPropertyNames`, keeping each name's value with it. */
export function orderPropertyEntries<T>(
  schema: Record<string, T>,
  declared: readonly string[],
): Array<[string, T]> {
  return orderPropertyNames(Object.keys(schema), declared).map((name) => [name, schema[name]!]);
}

/** Whether the order was told to us, or produced because it could not be known. */
export function propertyOrderSource(order: readonly string[]): PropertyOrderSource {
  return order.length > 0 ? "declared" : "sorted";
}

/**
 * Follow a property rename.
 *
 * `updateNodeType` moves instance values for a declared `oldKey -> newKey`, and
 * the order vector has to move with them: leaving the old name behind would make
 * the order reference a property the schema no longer has, and drop the new one
 * to the sorted remainder.
 */
export function renameInPropertyOrder(
  order: readonly string[],
  renames: Record<string, string> | undefined,
): string[] {
  if (!renames) return dedupe(asStringArray([...order]));
  return dedupe(order.map((name) => renames[name] ?? name));
}

/** Drop names the schema no longer holds, so a removal cannot leave a ghost. */
export function prunePropertyOrder(
  order: readonly string[],
  schema: Record<string, unknown>,
): string[] {
  const present = new Set(Object.keys(schema));
  return dedupe(asStringArray([...order]).filter((name) => present.has(name)));
}
