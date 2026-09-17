-- Ontology plugin — tenants and API keys.
--
-- The ontology borrowed both from the host: its tables referenced
-- public.companies for the tenant, and the host decided who the caller was. A
-- deployment without Paperclip has neither, so this is where the ontology starts
-- owning its own tenancy and its own credentials.
--
-- The foreign keys in this file point at ontology_tenants rather than at the host
-- table. Existing tables keep referencing public.companies — changing them is a
-- migration over live data and belongs with the cutover, not with this file.
--
-- ontology_tenants: one row per customer instance tenant.
-- ontology_api_keys: the only credential. key_hash is the salted hash, prefix is
-- the searchable and displayable half. secret material is never stored: the key
-- is shown once, at creation.
--
-- Namespace schema: plugin_ontology_b62f8af3e9 (host-derived; see 001_ontology.sql).
-- NOTE: no apostrophes in comments (migration validator string stripper).

CREATE TABLE plugin_ontology_b62f8af3e9.ontology_tenants (
  id          uuid PRIMARY KEY,
  slug        text NOT NULL,
  name        text NOT NULL,
  created_by  text NOT NULL DEFAULT 'system',
  is_deleted  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug)
);

CREATE TABLE plugin_ontology_b62f8af3e9.ontology_api_keys (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES plugin_ontology_b62f8af3e9.ontology_tenants(id) ON DELETE CASCADE,
  prefix      text NOT NULL,
  key_hash    text NOT NULL,
  label       text NOT NULL DEFAULT '',
  scope       text NOT NULL DEFAULT 'agent',
  roles       jsonb NOT NULL DEFAULT '[]'::jsonb,
  revoked_at  timestamptz,
  revoked_by  text,
  last_used_at timestamptz,
  created_by  text NOT NULL DEFAULT 'system',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prefix)
);

-- Authentication looks a key up by its prefix on every call, so the prefix is
-- the index that matters.
CREATE INDEX ontology_api_keys_tenant_idx
  ON plugin_ontology_b62f8af3e9.ontology_api_keys (tenant_id, revoked_at);
