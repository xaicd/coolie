#!/usr/bin/env node
/**
 * Convert the Microsoft Ontology Playground catalogue into our sample domains.
 *
 * Why a converter rather than a copy: their files are RDF/OWL and ours are
 * node types with a `propertiesSchema` map and relation types whose endpoints
 * live in `metadata`. The two models agree on substance (entity → object type,
 * datatype property → owned property, object property → link type with
 * cardinality) and disagree on everything else, so a one-time conversion whose
 * output is checked in — and reviewed as data — beats a runtime dependency on a
 * format we deliberately do not adopt.
 *
 * Two things this deliberately does NOT carry over:
 *
 *   - `ont:icon` / `ont:color`. Their UI hints. We have no icon column on a node
 *     type, and a hex colour written into our tree would fail the token gate in
 *     `ui/`, so dropping them is the honest move rather than parking them in a
 *     metadata bag nobody reads.
 *   - OWL. There is no reasoning here and we do not want any: their files use a
 *     shallow subset (classes, datatype properties, object properties with
 *     cardinality) and this reads exactly that subset. If a file ever grows a
 *     restriction or a class expression, the parser will not silently ignore it —
 *     it counts what it did not understand and fails.
 *
 * Usage:
 *   node scripts/convert-ontology-playground.mjs <path-to-ontology-playground>
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";

/** Our property types. A descriptor outside this set would be stored and then
 * never rendered, which is the failure this converter exists to prevent. */
const PROPERTY_TYPES = new Set(["string", "number", "boolean"]);

/** Ours are underscored; theirs are hyphenated. Mapping this wrong yields a
 * cardinality the store accepts and the UI cannot name. */
const CARDINALITY = {
  "one-to-one": "one_to_one",
  "one-to-many": "one_to_many",
  "many-to-one": "many_to_one",
  "many-to-many": "many_to_many",
};

/** Their `propertyType` / `attributeType` → our descriptor. */
function descriptorFor(type, extras = {}) {
  const normalized = String(type ?? "string").trim().toLowerCase();
  const out = {};
  switch (normalized) {
    case "string":
      out.type = "string";
      break;
    case "integer":
    case "int":
      out.type = "number";
      break;
    case "decimal":
    case "double":
    case "float":
      out.type = "number";
      break;
    case "boolean":
    case "bool":
      out.type = "boolean";
      break;
    case "date":
      out.type = "string";
      out.format = "date";
      break;
    case "datetime":
    case "date-time":
      out.type = "string";
      out.format = "date-time";
      break;
    case "enum":
      out.type = "string";
      break;
    default:
      // Unmapped types are reported, never quietly coerced to string.
      return { unmapped: normalized };
  }
  return { descriptor: { ...out, ...extras } };
}

/**
 * Text content of an element, tolerating attributes on the opening tag.
 *
 * `<ont:isIdentifier rdf:datatype="…boolean">true</ont:isIdentifier>` is the
 * same element as `<ont:isIdentifier>true</ont:isIdentifier>`, but a stricter
 * pattern silently reads the former as absent — and "absent" is indistinguishable
 * from "the source never had it". Every read is counted so the fidelity check at
 * the end of `parseOntology` can prove nothing was dropped that way.
 */
let reads = new Map();
const tag = (block, name) => {
  const match = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  if (!match) return undefined;
  reads.set(name, (reads.get(name) ?? 0) + 1);
  return match[1].trim();
};

/** How many times an element appears in the source document. */
const occurrences = (xml, name) =>
  (xml.match(new RegExp(`<${name}\\b`, "g")) ?? []).length;

/**
 * An element that points at something else rather than carrying text:
 * `<rdfs:domain rdf:resource="http://…/Customer"/>`. The first version of this
 * read them as text elements, got nothing, and reported every property as
 * ownerless — which is how the mistake surfaced instead of a silent empty schema.
 */
const resourceOf = (block, element) => {
  const match = block.match(new RegExp(`<${element}\\b[^>]*rdf:resource="([^"]*)"`, "i"));
  return match ? match[1].trim() : undefined;
};

const attr = (openTag, name) => {
  const match = openTag.match(new RegExp(`${name}="([^"]*)"`, "i"));
  return match ? match[1].trim() : undefined;
};

/** Last path segment of an ontology URL: .../cosmic-coffee-company/Customer → Customer */
const lastSegment = (url) => (url ? url.replace(/\/+$/, "").split("/").pop() : undefined);

/**
 * Our type keys are lowercase slugs, and the source is inconsistent about this:
 * a class URL ends in `Customer` while `ont:fromEntityId` says `customer`. The
 * `-EntityId` values are the authoritative identifiers (the relationships point
 * at them), so keys are the lowercased segment and the class's own label stays
 * the display name. Without this the endpoints referenced types that did not
 * exist under that spelling.
 */
const normalizeKey = (value) => (value ? value.toLowerCase() : undefined);

function parseOntology(xml) {
  // Per-document, not per-process: a shared counter made the fidelity check
  // compare one file's reads against another file's source.
  reads = new Map();
  const problems = [];
  // Self-closing elements would be skipped by the block regexes below and vanish
  // without a word, so refuse them explicitly.
  const selfClosing = xml.match(/<(owl:Class|owl:DatatypeProperty|owl:ObjectProperty)[^>]*\/>/g);
  if (selfClosing) problems.push(`self-closing elements are not parsed: ${selfClosing.length}`);

  const blocksOf = (element) => {
    const out = [];
    const re = new RegExp(`<${element}\\b([^>]*)>([\\s\\S]*?)</${element}>`, "g");
    let match;
    while ((match = re.exec(xml)) !== null) out.push({ open: match[1], body: match[2] });
    return out;
  };

  // Blocks we read nothing from, on purpose — the ontology's own label and
  // comment (we take those from metadata.json) and link attributes (we have no
  // place for them). Their contents are still counted, because "we chose not to
  // read this" and "our pattern no longer matches this" must not look alike.
  const skippedBodies = blocksOf("owl:Ontology").map((b) => b.body);

  const classes = blocksOf("owl:Class");
  const entityKeys = new Set(classes.map((c) => normalizeKey(lastSegment(attr(c.open, "rdf:about")))));

  const nodeTypes = classes.map((c) => {
    const key = normalizeKey(lastSegment(attr(c.open, "rdf:about")));
    return {
      key,
      displayName: tag(c.body, "rdfs:label") ?? key,
      description: tag(c.body, "rdfs:comment") ?? null,
    };
  });

  const unmapped = [];
  const relationships = [];

  for (const prop of blocksOf("owl:ObjectProperty")) {
    const from =
      normalizeKey(tag(prop.body, "ont:fromEntityId")) ??
      normalizeKey(lastSegment(resourceOf(prop.body, "rdfs:domain")));
    const to =
      normalizeKey(tag(prop.body, "ont:toEntityId")) ??
      normalizeKey(lastSegment(resourceOf(prop.body, "rdfs:range")));
    const raw = tag(prop.body, "ont:cardinality");
    const cardinality = raw ? CARDINALITY[raw] : undefined;
    if (raw && !cardinality) unmapped.push(`cardinality ${raw}`);
    if (!entityKeys.has(from) || !entityKeys.has(to)) {
      problems.push(`relation endpoint outside the entity set: ${from} -> ${to}`);
    }
    relationships.push({
      key: lastSegment(attr(prop.open, "rdf:about")),
      displayName: tag(prop.body, "rdfs:label") ?? lastSegment(attr(prop.open, "rdf:about")),
      description: tag(prop.body, "rdfs:comment") ?? null,
      from,
      to,
      cardinality: cardinality ?? "many_to_many",
    });
  }

  const linkAttributeCount = { value: 0 };
  const propertiesByEntity = new Map([...entityKeys].map((k) => [k, {}]));

  for (const prop of blocksOf("owl:DatatypeProperty")) {
    // An attribute that belongs to a link rather than to an entity. We have no
    // place to put one; it is counted and reported instead of being hung on the
    // wrong node. Checked *before* anything is read from the block: reading first
    // counted these values as carried out and then counted the block as skipped,
    // so three link attributes read as six.
    if (tag(prop.body, "ont:relationshipAttributeOf")) {
      linkAttributeCount.value += 1;
      skippedBodies.push(prop.body);
      continue;
    }
    const rawType = tag(prop.body, "ont:propertyType") ?? tag(prop.body, "ont:attributeType");
    const owner = normalizeKey(lastSegment(resourceOf(prop.body, "rdfs:domain")));
    if (!owner || !propertiesByEntity.has(owner)) {
      problems.push(`property with no known owner: ${tag(prop.body, "rdfs:label")} (domain ${owner})`);
      continue;
    }

    const extras = {};
    if (tag(prop.body, "ont:isIdentifier") === "true") extras.isIdentifier = true;
    const unit = tag(prop.body, "ont:unit");
    if (unit) extras.unit = unit;
    const allowed = tag(prop.body, "ont:enumValues");
    if (allowed) {
      extras.enum = allowed.split(",").map((value) => value.trim()).filter(Boolean);
    }

    const mapped = descriptorFor(rawType, extras);
    if (mapped.unmapped) {
      unmapped.push(`propertyType ${mapped.unmapped} (${tag(prop.body, "rdfs:label")})`);
      continue;
    }
    const name = tag(prop.body, "rdfs:label");
    const description = tag(prop.body, "rdfs:comment");
    if (description) mapped.descriptor.description = description;
    propertiesByEntity.get(owner)[name] = mapped.descriptor;
  }

  for (const type of nodeTypes) {
    type.propertiesSchema = propertiesByEntity.get(type.key) ?? {};
  }

  // Fidelity: for every element we consume, the source occurrence count must
  // equal the number of values we actually carried out. A mismatch means a read
  // pattern missed a spelling — the loss that is otherwise invisible, because a
  // missing value and a value that was never there look identical downstream.
  for (const name of ["rdfs:label", "rdfs:comment", "ont:isIdentifier", "ont:enumValues", "ont:unit", "ont:propertyType", "ont:attributeType"]) {
    const found = occurrences(xml, name);
    const carried = reads.get(name) ?? 0;
    const skipped = skippedBodies.reduce((sum, body) => sum + occurrences(body, name), 0);
    if (carried + skipped !== found) {
      problems.push(
        `${name}: ${found} in source, ${carried} carried out, ${skipped} deliberately skipped`,
      );
    }
  }

  return { nodeTypes, relationships, problems, unmapped, linkAttributes: linkAttributeCount.value };
}

function main() {
  const source = process.argv[2];
  if (!source || !existsSync(source)) {
    console.error("usage: node scripts/convert-ontology-playground.mjs <path-to-clone>");
    process.exit(1);
  }
  const catalogueDir = join(source, "catalogue", "official");
  const revision = execFileSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();

  const domains = [];
  const failures = [];
  for (const entry of readdirSync(catalogueDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    // Only the base ontology per domain. The `-step-N` variants are progressive
    // teaching material for the same domain and would be duplicates here.
    if (entry.name.includes("-step-")) continue;

    const dir = join(catalogueDir, entry.name);
    const rdf = readdirSync(dir).find((file) => file.endsWith(".rdf"));
    if (!rdf) continue;
    const metadataPath = join(dir, "metadata.json");
    const metadata = existsSync(metadataPath) ? JSON.parse(readFileSync(metadataPath, "utf8")) : {};

    const parsed = parseOntology(readFileSync(join(dir, rdf), "utf8"));
    if (parsed.problems.length > 0) {
      failures.push(`${entry.name}: ${parsed.problems.join("; ")}`);
      continue;
    }

    domains.push({
      key: entry.name,
      displayName: metadata.name ?? parsed.nodeTypes[0]?.displayName ?? entry.name,
      description: metadata.description ?? null,
      category: metadata.category ?? null,
      tags: Array.isArray(metadata.tags) ? metadata.tags : [],
      upstreamAuthor: metadata.author ?? null,
      nodeTypes: parsed.nodeTypes,
      relationTypes: parsed.relationships.map((relation) => ({
        key: relation.key,
        displayName: relation.displayName,
        description: relation.description,
        cardinality: relation.cardinality,
        sourceNodeTypeKey: relation.from,
        targetNodeTypeKey: relation.to,
      })),
      stats: {
        nodeTypes: parsed.nodeTypes.length,
        relationTypes: parsed.relationships.length,
        properties: parsed.nodeTypes.reduce((sum, type) => sum + Object.keys(type.propertiesSchema).length, 0),
        linkAttributesDropped: parsed.linkAttributes,
      },
      unmappedTypes: parsed.unmapped,
    });
  }

  if (failures.length > 0) {
    console.error("conversion refused — these files use something we do not understand:");
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
  }

  const payload = {
    _comment:
      "Generated by scripts/convert-ontology-playground.mjs. Do not hand-edit: re-run the converter so the provenance stays true. Source content is MIT licensed, (c) Microsoft Corporation — see THIRD_PARTY_NOTICES.md. Node type icons and colours from the source are deliberately dropped.",
    source: {
      repository: "https://github.com/microsoft/Ontology-Playground",
      revision,
      license: "MIT",
      retrievedAt: new Date().toISOString(),
      note: "Sample domain content only. The RDF/OWL *format* and any OWL semantics are not adopted.",
    },
    domains,
  };

  const out = resolve(process.cwd(), "packages/plugins/plugin-ontology/src/samples/ontology-domains.json");
  mkdirSync(resolve(out, ".."), { recursive: true });
  writeFileSync(out, JSON.stringify(payload, null, 2) + "\n");

  console.log(`converted ${domains.length} domains from ${basename(source)} @ ${revision.slice(0, 8)}`);
  for (const domain of domains) {
    const dropped = domain.stats.linkAttributesDropped;
    const unmapped = domain.unmappedTypes.length ? `  unmapped: ${domain.unmappedTypes.join(", ")}` : "";
    console.log(
      `  ${domain.key.padEnd(22)} ${String(domain.stats.nodeTypes).padStart(2)} types` +
        ` ${String(domain.stats.relationTypes).padStart(2)} relations` +
        ` ${String(domain.stats.properties).padStart(3)} properties` +
        (dropped ? `  link-attributes dropped: ${dropped}` : "") +
        unmapped,
    );
  }
  console.log(`\nwrote ${out}`);
}

main();
