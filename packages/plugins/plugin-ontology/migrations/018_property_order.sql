-- Ontology plugin — the display order of the properties of an object type.
--
-- `properties_schema` is `jsonb`, and `jsonb` does not preserve the order of the
-- KEYS of an object — it stores them in its own order — so the Schema page has
-- never been able to show the field order the source declared. The extractors do
-- know it (`ExtractedProperty[]` is an ordered array out of the DDL, Java, MyBatis
-- and proto parsers); nothing recorded it on the way to the database.
--
-- The order is stored as jsonb and NOT as `text[]`, for a runtime reason worth
-- writing down: the host SqlClient binds each parameter as a scalar, so a JS array
-- never reaches PostgreSQL as a `text[]` and the statement fails at runtime — the
-- same trap GraphStore.migratePropertyRenames documents for the jsonb `?|`
-- operator. A jsonb parameter binds as a string. What makes this work at all, and
-- the distinction that is easy to get backwards: jsonb reorders the keys of an
-- object but preserves the element order of an ARRAY. This column holds an array,
-- so the order survives.
--
-- The default is an empty jsonb array, so every existing row reads back as
-- unknown. A reader reports `sorted` for those rather than presenting the
-- arbitrary map order as the order the source declared — no order has ever been
-- recorded, and claiming one would be inventing history. Same ruling as the
-- schema_version default of 0 in 013.
--
-- Namespace schema: plugin_ontology_b62f8af3e9 (host-derived; see 001_ontology.sql).
-- NOTE: no apostrophes in comments (migration validator string stripper).

ALTER TABLE plugin_ontology_b62f8af3e9.ontology_node_types
  ADD COLUMN property_order jsonb NOT NULL DEFAULT '[]'::jsonb;
