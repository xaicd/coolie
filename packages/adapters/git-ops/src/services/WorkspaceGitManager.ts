/**
 * WorkspaceGitManager — 宿主机工作区 Git 管理器 (async, simple-git)
 *
 * Migrated from DigitalStaff `backend/modules/git-ops/services/WorkspaceGitManager.js`
 * under the wave 68 sync. Differences from the JS source:
 *
 *  - require() → import
 *  - module.exports → named export
 *  - `promisify(exec)` shell-out → `simple-git` async API
 *  - hardcoded user.name/email ("AI Studio" / "ai-studio@system.local") →
 *    env (`WORKSPACE_GIT_USER_NAME`, `WORKSPACE_GIT_USER_EMAIL`); defaults
 *    preserved.
 *  - static `getInstance()` → exported `workspaceGitManager()` factory so
 *    tests can pass a fresh instance.
 *
 * The async surface stays identical to the JS source (init / commit / save)
 * so call sites don't need changes.
 */

import { simpleGit, type SimpleGit, type StatusResult } from "simple-git";

const DEFAULT_GIT_USER_NAME = "AI Studio";
const DEFAULT_GIT_USER_EMAIL = "ai-studio@system.local";

export const GIT_CMD_TIMEOUT_MS = 30_000;

export interface WorkspaceGitManagerOptions {
  /** Override the user.name applied during `git init` when no global config
   *  is present. Falls back to `WORKSPACE_GIT_USER_NAME` then to the DS
   *  default. */
  userName?: string;
  /** Same as `userName` but for `user.email`. */
  userEmail?: string;
  /** Timeout for git operations (ms). Default 30s. */
  timeoutMs?: number;
}

function resolveUserConfig(opts: WorkspaceGitManagerOptions, env: NodeJS.ProcessEnv = process.env): { name: string; email: string; nameOverridden: boolean; emailOverridden: boolean } {
  const name = opts.userName ?? env.WORKSPACE_GIT_USER_NAME ?? DEFAULT_GIT_USER_NAME;
  const email = opts.userEmail ?? env.WORKSPACE_GIT_USER_EMAIL ?? DEFAULT_GIT_USER_EMAIL;
  const envName = env.WORKSPACE_GIT_USER_NAME;
  const envEmail = env.WORKSPACE_GIT_USER_EMAIL;
  const nameOverridden: boolean = opts.userName !== undefined || (typeof envName === "string" && envName.length > 0);
  const emailOverridden: boolean = opts.userEmail !== undefined || (typeof envEmail === "string" && envEmail.length > 0);
  return { name, email, nameOverridden, emailOverridden };
}

/**
 * Manager instance. The class itself is not a singleton — pass
 * `workspaceGitManager()` to get a memoised one, or `new WorkspaceGitManager()`
 * for a per-request instance.
 */
export class WorkspaceGitManager {
  private readonly timeoutMs: number;
  private readonly userConfig: { name: string; email: string; nameOverridden: boolean; emailOverridden: boolean };

  constructor(opts: WorkspaceGitManagerOptions = {}, env: NodeJS.ProcessEnv = process.env) {
    this.timeoutMs = opts.timeoutMs ?? GIT_CMD_TIMEOUT_MS;
    this.userConfig = resolveUserConfig(opts, env);
  }

  /** Build a SimpleGit configured for `cwd`. Simple-git inherits the parent
   *  `process.env` automatically (HTTPS proxies / git credential helpers
   *  keep working); the timeout is per-instance so unit tests can shrink it. */
  private git(cwd: string): SimpleGit {
    return simpleGit({
      baseDir: cwd,
      binary: "git",
      maxConcurrentProcesses: 1,
      timeout: { block: this.timeoutMs },
    });
  }

  /** Run a low-level git command and return the trimmed stdout. Mirrors the
   *  JS `_exec` helper; exists mainly so the rest of the methods stay
   *  small. */
  private async exec(cwd: string, args: string[]): Promise<string> {
    const result = await this.git(cwd).raw(args);
    return (result ?? "").trim();
  }

  /** `git init` if missing, otherwise no-op. Returns `true` when the dir was
   *  already a repo, `false` when freshly initialised. */
  async ensureGitRepo(workDir: string): Promise<boolean> {
    const git = this.git(workDir);
    try {
      const inside = await git.revparse(["--is-inside-work-tree"]);
      if (inside.trim() === "true") {
        return true;
      }
    } catch {
      // Not a repo — fall through to init.
    }

    try {
      await git.init();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`git init failed for ${workDir}: ${message}`);
    }

    // Configure user.{name,email} for this repo. We always apply local config
    // when the caller (via opts or env) supplied an explicit override; otherwise
    // we only fill in fields that are missing globally.
    try {
      const globalName = await this.exec(workDir, ["config", "--global", "--get", "user.name"]).catch(() => "");
      if (this.userConfig.nameOverridden || !globalName) {
        await this.exec(workDir, ["config", "user.name", this.userConfig.name]).catch(() => undefined);
      }
    } catch {
      await this.exec(workDir, ["config", "user.name", this.userConfig.name]).catch(() => undefined);
    }
    try {
      const globalEmail = await this.exec(workDir, ["config", "--global", "--get", "user.email"]).catch(() => "");
      if (this.userConfig.emailOverridden || !globalEmail) {
        await this.exec(workDir, ["config", "user.email", this.userConfig.email]).catch(() => undefined);
      }
    } catch {
      await this.exec(workDir, ["config", "user.email", this.userConfig.email]).catch(() => undefined);
    }
    return false;
  }

  /** Commit the `.crush/` directory. Idempotent: returns `false` when no
   *  staged change. Mirrors the JS `commitCrushDb`. */
  async commitCrushDb(workDir: string): Promise<boolean> {
    try {
      await this.exec(workDir, ["add", ".crush/"]);
      const status: StatusResult = await this.git(workDir).status();
      if (status.staged.length === 0) {
        return false;
      }
      await this.exec(workDir, ["commit", "-m", "crush: sync session db"]);
      return true;
    } catch {
      // Git failures are non-fatal by design (matches the JS contract).
      return false;
    }
  }

  /** Stage everything and commit. Returns `false` on no changes; errors
   *  (auth, no git) are caught and reported as `false`. */
  async autoSave(workDir: string, msg: string = "auto-save"): Promise<boolean> {
    try {
      await this.exec(workDir, ["add", "-A"]);
      const status: StatusResult = await this.git(workDir).status();
      if (status.staged.length === 0 && status.modified.length === 0 && status.created.length === 0 && status.deleted.length === 0) {
        return false;
      }
      const safeMsg = msg.replace(/"/g, '\\"');
      await this.exec(workDir, ["commit", "-m", safeMsg]);
      return true;
    } catch {
      return false;
    }
  }
}

let _default: WorkspaceGitManager | null = null;
export function workspaceGitManager(opts: WorkspaceGitManagerOptions = {}): WorkspaceGitManager {
  if (!_default) _default = new WorkspaceGitManager(opts);
  return _default;
}

/** Reset the singleton — test helper. */
export function resetWorkspaceGitManagerForTests(): void {
  _default = null;
}