import { inflateRawSync } from "node:zlib";

/**
 * Supported text extensions for direct UTF-8 reading.
 */
const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".csv",
  ".yaml",
  ".yml",
  ".xml",
  ".ts",
  ".js",
  ".html",
  ".sql",
]);

/**
 * Zero-dependency native DOCX parser for extracting plain text from Office Open XML documents.
 * DOCX is a standard PKZIP archive containing word/document.xml.
 */
export function extractDocxText(buffer: Buffer): string | null {
  try {
    let offset = 0;
    while (offset < buffer.length - 30) {
      // Local file header signature: 0x04034b50 ("PK\x03\x04")
      if (buffer.readUInt32LE(offset) === 0x04034b50) {
        const compression = buffer.readUInt16LE(offset + 8);
        const compressedSize = buffer.readUInt32LE(offset + 18);
        const fileNameLen = buffer.readUInt16LE(offset + 26);
        const extraLen = buffer.readUInt16LE(offset + 28);
        const fileName = buffer.toString(
          "utf8",
          offset + 30,
          offset + 30 + fileNameLen,
        );
        const dataStart = offset + 30 + fileNameLen + extraLen;

        if (fileName === "word/document.xml") {
          const compressedData = buffer.subarray(
            dataStart,
            dataStart + compressedSize,
          );
          let xml: string | null = null;
          if (compression === 8) {
            // Deflate compression
            xml = inflateRawSync(compressedData).toString("utf8");
          } else if (compression === 0) {
            // Uncompressed
            xml = compressedData.toString("utf8");
          }

          if (xml) {
            // Strip tags and format paragraphs
            const text = xml
              .replace(/<\/w:p>/g, "\n")
              .replace(/<w:tab\/>/g, "\t")
              .replace(/<[^>]+>/g, "")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&amp;/g, "&")
              .replace(/&quot;/g, '"')
              .replace(/&apos;/g, "'")
              .replace(/\n{3,}/g, "\n\n")
              .trim();
            return text;
          }
        }
        offset = dataStart + compressedSize;
      } else {
        offset++;
      }
    }
  } catch (error) {
    // Return null if malformed or password-protected
    return null;
  }
  return null;
}

export interface ExtractedDocument {
  filename: string;
  text: string;
  charCount: number;
  isTruncated: boolean;
}

/**
 * Extracts plain text from an uploaded document buffer (DOCX, TXT, MD, etc.).
 * Truncates text exceeding maxChars to prevent blowing up the LLM context window.
 */
export async function extractDocumentText(
  buffer: Buffer,
  filename?: string,
  contentType?: string,
  maxChars = 20_000,
): Promise<ExtractedDocument | null> {
  if (!buffer || buffer.length === 0) return null;

  const fname = (filename || "").toLowerCase();
  const ctype = (contentType || "").toLowerCase();

  let rawText: string | null = null;

  if (
    fname.endsWith(".docx") ||
    ctype.includes("wordprocessingml") ||
    ctype.includes("msword")
  ) {
    rawText = extractDocxText(buffer);
  } else if (
    Array.from(TEXT_EXTENSIONS).some((ext) => fname.endsWith(ext)) ||
    ctype.startsWith("text/") ||
    ctype.includes("json")
  ) {
    try {
      rawText = buffer.toString("utf8").trim();
    } catch {
      rawText = null;
    }
  } else if (buffer.length > 4 && buffer.readUInt32LE(0) === 0x04034b50) {
    // Sniff PK header as fallback
    rawText = extractDocxText(buffer);
  }

  if (!rawText || rawText.length === 0) return null;

  const totalChars = rawText.length;
  let text = rawText;
  let isTruncated = false;

  if (totalChars > maxChars) {
    // Keep first 16,000 chars + last 3,000 chars
    const headChars = Math.floor(maxChars * 0.8);
    const tailChars = Math.floor(maxChars * 0.15);
    const head = rawText.slice(0, headChars);
    const tail = rawText.slice(totalChars - tailChars);
    text = `${head}\n\n... [文档内容较长，已省略中间约 ${totalChars - headChars - tailChars} 字] ...\n\n${tail}`;
    isTruncated = true;
  }

  return {
    filename: filename || "attachment",
    text,
    charCount: totalChars,
    isTruncated,
  };
}
