import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  agents,
  companies,
  companyMemberships,
  createDb,
  issues,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "../__tests__/helpers/embedded-postgres.js";
import { issueService } from "./issues.js";
import {
  PAPERCLIP_CONCIERGE_USER_ID,
  isConciergePrincipalUserId,
  resolveCompanyDefaultResponsibleUserId,
  resolveCompanyScopedResponsibleUserId,
} from "./responsible-user.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

describe("responsible-user resolution", () => {
  it("recognizes the synthetic loopback-concierge principal", () => {
    expect(isConciergePrincipalUserId(PAPERCLIP_CONCIERGE_USER_ID)).toBe(true);
    expect(isConciergePrincipalUserId(` ${PAPERCLIP_CONCIERGE_USER_ID} `)).toBe(true);
    expect(isConciergePrincipalUserId("real-user")).toBe(false);
    expect(isConciergePrincipalUserId(null)).toBe(false);
  });
});

describeEmbeddedPostgres("responsible-user resolution against a real company", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-responsible-user-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(issues);
    await db.delete(agents);
    await db.delete(companyMemberships);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  }, 60_000);

  async function seedCompany() {
    const companyId = randomUUID();
    const ownerUserId = `owner-${randomUUID()}`;
    await db.insert(companies).values({
      id: companyId,
      name: `Responsible ${companyId.slice(0, 8)}`,
      issuePrefix: `RU${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      defaultResponsibleUserId: ownerUserId,
    });
    await db.insert(companyMemberships).values({
      companyId,
      principalType: "user",
      principalId: ownerUserId,
      membershipRole: "owner",
      status: "active",
    });
    return { companyId, ownerUserId };
  }

  it("resolves the company default responsible user", async () => {
    const { companyId, ownerUserId } = await seedCompany();
    await expect(
      resolveCompanyDefaultResponsibleUserId(db, companyId),
    ).resolves.toBe(ownerUserId);
  });

  it("leaves a real responsible user untouched", async () => {
    const { companyId } = await seedCompany();
    await expect(
      resolveCompanyScopedResponsibleUserId(db, companyId, "real-user"),
    ).resolves.toBe("real-user");
  });

  it("substitutes the concierge principal with the real company owner", async () => {
    const { companyId, ownerUserId } = await seedCompany();
    await expect(
      resolveCompanyScopedResponsibleUserId(
        db,
        companyId,
        PAPERCLIP_CONCIERGE_USER_ID,
      ),
    ).resolves.toBe(ownerUserId);
  });

  it("stamps an issue created by the concierge key with the real owner", async () => {
    const { companyId, ownerUserId } = await seedCompany();
    const issue = await issueService(db).create(companyId, {
      title: `Concierge-created ${randomUUID()}`,
      createdByUserId: PAPERCLIP_CONCIERGE_USER_ID,
      actorResponsibleUserId: null,
      trustExplicitResponsibleUserId: true,
    } as never);

    expect(issue.responsibleUserId).toBe(ownerUserId);
    const [persisted] = await db
      .select({ responsibleUserId: issues.responsibleUserId })
      .from(issues)
      .where(eq(issues.id, issue.id));
    expect(persisted.responsibleUserId).toBe(ownerUserId);
  });

  it("keeps an issue created by a real member attributed to that member", async () => {
    const { companyId, ownerUserId } = await seedCompany();
    const issue = await issueService(db).create(companyId, {
      title: `Member-created ${randomUUID()}`,
      createdByUserId: ownerUserId,
      trustExplicitResponsibleUserId: true,
    } as never);
    expect(issue.responsibleUserId).toBe(ownerUserId);
  });
});
