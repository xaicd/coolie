import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceGitManager } from "../services/WorkspaceGitManager.js";

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "coolie-wgm-"));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("WorkspaceGitManager", () => {
  it("ensureGitRepo initialises a fresh workdir and reports false", async () => {
    const mgr = new WorkspaceGitManager({ timeoutMs: 5000 });
    const fresh = await mgr.ensureGitRepo(workDir);
    expect(fresh).toBe(false);

    const again = await mgr.ensureGitRepo(workDir);
    expect(again).toBe(true);
  });

  it("autoSave commits staged content with the supplied message", async () => {
    const mgr = new WorkspaceGitManager({
      timeoutMs: 5000,
      userName: "Test Bot",
      userEmail: "test@coolie.local",
    });
    await mgr.ensureGitRepo(workDir);

    await writeFile(join(workDir, "hello.txt"), "hello world\n", "utf8");

    const committed = await mgr.autoSave(workDir, "test: first commit");
    expect(committed).toBe(true);

    const again = await mgr.autoSave(workDir, "test: should be no-op");
    expect(again).toBe(false);
  });

  it("autoSave returns false when no changes are staged", async () => {
    const mgr = new WorkspaceGitManager({
      timeoutMs: 5000,
      userName: "Test Bot",
      userEmail: "test@coolie.local",
    });
    await mgr.ensureGitRepo(workDir);
    expect(await mgr.autoSave(workDir, "empty")).toBe(false);
  });

  it("commitCrushDb commits the .crush directory and skips clean trees", async () => {
    const mgr = new WorkspaceGitManager({
      timeoutMs: 5000,
      userName: "Test Bot",
      userEmail: "test@coolie.local",
    });
    await mgr.ensureGitRepo(workDir);

    // Without a .crush dir, no staged change → false.
    expect(await mgr.commitCrushDb(workDir)).toBe(false);

    await mkdir(join(workDir, ".crush"), { recursive: true });
    await writeFile(join(workDir, ".crush/db.sqlite"), "x", "utf8");
    expect(await mgr.commitCrushDb(workDir)).toBe(true);
    expect(await mgr.commitCrushDb(workDir)).toBe(false);
  });

  it("uses the configured user identity from explicit options", async () => {
    const mgr = new WorkspaceGitManager({
      timeoutMs: 5000,
      userName: "Custom Bot",
      userEmail: "bot@coolie.local",
    });
    await mgr.ensureGitRepo(workDir);

    await writeFile(join(workDir, "file.txt"), "data", "utf8");
    expect(await mgr.autoSave(workDir, "user-config check")).toBe(true);

    const { execSync } = await import("node:child_process");
    const log = execSync("git log -1 --pretty=fuller", { cwd: workDir }).toString();
    expect(log).toContain("Custom Bot");
    expect(log).toContain("bot@coolie.local");
    void readFile;
  });

  it("falls back to env when no explicit override is passed", async () => {
    const mgr = new WorkspaceGitManager({ timeoutMs: 5000 }, {
      WORKSPACE_GIT_USER_NAME: "Env Bot",
      WORKSPACE_GIT_USER_EMAIL: "env@coolie.local",
    });
    await mgr.ensureGitRepo(workDir);
    await writeFile(join(workDir, "x.txt"), "x", "utf8");
    expect(await mgr.autoSave(workDir, "env-bot commit")).toBe(true);
    const { execSync } = await import("node:child_process");
    const log = execSync("git log -1 --pretty=fuller", { cwd: workDir }).toString();
    expect(log).toContain("Env Bot");
  });
});