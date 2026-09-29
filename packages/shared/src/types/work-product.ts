export type IssueWorkProductType =
  | "preview_url"
  | "runtime_service"
  | "pull_request"
  | "branch"
  | "commit"
  | "artifact"
  | "document";

export type IssueWorkProductProvider =
  | "paperclip"
  | "github"
  | "vercel"
  | "s3"
  | "custom";

export type IssueWorkProductStatus =
  | "active"
  | "ready_for_review"
  | "approved"
  | "changes_requested"
  | "merged"
  | "closed"
  | "failed"
  | "archived"
  | "draft";

export type IssueWorkProductReviewState =
  | "none"
  | "needs_board_review"
  | "approved"
  | "changes_requested";

export interface IssueWorkProduct {
  id: string;
  companyId: string;
  projectId: string | null;
  issueId: string;
  executionWorkspaceId: string | null;
  runtimeServiceId: string | null;
  type: IssueWorkProductType;
  provider: IssueWorkProductProvider | string;
  externalId: string | null;
  title: string;
  url: string | null;
  status: IssueWorkProductStatus | string;
  reviewState: IssueWorkProductReviewState;
  isPrimary: boolean;
  healthStatus: "unknown" | "healthy" | "unhealthy";
  summary: string | null;
  metadata: Record<string, unknown> | null;
  sourceTrust?: import("../trust-policy.js").SourceTrustMetadata | null;
  createdByRunId: string | null;
  /** wave141 — version chain. Group id shared by every version of one logical deliverable. */
  versionGroupId?: string | null;
  /** wave141 — 1-based position in the version chain. */
  versionNumber?: number;
  /** wave141 — true for the version the lists default to. */
  isLatest?: boolean;
  /** wave141 — sha256 of the stored bytes; null for non-file work products. */
  contentSha256?: string | null;
  /** wave141 — optional change note recorded with this version. */
  versionNote?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * wave141 — one entry in a deliverable's version chain. Flattened from the
 * work-product row plus its backing attachment/asset so the App and Web can
 * render the history list and switch the prototype sandbox preview without a
 * second round trip.
 */
export interface WorkProductVersion {
  id: string;
  versionGroupId: string | null;
  versionNumber: number;
  isLatest: boolean;
  title: string;
  summary: string | null;
  versionNote: string | null;
  contentSha256: string | null;
  contentType: string | null;
  byteSize: number | null;
  originalFilename: string | null;
  attachmentId: string | null;
  contentPath: string | null;
  openPath: string | null;
  downloadPath: string | null;
  createdByAgent: { id: string; name: string } | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkProductVersionsResponse {
  /** Version-chain id. Null when the work product carries no version group. */
  groupId: string | null;
  /** Newest first. */
  versions: WorkProductVersion[];
}

export interface ActivateWorkProductVersionResponse {
  ok: true;
  workProductId: string;
  previousLatestId: string | null;
  activatedVersionId: string;
}

export interface AttachmentArtifactWorkProductMetadata {
  attachmentId: string;
  contentType: string;
  byteSize: number;
  contentPath: string;
  openPath: string;
  downloadPath: string;
  originalFilename?: string | null;
}

export type PullRequestWorkProductState = "open" | "draft" | "merged" | "closed";

export interface PullRequestWorkProductMetadata {
  repo: string;
  number: number;
  baseRef: string;
  headRef: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  state: PullRequestWorkProductState;
  draft: boolean;
}

export interface CommitWorkProductMetadata {
  repo: string;
  sha: string;
  branch: string;
  additions: number;
  deletions: number;
  changedFiles: number;
}
