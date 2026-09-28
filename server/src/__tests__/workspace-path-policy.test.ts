import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  WORKSPACE_ALLOWED_ROOTS_ENV,
  allowedWorkspaceRoots,
  assertWorkspaceCwdAllowed,
  managedProjectsRoot,
} from "../services/workspace-path-policy.js";

describe("workspace path policy", () => {
  const original = process.env[WORKSPACE_ALLOWED_ROOTS_ENV];
  afterEach(() => {
    if (original === undefined) delete process.env[WORKSPACE_ALLOWED_ROOTS_ENV];
    else process.env[WORKSPACE_ALLOWED_ROOTS_ENV] = original;
  });

  it("allows a project's managed directory", () => {
    const dir = path.join(managedProjectsRoot(), "company-1", "project-1", "repo");
    expect(assertWorkspaceCwdAllowed(dir)).toBe(path.resolve(dir));
  });

  it("rejects a relative path", () => {
    expect(() => assertWorkspaceCwdAllowed("relative/dir")).toThrow(/absolute path/i);
  });

  it("rejects a path outside the managed root", () => {
    expect(() => assertWorkspaceCwdAllowed("/etc")).toThrow(/allowed project root/i);
  });

  it("rejects traversal that escapes the managed root", () => {
    const escaped = path.join(managedProjectsRoot(), "..", "..", "escaped");
    expect(() => assertWorkspaceCwdAllowed(escaped)).toThrow(/allowed project root/i);
  });

  it("does not treat a shared-prefix sibling as inside the root", () => {
    // `/x/projects-extra` must not pass for `/x/projects`. This is why containment uses
    // path.relative rather than startsWith.
    expect(() => assertWorkspaceCwdAllowed(`${managedProjectsRoot()}-extra`)).toThrow(/allowed project root/i);
  });

  it("allows a configured extra root without widening anything else", () => {
    const extra = path.join(os.tmpdir(), "paperclip-extra-root");
    process.env[WORKSPACE_ALLOWED_ROOTS_ENV] = extra;

    expect(allowedWorkspaceRoots()).toContain(path.resolve(extra));
    expect(assertWorkspaceCwdAllowed(path.join(extra, "project-1"))).toBe(path.resolve(extra, "project-1"));
    expect(() => assertWorkspaceCwdAllowed("/etc")).toThrow(/allowed project root/i);
  });

  it("reads the extra roots as path.delimiter-separated entries", () => {
    const first = path.join(os.tmpdir(), "root-a");
    const second = path.join(os.tmpdir(), "root-b");
    process.env[WORKSPACE_ALLOWED_ROOTS_ENV] = [first, second].join(path.delimiter);

    expect(assertWorkspaceCwdAllowed(path.join(second, "project"))).toBe(path.resolve(second, "project"));
    expect(assertWorkspaceCwdAllowed(path.join(first, "project"))).toBe(path.resolve(first, "project"));
  });

  it("keeps the managed root allowed when an extra root is configured", () => {
    process.env[WORKSPACE_ALLOWED_ROOTS_ENV] = path.join(os.tmpdir(), "only-extra");
    const managed = path.join(managedProjectsRoot(), "company-1", "project-1");
    expect(assertWorkspaceCwdAllowed(managed)).toBe(path.resolve(managed));
  });
});
