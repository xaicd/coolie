/**
 * Property schema <-> editable rows.
 *
 * Pure and unit-tested because two surfaces write back through it: the schema
 * modal (right-click → 属性) and the schema tab's inline property editor.
 *
 * The previous implementation rebuilt every field as `{ type }` only, so any
 * `enum`, `format`, `required` or description was silently dropped on save.
 * Rows now carry `rest` — the untouched remainder of the stored descriptor —
 * and only the fields the user actually edited are rewritten.
 */

export const SCHEMA_TYPE_OPTIONS = [
  "string",
  "number",
  "integer",
  "boolean",
  "array",
  "object",
] as const;

export interface SchemaRow {
  /** Editable field name. */
  key: string;
  /** Editable JSON-schema type. */
  type: string;
  /** Editable free-text note (stored as `description`, omitted when blank). */
  description: string;
  /** Everything else from the stored descriptor, preserved verbatim. */
  rest: Record<string, unknown>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Type option list for one row, keeping a stored value that is not standard. */
export function typeOptionsFor(current: string): string[] {
  const options = [...SCHEMA_TYPE_OPTIONS] as string[];
  if (current.trim() !== "" && !options.includes(current)) options.unshift(current);
  return options;
}

/**
 * Read a stored schema into rows. Tolerates the two shapes we have seen in the
 * wild: a JSON-Schema document (`{ type: "object", properties: {...} }`) and a
 * flat `{ field: descriptor }` map. A descriptor that is a bare primitive is
 * mapped to the matching type rather than discarded.
 */
export function rowsFromSchema(schema: unknown): SchemaRow[] {
  if (!isPlainObject(schema)) return [];
  const source = isPlainObject(schema.properties) ? schema.properties : schema;

  const rows: SchemaRow[] = [];
  for (const [key, value] of Object.entries(source)) {
    if (key === "type" && !isPlainObject(value)) continue;
    if (isPlainObject(value)) {
      const { type, description, ...rest } = value;
      rows.push({
        key,
        type: typeof type === "string" && type.trim() !== "" ? type : "string",
        description: typeof description === "string" ? description : "",
        rest,
      });
      continue;
    }
    rows.push({
      key,
      type: typeof value === "number"
        ? "number"
        : typeof value === "boolean"
          ? "boolean"
          : "string",
      description: "",
      rest: {},
    });
  }
  return rows;
}

/**
 * Build the stored schema from rows.
 *
 * The canonical storage shape in this plugin is a **flat map** of
 * `field -> descriptor` (that is what the seed data, the bootstrap draft and
 * `editOps.propertiesSchemaFor` all read and write). An earlier version of this
 * helper wrapped the result in `{ type: "object", properties: { … } }`, which
 * changed the stored shape on the first save and then made a conversational
 * `addProperty` land at the top level instead of inside `properties`. Rows read
 * from a wrapped document are normalised to the flat shape on write.
 */
export function schemaFromRows(rows: SchemaRow[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    const descriptor: Record<string, unknown> = { ...row.rest, type: row.type };
    const description = row.description.trim();
    if (description !== "") descriptor.description = description;
    else delete descriptor.description;
    properties[key] = descriptor;
  }
  return properties;
}

/** Stable comparison for the "unsaved changes" state. */
export function schemasEqual(a: SchemaRow[], b: SchemaRow[]): boolean {
  return JSON.stringify(schemaFromRows(a)) === JSON.stringify(schemaFromRows(b));
}
