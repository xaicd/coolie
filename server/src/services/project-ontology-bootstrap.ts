import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { pluginDatabaseNamespaces } from "@paperclipai/db";
import type { Db } from "@paperclipai/db";

/**
 * Coolie fork — wave302: 项目进厂即本体域 (constitution art. 2).
 *
 * Creating a project must atomically initialize a same-named ontology domain
 * in plugin-ontology's namespace, so a project can never land as a 裸项目
 * (bare project with no ontology). The write rides the caller's transaction:
 * either the project row, its domain, and the `project → domain` resource
 * link all commit together, or none of them do.
 *
 * Composition first (constitution art. 5): no new tables, no plugin RPC. The
 * host owns `plugin_database_namespaces`, and the two rows written here are
 * exactly what `PostgresGraphStore.createDomain` + `linkResource` would write
 * — same columns, same defaults — so the plugin's own readers (domain list,
 * resource link queries) see a first-class domain.
 *
 * Error-free by construction: postgres.js stashes the first in-transaction
 * query error and rethrows it when the transaction scope ends — even one a
 * SAVEPOINT recovered from — so a statement that raises 42P01 here would
 * poison the caller's whole transaction. Every probe below (namespace row,
 * `to_regclass` table check, slug lookup) is a query that cannot fail, and
 * the inserts can only fail on a same-slug race between two concurrent
 * creates of an identically named first project, which rolling back the
 * entire create is the correct answer to.
 *
 * Degrade, don't brick: when the ontology plugin is absent or its namespace
 * is not migrated, the bootstrap reports `skipped` and the project creation
 * still commits. An instance whose operator disabled plugin-ontology keeps a
 * working projects API; the default self-hosted install auto-installs the
 * plugin, so the no-bare-project invariant holds where the platform is whole.
 */

/** plugin-ontology's manifest id — matches the catalog entry in bundled-plugins.ts. */
export const ONTOLOGY_PLUGIN_KEY = "paperclipai.plugin-ontology";

const NAMESPACE_IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SLUG_MAX_LENGTH = 48;

export type ProjectOntologyBootstrap =
  | { status: "created"; domainId: string; slug: string }
  | { status: "skipped"; reason: "plugin-inactive" | "not-migrated" };

/**
 * Slug derivation mirrors the plugin UI's own convention
 * (`LegacyImportWizardModal`: lowercase, `[^a-z0-9_-]` → `_`), so a
 * project-born domain is indistinguishable from one a human created in the
 * wizard. Names with no ASCII alphanumeric (pure CJK/emoji) collapse to the
 * `project` base and disambiguate through the unique-suffix path.
 */
export function slugifyProjectDomain(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/_+$/g, "");
  return slug || "project";
}

/** Resolve the ontology plugin's physical namespace, host bookkeeping first. */
async function resolveOntologyNamespace(tx: Db): Promise<string | null> {
  const rows = await tx
    .select({ namespaceName: pluginDatabaseNamespaces.namespaceName })
    .from(pluginDatabaseNamespaces)
    .where(
      and(
        eq(pluginDatabaseNamespaces.pluginKey, ONTOLOGY_PLUGIN_KEY),
        eq(pluginDatabaseNamespaces.status, "active"),
      ),
    )
    .limit(1);
  const namespace = rows[0]?.namespaceName;
  if (!namespace || !NAMESPACE_IDENTIFIER_RE.test(namespace)) return null;
  return namespace;
}

export interface ProjectOntologyBootstrapInput {
  companyId: string;
  projectId: string;
  projectName: string;
  description?: string | null;
  icon?: string | null;
  /** Actor id for the audit columns (text, same slot the plugin's seeds use). */
  createdBy: string;
}

/**
 * Ensure the project's same-named domain + owner resource link exist, on the
 * caller's transaction. Idempotent by construction: the disambiguation slug
 * embeds the project's own uuid fragment, so a replayed create of the same
 * project lands on the same slug instead of colliding.
 */
export async function ensureProjectOntologyDomain(
  tx: Db,
  input: ProjectOntologyBootstrapInput,
): Promise<ProjectOntologyBootstrap> {
  const namespace = await resolveOntologyNamespace(tx);
  if (!namespace) return { status: "skipped", reason: "plugin-inactive" };
  const domainsTable = `${namespace}.ontology_domains`;
  const linksTable = `${namespace}.ontology_resource_links`;

  // A namespace row can outlive its tables (failed or partial install).
  // to_regclass answers NULL instead of raising, so a not-migrated plugin
  // degrades to `skipped` without ever producing an in-transaction error.
  const readiness = await tx.execute(
    sql`SELECT to_regclass(${domainsTable}) IS NOT NULL AS domains,
               to_regclass(${linksTable}) IS NOT NULL AS links`,
  );
  const ready = (Array.isArray(readiness) ? readiness[0] : undefined) as
    | { domains?: boolean; links?: boolean }
    | undefined;
  if (!ready?.domains || !ready?.links) {
    return { status: "skipped", reason: "not-migrated" };
  }

  const baseSlug = slugifyProjectDomain(input.projectName);
  // The suffixed slug embeds this project's own uuid fragment, so it can only
  // be held by a previous bootstrap of THIS project. A row carrying this
  // project's id in metadata is a replay: adopt the domain it already made
  // (whichever slug it landed on) instead of minting a second one.
  const suffixSlug = `${baseSlug}-${input.projectId.slice(0, 8)}`;
  const existing = await tx.execute(
    sql`SELECT id, slug, metadata->>'projectId' AS project_id
          FROM ${sql.raw(`"${namespace}".ontology_domains`)}
         WHERE company_id = ${input.companyId}
           AND (slug IN (${baseSlug}, ${suffixSlug}) OR metadata->>'projectId' = ${input.projectId})`,
  );
  const existingRows = (Array.isArray(existing) ? existing : []) as Array<
    { id?: string; slug?: string; project_id?: string }
  >;
  const replay = existingRows.find((row) => row.project_id === input.projectId && row.id);
  if (replay?.id && replay.slug) {
    return { status: "created", domainId: replay.id, slug: replay.slug };
  }

  const slug = existingRows.length > 0 ? suffixSlug : baseSlug;
  const domainId = randomUUID();
  await tx.execute(
    sql`INSERT INTO ${sql.raw(`"${namespace}".ontology_domains`)}
          (id, company_id, slug, display_name, description, icon, category,
           is_built_in, bootstrap_source, bootstrap_description,
           created_by, updated_by, metadata)
        VALUES (${domainId}, ${input.companyId}, ${slug}, ${input.projectName},
                ${input.description ?? null}, ${input.icon ?? "📦"}, ${"项目"},
                false, ${"system-seed"},
                ${"宪法第2条：项目进厂即本体域（wave302 项目创建原子初始化）"},
                ${input.createdBy}, ${input.createdBy},
                ${JSON.stringify({ projectId: input.projectId, origin: "project-create" })}::jsonb)`,
  );
  await tx.execute(
    sql`INSERT INTO ${sql.raw(`"${namespace}".ontology_resource_links`)}
          (id, company_id, domain_id, resource_kind, resource_id, resource_label, role,
           created_by, updated_by, metadata)
        VALUES (${randomUUID()}, ${input.companyId}, ${domainId}, ${"project"},
                ${input.projectId}, ${input.projectName}, ${"owner"},
                ${input.createdBy}, ${input.createdBy}, ${"{}"}::jsonb)`,
  );
  return { status: "created", domainId, slug };
}

