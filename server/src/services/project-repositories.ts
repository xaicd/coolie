import type { ProjectRepository, ProjectWorkspace } from "@paperclipai/shared";
import { unprocessable } from "../errors.js";
import { isConnectionGrantAudienceAllowed } from "./tool-gateway.js";

export function canBrowseProjectRepositoryGrant(input: {
  grant: { status: string; kind: string; subjectUserId: string | null };
  userId: string | null;
  activeMember: boolean;
  audience: string[];
}) {
  const { grant, userId, activeMember, audience } = input;
  if (grant.status !== "active") return false;
  if (grant.kind === "user") return Boolean(userId && activeMember && grant.subjectUserId === userId);
  return grant.kind === "organization" && isConnectionGrantAudienceAllowed(audience, userId, activeMember);
}

export function mergeProjectRepository(
  repositories: Map<string, ProjectRepository>,
  repo: { id: string; fullName: string; private?: boolean },
  connectionName: string,
) {
  const previous = repositories.get(repo.id);
  repositories.set(repo.id, {
    ...repo, url: `https://github.com/${repo.fullName}`,
    connections: [...new Set([...(previous?.connections ?? []), connectionName])],
  });
}

/** Prefer current provider metadata; unavailable existing selections can remain. */
export function resolveProjectRepositorySelection(
  ids: string[],
  available: ProjectRepository[],
  existing: Pick<ProjectWorkspace, "name" | "repoUrl" | "metadata">[] = [],
): ProjectRepository[] {
  return [...new Set(ids)].map((id) => {
    const current = available.find((repo) => repo.id === id);
    if (current) return current;
    const retained = existing.find((workspace) => workspace.metadata?.githubRepositoryId === id && workspace.repoUrl);
    if (retained) return { id, fullName: retained.name, url: retained.repoUrl!, connections: [] };
    throw unprocessable("A selected GitHub repository is no longer available. Refresh repositories and try again.");
  });
}

/** Register an existing Git URL without assuming it is in the connection catalog.
 * No fetch or credential sharing: execution uses the normal repository access policy.
 */
export function normalizeProjectRepositoryUrl(value: string): { fullName: string; url: string } {
  const trimmed = value.trim();
  // Support SCP-style SSH Git URL: git@host:owner/repo.git
  const scpMatch = trimmed.match(/^git@([^:]+):([^\s]+)$/);
  if (scpMatch) {
    const cleanPath = scpMatch[2].replace(/\/$/, "").replace(/\.git$/, "");
    const parts = cleanPath.split("/").filter(Boolean);
    if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) {
      throw unprocessable("Repository URL must identify a Git repository path");
    }
    const fullName = parts.slice(-2).join("/");
    return { fullName, url: trimmed };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw unprocessable("Repository URL must be a valid HTTP, HTTPS, or SSH Git repository URL");
  }
  if (parsed.protocol === "ssh:") {
    const cleanPath = parsed.pathname.replace(/\/$/, "").replace(/\.git$/, "");
    const parts = cleanPath.split("/").filter(Boolean);
    if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) {
      throw unprocessable("Repository URL must identify a Git repository path");
    }
    const fullName = parts.slice(-2).join("/");
    return { fullName, url: trimmed };
  }
  if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || parsed.search || parsed.hash) {
    throw unprocessable("Repository URL must be an HTTP or HTTPS Git repository URL without query or fragment");
  }
  if (parsed.username || parsed.password) {
    throw unprocessable("Repository URL must not contain embedded credentials; use Git Credentials management instead");
  }
  const cleanPath = parsed.pathname.replace(/\/$/, "").replace(/\.git$/, "");
  const parts = cleanPath.split("/").filter(Boolean);
  if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) {
    throw unprocessable("Repository URL must identify a Git repository path");
  }
  const fullName = parts.slice(-2).join("/");
  const url = `${parsed.protocol}//${parsed.host}${cleanPath}`;
  return { fullName, url };
}
