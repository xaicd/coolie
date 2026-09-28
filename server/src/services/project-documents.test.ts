import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveManagedProjectWorkspaceDir, resolvePaperclipInstanceRoot } from "../home-paths.js";
import {
  analyzeProjectDocument,
  landProjectDocument,
  listProjectDocuments,
  sanitizeProjectDocumentFilename,
} from "./project-documents.js";

const ORIGINAL_ENV = { ...process.env };
let home: string;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-project-docs-"));
  process.env.PAPERCLIP_HOME = home;
  delete process.env.PAPERCLIP_INSTANCE_ID;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  fs.rmSync(home, { recursive: true, force: true });
});

const COMPANY = "11111111-1111-1111-1111-111111111111";
const PROJECT = "22222222-2222-2222-2222-222222222222";

function coolieDocsDir(companyId = COMPANY, projectId = PROJECT) {
  return path.join(resolvePaperclipInstanceRoot(), "projects", companyId, projectId, "coolie-docs");
}

describe("project documents", () => {
  it("lands a document in the project's coolie-docs dir with no git", async () => {
    const landed = await landProjectDocument({
      companyId: COMPANY,
      projectId: PROJECT,
      filename: "需求.md",
      body: Buffer.from("# 需求正文"),
      originalFilename: "需求.md",
    });

    expect(landed.relativePath).toBe(
      path.posix.join("projects", COMPANY, PROJECT, "coolie-docs", "需求.md"),
    );
    expect(landed.byteSize).toBe(Buffer.byteLength("# 需求正文"));
    expect(fs.readFileSync(path.join(coolieDocsDir(), "需求.md"), "utf8")).toBe("# 需求正文");
    // Plain storage: the docs dir is never a git checkout.
    expect(fs.existsSync(path.join(coolieDocsDir(), ".git"))).toBe(false);
  });

  it("lands the coolie-docs dir as a sibling of the managed repo checkout, never inside it", async () => {
    const landed = await landProjectDocument({
      companyId: COMPANY,
      projectId: PROJECT,
      filename: "spec.pdf",
      body: Buffer.from("pdf"),
    });
    const repoDir = resolveManagedProjectWorkspaceDir({
      companyId: COMPANY,
      projectId: PROJECT,
      repoName: "coolie",
    });

    const docsDir = coolieDocsDir();
    expect(path.relative(repoDir, docsDir)).toBe(path.join("..", "coolie-docs"));
    expect(fs.existsSync(path.join(repoDir, landed.filename))).toBe(false);
  });

  it("lists landed documents, newest first, and is empty before any upload", async () => {
    expect(await listProjectDocuments({ companyId: COMPANY, projectId: PROJECT })).toEqual([]);

    await landProjectDocument({ companyId: COMPANY, projectId: PROJECT, filename: "a.md", body: Buffer.from("a") });
    await landProjectDocument({ companyId: COMPANY, projectId: PROJECT, filename: "b.png", body: Buffer.from("bb") });

    const documents = await listProjectDocuments({ companyId: COMPANY, projectId: PROJECT });
    expect(documents.map((document) => document.filename).sort()).toEqual(["a.md", "b.png"]);
    expect(documents.find((document) => document.filename === "b.png")?.byteSize).toBe(2);
  });

  it("keeps two projects' docs dirs distinct and non-nested", () => {
    const other = "33333333-3333-3333-3333-333333333333";
    expect(coolieDocsDir(COMPANY, PROJECT)).not.toBe(coolieDocsDir(COMPANY, other));
    expect(path.relative(coolieDocsDir(COMPANY, PROJECT), coolieDocsDir(COMPANY, other)).startsWith("..")).toBe(true);
  });

  it("reduces an uploaded name to a containment-safe basename", () => {
    expect(sanitizeProjectDocumentFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeProjectDocumentFilename("..\\..\\evil.md")).toBe("evil.md");
    expect(sanitizeProjectDocumentFilename("..")).toBe("");
    expect(sanitizeProjectDocumentFilename("")).toBe("");
    expect(sanitizeProjectDocumentFilename("normal 名称.md")).toBe("normal 名称.md");
  });
});

describe("analyzeProjectDocument (Req C)", () => {
  it("derives a Chinese display name from the first H1 and a slug from the filename stem", async () => {
    const analysis = await analyzeProjectDocument({
      body: Buffer.from("# 智慧乡村文旅平台\n\n面向县域的乡村旅游一体化平台。"),
      filename: "smart-village-prd.md",
      contentType: "text/markdown",
      existingProjectNames: [],
    });

    expect(analysis.suggestedName).toBe("智慧乡村文旅平台");
    expect(analysis.suggestedSlug).toBe("smart-village-prd");
    expect(analysis.source).toBe("content");
    expect(analysis.textSupported).toBe(true);
    expect(analysis.summary).toContain("面向县域");
  });

  it("uniquifies the suggested slug against the company's existing projects", async () => {
    const analysis = await analyzeProjectDocument({
      body: Buffer.from("# 智慧乡村文旅平台"),
      filename: "smart-village-prd.md",
      existingProjectNames: ["Smart Village PRD"],
    });

    expect(analysis.suggestedSlug).toBe("smart-village-prd-2");
  });

  it("falls back to the filename stem when the format has no extractor (PDF)", async () => {
    const analysis = await analyzeProjectDocument({
      body: Buffer.from("%PDF-1.7 not really a pdf"),
      filename: "village-tourism.pdf",
      contentType: "application/pdf",
      existingProjectNames: [],
    });

    expect(analysis.textSupported).toBe(false);
    expect(analysis.source).toBe("filename");
    expect(analysis.suggestedName).toBe("village tourism");
    expect(analysis.suggestedSlug).toBe("village-tourism");
  });
});
