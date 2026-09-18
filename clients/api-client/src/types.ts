// Minimal shared types for the Coolie mobile/web happy path. For the full,
// always-current contract, generate from GET /api/openapi.json.

export type IssuePriority = "critical" | "high" | "medium" | "low";
export type IssueStatus = "backlog" | "todo" | "in_progress" | "in_review" | "done" | "blocked" | "cancelled";

export interface Company {
  id: string;
  name: string;
}

/**
 * What an agent API key can see about itself (`GET /api/agents/me`). A key is
 * scoped to exactly one company, and `companyId` here is how a client learns
 * which — an agent key cannot list companies (that route is board-only).
 */
export interface AgentIdentity {
  id: string;
  companyId: string;
  name: string;
  role?: string;
  title?: string | null;
  status?: string;
}

export interface Issue {
  id: string;
  title: string;
  description?: string;
  status: IssueStatus;
  priority: IssuePriority;
  companyId: string;
}

export interface SessionUser {
  id: string;
  email?: string;
  name?: string;
}

export interface CreateIssueInput {
  companyId: string;
  title: string;
  description?: string;
  priority?: IssuePriority;
  projectId?: string;
  assigneeAgentId?: string;
}

export type AudioFormat = "mp3" | "wav" | "m4a" | "pcm" | "flac" | "ogg-opus";

export interface VoiceDispatchInput {
  companyId: string;
  /** Base64 of the audio (no data: prefix). Tencent one-sentence: <= 3MB, <= 60s. */
  audioBase64: string;
  format?: AudioFormat;
  /** When true (default), the recognized speech is turned into a task. */
  createIssue?: boolean;
  priority?: IssuePriority;
}

export interface VoiceDispatchResult {
  transcription: { status: "pending" | "done" | "failed"; text: string; error?: string };
  issue: { id: string; title: string } | null;
}

/** Standard error code when Tencent ASR is not configured on the instance. */
export const ASR_NOT_CONFIGURED = "ASR_NOT_CONFIGURED";

export const MULTIMODAL_PLUGIN_ID = "paperclipai.plugin-multimodal";
