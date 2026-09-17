# Third-party notices — ontology sample domains

## Microsoft Ontology Playground

The sample domain content in `src/samples/ontology-domains.json` is derived from
the Microsoft Ontology Playground catalogue.

- Source: <https://github.com/microsoft/Ontology-Playground>
- Pinned revision: `792d9b507c45` (recorded in the generated file's `source` block)
- License: MIT
- Copyright: Microsoft Corporation
- Upstream author of the catalogue entries: `ontology-quest`

Under the MIT licence the copyright notice and permission notice must be
preserved for redistributed copies. This file is that preservation; the same
notice appears in every file generated from the catalogue by
`scripts/convert-ontology-playground.mjs`.

**Microsoft trademarks.** The Playground repository carries a trademark notice
requiring that its marks and logos not be used in a way that suggests Microsoft
sponsorship or endorsement. Accordingly:

- The sample domains are presented as *sample content*, never branded as
  Microsoft or Fabric IQ.
- No Microsoft logos, product names or brand colour values are carried over. The
  source's `ont:icon` and `ont:color` element values are deliberately dropped by
  the converter.
- The domain named **"Fourth Coffee"** and the retail/supply-chain material are
  upstream's own teaching scenarios, kept under their original names so the
  provenance stays checkable.

## What is derived and what is not

Derived (content, relicensed under MIT terms with attribution):

- object type keys, display names and descriptions
- property keys, their types (`string` / `number` / `boolean`), descriptions,
  units, enum value lists and identifier flags
- relationship keys, display names, descriptions, endpoints and cardinality

**Not** adopted (deliberately):

- RDF/OWL as a storage or interchange format. The converter reads a shallow
  subset of OWL once, at build time, and emits our own node type / relation type
  shape. No OWL semantics, class expressions or reasoning enter this repository.
- Link attributes (`ont:relationshipAttributeOf`). Three in the Fourth Coffee
  domain. We have no place to store a property belonging to a relationship, so
  they are dropped and counted in the generated file rather than hung on a node.

## Regenerating

```sh
git clone --depth 1 https://github.com/microsoft/Ontology-Playground.git /tmp/ontplay
node scripts/convert-ontology-playground.mjs /tmp/ontplay
```

The converter refuses to write if it does not understand something in the
source, and verifies that every element it consumes was either carried into the
output or deliberately skipped. Do not hand-edit the generated file: re-run the
converter so the pinned revision and this notice stay true.
