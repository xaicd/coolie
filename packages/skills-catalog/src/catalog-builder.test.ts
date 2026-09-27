import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCatalogManifest,
  formatCatalogManifest,
  validateCatalog,
} from "./catalog-builder.js";

const tempDirs: string[] = [];

describe("skills catalog manifest", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
    vi.unstubAllGlobals();
  });

  it("builds stable manifest entries from catalog skill directories", async () => {
    const packageDir = await createCatalogPackage();
    await writeSkill(packageDir, "bundled", "software-development", "github-pr-workflow", {
      frontmatter: [
        "name: GitHub PR Workflow",
        "description: Prepare pull requests and verification notes.",
        "key: paperclipai/bundled/software-development/github-pr-workflow",
        "recommendedForRoles:",
        "  - engineer",
        "tags:",
        "  - github",
        "  - pull-requests",
      ],
      files: {
        "references/checklist.md": "# Checklist\n",
      },
    });

    const result = await buildCatalogManifest({
      packageDir,
      generatedAt: "2026-05-26T00:00:00.000Z",
    });

    expect(result.errors).toEqual([]);
    expect(result.manifest.skills).toHaveLength(1);
    expect(result.manifest.skills[0]).toMatchObject({
      id: "paperclipai:bundled:software-development:github-pr-workflow",
      key: "paperclipai/bundled/software-development/github-pr-workflow",
      kind: "bundled",
      category: "software-development",
      slug: "github-pr-workflow",
      name: "GitHub PR Workflow",
      trustLevel: "markdown_only",
      compatibility: "compatible",
      recommendedForRoles: ["engineer"],
      tags: ["github", "pull-requests"],
    });
    expect(result.manifest.skills[0]!.files.map((file) => file.path)).toEqual([
      "SKILL.md",
      "references/checklist.md",
    ]);
    expect(result.manifest.skills[0]!.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("builds stable manifest entries from pinned GitHub references", async () => {
    const packageDir = await createCatalogPackage();
    const skillMarkdown = [
      "---",
      "name: Remote Research",
      "description: Research recent discussion from a pinned upstream skill.",
      "---",
      "",
      "Use this skill.",
      "",
    ].join("\n");
    const script = "print('hello')\n";
    await writeReference(packageDir, "optional", "research", "remote-research", {
      source: {
        type: "github",
        hostname: "github.com",
        owner: "example",
        repo: "remote-skill",
        ref: "v1.0.0",
        commit: "0123456789abcdef0123456789abcdef01234567",
        path: "skills/remote-research",
      },
      files: ["SKILL.md", "scripts/**"],
      recommendedForRoles: ["researcher"],
      tags: ["research"],
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/git/trees/")) {
        return new Response(JSON.stringify({
          tree: [
            { path: "skills/remote-research/SKILL.md", type: "blob", size: Buffer.byteLength(skillMarkdown) },
            { path: "skills/remote-research/scripts/run.py", type: "blob", size: Buffer.byteLength(script) },
            { path: "README.md", type: "blob", size: 9 },
          ],
        }), { status: 200 });
      }
      if (url.endsWith("/skills/remote-research/SKILL.md")) {
        return new Response(skillMarkdown, { status: 200 });
      }
      if (url.endsWith("/skills/remote-research/scripts/run.py")) {
        return new Response(script, { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await buildCatalogManifest({
      packageDir,
      generatedAt: "2026-05-26T00:00:00.000Z",
    });

    expect(result.errors).toEqual([]);
    expect(result.manifest.skills[0]).toMatchObject({
      id: "paperclipai:optional:research:remote-research",
      key: "paperclipai/optional/research/remote-research",
      path: "catalog/optional/research/remote-research",
      trustLevel: "scripts_executables",
      recommendedForRoles: ["researcher"],
      tags: ["research"],
      source: {
        type: "github",
        owner: "example",
        repo: "remote-skill",
        ref: "v1.0.0",
        commit: "0123456789abcdef0123456789abcdef01234567",
        path: "skills/remote-research",
      },
    });
    expect(result.manifest.skills[0]!.files.map((file) => file.path)).toEqual([
      "SKILL.md",
      "scripts/run.py",
    ]);
    expect(result.manifest.skills[0]!.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("reuses the existing manifest entry when a pinned GitHub reference is temporarily unavailable", async () => {
    const packageDir = await createCatalogPackage();
    await writeReference(packageDir, "optional", "research", "remote-research", {
      source: {
        type: "github",
        hostname: "github.com",
        owner: "example",
        repo: "remote-skill",
        ref: "v1.0.0",
        commit: "0123456789abcdef0123456789abcdef01234567",
        path: "skills/remote-research",
      },
      files: ["SKILL.md", "scripts/**"],
      recommendedForRoles: ["researcher"],
      tags: ["research"],
    });
    await fs.mkdir(path.join(packageDir, "generated"), { recursive: true });
    await fs.writeFile(
      path.join(packageDir, "generated", "catalog.json"),
      formatCatalogManifest({
        schemaVersion: 1,
        packageName: "@paperclipai/skills-catalog",
        packageVersion: "0.3.1",
        generatedAt: "2026-05-26T00:00:00.000Z",
        skills: [{
          id: "paperclipai:optional:research:remote-research",
          key: "paperclipai/optional/research/remote-research",
          kind: "optional",
          category: "research",
          slug: "remote-research",
          name: "Remote Research",
          description: "Research recent discussion from a pinned upstream skill.",
          path: "catalog/optional/research/remote-research",
          entrypoint: "SKILL.md",
          trustLevel: "scripts_executables",
          compatibility: "compatible",
          defaultInstall: false,
          recommendedForRoles: ["researcher"],
          requires: [],
          tags: ["research"],
          files: [
            {
              path: "SKILL.md",
              kind: "skill",
              sizeBytes: 128,
              sha256: "a".repeat(64),
            },
            {
              path: "scripts/run.py",
              kind: "script",
              sizeBytes: 14,
              sha256: "b".repeat(64),
            },
          ],
          contentHash: `sha256:${"c".repeat(64)}`,
          source: {
            type: "github",
            hostname: "github.com",
            owner: "example",
            repo: "remote-skill",
            ref: "v1.0.0",
            commit: "0123456789abcdef0123456789abcdef01234567",
            path: "skills/remote-research",
            url: "https://github.com/example/remote-skill/tree/v1.0.0/skills/remote-research",
          },
        }],
      }),
      "utf8",
    );
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/git/trees/")) {
        return new Response("forbidden", { status: 403 });
      }
      return new Response("not found", { status: 404 });
    }));

    const result = await buildCatalogManifest({
      packageDir,
      generatedAt: "2026-05-26T00:00:00.000Z",
    });

    expect(result.errors).toEqual([]);
    expect(result.manifest.skills).toHaveLength(1);
    expect(result.manifest.skills[0]?.name).toBe("Remote Research");
    expect(result.manifest.skills[0]?.files.map((file) => file.path)).toEqual(["SKILL.md", "scripts/run.py"]);
  });

  it("reuses the existing manifest entry when the GitHub tree is unavailable but SKILL.md can be fetched", async () => {
    const packageDir = await createCatalogPackage();
    await writeReference(packageDir, "optional", "research", "remote-research", {
      source: {
        type: "github",
        hostname: "github.com",
        owner: "example",
        repo: "remote-skill",
        ref: "v1.0.0",
        commit: "0123456789abcdef0123456789abcdef01234567",
        path: "skills/remote-research",
      },
      files: ["SKILL.md", "scripts/**"],
      recommendedForRoles: ["researcher"],
      tags: ["research"],
    });
    await fs.mkdir(path.join(packageDir, "generated"), { recursive: true });
    await fs.writeFile(
      path.join(packageDir, "generated", "catalog.json"),
      formatCatalogManifest({
        schemaVersion: 1,
        packageName: "@paperclipai/skills-catalog",
        packageVersion: "0.3.1",
        generatedAt: "2026-05-26T00:00:00.000Z",
        skills: [{
          id: "paperclipai:optional:research:remote-research",
          key: "paperclipai/optional/research/remote-research",
          kind: "optional",
          category: "research",
          slug: "remote-research",
          name: "Remote Research",
          description: "Research recent discussion from a pinned upstream skill.",
          path: "catalog/optional/research/remote-research",
          entrypoint: "SKILL.md",
          trustLevel: "scripts_executables",
          compatibility: "compatible",
          defaultInstall: false,
          recommendedForRoles: ["researcher"],
          requires: [],
          tags: ["research"],
          files: [
            {
              path: "SKILL.md",
              kind: "skill",
              sizeBytes: 128,
              sha256: "a".repeat(64),
            },
          ],
          contentHash: `sha256:${"c".repeat(64)}`,
          source: {
            type: "github",
            hostname: "github.com",
            owner: "example",
            repo: "remote-skill",
            ref: "v1.0.0",
            commit: "0123456789abcdef0123456789abcdef01234567",
            path: "skills/remote-research",
            url: "https://github.com/example/remote-skill/tree/v1.0.0/skills/remote-research",
          },
        }],
      }),
      "utf8",
    );
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/git/trees/")) {
        return new Response("forbidden", { status: 403 });
      }
      return new Response("---\nname: Remote Research\ndescription: Research recent discussion from a pinned upstream skill.\n---\n");
    }));

    const result = await buildCatalogManifest({
      packageDir,
      generatedAt: "2026-05-26T00:00:00.000Z",
    });

    expect(result.errors).toEqual([]);
    expect(result.manifest.skills).toHaveLength(1);
    expect(result.manifest.skills[0]?.files.map((file) => file.path)).toEqual(["SKILL.md"]);
  });

  it("reports frontmatter, directory, uniqueness, and inventory errors together", async () => {
    const packageDir = await createCatalogPackage();
    await writeSkill(packageDir, "bundled", "Bad_Category", "duplicate", {
      frontmatter: [
        "name: Duplicate",
        "key: paperclipai/bundled/software-development/other",
        "recommendedForRoles: engineer",
      ],
    });
    await writeSkill(packageDir, "optional", "software-development", "duplicate", {
      frontmatter: [
        "name: Duplicate Optional",
        "description: Optional duplicate slug.",
      ],
    });
    await fs.mkdir(path.join(packageDir, "catalog", "bundled", "software-development", "missing-skill"), {
      recursive: true,
    });
    await fs.mkdir(path.join(packageDir, "catalog", "misc"), { recursive: true });
    await fs.writeFile(path.join(packageDir, "catalog", "misc", "SKILL.md"), "# Misplaced\n", "utf8");

    const result = await buildCatalogManifest({
      packageDir,
      generatedAt: "2026-05-26T00:00:00.000Z",
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("catalog/misc/SKILL.md is not under catalog/<bundled|optional>/<category>/<slug>/{SKILL.md,catalog-ref.json}"),
        expect.stringContaining("catalog/bundled/software-development/missing-skill is missing SKILL.md or catalog-ref.json"),
        expect.stringContaining("has invalid category"),
        expect.stringContaining("frontmatter must include description"),
        expect.stringContaining("key must be paperclipai/bundled/Bad_Category/duplicate"),
        expect.stringContaining("field recommendedForRoles must be an array of strings"),
        expect.stringContaining("Duplicate catalog slug \"duplicate\""),
      ]),
    );
  });

  it("detects stale generated manifests", async () => {
    const packageDir = await createCatalogPackage();
    await writeSkill(packageDir, "bundled", "software-development", "review", {
      frontmatter: [
        "name: Review",
        "description: Review implementation work.",
      ],
    });
    await fs.mkdir(path.join(packageDir, "generated"), { recursive: true });
    await fs.writeFile(
      path.join(packageDir, "generated", "catalog.json"),
      formatCatalogManifest({
        schemaVersion: 1,
        packageName: "@paperclipai/skills-catalog",
        packageVersion: "0.3.1",
        generatedAt: "2026-05-26T00:00:00.000Z",
        skills: [],
      }),
      "utf8",
    );

    const result = await validateCatalog(packageDir);

    expect(result.errors).toContain(
      "generated/catalog.json is stale. Run pnpm --filter @paperclipai/skills-catalog build:manifest.",
    );
  });

  it("fetches a pinned repository tree once even when several references share it", async () => {
    const packageDir = await createCatalogPackage();
    const commit = "0123456789abcdef0123456789abcdef01234567";
    for (const [slug, name] of [["alpha", "Alpha"], ["beta", "Beta"]] as const) {
      await writeReference(packageDir, "optional", "research", slug, {
        source: {
          type: "github",
          hostname: "github.com",
          owner: "example",
          repo: "shared",
          ref: "v1.0.0",
          commit,
          path: `skills/${slug}`,
        },
        files: ["SKILL.md"],
        recommendedForRoles: ["researcher"],
        tags: ["research"],
      });
    }
    const treeFetches: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/git/trees/")) {
        treeFetches.push(url);
        return Response.json({
          tree: [
            { path: "skills/alpha/SKILL.md", type: "blob", size: 64 },
            { path: "skills/beta/SKILL.md", type: "blob", size: 64 },
          ],
        });
      }
      const name = url.includes("/skills/alpha/") ? "Alpha" : "Beta";
      return new Response(`---\nname: ${name}\ndescription: Shared repo reference for ${name}.\n---\n\nUse this skill.\n`);
    }));

    const result = await buildCatalogManifest({ packageDir, generatedAt: "2026-05-26T00:00:00.000Z" });

    expect(result.errors).toEqual([]);
    expect(result.manifest.skills).toHaveLength(2);
    expect(treeFetches).toHaveLength(1);
  });

  it("aborts a hanging fetch instead of blocking the build", async () => {
    const packageDir = await createCatalogPackage();
    await writeReference(packageDir, "optional", "research", "remote-research", {
      source: {
        type: "github",
        hostname: "github.com",
        owner: "example",
        repo: "remote-skill",
        ref: "v1.0.0",
        commit: "0123456789abcdef0123456789abcdef01234567",
        path: "skills/remote-research",
      },
      files: ["SKILL.md"],
      recommendedForRoles: ["researcher"],
      tags: ["research"],
    });
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/git/trees/")) {
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        });
      }
      return new Response("not found", { status: 404 });
    }));

    const result = await buildCatalogManifest({
      packageDir,
      generatedAt: "2026-05-26T00:00:00.000Z",
      fetchTimeoutMs: 50,
    });

    expect(result.errors.some((error) => error.includes("failed to fetch GitHub tree:"))).toBe(true);
    expect(result.manifest.skills).toHaveLength(0);
  });

  it("bounds in-flight file fetches to the configured concurrency", async () => {
    const packageDir = await createCatalogPackage();
    await writeReference(packageDir, "optional", "research", "wide-skill", {
      source: {
        type: "github",
        hostname: "github.com",
        owner: "example",
        repo: "wide",
        ref: "v1.0.0",
        commit: "0123456789abcdef0123456789abcdef01234567",
        path: "skills/wide",
      },
      files: ["SKILL.md", "references/**"],
      recommendedForRoles: ["researcher"],
      tags: ["research"],
    });
    const referencePaths = Array.from({ length: 11 }, (_, index) => `skills/wide/references/${index}.md`);
    let inFlight = 0;
    let maxInFlight = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/git/trees/")) {
        return Response.json({
          tree: [
            { path: "skills/wide/SKILL.md", type: "blob", size: 64 },
            ...referencePaths.map((path) => ({ path, type: "blob", size: 16 })),
          ],
        });
      }
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return new Response(url.includes("/SKILL.md")
        ? "---\nname: Wide Skill\ndescription: A referenced skill with many supporting files.\n---\n\nUse it.\n"
        : "# Reference\n");
    }));

    const result = await buildCatalogManifest({
      packageDir,
      generatedAt: "2026-05-26T00:00:00.000Z",
      fetchConcurrency: 3,
    });

    expect(result.errors).toEqual([]);
    expect(result.manifest.skills[0]!.files).toHaveLength(12);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });
});

async function createCatalogPackage() {
  const packageDir = await fs.mkdtemp(path.join(os.tmpdir(), "skills-catalog-"));
  tempDirs.push(packageDir);
  await fs.mkdir(path.join(packageDir, "catalog", "bundled"), { recursive: true });
  await fs.mkdir(path.join(packageDir, "catalog", "optional"), { recursive: true });
  await fs.writeFile(
    path.join(packageDir, "package.json"),
    JSON.stringify({ version: "0.3.1" }),
    "utf8",
  );
  return packageDir;
}

async function writeSkill(
  packageDir: string,
  kind: "bundled" | "optional",
  category: string,
  slug: string,
  options: {
    frontmatter: string[];
    files?: Record<string, string>;
  },
) {
  const skillDir = path.join(packageDir, "catalog", kind, category, slug);
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(
    path.join(skillDir, "SKILL.md"),
    `---\n${options.frontmatter.join("\n")}\n---\n\nUse this skill.\n`,
    "utf8",
  );
  for (const [relativePath, content] of Object.entries(options.files ?? {})) {
    const filePath = path.join(skillDir, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
  }
}

async function writeReference(
  packageDir: string,
  kind: "bundled" | "optional",
  category: string,
  slug: string,
  descriptor: Record<string, unknown>,
) {
  const skillDir = path.join(packageDir, "catalog", kind, category, slug);
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(
    path.join(skillDir, "catalog-ref.json"),
    `${JSON.stringify(descriptor, null, 2)}\n`,
    "utf8",
  );
}
