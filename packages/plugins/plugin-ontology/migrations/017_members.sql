-- Ontology plugin — members.
--
-- Roles used to be a string array on an API key, which is enough to decide what
-- a *credential* may do and not enough to decide what a *person* may do: changing
-- a role change meant minting a new key, and there was no way to stop
-- someone without deleting the key that other things might reference.
--
-- A member is the identity: a person or a service in a tenant, with roles and a
-- status. A key may name the member it belongs to, in which case the member owns
-- the roles and the key is only a credential.
--
-- actor_ref is the caller identity the surrounding system uses: the host user id
-- when the ontology runs as a plugin, or any stable external id when it does not.
-- It is unique per tenant so the same person cannot hold two roles at once.
--
-- status: active | suspended. A suspended member keeps their history and loses
-- their access; suspension is not deletion, because "who did this" has to survive
-- the decision to stop them.
--
-- Namespace schema: plugin_ontology_b62f8af3e9 (host-derived; see 001_ontology.sql).
-- NOTE: no apostrophes in comments (migration validator string stripper).

CREATE TABLE plugin_ontology_b62f8af3e9.ontology_members (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL REFERENCES plugin_ontology_b62f8af3e9.ontology_tenants(id) ON DELETE CASCADE,
  actor_ref    text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  roles        jsonb NOT NULL DEFAULT '[]'::jsonb,
  status       text NOT NULL DEFAULT 'active',
  created_by   text NOT NULL DEFAULT 'system',
  is_deleted   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, actor_ref)
);

-- A key may belong to a member; when it does, the member owns the roles.
ALTER TABLE plugin_ontology_b62f8af3e9.ontology_api_keys
  ADD COLUMN member_id uuid REFERENCES plugin_ontology_b62f8af3e9.ontology_members(id) ON DELETE SET NULL;

CREATE INDEX ontology_members_tenant_idx
  ON plugin_ontology_b62f8af3e9.ontology_members (tenant_id, is_deleted);
