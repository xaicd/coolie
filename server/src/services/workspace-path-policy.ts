import path from "node:path";
import { unprocessable } from "../errors.js";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";

/**
 * Extra roots a project sandbox directory may live under, in addition to the managed root.
 *
 * `path.delimiter`-separated (like `PATH`). Needed because the deployment shape decides
 * what a legitimate root is: a container install mounts the host checkout somewhere such
 * as `/host-workspace`, so a single hard-coded root would reject a valid binding. Unset
 * means "managed root only".
 */
export const WORKSPACE_ALLOWED_ROOTS_ENV = "PAPERCLIP_WORKSPACE_ALLOWED_ROOTS";

/** `<instanceRoot>/projects` — where `resolveManagedProjectWorkspaceDir` places every project. */
export function managedProjectsRoot(): string {
  return path.resolve(resolvePaperclipInstanceRoot(), "projects");
}

function configuredWorkspaceRoots(): string[] {
  return (process.env[WORKSPACE_ALLOWED_ROOTS_ENV] ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => path.resolve(entry));
}

export function allowedWorkspaceRoots(): string[] {
  return [managedProjectsRoot(), ...configuredWorkspaceRoots()];
}

/**
 * Containment via `path.relative`, never `startsWith`: `/root/projects-extra` is NOT inside
 * `/root/projects`, but a naive prefix check would say it is.
 */
function isInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * Enforce the project sandbox directory rule at the point a caller-supplied `cwd` is
 * persisted.
 *
 * The convention already existed — `resolveManagedProjectWorkspaceDir` derives
 * `<instanceRoot>/projects/<companyId>/<projectId>/<repoName|_default>`, with a documented
 * per-project non-nesting invariant — but nothing stopped a caller from storing an
 * arbitrary path, so project creation accepted any non-empty string as the sandbox
 * directory. This is the missing enforcement: the path must be absolute and must land
 * inside one of `allowedWorkspaceRoots()`.
 *
 * @returns the resolved absolute path, which is what the caller should persist.
 */
export function assertWorkspaceCwdAllowed(cwd: string): string {
  const trimmed = cwd.trim();
  if (!path.isAbsolute(trimmed)) {
    throw unprocessable("Workspace directory must be an absolute path.", {
      code: "workspace_cwd_not_absolute",
      cwd: trimmed,
    });
  }

  const resolved = path.resolve(trimmed);
  const allowedRoots = allowedWorkspaceRoots();
  if (!allowedRoots.some((root) => isInsideRoot(root, resolved))) {
    throw unprocessable(
      "Workspace directory must be inside an allowed project root.",
      {
        code: "workspace_cwd_outside_allowed_roots",
        cwd: resolved,
        allowedRoots,
      },
    );
  }
  return resolved;
}
