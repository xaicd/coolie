/**
 * OpenAPI / Swagger parser — clean-room port of DigitalStaff's
 * `LegacyImportService.parseOpenAPI` (lines 255-317 of
 * DigitalStaff/backend/modules/ontology/services/LegacyImportService.js).
 *
 * Accepts either:
 *  - a JSON string (the typical case — user pastes a Swagger export)
 *  - an already-parsed object (for tests and programmatic use)
 *
 * Output shape mirrors `parseSqlDdl`'s so the wizard's Step 1 preview
 * can render either source with the same component:
 *  - `nodeTypes[]`: { key, displayName, properties }
 *  - `relationTypes[]`: empty (OpenAPI doesn't model relations directly)
 *  - `actions[]`:    { key, method, endpoint, description }
 *
 * Type mapping is intentionally lossy: `$ref`, `oneOf`, `allOf`,
 * `array.items` collapse to simple string fields. The wizard's job
 * is to surface "this is what we got" — the user can refine in the
 * type editor.
 */

export interface ParsedOpenAPINodeType {
  key: string;
  displayName: string;
  properties: Record<string, { type: string; description?: string }>;
}

export interface ParsedOpenAPIAction {
  key: string;
  method: string;
  endpoint: string;
  description?: string;
}

export interface ParsedOpenAPI {
  nodeTypes: ParsedOpenAPINodeType[];
  relationTypes: [];
  actions: ParsedOpenAPIAction[];
}

export function parseOpenAPI(input: string | unknown): ParsedOpenAPI {
  const doc =
    typeof input === "string"
      ? (JSON.parse(input) as Record<string, unknown>)
      : (input as Record<string, unknown>);
  if (!doc || (typeof doc.swagger !== "string" && typeof doc.openapi !== "string")) {
    throw new Error("Invalid OpenAPI / Swagger specification");
  }

  const components = (doc.components as Record<string, unknown> | undefined) ?? {};
  const definitions = (doc.definitions as Record<string, unknown> | undefined) ?? {};
  const schemas = (components.schemas as Record<string, unknown> | undefined) ?? definitions;

  const nodeTypes: ParsedOpenAPINodeType[] = [];
  for (const [schemaName, schemaObj] of Object.entries(schemas)) {
    const obj = schemaObj as {
      type?: string;
      description?: string;
      properties?: Record<string, { type?: string; format?: string; description?: string }>;
    };
    // Skip non-object schemas (primitives). Object schemas with no
    // declared properties still pass through as empty — the wizard
    // user can decide whether to keep them.
    if (obj.type && obj.type !== "object") continue;

    const key = toPascalCase(schemaName);
    const properties: ParsedOpenAPINodeType["properties"] = {};
    for (const [propName, propDef] of Object.entries(obj.properties ?? {})) {
      properties[propName] = {
        type: mapSwaggerType(propDef.type, propDef.format),
        description: propDef.description,
      };
    }

    nodeTypes.push({
      key,
      displayName: obj.description ?? key,
      properties,
    });
  }

  const actions: ParsedOpenAPIAction[] = [];
  const paths = (doc.paths as Record<string, Record<string, unknown>> | undefined) ?? {};
  for (const [pathUrl, pathItem] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(pathItem)) {
      if (!["get", "post", "put", "delete", "patch"].includes(method.toLowerCase())) continue;
      const opObj = op as {
        operationId?: string;
        summary?: string;
        description?: string;
      };
      const safePath = pathUrl.replace(/[^a-zA-Z0-9]/g, "_");
      const key =
        opObj.operationId ?? `${method.toLowerCase()}_${safePath.replace(/^_+|_+$/g, "")}`;
      actions.push({
        key,
        method: method.toUpperCase(),
        endpoint: pathUrl,
        description: opObj.description ?? opObj.summary,
      });
    }
  }

  return {
    nodeTypes,
    relationTypes: [],
    actions,
  };
}

function toPascalCase(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .split("_")
    .filter(Boolean)
    .map((s) => s[0]!.toUpperCase() + s.slice(1))
    .join("");
}

function mapSwaggerType(
  type: string | undefined,
  format: string | undefined,
): string {
  if (!type) return "string";
  if (type === "integer" || type === "number") {
    return format === "float" || format === "double" ? "float" : "integer";
  }
  if (type === "boolean") return "boolean";
  if (type === "array") return "array";
  if (type === "object") return "object";
  return "string";
}
