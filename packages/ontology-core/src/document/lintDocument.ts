/**
 * Modelling lint — will this model be *good*, as opposed to *loadable*?
 *
 * `validateDocument` answers one question: can this be imported as a working
 * model. This answers the other one, and they are deliberately separate because
 * a domain can import perfectly and still be unusable.
 *
 * Every rule here traces to a documented rule from the upstream project, not to
 * our taste. Their Ontology Design Patterns article and authoring guide name the
 * anti-patterns explicitly, and two of them land directly on how this repository
 * builds domains:
 *
 *  - **"Over-modelling: every internal table becomes an entity. Model what users
 *    will query, not your schema."** Our scanner and fold pipeline turn tables and
 *    classes into object types by design, so this is the *default* outcome here,
 *    not an edge case. A domain imported from a legacy system is over-modelled
 *    until a human says otherwise, and that has to be visible.
 *  - **"Model relationships, not foreign keys."** A `customer_id` column is not a
 *    property; it is a named relationship whose meaning was lost when it became a
 *    column. We read DDL, so we reproduce that loss faithfully.
 *
 * Each finding carries the fix, because a rule that only says "this is wrong"
 * trains people to ignore the list.
 */
import type { OntologyDocument } from "./OntologyDocument.js";

export interface LintFinding {
  severity: "warning" | "info";
  code: string;
  subject: string;
  message: string;
  /** The concrete change, phrased as the fix rather than the complaint. */
  advice: string;
}

/** Abbreviations the guide names, plus the ones its examples imply. */
const ABBREVIATIONS = new Set([
  "qty", "amt", "dt", "desc", "num", "no", "nm", "addr", "cnt", "val",
  "usr", "pwd", "ts", "idx", "fk", "pk", "org", "dept", "mgr",
]);

/** Vague relationship names the guide calls out: `relatedTo`, `hasLink`. */
const VAGUE_RELATIONS = new Set([
  "relatedto", "related", "haslink", "link", "linkto", "association", "assoc",
  "relation", "relationship", "connects", "connectedto", "references", "ref",
]);

/** Warehouse-style prefixes: `tbl_cust_v2`, `DIM_PRODUCT`, `fact_orders`. */
const INTERNAL_TABLE_PATTERN = /(^|_)(tbl|dim|fact|stg|staging|tmp|raw|src|ods|dwd|dws)(_|$)|_v\d+$/i;

/** A column that is a foreign key dressed as a property: `customer_id`, `customerId`. */
const FK_PROPERTY_PATTERN = /(^|_)(id|key)$|(_id|Id|ID|Key)$/;

const looksLikeForeignKey = (name: string, isIdentifier: boolean): boolean => {
  if (isIdentifier) return false;
  if (!FK_PROPERTY_PATTERN.test(name)) return false;
  // `id` alone is the entity's own key, not a pointer at another one.
  const stripped = name.replace(/(_?id|_?key)$/i, "");
  return stripped.length > 0;
};

export function lintDocument(document: OntologyDocument): LintFinding[] {
  const findings: LintFinding[] = [];
  const add = (
    severity: LintFinding["severity"],
    code: string,
    subject: string,
    message: string,
    advice: string,
  ) => findings.push({ severity, code, subject, message, advice });

  const keyFor = (name: string) => name.trim().toLowerCase().replace(/[\s_-]+/g, "");

  // The documented headline anti-pattern, and the one we produce by default.
  const internalNames = document.objectTypes.filter((type) => INTERNAL_TABLE_PATTERN.test(type.key));
  if (internalNames.length >= Math.max(2, Math.ceil(document.objectTypes.length * 0.3))) {
    add(
      "warning",
      "domain/over-modelled",
      "objectTypes",
      `${internalNames.length} of ${document.objectTypes.length} object types are named like internal tables (${internalNames
        .slice(0, 3)
        .map((type) => type.key)
        .join(", ")})`,
      "model what people will query, not the schema: keep the concepts someone would name in a question, and fold the rest in as properties or drop them",
    );
  }

  const byKey = new Map(document.objectTypes.map((type) => [type.key, type]));

  for (const type of document.objectTypes) {
    if (INTERNAL_TABLE_PATTERN.test(type.key)) {
      add(
        "info",
        "object-type/internal-name",
        type.key,
        "the key looks like an internal table name",
        "rename it to the concept a person would say out loud",
      );
    }
    if (type.properties.length > 30) {
      add(
        "warning",
        "object-type/god-entity",
        type.key,
        `${type.properties.length} properties`,
        // Their example: a Person with salary, patientId, courseGrade and
        // accountBalance is four concepts wearing one name.
        "split it into focused entity types and relate them",
      );
    } else if (type.properties.length > 8) {
      add(
        "info",
        "object-type/many-properties",
        type.key,
        `${type.properties.length} properties`,
        "the guide suggests 3-8; move the rest to a related type or drop them",
      );
    }

    const identifiers = type.properties.filter((property) => property.isIdentifier);
    if (identifiers.length > 1) {
      add(
        "warning",
        "object-type/compound-identifier",
        type.key,
        `${identifiers.length} properties marked as identifiers (${identifiers.map((p) => p.name).join(", ")})`,
        "most tools expect a single identifier per entity; keep the stable business key and demote the rest to plain properties",
      );
    }
    if (identifiers.length === 1) {
      const identifier = identifiers[0];
      // Their guidance: the identifier should be a stable business key rather
      // than an internal auto-increment.
      if (/^(id|_id|rowid|oid|uuid|guid|seq)$/i.test(identifier.name)) {
        add(
          "info",
          "object-type/weak-identifier",
          `${type.key}.${identifier.name}`,
          "looks like a surrogate key",
          "prefer a stable business key (isbn, email, orderNumber) so instances can be counted and joined across systems",
        );
      }
    }

    const seen = new Set<string>();
    for (const property of type.properties) {
      const key = keyFor(property.name);
      if (ABBREVIATIONS.has(property.name.toLowerCase())) {
        add(
          "warning",
          "property/abbreviated",
          `${type.key}.${property.name}`,
          "abbreviated name",
          "spell it out (quantity, amount, createdDate) so search and natural-language queries can match it",
        );
      }
      if (looksLikeForeignKey(property.name, property.isIdentifier === true)) {
        const target = byKey.get(
          property.name.replace(/(_?id|_?key)$/i, "").replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase(),
        );
        add(
          "warning",
          "property/foreign-key",
          `${type.key}.${property.name}`,
          target ? `points at ${target.key} via a foreign key column` : "looks like a foreign key column",
          target
            ? `model the relationship, not the key: a named relation ${type.key} -> ${target.key} carries the meaning that "${property.name}" lost`
            : "model it as a named relationship instead of a key column",
        );
      }
      if (seen.has(key)) {
        add(
          "info",
          "property/name-collision",
          `${type.key}.${property.name}`,
          "collides with another property once punctuation is ignored",
          "two names that differ only by case or separator will be read as the same field",
        );
      }
      seen.add(key);
      if (property.name.includes("_") && /[A-Z]/.test(property.name)) {
        add(
          "info",
          "property/mixed-naming",
          `${type.key}.${property.name}`,
          "mixed snake_case and camelCase",
          "pick one convention per domain",
        );
      }
    }
  }

  for (const relation of document.relationTypes) {
    if (VAGUE_RELATIONS.has(keyFor(relation.displayName))) {
      add(
        "warning",
        "relation-type/vague-name",
        relation.key,
        `"${relation.displayName}" does not say what the connection means`,
        "use a specific verb: places, contains, prescribes, enrolledIn",
      );
    }
    if (!relation.displayName?.trim()) {
      add(
        "warning",
        "relation-type/unnamed",
        relation.key,
        "no display name",
        "name it with the verb that reads correctly on the edge, in both directions you care about",
      );
    }
  }

  // A → B and B → A both one-to-one: their guidance is that this is usually one
  // concept drawn twice.
  const oneToOne = document.relationTypes.filter((relation) => relation.cardinality === "one_to_one");
  const seenPair = new Set<string>();
  for (const relation of oneToOne) {
    const pair = [relation.sourceNodeTypeKey, relation.targetNodeTypeKey].sort().join("|");
    if (relation.sourceNodeTypeKey === relation.targetNodeTypeKey) continue;
    if (seenPair.has(pair)) {
      add(
        "warning",
        "relation-type/circular-one-to-one",
        relation.key,
        `another one-to-one runs between ${relation.sourceNodeTypeKey} and ${relation.targetNodeTypeKey}`,
        "two one-to-one relations over the same pair are usually the same entity — consider merging them",
      );
    }
    seenPair.add(pair);
  }

  // Both directions of the same pair is legitimate when the cardinalities differ,
  // but reporting it is useful because it is also the most common modelling slip.
  const directed = new Map<string, string[]>();
  for (const relation of document.relationTypes) {
    const key = `${relation.sourceNodeTypeKey}->${relation.targetNodeTypeKey}`;
    directed.set(key, [...(directed.get(key) ?? []), relation.key]);
  }
  for (const [key, keys] of directed) {
    if (keys.length > 1) {
      add(
        "info",
        "relation-type/parallel",
        keys.join(", "),
        `${keys.length} relations run ${key}`,
        "if they mean the same connection, keep one and move what differs into its name",
      );
    }
  }

  return findings;
}
