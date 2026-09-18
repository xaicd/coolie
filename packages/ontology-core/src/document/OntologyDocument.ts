/**
 * The ontology document — the unit of exchange.
 *
 * This module exists because of one observed fact about the Microsoft Ontology
 * Playground: it renders an ontology in a browser with no backend, no database
 * and no authentication, from a blob of JSON pasted into a `data-` attribute.
 * An ontology can therefore travel as a *document*, and once it can, the
 * ontology layer stops needing Paperclip to be running in order to be read.
 *
 * That is the whole reason this is a separate module rather than three more
 * store methods:
 *
 *   Paperclip  needs a database and a user model to mean anything.
 *   DSH        needs systems to act on.
 *   ontology   needs this file.
 *
 * Design constraints, each with its reason:
 *
 *  - **No tenancy, no host identity.** The document carries no company id, no
 *    tenant id, no issue/role/session reference. It is a *model*; who owns it is
 *    decided by the holder, not declared by the content. This is the same red
 *    line the layering guard enforces on the object-model tables, applied to the
 *    thing that leaves the instance.
 *  - **Property order is explicit.** Their format preserves order only through
 *    XML document order, which cannot transfer to Postgres `jsonb` — and did not
 *    transfer here, which is why the Schema page's field order does not match the
 *    source today. So order is data here, and where we cannot know it we say so
 *    instead of inventing it.
 *  - **Relation endpoints are first-class.** Ours live in a `metadata` bag, and
 *    the one time a column projection omitted that bag every type-level edge
 *    silently vanished. A format that leaves the instance should not repeat it.
 *  - **Loss is reported, never swallowed.** Their parser silently drops
 *    properties whose domain does not resolve and silently coerces an unknown
 *    cardinality to `one-to-many`. Validation here returns severities instead.
 */
import { createHash } from "node:crypto";
import { LINK_CARDINALITIES, type LinkCardinality } from "../enums.js";
import { orderPropertyNames, propertyOrderSource, readPropertyOrder } from "../propertyOrder.js";

export const DOCUMENT_FORMAT = "paperclip.ontology/1";

/** Our three storage types. `format` and `enum` carry the rest. */
export const DOCUMENT_PROPERTY_TYPES = ["string", "number", "boolean"] as const;
export type DocumentPropertyType = (typeof DOCUMENT_PROPERTY_TYPES)[number];

export interface DocumentProperty {
  name: string;
  type: DocumentPropertyType;
  description?: string;
  format?: "date" | "date-time";
  /** Order is meaningful (Bronze < Silver < Gold), so an enum is a list. */
  enum?: string[];
  unit?: string;
  isIdentifier?: boolean;
}

/**
 * A property belonging to a relationship rather than to an entity — `quantity`
 * on `contains`, not on `Order` or `Product`.
 *
 * We have nowhere to store one today, which is why converting the upstream
 * catalogue dropped three of them. The format supports them so that the drop
 * becomes a storage gap rather than a representational one.
 */
export interface DocumentRelationAttribute {
  name: string;
  type: string;
}

export interface DocumentObjectType {
  key: string;
  displayName: string;
  description?: string;
  /** Ordered. This is data, not a bag. */
  properties: DocumentProperty[];
  /**
   * Where this type's property order came from. `declared` means the exporter
   * knew it; `sorted` means it did not and produced a deterministic order rather
   * than presenting the arbitrary order a `jsonb` map returns as if it were the
   * source's. A reader that cares can tell the difference.
   */
  orderSource: "declared" | "sorted";
}

export interface DocumentRelationType {
  key: string;
  displayName: string;
  description?: string;
  cardinality: LinkCardinality;
  /** First-class here, for the reason in the header. */
  sourceNodeTypeKey: string;
  targetNodeTypeKey: string;
  attributes?: DocumentRelationAttribute[];
}

export interface OntologyDocumentSource {
  domainSlug?: string;
  schemaVersion?: number;
  /** Free text: where this came from. Never an environment identity we enforce. */
  origin?: string;
}

export interface OntologyDocument {
  format: string;
  name: string;
  description?: string;
  exportedAt: string;
  source?: OntologyDocumentSource;
  objectTypes: DocumentObjectType[];
  relationTypes: DocumentRelationType[];
  /** sha256 over the canonical form. Absent on input; recomputed on read. */
  fingerprint?: string;
}

/**
 * Deterministic form, used for fingerprints and comparisons.
 *
 * Object types and relation types are sorted by key — their *order* is a
 * presentation concern, so two documents that differ only in the sequence of
 * types are the same model. Properties are NOT sorted: their order is part of
 * the model, and sorting them would erase exactly the thing this format added
 * explicit ordering for.
 */
export function canonicalize(document: OntologyDocument): OntologyDocument {
  const byKey = <T extends { key: string }>(rows: T[]): T[] =>
    [...rows].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  return {
    format: document.format,
    name: document.name,
    ...(document.description ? { description: document.description } : {}),
    exportedAt: document.exportedAt,
    ...(document.source ? { source: document.source } : {}),
    objectTypes: byKey(document.objectTypes).map((type) => ({
      key: type.key,
      displayName: type.displayName,
      ...(type.description ? { description: type.description } : {}),
      orderSource: type.orderSource,
      properties: type.properties.map((property) => ({
        name: property.name,
        type: property.type,
        ...(property.description ? { description: property.description } : {}),
        ...(property.format ? { format: property.format } : {}),
        ...(property.enum ? { enum: [...property.enum] } : {}),
        ...(property.unit ? { unit: property.unit } : {}),
        ...(property.isIdentifier ? { isIdentifier: true } : {}),
      })),
    })),
    relationTypes: byKey(document.relationTypes).map((relation) => ({
      key: relation.key,
      displayName: relation.displayName,
      ...(relation.description ? { description: relation.description } : {}),
      cardinality: relation.cardinality,
      sourceNodeTypeKey: relation.sourceNodeTypeKey,
      targetNodeTypeKey: relation.targetNodeTypeKey,
      ...(relation.attributes?.length
        ? { attributes: relation.attributes.map((a) => ({ name: a.name, type: a.type })) }
        : {}),
    })),
  };
}

/** Stable string form: canonical, with keys in a fixed order. */
export function serializeDocument(document: OntologyDocument): string {
  return JSON.stringify(canonicalize(document));
}

export function fingerprintDocument(document: OntologyDocument): string {
  return createHash("sha256").update(serializeDocument(document)).digest("hex");
}

export interface DocumentProblem {
  severity: "error" | "warning";
  code: string;
  subject: string;
  message: string;
}

/**
 * Quality rules, taken from the upstream authoring guide because they are the
 * ones a modelling tool can actually check. Severity is deliberately split:
 *
 *   error   — the document cannot be imported as a working model.
 *   warning — it imports, and the graph will be worse for it.
 *
 * Anything we cannot check is not reported. A check that guesses is worse than
 * no check, because it teaches people to ignore the list.
 */
export function validateDocument(document: OntologyDocument): DocumentProblem[] {
  const problems: DocumentProblem[] = [];
  const add = (severity: DocumentProblem["severity"], code: string, subject: string, message: string) =>
    problems.push({ severity, code, subject, message });

  if (document.format !== DOCUMENT_FORMAT) {
    add("error", "format/unknown", document.format, `expected ${DOCUMENT_FORMAT}`);
    // Everything below assumes our own shape; reporting more would be noise.
    return problems;
  }
  if (!document.name?.trim()) {
    add("error", "document/name-missing", "name", "a document needs a name");
  }

  // Tenancy and host identity: the document is a model, not a record of who owns
  // it. These would be read as facts about the model by whoever receives it.
  // Walked, not string-matched: a key named `companyId` is the obvious case, but
  // `origin: "companyId=abc"` couples the document just as firmly and would slip
  // past a search for a quoted key. Property *names* are exempt — a Person with a
  // `role` property is modelling a person, not referencing a host role.
  const forbidden = ["compan(y|ies)_?id", "tenant_?id", "issue_?id", "job_?id", "session_?id", "api_?key"];
  const coupling = new RegExp(`^(${forbidden.join("|")})$`, "i");
  const couplingInText = new RegExp(`\\b(${forbidden.join("|")})\\b`, "i");

  const walk = (value: unknown, path: string, inProperty: boolean): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, inProperty));
      return;
    }
    if (!value || typeof value !== "object") {
      if (typeof value === "string" && couplingInText.test(value)) {
        add("error", "document/host-coupling", path, "a document carries no tenancy or host identity");
      }
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      const isPropertyNode = key === "properties" || inProperty;
      if (!isPropertyNode && coupling.test(key)) {
        add("error", "document/host-coupling", `${path}.${key}`, "a document carries no tenancy or host identity");
        continue;
      }
      walk(child, `${path}.${key}`, isPropertyNode && key === "properties" ? true : inProperty);
    }
  };
  walk(document, "$", false);

  const keys = new Set<string>();
  for (const type of document.objectTypes) {
    if (keys.has(type.key)) add("error", "object-type/duplicate-key", type.key, "duplicate object type key");
    keys.add(type.key);
    if (!type.key) add("error", "object-type/key-missing", type.displayName || "?", "object type has no key");
    else if (!/^[a-z][a-z0-9_]*$/.test(type.key)) {
      add("warning", "object-type/key-shape", type.key, "expected a lowercase slug (a-z, 0-9, _)");
    }
    if (!type.displayName?.trim()) {
      add("error", "object-type/display-name-missing", type.key, "a type needs a display name");
    }
    // Their build rejects an ontology without one, and for the same reason: a
    // model whose instances cannot be identified cannot be joined to anything.
    if (!type.properties.some((property) => property.isIdentifier)) {
      add("error", "object-type/no-identifier", type.key, "no property is marked as the identifier");
    }
    if (type.properties.length === 0) {
      add("warning", "object-type/no-properties", type.key, "no properties: nothing to show or query");
    } else if (type.properties.length > 8) {
      add("warning", "object-type/many-properties", type.key, `${type.properties.length} properties (guide suggests 3-8)`);
    }
    if (/^(item|thing|data|entity|record|object)$/i.test(type.key)) {
      add("warning", "object-type/generic-name", type.key, "a domain-specific noun searches and reads better");
    }
    const names = new Set<string>();
    for (const property of type.properties) {
      if (!property.name?.trim()) add("error", "property/name-missing", type.key, "a property needs a name");
      if (names.has(property.name)) {
        add("error", "property/duplicate-name", `${type.key}.${property.name}`, "duplicate property name");
      }
      names.add(property.name);
      if (!DOCUMENT_PROPERTY_TYPES.includes(property.type)) {
        add("error", "property/unknown-type", `${type.key}.${property.name}`, `unsupported type ${String(property.type)}`);
      }
      if (property.enum && property.enum.length === 0) {
        add("warning", "property/empty-enum", `${type.key}.${property.name}`, "an empty enum says nothing");
      }
    }
  }

  if (document.objectTypes.length === 0) {
    add("error", "document/no-object-types", "objectTypes", "a document with no object types models nothing");
  }
  if (document.objectTypes.length > 10) {
    add("warning", "document/many-types", "objectTypes", `${document.objectTypes.length} object types; the guide says focus on 5-8`);
  }

  const relationKeys = new Set<string>();
  for (const relation of document.relationTypes) {
    if (relationKeys.has(relation.key)) {
      add("error", "relation-type/duplicate-key", relation.key, "duplicate relation type key");
    }
    relationKeys.add(relation.key);
    if (!LINK_CARDINALITIES.includes(relation.cardinality)) {
      // Reported, never coerced: an unknown cardinality is a fact about the
      // source we failed to understand, and guessing it changes the model.
      add("error", "relation-type/unknown-cardinality", relation.key, `unsupported cardinality ${String(relation.cardinality)}`);
    }
    for (const [role, endpoint] of [["source", relation.sourceNodeTypeKey], ["target", relation.targetNodeTypeKey]] as const) {
      if (!endpoint) add("error", `relation-type/${role}-missing`, relation.key, `${role} endpoint is missing`);
      else if (!keys.has(endpoint)) {
        add("error", `relation-type/${role}-unknown`, relation.key, `${role} endpoint "${endpoint}" is not an object type here`);
      }
    }
    // Their guide: a relationship name is a verb. Checked loosely so a real
    // noun-as-verb ("use", "value") does not produce a false accusation.
    if (/\b(ownership|relationship|association|linkage|membership)\b/i.test(relation.displayName ?? "")) {
      add("warning", "relation-type/noun-name", relation.key, "relationship names read better as verbs");
    }
    for (const attribute of relation.attributes ?? []) {
      if (!attribute.name?.trim()) {
        add("error", "relation-attribute/name-missing", relation.key, "a relationship attribute needs a name");
      }
    }
  }
  if (document.objectTypes.length > 1 && document.relationTypes.length === 0) {
    add("warning", "document/no-relations", "relationTypes", "disconnected nodes: nothing to traverse");
  }

  return problems;
}

export interface DocumentSourceRows {
  domain: { slug: string; displayName: string; description?: string | null; version?: number };
  nodeTypes: Array<{
    key: string;
    display_name?: string;
    displayName?: string;
    description?: string | null;
    properties_schema?: Record<string, unknown> | null;
    propertiesSchema?: Record<string, unknown> | null;
    /**
     * The stored order column. Read here so a caller that has the rows does not
     * have to restate the order — that restatement is what this column replaced.
     */
    property_order?: string[] | null;
  }>;
  relationTypes: Array<{
    key: string;
    display_name?: string;
    displayName?: string;
    description?: string | null;
    cardinality?: string | null;
    metadata?: Record<string, unknown> | null;
  }>;
  /** Where storage could not tell us the order, this is how we were told. */
  propertyOrder?: Record<string, string[]>;
  exportedAt?: string;
  origin?: string;
}

/** Read the endpoint keys without importing the store's reader (layering). */
function endpointsFromMetadata(metadata: Record<string, unknown> | null | undefined): {
  source?: string;
  target?: string;
} {
  if (!metadata || typeof metadata !== "object") return {};
  const source = metadata.sourceNodeTypeKey;
  const target = metadata.targetNodeTypeKey;
  return {
    ...(typeof source === "string" && source ? { source: source } : {}),
    ...(typeof target === "string" && target ? { target: target } : {}),
  };
}

function orderProperties(
  schema: Record<string, unknown>,
  declared: string[] | undefined,
  problems: DocumentProblem[],
  typeKey: string,
): DocumentObjectType["properties"] {
  // The sequencing rule lives in `propertyOrder.ts`, shared with the workbench,
  // so the document and the Schema page cannot order the same schema differently.
  const ordered = orderPropertyNames(Object.keys(schema), declared ?? []);

  return ordered.map((name) => {
    const raw = schema[name];
    const descriptor = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const type = descriptor.type;
    const known = (DOCUMENT_PROPERTY_TYPES as readonly string[]).includes(String(type));
    if (!known) {
      problems.push({
        severity: "error",
        code: "property/unknown-type",
        subject: `${typeKey}.${name}`,
        message: `storage held ${JSON.stringify(type)}, which is not one of our property types`,
      });
    }
    return {
      name,
      type: known ? (type as DocumentPropertyType) : "string",
      ...(typeof descriptor.description === "string" && descriptor.description
        ? { description: descriptor.description }
        : {}),
      ...(descriptor.format === "date" || descriptor.format === "date-time"
        ? { format: descriptor.format }
        : {}),
      ...(Array.isArray(descriptor.enum) ? { enum: descriptor.enum.map(String) } : {}),
      ...(typeof descriptor.unit === "string" && descriptor.unit ? { unit: descriptor.unit } : {}),
      ...(descriptor.isIdentifier === true ? { isIdentifier: true } : {}),
    };
  });
}

export interface RowsResult {
  document: OntologyDocument;
  /** What the storage held that we could not interpret. Never silently coerced:
   * an unrecognised cardinality that becomes `many_to_many` is indistinguishable
   * from a source that genuinely said `many_to_many`. */
  problems: DocumentProblem[];
}

export function documentFromRows(rows: DocumentSourceRows): RowsResult {
  const declarations = rows.propertyOrder ?? {};
  const problems: DocumentProblem[] = [];

  const document: OntologyDocument = {
    format: DOCUMENT_FORMAT,
    name: rows.domain.displayName,
    ...(rows.domain.description ? { description: rows.domain.description } : {}),
    exportedAt: rows.exportedAt ?? new Date().toISOString(),
    source: {
      domainSlug: rows.domain.slug,
      ...(typeof rows.domain.version === "number" ? { schemaVersion: rows.domain.version } : {}),
      ...(rows.origin ? { origin: rows.origin } : {}),
    },
    objectTypes: rows.nodeTypes.map((type) => {
      const schema = type.properties_schema ?? type.propertiesSchema ?? {};
      // The stored column is the truth; `rows.propertyOrder` is a caller telling
      // us what storage cannot know (an older row, or a document being written).
      const declared = declarations[type.key] ?? readPropertyOrder(type);
      return {
        key: type.key,
        displayName: type.display_name ?? type.displayName ?? type.key,
        ...(type.description ? { description: type.description } : {}),
        // Storage is jsonb, which does not preserve key order. Saying "sorted"
        // is honest; presenting the map's arbitrary order as the source's would not be.
        orderSource: propertyOrderSource(declared ?? []),
        properties: orderProperties(schema, declared, problems, type.key),
      };
    }),
    relationTypes: rows.relationTypes.map((relation) => {
      const endpoints = endpointsFromMetadata(relation.metadata);
      return {
        key: relation.key,
        displayName: relation.display_name ?? relation.displayName ?? relation.key,
        ...(relation.description ? { description: relation.description } : {}),
        cardinality: (LINK_CARDINALITIES as readonly string[]).includes(String(relation.cardinality))
          ? (relation.cardinality as LinkCardinality)
          : "many_to_many",
        ...(LINK_CARDINALITIES.includes(relation.cardinality as LinkCardinality)
          ? {}
          : (problems.push({
              severity: "error" as const,
              code: "relation-type/unknown-cardinality",
              subject: relation.key,
              message: `storage held ${JSON.stringify(relation.cardinality)}, which is not one of our cardinalities`,
            }),
            {})),
        sourceNodeTypeKey: endpoints.source ?? "",
        targetNodeTypeKey: endpoints.target ?? "",
      };
    }),
  };

  return { document, problems };
}

export interface DocumentWritePlan {
  objectTypes: Array<{
    key: string;
    displayName: string;
    description?: string | null;
    propertiesSchema: Record<string, unknown>;
    /** The order, kept beside the map because jsonb will not keep it. */
    propertyOrder: string[];
  }>;
  relationTypes: Array<{
    key: string;
    displayName: string;
    description?: string | null;
    cardinality: LinkCardinality;
    sourceNodeTypeKey: string;
    targetNodeTypeKey: string;
  }>;
}

/**
 * The write side, shaped for the store — with the property order carried
 * *beside* the schema map rather than inside it, because that is the only place
 * it can survive a round trip through `jsonb`. This is the bridge to the storage
 * change; until that lands, callers can still persist the order themselves.
 */
export function documentToWritePlan(document: OntologyDocument): DocumentWritePlan {
  const canonical = canonicalize(document);
  return {
    objectTypes: canonical.objectTypes.map((type) => ({
      key: type.key,
      displayName: type.displayName,
      description: type.description ?? null,
      propertiesSchema: Object.fromEntries(
        type.properties.map((property) => [
          property.name,
          {
            type: property.type,
            ...(property.description ? { description: property.description } : {}),
            ...(property.format ? { format: property.format } : {}),
            ...(property.enum ? { enum: property.enum } : {}),
            ...(property.unit ? { unit: property.unit } : {}),
            ...(property.isIdentifier ? { isIdentifier: true } : {}),
          },
        ]),
      ),
      propertyOrder: type.properties.map((property) => property.name),
    })),
    relationTypes: canonical.relationTypes.map((relation) => ({
      key: relation.key,
      displayName: relation.displayName,
      description: relation.description ?? null,
      cardinality: relation.cardinality,
      sourceNodeTypeKey: relation.sourceNodeTypeKey,
      targetNodeTypeKey: relation.targetNodeTypeKey,
    })),
  };
}

export interface ParseResult {
  document?: OntologyDocument;
  problems: DocumentProblem[];
}

/**
 * Parse a document without throwing on content problems — the caller decides
 * what to do with the problems, and an import that is 90% understood should be
 * reportable rather than lost.
 */
export function parseDocument(text: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      problems: [
        {
          severity: "error",
          code: "document/not-json",
          subject: "document",
          message: String((error as Error).message),
        },
      ],
    };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      problems: [{ severity: "error", code: "document/not-an-object", subject: "document", message: "expected a JSON object" }],
    };
  }

  const candidate = parsed as OntologyDocument;
  const problems = validateDocument(candidate);
  if (problems.some((problem) => problem.severity === "error")) {
    return { problems };
  }
  const document = canonicalize(candidate);
  return { document: { ...document, fingerprint: fingerprintDocument(document) }, problems };
}
