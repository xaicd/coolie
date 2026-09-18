-- Ops console — the plugin own state.
--
-- The console reads core tables (see `coreReadTables` in src/manifest.ts) and
-- owns exactly one thing itself: a free-text note per client, which is the piece
-- of operator context the control plane has nowhere to keep ("waiting on the
-- invoice", "renewal due in March").
--
-- The namespace exists because declaring `coreReadTables` requires declaring
-- `migrationsDir`, and the host applies migration files verbatim, so every object
-- reference is fully qualified.
--
-- Namespace schema: plugin_ops_console_5bcbc10c69 (host-derived; see src/manifest.ts).
-- NOTE: no apostrophes in comments (migration validator string stripper).

CREATE TABLE plugin_ops_console_5bcbc10c69.ops_client_flags (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  note       text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
