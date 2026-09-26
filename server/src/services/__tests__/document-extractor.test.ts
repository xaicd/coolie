import { describe, expect, it } from "vitest";
import { extractDocumentText, extractDocxText } from "../document-extractor.js";
import fs from "node:fs";

describe("document-extractor", () => {
  it("extracts plain text from text files", async () => {
    const buf = Buffer.from("Hello world\nThis is a requirement.", "utf8");
    const result = await extractDocumentText(buf, "requirements.txt", "text/plain");
    expect(result).not.toBeNull();
    expect(result?.text).toContain("Hello world");
    expect(result?.charCount).toBe(34);
    expect(result?.isTruncated).toBe(false);
  });

  it("extracts text from markdown files", async () => {
    const buf = Buffer.from("# Spec\n\n- Feature A\n- Feature B", "utf8");
    const result = await extractDocumentText(buf, "spec.md", "text/markdown");
    expect(result).not.toBeNull();
    expect(result?.text).toContain("Feature A");
  });

  it("extracts text from real DOCX file if available", async () => {
    const docxPath = "/host-workspace/download/design-project.docx";
    if (fs.existsSync(docxPath)) {
      const buf = fs.readFileSync(docxPath);
      const result = await extractDocumentText(buf, "design-project.docx");
      expect(result).not.toBeNull();
      expect(result?.text).toContain("产融智能体应用系统");
      expect(result?.charCount).toBeGreaterThan(1000);
    }
  });

  it("truncates documents that exceed maxChars", async () => {
    const longText = "A".repeat(50_000);
    const buf = Buffer.from(longText, "utf8");
    const result = await extractDocumentText(buf, "large.txt", "text/plain", 10_000);
    expect(result).not.toBeNull();
    expect(result?.isTruncated).toBe(true);
    expect(result?.text).toContain("已省略中间");
  });
});
