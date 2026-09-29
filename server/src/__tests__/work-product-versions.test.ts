import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { companies, createDb, issueWorkProducts, issues } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { workProductService } from "../services/work-products.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres work-product version tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("work product versions (wave141)", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-work-product-versions-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(issueWorkProducts);
    await db.delete(issues);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedIssue() {
    const companyId = randomUUID();
    const issueId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Wave141",
      issuePrefix: `W${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    await db.insert(issues).values({
      id: issueId,
      companyId,
      title: "Prototype deliverable",
      status: "done",
      priority: "medium",
    });
    return { companyId, issueId };
  }

  function artifactData(title: string, filename: string) {
    const attachmentId = randomUUID();
    const contentPath = `/api/attachments/${attachmentId}/content`;
    return {
      type: "artifact",
      provider: "paperclip",
      externalId: attachmentId,
      title,
      status: "active",
      reviewState: "none",
      isPrimary: false,
      healthStatus: "unknown",
      metadata: {
        attachmentId,
        contentType: "text/html",
        byteSize: 12,
        contentPath,
        openPath: contentPath,
        downloadPath: `${contentPath}?download=1`,
        originalFilename: filename,
      },
    };
  }

  it("chains v1/v2/v3, dedupes identical bytes, and activates a version", async () => {
    const { companyId, issueId } = await seedIssue();
    const svc = workProductService(db);

    const v1 = await svc.createArtifactWithVersion(
      issueId,
      companyId,
      artifactData("proto.html", "proto.html"),
      { versionKey: "proto.html", contentSha256: "sha-v1" },
    );
    expect(v1.kind).toBe("created");
    expect(v1.workProduct?.versionNumber).toBe(1);
    expect(v1.workProduct?.isLatest).toBe(true);
    const groupId = v1.workProduct?.versionGroupId;
    expect(groupId).toBeTruthy();

    const v2 = await svc.createArtifactWithVersion(
      issueId,
      companyId,
      artifactData("proto.html", "proto.html"),
      { versionKey: "proto.html", contentSha256: "sha-v2" },
    );
    expect(v2.kind).toBe("created");
    expect(v2.workProduct?.versionNumber).toBe(2);
    expect(v2.workProduct?.versionGroupId).toBe(groupId);

    const v3 = await svc.createArtifactWithVersion(
      issueId,
      companyId,
      artifactData("proto.html", "proto.html"),
      { versionKey: "proto.html", contentSha256: "sha-v3" },
    );
    expect(v3.kind).toBe("created");
    expect(v3.workProduct?.versionNumber).toBe(3);

    // Byte-identical re-upload to v3 → unchanged, no new row.
    const duplicate = await svc.createArtifactWithVersion(
      issueId,
      companyId,
      artifactData("proto.html", "proto.html"),
      { versionKey: "proto.html", contentSha256: "sha-v3" },
    );
    expect(duplicate.kind).toBe("unchanged");
    expect(duplicate.workProduct?.id).toBe(v3.workProduct?.id);

    const rows = await db
      .select()
      .from(issueWorkProducts)
      .where(eq(issueWorkProducts.issueId, issueId));
    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.isLatest)).toHaveLength(1);
    expect(rows.find((row) => row.isLatest)?.versionNumber).toBe(3);

    const versions = await svc.listVersions(v3.workProduct!.id);
    expect(versions?.groupId).toBe(groupId);
    expect(versions?.versions.map((version) => version.versionNumber)).toEqual([3, 2, 1]);
    expect(versions?.versions.map((version) => version.contentSha256)).toEqual([
      "sha-v3",
      "sha-v2",
      "sha-v1",
    ]);

    // Activate (roll back to) v1.
    const activated = await svc.activateVersion(v3.workProduct!.id, v1.workProduct!.id);
    expect(activated).toEqual({ status: "ok", previousLatestId: v3.workProduct!.id });

    const after = await svc.listVersions(v3.workProduct!.id);
    expect(after?.versions.find((version) => version.isLatest)?.versionNumber).toBe(1);
    expect(after?.versions.filter((version) => version.isLatest)).toHaveLength(1);

    // An unrelated version id is rejected.
    const foreign = await svc.activateVersion(v3.workProduct!.id, randomUUID());
    expect(foreign).toEqual({ status: "not_found" });
  });
});
