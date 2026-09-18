# Property order survives storage

Date: 2026-09-18. Baseline: 27f4040194ddf244091c4f1267835b0fb2d798b5.

This closes the still-open item on
[`2026-09-17-ontology-standalone-and-upgrade.md`](./2026-09-17-ontology-standalone-and-upgrade.md):

> `propertiesSchema` field order does not survive Postgres `jsonb`, so the Schema
> page cannot present the source's order as the source's.

## 1. The problem, stated exactly

`ontology_node_types.properties_schema` is `jsonb`. Postgres `jsonb` does not
preserve object key order — it stores keys in its own order (by length, then
bytes) — so every reader that does `Object.entries(propertiesSchema)` gets an
arbitrary sequence. The extractors all know the real order: `ExtractedProperty[]`
is an ordered array out of `parseSqlDdl`, `parseJavaFile`, `parseMyBatisMapper`
and `parseProtoFile`. The order is lost at the step that folds that array into
the flat `field -> descriptor` map (`AstExtractor.extractRepoDraft`), and again
on the way back out of the database.

The exchange format already decided what to do about this. `OntologyDocument.ts`
carries `propertyOrder` and an explicit `orderSource: "declared" | "sorted"`, and
its header says why:

> **Property order is explicit.** Their format preserves order only through XML
> document order, which cannot transfer to Postgres `jsonb` — and did not transfer
> here, which is why the Schema page's field order does not match the source today.
> So order is data here, and where we cannot know it we say so.

That module's write bridge (`documentToWritePlan`) already emits `propertyOrder`
beside the schema map, with the note "until that lands, callers can still persist
the order themselves". **Nothing ever persisted it.** So this is not a new design:
it is wiring up a mechanism that was designed, written, documented and left
dangling.

## 2. Decision: order gets its own column

`ontology_node_types.property_order text[] NOT NULL DEFAULT '{}'` (migration
018). `text[]` preserves element order; a `jsonb` **object** cannot.

Rejected alternative: carrying it in the existing `metadata` jsonb bag, which is
where `provenance.ts` put `origin` and `sourceFiles`, on the argument that
"adding a column per future importer would mean a migration each time". That
argument is right for *importer bookkeeping* and wrong here, for three reasons:

1. **It is part of the model's shape, not where the type came from.** It has to be
   exposed through `describe-domain` and MCP, and carried in the exchange
   document, as a peer of the schema.
2. **It has to move with a property rename.** `updateNodeType` already migrates
   instance data for a declared `propertyRenames`; leaving the old name in the
   order vector would make the order reference a field that no longer exists. The
   rename path must rewrite the order in the same atomic edit.
3. **`metadata` is replaced wholesale** by any caller that passes it (importers
   do, on every publish). Order stored there would be clobbered by an unrelated
   provenance write, or left stale by a schema edit. A column next to
   `properties_schema`, written by the same two mutators, cannot drift.

The precedent is already in the repo for model-shape data: `layer`,
`layer_spec` and `implements_interfaces` are columns added by `003`, not
metadata keys. `metadata` is reserved for provenance.

`orderSource` is **derived, not stored**: a non-empty `property_order` means
`declared`; an empty one means `sorted` (we never knew, and we say so). Default
`'{}'` backfills every existing row as `sorted`, which is the honest answer — no
order has ever been recorded, and claiming one would be inventing history. This
is the same ruling as `013`'s `schema_version DEFAULT 0`.

## 3. Where the meaning is decided

One pure module, `packages/ontology-core/src/propertyOrder.ts`, no I/O, unit
tested on its own (the parsers' shape, per the standing rule that "the logic that
decides meaning" is pulled out of the I/O method):

- `orderPropertyNames(names, declared)` — declared names that are present, as a
  prefix, then the remainder **sorted**. A partial or stale declaration is
  therefore honoured as far as it goes and never presents map order as the
  source's.
- `orderSource(order)` — `declared` when the vector is non-empty, else `sorted`.
- `renameInPropertyOrder(order, renames)` — applies `oldKey -> newKey`, in place
  of the old name, so the order survives the rename that moved the data.
- `prunePropertyOrder(order, schema)` — drops names no longer in the schema, so a
  removal cannot leave a ghost.
- `readPropertyOrder(row)` — the one reader, tolerating null/absent.

`OntologyDocument.orderProperties` is rewritten to call `orderPropertyNames`
instead of keeping its own copy, so the document and the UI cannot order the same
schema differently. The UI reads through the same function.

## 4. Layers touched

1. **Core, pure** — `propertyOrder.ts` as above; `OntologyDocument` consumes it.
2. **Store** — `OntologyNodeTypeInput`/`Update`/`Row` gain `propertyOrder`;
   `createNodeType` inserts it; `updateNodeType` writes it only when provided and
   rewrites it through the rename/prune helpers when the schema changed;
   `describeDomain` and `listNodeTypes` return it. `NODE_TYPE_COLS` and
   `NODE_TYPE_COLS_NT` both grow.
3. **Extraction** — `extractRepoDraft` keeps a per-entity order (first-seen;
   a later source's new fields append, matching the existing per-field merge
   rule), and `RepoDraft.seedNodeTypes[]` carries `propertyOrder`.
4. **Worker / manifest** — publish, `create-node-type`, `update-node-type`,
   bootstrap and seed-samples pass it; the read handlers (`domain-detail`,
   `list-node-types`) expose it as `propertyOrder` beside `propertiesSchema`.
5. **UI** — `rowsFromSchema` takes the declared order and returns rows in it;
   the schema editor sends the row order back as `propertyOrder` on save, so a
   user-authored order survives the round trip rather than reverting to jsonb
   order. `SchemaPreviewPane`, the graph view's schema tab and `CitationPreview`
   all read the ordered rows.
6. **MCP** — the tool results carry `propertyOrder`, so an agent sees the same
   order a human does.

## 5. Verification

Not unit tests alone. The failure mode this feature exists to catch is invisible
to a fake db: a double returns whatever it was given, so it "preserves" order
trivially. So:

- a **real-Postgres** test in `packages/ontology-mcp/tests/` that writes a type
  with a declared order, re-reads it, and asserts the order came back — and that
  a type with no declared order reads as `sorted`;
- a store round-trip test for `createNodeType` -> `describeDomain`;
- a rename test asserting the order vector follows the rename and drops the old
  name;
- **live**: import a fixture whose DDL declares columns in a non-alphabetical
  order, then read the type back through the running instance and confirm the
  Schema page shows the source's order; confirm the dump shows `property_order`
  populated. If the UI cannot be driven to the end, say exactly where it stopped.

## 6. Risks and boundaries

- **A stale name in the order vector** is the failure to guard: the prune/rename
  helpers exist so the order can never name a property the schema does not have.
- **No reordering UI is added.** This makes the source's order survive and be
  shown; dragging fields into a new order is a separate feature and is not
  implied by this one.
- **`layer_spec`-style columns are the template**, not the `metadata` bag.
- The export document keeps its `orderSource: sorted` fallback for any row the
  column left empty — the honest answer, not a fabricated one.
