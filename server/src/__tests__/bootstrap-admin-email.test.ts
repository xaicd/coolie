import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { authUsers, createDb, instanceUserRoles } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { loadConfig } from "../config.js";
import {
  claimBootstrapAdminByEmail,
  matchesBootstrapAdminEmail,
  normalizeBootstrapAdminEmail,
  readAuthUserEmail,
} from "../bootstrap-admin-email.js";

const PINNED = "founder@example.com";

describe("bootstrap admin email matching", () => {
  it("normalizes surrounding whitespace and casing", () => {
    expect(normalizeBootstrapAdminEmail("  Founder@Example.COM ")).toBe(PINNED);
    expect(normalizeBootstrapAdminEmail("")).toBeUndefined();
    expect(normalizeBootstrapAdminEmail("   ")).toBeUndefined();
    expect(normalizeBootstrapAdminEmail(null)).toBeUndefined();
    expect(normalizeBootstrapAdminEmail(undefined)).toBeUndefined();
  });

  it("matches the pinned address however either side is typed", () => {
    expect(matchesBootstrapAdminEmail(" Founder@Example.com ", "founder@example.COM")).toBe(true);
    expect(matchesBootstrapAdminEmail(undefined, PINNED)).toBe(false);
    expect(matchesBootstrapAdminEmail(PINNED, undefined)).toBe(false);
    expect(matchesBootstrapAdminEmail(PINNED, "someone-else@example.com")).toBe(false);
  });
});

describe("bootstrap admin email config", () => {
  const missingConfigPath = path.join(
    os.tmpdir(),
    `paperclip-bootstrap-admin-${process.pid}.json`,
  );

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads the pinned address from the environment", () => {
    vi.stubEnv("PAPERCLIP_CONFIG", missingConfigPath);
    vi.stubEnv("PAPERCLIP_BOOTSTRAP_ADMIN_EMAIL", "  Founder@Example.COM ");

    expect(loadConfig().bootstrapAdminEmail).toBe(PINNED);
  });

  it("treats a blank value as unset", () => {
    vi.stubEnv("PAPERCLIP_CONFIG", missingConfigPath);
    vi.stubEnv("PAPERCLIP_BOOTSTRAP_ADMIN_EMAIL", "   ");

    expect(loadConfig().bootstrapAdminEmail).toBeUndefined();
  });

  it("leaves the pin unset when the environment says nothing", () => {
    vi.stubEnv("PAPERCLIP_CONFIG", missingConfigPath);
    vi.stubEnv("PAPERCLIP_BOOTSTRAP_ADMIN_EMAIL", "");

    expect(loadConfig().bootstrapAdminEmail).toBeUndefined();
  });
});

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

describeEmbeddedPostgres("claimBootstrapAdminByEmail", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-bootstrap-admin-email-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(instanceUserRoles);
    await db.delete(authUsers);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function adminUserIds() {
    const rows = await db.select().from(instanceUserRoles);
    return rows.filter((row) => row.role === "instance_admin").map((row) => row.userId);
  }

  it("grants the pinned address while the instance has no admin", async () => {
    const userId = randomUUID();

    await expect(
      claimBootstrapAdminByEmail(db, {
        configuredEmail: PINNED,
        deploymentMode: "authenticated",
        userId,
        email: "Founder@Example.com",
      }),
    ).resolves.toBe("claimed");

    expect(await adminUserIds()).toEqual([userId]);
  });

  it("never grants an address the operator did not pin", async () => {
    await expect(
      claimBootstrapAdminByEmail(db, {
        configuredEmail: PINNED,
        deploymentMode: "authenticated",
        userId: randomUUID(),
        email: "someone-else@example.com",
      }),
    ).resolves.toBe("email_mismatch");

    expect(await adminUserIds()).toEqual([]);
  });

  it("does nothing when no address is pinned", async () => {
    await expect(
      claimBootstrapAdminByEmail(db, {
        configuredEmail: undefined,
        deploymentMode: "authenticated",
        userId: randomUUID(),
        email: PINNED,
      }),
    ).resolves.toBe("not_configured");

    expect(await adminUserIds()).toEqual([]);
  });

  it("stays out of local_trusted, which has its own local board admin", async () => {
    await expect(
      claimBootstrapAdminByEmail(db, {
        configuredEmail: PINNED,
        deploymentMode: "local_trusted",
        userId: randomUUID(),
        email: PINNED,
      }),
    ).resolves.toBe("not_authenticated_mode");

    expect(await adminUserIds()).toEqual([]);
  });

  it("keeps the instance to a single admin once one exists", async () => {
    const first = randomUUID();
    const second = randomUUID();
    const pinnedInput = {
      configuredEmail: PINNED,
      deploymentMode: "authenticated",
      email: PINNED,
    };

    await expect(
      claimBootstrapAdminByEmail(db, { ...pinnedInput, userId: first }),
    ).resolves.toBe("claimed");
    await expect(
      claimBootstrapAdminByEmail(db, { ...pinnedInput, userId: second }),
    ).resolves.toBe("already_claimed");

    expect(await adminUserIds()).toEqual([first]);
  });

  it("reads back the email a session hook has to look up", async () => {
    const userId = randomUUID();
    await db.insert(authUsers).values({
      id: userId,
      name: "Founder",
      email: PINNED,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(readAuthUserEmail(db, userId)).resolves.toBe(PINNED);
    await expect(readAuthUserEmail(db, randomUUID())).resolves.toBeNull();
  });
});
