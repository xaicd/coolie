import { and, desc, eq, inArray, or } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, heartbeatRunEvents, heartbeatRuns, issueWorkProducts, workspaceRuntimeServices } from "@paperclipai/db";
import type { IssueWorkProduct, WorkProductVersionsResponse } from "@paperclipai/shared";
import { insertRowsInChunks } from "./batch-insert.js";
import { resolveArtifactVersion, toWorkProductVersion } from "./work-product-versions.js";
import {
  createPullRequestMergeDetailsResolver,
  extractGitHubPullRequestReferences,
  type PullRequestMergeDetailsResolver,
} from "./github-pull-request-merge.js";
import {
  createGitHubCommitDiffDetailsResolver,
  extractGitHubCommitReference,
  type GitHubCommitDiffDetailsResolver,
} from "./github-commit-details.js";
import type { ImportIssueWorkProductRow } from "./import-write-types.js";

type IssueWorkProductRow = typeof issueWorkProducts.$inferSelect;

export interface WorkProductDiffSummary {
  additions: number | null;
  deletions: number | null;
  changedFiles: number;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function workProductDiffSummaryFromEventPayload(payload: unknown): WorkProductDiffSummary | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const outer = payload as Record<string, unknown>;
  const wrappedEvent = outer.prpEvent && typeof outer.prpEvent === "object" && !Array.isArray(outer.prpEvent)
    ? outer.prpEvent as Record<string, unknown>
    : null;
  const eventPayload = wrappedEvent?.payload ?? (outer.schema === "paperclip.prp.event.v1" ? outer.payload : outer);
  if (!eventPayload || typeof eventPayload !== "object" || Array.isArray(eventPayload)) return null;
  const totals = (eventPayload as Record<string, unknown>).totals;
  if (!totals || typeof totals !== "object" || Array.isArray(totals)) return null;
  const values = totals as Record<string, unknown>;
  const changedFiles = nonNegativeInteger(values.files);
  if (changedFiles === null) return null;
  return {
    additions: values.additions === null ? null : nonNegativeInteger(values.additions),
    deletions: values.deletions === null ? null : nonNegativeInteger(values.deletions),
    changedFiles,
  };
}

export function enrichWorkProductMetadataWithDiff(
  metadata: Record<string, unknown> | null | undefined,
  summary: WorkProductDiffSummary | null,
): Record<string, unknown> | null {
  if (!summary) return metadata ?? null;
  return {
    ...(metadata ?? {}),
    ...(summary.additions === null ? {} : { additions: summary.additions }),
    ...(summary.deletions === null ? {} : { deletions: summary.deletions }),
    changedFiles: summary.changedFiles,
  };
}

export async function refreshPullRequestWorkProductMetadata(
  products: IssueWorkProduct[],
  resolvePullRequestDetails: PullRequestMergeDetailsResolver,
): Promise<IssueWorkProduct[]> {
  return await Promise.all(products.map(async (product) => {
    if (product.type !== "pull_request") return product;
    const metadata = product.metadata ?? {};
    const repo = typeof metadata.repo === "string" ? metadata.repo : null;
    const number = nonNegativeInteger(metadata.number);
    const references = extractGitHubPullRequestReferences([
      product.url,
      repo && number ? `${repo}#${number}` : null,
    ]);
    const reference = references[0];
    if (!reference) return product;
    try {
      const details = await resolvePullRequestDetails(product.companyId, reference);
      if (!details.workProductState) return product;
      return {
        ...product,
        metadata: {
          ...metadata,
          repo: repo ?? `${reference.owner}/${reference.repo}`,
          number: number ?? reference.number,
          ...(details.baseRef ? { baseRef: details.baseRef } : {}),
          ...(details.headRef ? { headRef: details.headRef } : {}),
          ...(nonNegativeInteger(details.additions) === null ? {} : { additions: details.additions }),
          ...(nonNegativeInteger(details.deletions) === null ? {} : { deletions: details.deletions }),
          ...(nonNegativeInteger(details.changedFiles) === null ? {} : { changedFiles: details.changedFiles }),
          state: details.workProductState,
          draft: details.workProductState === "draft" || details.draft === true,
        },
      };
    } catch {
      return product;
    }
  }));
}

function toIssueWorkProduct(row: IssueWorkProductRow): IssueWorkProduct {
  return {
    id: row.id,
    companyId: row.companyId,
    projectId: row.projectId ?? null,
    issueId: row.issueId,
    executionWorkspaceId: row.executionWorkspaceId ?? null,
    runtimeServiceId: row.runtimeServiceId ?? null,
    type: row.type as IssueWorkProduct["type"],
    provider: row.provider,
    externalId: row.externalId ?? null,
    title: row.title,
    url: row.url ?? null,
    status: row.status,
    reviewState: row.reviewState as IssueWorkProduct["reviewState"],
    isPrimary: row.isPrimary,
    healthStatus: row.healthStatus as IssueWorkProduct["healthStatus"],
    summary: row.summary ?? null,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    sourceTrust: row.sourceTrust ?? null,
    createdByRunId: row.createdByRunId ?? null,
    versionGroupId: row.versionGroupId ?? null,
    versionNumber: row.versionNumber ?? 1,
    isLatest: row.isLatest ?? true,
    contentSha256: row.contentSha256 ?? null,
    versionNote: row.versionNote ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Refresh runtime-service work products from the live runtime rows they point at
 * (PAP-17572).
 *
 * A runtime URL is only valid for as long as the process holds that port. A
 * managed restart can relocate it, which used to leave a user-facing preview link
 * that answers with somebody else's service or nothing at all. The runtime row is
 * the authoritative publication record, so it wins over the stored copy.
 *
 * Read-path only and deliberately non-destructive: a work product whose runtime
 * row is gone keeps its recorded URL and is reported closed rather than silently
 * blanked, so the history of what was published survives.
 */
export function reconcileRuntimeServiceWorkProducts(
  products: IssueWorkProduct[],
  liveRuntimeServices: Array<{
    id: string;
    url: string | null;
    status: string;
    healthStatus: string;
  }>,
): IssueWorkProduct[] {
  if (products.length === 0) return products;
  const liveById = new Map(liveRuntimeServices.map((service) => [service.id, service]));
  return products.map((product) => {
    if (product.type !== "runtime_service" || !product.runtimeServiceId) return product;
    const live = liveById.get(product.runtimeServiceId);
    if (!live) {
      return product.status === "closed" && product.healthStatus === "unhealthy"
        ? product
        : { ...product, status: "closed", healthStatus: "unhealthy" };
    }
    const isServing = live.status === "running" && live.healthStatus === "healthy";
    const url = live.url ?? product.url;
    const status = live.status === "running" ? product.status : "closed";
    const healthStatus: IssueWorkProduct["healthStatus"] = isServing ? "healthy" : "unhealthy";
    if (product.url === url && product.status === status && product.healthStatus === healthStatus) return product;
    return { ...product, url, status, healthStatus };
  });
}

export function workProductService(
  db: Db,
  opts: {
    resolvePullRequestDetails?: PullRequestMergeDetailsResolver;
    resolveCommitDetails?: GitHubCommitDiffDetailsResolver;
  } = {},
) {
  const resolvePullRequestDetails = opts.resolvePullRequestDetails ?? createPullRequestMergeDetailsResolver(db);
  const resolveCommitDetails = opts.resolveCommitDetails ?? createGitHubCommitDiffDetailsResolver(db);
  return {
    listForIssue: async (issueId: string, options: { refreshPullRequests?: boolean } = {}) => {
      const rows = await db
        .select()
        .from(issueWorkProducts)
        // wave141 — the issue's work-product list shows the latest version of
        // each deliverable; the full chain is served by `listVersions`.
        .where(and(eq(issueWorkProducts.issueId, issueId), eq(issueWorkProducts.isLatest, true)))
        .orderBy(desc(issueWorkProducts.isPrimary), desc(issueWorkProducts.updatedAt));
      const products = rows.map(toIssueWorkProduct);
      const runtimeServiceIds = products
        .map((product) => (product.type === "runtime_service" ? product.runtimeServiceId : null))
        .filter((value): value is string => Boolean(value));
      const reconciled = runtimeServiceIds.length === 0
        ? products
        : reconcileRuntimeServiceWorkProducts(products, await db
            .select({
              id: workspaceRuntimeServices.id,
              url: workspaceRuntimeServices.url,
              status: workspaceRuntimeServices.status,
              healthStatus: workspaceRuntimeServices.healthStatus,
            })
            .from(workspaceRuntimeServices)
            .where(inArray(workspaceRuntimeServices.id, [...new Set(runtimeServiceIds)])));
      return options.refreshPullRequests
        ? refreshPullRequestWorkProductMetadata(reconciled, resolvePullRequestDetails)
        : reconciled;
    },

    latestRunDiffSummary: async (runId: string): Promise<WorkProductDiffSummary | null> => {
      const rows = await db
        .select({ payload: heartbeatRunEvents.payload })
        .from(heartbeatRunEvents)
        .where(and(
          eq(heartbeatRunEvents.runId, runId),
          inArray(heartbeatRunEvents.eventType, ["workspace.change.updated", "workspace.diff.recorded"]),
        ))
        .orderBy(desc(heartbeatRunEvents.seq))
        .limit(20);
      for (const row of rows) {
        const summary = workProductDiffSummaryFromEventPayload(row.payload);
        if (summary) return summary;
      }
      return null;
    },

    resolveCommitDiffSummary: async (
      companyId: string,
      input: { provider: string; url?: string | null; metadata?: Record<string, unknown> | null },
    ): Promise<WorkProductDiffSummary | null> => {
      if (input.provider.toLowerCase() !== "github") return null;
      const metadata = input.metadata ?? {};
      const repo = typeof metadata.repo === "string" ? metadata.repo : null;
      const sha = typeof metadata.sha === "string" ? metadata.sha : null;
      const reference = extractGitHubCommitReference([
        input.url,
        repo && sha ? `${repo}@${sha}` : null,
      ]);
      return reference ? await resolveCommitDetails(companyId, reference) : null;
    },

    getById: async (id: string) => {
      const row = await db
        .select()
        .from(issueWorkProducts)
        .where(eq(issueWorkProducts.id, id))
        .then((rows) => rows[0] ?? null);
      return row ? toIssueWorkProduct(row) : null;
    },

    createForIssue: async (issueId: string, companyId: string, data: Omit<typeof issueWorkProducts.$inferInsert, "issueId" | "companyId">) => {
      const row = await db.transaction(async (tx) => {
        if (data.isPrimary) {
          await tx
            .update(issueWorkProducts)
            .set({ isPrimary: false, updatedAt: new Date() })
            .where(
              and(
                eq(issueWorkProducts.companyId, companyId),
                eq(issueWorkProducts.issueId, issueId),
                eq(issueWorkProducts.type, data.type),
              ),
            );
        }
        return await tx
          .insert(issueWorkProducts)
          .values({
            ...data,
            companyId,
            issueId,
          })
          .returning()
          .then((rows) => rows[0] ?? null);
      });
      return row ? toIssueWorkProduct(row) : null;
    },

    /**
     * wave141 — create an artifact work product as the next version of its
     * deliverable chain (or report that the bytes are unchanged).
     */
    createArtifactWithVersion: async (
      issueId: string,
      companyId: string,
      data: Omit<typeof issueWorkProducts.$inferInsert, "issueId" | "companyId">,
      version: { versionKey: string; contentSha256?: string | null; versionNote?: string | null },
    ): Promise<
      | { kind: "unchanged"; workProduct: IssueWorkProduct | null }
      | { kind: "created"; workProduct: IssueWorkProduct | null }
    > => {
      return await db.transaction(async (tx) => {
        const resolution = await resolveArtifactVersion(tx as unknown as Db, {
          companyId,
          issueId,
          versionKey: version.versionKey,
          contentSha256: version.contentSha256,
          versionNote: version.versionNote,
        });
        if (resolution.kind === "unchanged") {
          const row = await tx
            .select()
            .from(issueWorkProducts)
            .where(eq(issueWorkProducts.id, resolution.workProductId))
            .then((rows) => rows[0] ?? null);
          return { kind: "unchanged" as const, workProduct: row ? toIssueWorkProduct(row) : null };
        }
        const row = await tx
          .insert(issueWorkProducts)
          .values({ ...data, ...resolution.values, companyId, issueId })
          .returning()
          .then((rows) => rows[0] ?? null);
        return { kind: "created" as const, workProduct: row ? toIssueWorkProduct(row) : null };
      });
    },

    /**
     * wave141 — read-only check used by the upload route before writing bytes:
     * returns the current latest version when the incoming content is identical.
     */
    findUnchangedArtifactVersion: async (input: {
      companyId: string;
      issueId: string;
      versionKey: string;
      contentSha256: string;
    }) => {
      const resolution = await resolveArtifactVersion(db, { ...input, dedupe: true });
      return resolution.kind === "unchanged" ? resolution : null;
    },

    /** wave141 — the full version chain for a deliverable (newest first). */
    listVersions: async (workProductId: string): Promise<WorkProductVersionsResponse | null> => {
      const root = await db
        .select()
        .from(issueWorkProducts)
        .where(eq(issueWorkProducts.id, workProductId))
        .then((rows) => rows[0] ?? null);
      if (!root) return null;
      const groupId = root.versionGroupId ?? root.id;
      const rows = await db
        .select({ product: issueWorkProducts, agentId: agents.id, agentName: agents.name })
        .from(issueWorkProducts)
        .leftJoin(
          heartbeatRuns,
          and(
            eq(issueWorkProducts.createdByRunId, heartbeatRuns.id),
            eq(heartbeatRuns.companyId, issueWorkProducts.companyId),
          ),
        )
        .leftJoin(
          agents,
          and(eq(heartbeatRuns.agentId, agents.id), eq(agents.companyId, heartbeatRuns.companyId)),
        )
        .where(
          and(
            eq(issueWorkProducts.companyId, root.companyId),
            eq(issueWorkProducts.issueId, root.issueId),
            or(
              eq(issueWorkProducts.versionGroupId, groupId),
              eq(issueWorkProducts.id, groupId),
            ),
          ),
        )
        .orderBy(desc(issueWorkProducts.versionNumber), desc(issueWorkProducts.updatedAt));
      return {
        groupId: root.versionGroupId ?? null,
        versions: rows.map((row) =>
          toWorkProductVersion(
            row.product,
            row.agentId && row.agentName ? { id: row.agentId, name: row.agentName } : null,
          ),
        ),
      };
    },

    /**
     * wave141 — mark a version as the latest (rollback / pin). Clears the flag
     * on every other version in the chain.
     */
    activateVersion: async (
      workProductId: string,
      versionId: string,
    ): Promise<
      | { status: "ok"; previousLatestId: string | null }
      | { status: "not_found" }
      | { status: "invalid" }
    > => {
      return await db.transaction(async (tx) => {
        const root = await tx
          .select()
          .from(issueWorkProducts)
          .where(eq(issueWorkProducts.id, workProductId))
          .then((rows) => rows[0] ?? null);
        if (!root) return { status: "not_found" as const };
        const target = await tx
          .select()
          .from(issueWorkProducts)
          .where(eq(issueWorkProducts.id, versionId))
          .then((rows) => rows[0] ?? null);
        if (!target) return { status: "not_found" as const };
        const groupId = root.versionGroupId ?? root.id;
        const targetGroupId = target.versionGroupId ?? target.id;
        if (
          target.companyId !== root.companyId ||
          target.issueId !== root.issueId ||
          targetGroupId !== groupId
        ) {
          return { status: "invalid" as const };
        }
        const previousLatest = await tx
          .select({ id: issueWorkProducts.id })
          .from(issueWorkProducts)
          .where(
            and(
              eq(issueWorkProducts.companyId, root.companyId),
              eq(issueWorkProducts.versionGroupId, groupId),
              eq(issueWorkProducts.isLatest, true),
            ),
          )
          .then((rows) => rows[0] ?? null);
        await tx
          .update(issueWorkProducts)
          .set({ isLatest: false, updatedAt: new Date() })
          .where(
            and(
              eq(issueWorkProducts.companyId, root.companyId),
              or(
                eq(issueWorkProducts.versionGroupId, groupId),
                eq(issueWorkProducts.id, groupId),
              ),
            ),
          );
        await tx
          .update(issueWorkProducts)
          .set({ isLatest: true, versionGroupId: groupId, updatedAt: new Date() })
          .where(eq(issueWorkProducts.id, versionId));
        return {
          status: "ok" as const,
          previousLatestId: previousLatest?.id ?? null,
        };
      });
    },

    update: async (id: string, patch: Partial<typeof issueWorkProducts.$inferInsert>) => {
      const row = await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(issueWorkProducts)
          .where(eq(issueWorkProducts.id, id))
          .then((rows) => rows[0] ?? null);
        if (!existing) return null;

        if (patch.isPrimary === true) {
          await tx
            .update(issueWorkProducts)
            .set({ isPrimary: false, updatedAt: new Date() })
            .where(
              and(
                eq(issueWorkProducts.companyId, existing.companyId),
                eq(issueWorkProducts.issueId, existing.issueId),
                eq(issueWorkProducts.type, existing.type),
              ),
            );
        }

        return await tx
          .update(issueWorkProducts)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(issueWorkProducts.id, id))
          .returning()
          .then((rows) => rows[0] ?? null);
      });
      return row ? toIssueWorkProduct(row) : null;
    },

    /**
     * Batched work-product insert for company import.
     *
     * {@link createForIssue} clears the prior primary of the same type on every
     * call; imported issues are brand new, so the only primaries in play are the
     * imported rows themselves. We reproduce "last primary wins" within each
     * (issue, type) group and insert the whole batch in chunked statements.
     */
    createManyForImport: async (rows: ImportIssueWorkProductRow[]): Promise<void> => {
      if (rows.length === 0) return;
      const lastPrimaryIndexByGroup = new Map<string, number>();
      rows.forEach((row, index) => {
        if (row.isPrimary) lastPrimaryIndexByGroup.set(`${row.issueId}:${row.type}`, index);
      });
      const values = rows.map((row, index) => ({
        companyId: row.companyId,
        issueId: row.issueId,
        projectId: row.projectId ?? null,
        type: row.type,
        provider: row.provider,
        externalId: row.externalId ?? null,
        title: row.title,
        url: row.url ?? null,
        status: row.status,
        reviewState: row.reviewState,
        isPrimary: row.isPrimary
          ? lastPrimaryIndexByGroup.get(`${row.issueId}:${row.type}`) === index
          : false,
        healthStatus: row.healthStatus,
        summary: row.summary ?? null,
        metadata: row.metadata ?? null,
        executionWorkspaceId: row.executionWorkspaceId ?? null,
        runtimeServiceId: row.runtimeServiceId ?? null,
        createdByRunId: row.createdByRunId ?? null,
        sourceTrust: row.sourceTrust ?? null,
      }));
      // Chunked writes are wrapped in a single transaction so a large import
      // that spans multiple insert statements is atomic: if a later chunk
      // fails, the earlier chunks roll back rather than leaving a partial
      // prefix behind (which a retry would then duplicate). Mirrors the
      // per-writer transaction the batched issue/document writers use.
      await db.transaction(async (tx) => {
        await insertRowsInChunks(tx, issueWorkProducts, values);
      });
    },

    remove: async (id: string) => {
      const row = await db
        .delete(issueWorkProducts)
        .where(eq(issueWorkProducts.id, id))
        .returning()
        .then((rows) => rows[0] ?? null);
      return row ? toIssueWorkProduct(row) : null;
    },
  };
}

export { toIssueWorkProduct };
