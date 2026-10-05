import { randomUUID } from "node:crypto";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  companies,
  createDb,
  pluginDatabaseNamespaces,
  pluginMigrations,
  plugins,
} from "@paperclipai/db";
import type { Db } from "@paperclipai/db";
import type { PaperclipPluginManifestV1 } from "@paperclipai/shared";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { pluginDatabaseService } from "../services/plugin-database.js";
import {
  ONTOLOGY_PLUGIN_KEY,
  ensureProjectOntologyDomain,
  slugifyProjectDomain,
} from "../services/project-ontology-bootstrap.js";

/**
 * wave302 — 宪法第2条 (项目进厂即本体域): creating a project atomically
 * initializes its same-named ontology domain plus the project→domain resource
 * link inside the caller's transaction.
 *
 * The embedded-Postgres cases run the REAL plugin-ontology migrations (same
 * trick as the bundled LLM Wiki case in plugin-database.test.ts), so the SQL
 * this service writes is exercised against the tables the plugin actually
 * ships — not a fixture lookalike.
 */

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres ontology bootstrap tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describe("slugifyProjectDomain", () => {
  it("mirrors the plugin UI convention (lowercase, non [a-z0-9_-] to _)", () => {
    expect(slugifyProjectDomain("Coolie Dev")).toBe("coolie_dev");
    expect(slugifyProjectDomain("Alpha-2  site!")).toBe("alpha-2_site");
  });

  it("falls back to the project base when nothing survives slugification", () => {
    expect(slugifyProjectDomain("官网重构")).toBe("project");
    expect(slugifyProjectDomain("已覆盖__核心__域")).toBe("project");
    expect(slugifyProjectDomain("！！！")).toBe("project");
  });

  it("caps the slug at 48 characters", () => {
    expect(slugifyProjectDomain("a".repeat(80))).toHaveLength(48);
  });
});

function ontologyManifest(): PaperclipPluginManifestV1 {
  return {
    id: ONTOLOGY_PLUGIN_KEY,
    apiVersion: 1,
    version: "0.1.0",
    displayName: "Ontology",
    description: "Ontology modeling plugin.",
    author: "Coolie",
    categories: ["automation", "ui"],
    capabilities: [
      "database.namespace.migrate",
      "database.namespace.read",
      "database.namespace.write",
      "companies.read",
    ],
    entrypoints: { worker: "./dist/worker.js" },
    database: {
      namespaceSlug: "ontology",
      migrationsDir: "migrations",
      coreReadTables: ["companies"],
    },
  };
}

describeEmbeddedPostgres("project ontology bootstrap", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let namespace = "";
  let pluginId = "";
  let packageRoot = "";
  const manifest = ontologyManifest();

  /** Recreate the migrated namespace from scratch — also repairs whatever a
   *  destructive test (drop schema, delete rows) left behind. */
  async function migrateOntologyNamespace() {
    if (namespace) {
      await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`));
    }
    await db.delete(pluginMigrations).where(eq(pluginMigrations.pluginKey, ONTOLOGY_PLUGIN_KEY));
    await db.delete(pluginDatabaseNamespaces).where(eq(pluginDatabaseNamespaces.pluginKey, ONTOLOGY_PLUGIN_KEY));
    const ns = await pluginDatabaseService(db).ensureNamespace(pluginId, manifest);
    if (!ns) throw new Error("ontology namespace was not ensured");
    namespace = ns.namespaceName;
    await pluginDatabaseService(db).applyMigrations(pluginId, manifest, packageRoot);
  }

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-ontology-bootstrap-");
    db = createDb(tempDb.connectionString);
    const repoRoot = path.basename(process.cwd()) === "server"
      ? path.resolve(process.cwd(), "..")
      : process.cwd();
    packageRoot = path.join(repoRoot, "packages", "plugins", "plugin-ontology");
    pluginId = randomUUID();
    await db.insert(plugins).values({
      id: pluginId,
      pluginKey: manifest.id,
      packageName: manifest.id,
      version: manifest.version,
      apiVersion: manifest.apiVersion,
      categories: manifest.categories,
      manifestJson: manifest,
      status: "installed",
      installOrder: 1,
    });
    await migrateOntologyNamespace();
  }, 120_000);

  afterEach(async () => {
    await migrateOntologyNamespace();
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function insertCompany(name = "本体工坊") {
    const id = randomUUID();
    await db.insert(companies).values({
      id,
      name,
      issuePrefix: `T${id.slice(1, 4).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    return id;
  }

  async function domainRows(companyId: string, slug?: string) {
    const result = await db.execute(
      slug === undefined
        ? sql`SELECT id, slug, display_name, category, bootstrap_source, lifecycle_state, metadata
              FROM ${sql.raw(`"${namespace}".ontology_domains`)}
              WHERE company_id = ${companyId}`
        : sql`SELECT id, slug, display_name, category, bootstrap_source, lifecycle_state, metadata
              FROM ${sql.raw(`"${namespace}".ontology_domains`)}
              WHERE company_id = ${companyId} AND slug = ${slug}`,
    );
    return Array.from(Array.isArray(result) ? result : []) as Array<Record<string, unknown>>;
  }

  it("creates the same-named domain and owner resource link on the caller's transaction", async () => {
    const companyId = await insertCompany();
    const projectId = randomUUID();

    const result = await db.transaction((tx) =>
      ensureProjectOntologyDomain(tx as unknown as Db, {
        companyId,
        projectId,
        projectName: "Coolie 平台研发",
        description: "wave302 交付",
        createdBy: "actor-test",
      }),
    );

    expect(result.status).toBe("created");
    if (result.status !== "created") return;
    expect(result.slug).toBe("coolie");

    const [domain] = await domainRows(companyId, result.slug);
    expect(domain).toMatchObject({
      display_name: "Coolie 平台研发",
      category: "项目",
      bootstrap_source: "system-seed",
      lifecycle_state: "draft",
    });
    expect((domain.metadata as Record<string, unknown>).projectId).toBe(projectId);

    const links = await db.execute(
      sql`SELECT resource_kind, resource_id, resource_label, role
          FROM ${sql.raw(`"${namespace}".ontology_resource_links`)}
          WHERE company_id = ${companyId} AND domain_id = ${result.domainId}`,
    );
    expect(Array.from(links as Record<string, unknown>[])).toEqual([
      { resource_kind: "project", resource_id: projectId, resource_label: "Coolie 平台研发", role: "owner" },
    ]);
  });

  it("rolls the domain back with the transaction when the caller fails", async () => {
    const companyId = await insertCompany();

    await expect(
      db.transaction(async (tx) => {
        await ensureProjectOntologyDomain(tx as unknown as Db, {
          companyId,
          projectId: randomUUID(),
          projectName: "Atom 原子验证",
          createdBy: "actor-test",
        });
        throw new Error("caller failed after bootstrap");
      }),
    ).rejects.toThrow("caller failed after bootstrap");

    expect(await domainRows(companyId)).toHaveLength(0);
  });

  it("disambiguates a taken slug with the project's own uuid fragment", async () => {
    const companyId = await insertCompany();
    // A human already holds the slug "alpha" in this company.
    await db.execute(
      sql`INSERT INTO ${sql.raw(`"${namespace}".ontology_domains`)}
            (id, company_id, slug, display_name, bootstrap_source)
          VALUES (${randomUUID()}, ${companyId}, ${"alpha"}, ${"Alpha 手工域"}, ${"manual"})`,
    );

    const projectId = randomUUID();
    const result = await db.transaction((tx) =>
      ensureProjectOntologyDomain(tx as unknown as Db, {
        companyId,
        projectId,
        projectName: "Alpha",
        createdBy: "actor-test",
      }),
    );

    expect(result).toMatchObject({ status: "created", slug: `alpha-${projectId.slice(0, 8)}` });
    expect(await domainRows(companyId)).toHaveLength(2);
  });

  it("adopts its own domain on a replayed create instead of minting a second one", async () => {
    const companyId = await insertCompany();
    const projectId = randomUUID();
    const input = {
      companyId,
      projectId,
      projectName: "Replay 回放",
      description: null,
      createdBy: "actor-test",
    };

    const first = await db.transaction((tx) => ensureProjectOntologyDomain(tx as unknown as Db, input));
    const second = await db.transaction((tx) => ensureProjectOntologyDomain(tx as unknown as Db, input));

    expect(second).toEqual(first);
    expect(await domainRows(companyId)).toHaveLength(1);
  });

  it("skips (and keeps the transaction alive) when the namespace is not migrated", async () => {
    // Namespace row active + schema present, but the tables were never created:
    // the bootstrap must report not-migrated, and the caller's own writes in
    // the same transaction must still commit — the savepoint absorbs the 42P01.
    const companyId = await insertCompany();
    await db.execute(sql.raw(`DROP SCHEMA "${namespace}" CASCADE`));
    await pluginDatabaseService(db).ensureNamespace(pluginId, manifest);

    const result = await db.transaction(async (tx) => {
      const bootstrap = await ensureProjectOntologyDomain(tx as unknown as Db, {
        companyId,
        projectId: randomUUID(),
        projectName: "降级验证",
        createdBy: "actor-test",
      });
      await tx.update(companies).set({ name: "降级后仍提交" }).where(eq(companies.id, companyId));
      return bootstrap;
    });

    expect(result).toEqual({ status: "skipped", reason: "not-migrated" });
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    expect(company.name).toBe("降级后仍提交");
  });

  it("skips when the ontology plugin is not installed on the instance", async () => {
    const companyId = await insertCompany();
    await db.delete(pluginDatabaseNamespaces).where(eq(pluginDatabaseNamespaces.pluginKey, ONTOLOGY_PLUGIN_KEY));

    const result = await db.transaction((tx) =>
      ensureProjectOntologyDomain(tx as unknown as Db, {
        companyId,
        projectId: randomUUID(),
        projectName: "无插件实例",
        createdBy: "actor-test",
      }),
    );

    expect(result).toEqual({ status: "skipped", reason: "plugin-inactive" });
  });
});
