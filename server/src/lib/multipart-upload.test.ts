import { describe, expect, it } from "vitest";
import {
  multipartBoundary,
  stripFilenameStarFromParts,
} from "./multipart-upload.js";

const BOUNDARY = "7cc48727-0000-4000-8000-000000000000";
const DOCX_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const FILENAME_CN =
  "某公司产融智能体应用系统集成服务项目技术规范书 (1).docx";

/**
 * Build the exact part header React Native's `FormData.getParts()` writes:
 * a raw `filename` plus an `encodeURI`-ed `filename*` (which keeps `(` and `)`
 * unencoded — the characters busboy rejects in an unquoted value).
 */
function rnBody(filename: string, fileBytes = "DOCX-BYTES"): Buffer {
  return Buffer.concat([
    Buffer.from(`--${BOUNDARY}\r\n`),
    Buffer.from(
      `Content-Disposition: form-data; name="file"; filename="${filename}"; filename*=utf-8''${encodeURI(filename)}\r\n`,
    ),
    Buffer.from(`Content-Type: ${DOCX_TYPE}\r\n\r\n`),
    Buffer.from(fileBytes),
    Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
  ]);
}

describe("multipartBoundary", () => {
  it("reads an unquoted boundary", () => {
    expect(multipartBoundary(`multipart/form-data; boundary=${BOUNDARY}`)).toBe(BOUNDARY);
  });

  it("reads a quoted boundary", () => {
    expect(multipartBoundary('multipart/form-data; boundary="abc"')).toBe("abc");
  });

  it("returns null without a boundary", () => {
    expect(multipartBoundary("multipart/form-data")).toBeNull();
    expect(multipartBoundary(undefined)).toBeNull();
  });
});

describe("stripFilenameStarFromParts", () => {
  it("removes a non-token filename* while keeping the plain filename", () => {
    const sanitized = stripFilenameStarFromParts(rnBody(FILENAME_CN), BOUNDARY);
    const text = sanitized.toString("latin1");
    expect(text).not.toContain("filename*");
    // The raw UTF-8 bytes of the name round-trip through the latin1 view.
    expect(text).toContain(
      Buffer.from(`filename="${FILENAME_CN}"`, "utf8").toString("latin1"),
    );
  });

  it("leaves the file body bytes untouched", () => {
    const fileBytes = "; filename*=evil\u0000\u00ffBINARY";
    const original = rnBody(FILENAME_CN, fileBytes);
    const sanitized = stripFilenameStarFromParts(original, BOUNDARY);
    const originalBody = original.subarray(original.indexOf("\r\n\r\n") + 4);
    const sanitizedBody = sanitized.subarray(sanitized.indexOf("\r\n\r\n") + 4);
    expect(sanitizedBody.equals(originalBody)).toBe(true);
  });

  it("materializes a plain filename when the client only sent filename*", () => {
    const body = Buffer.concat([
      Buffer.from(`--${BOUNDARY}\r\n`),
      Buffer.from(
        `Content-Disposition: form-data; name="file"; filename*=utf-8''${encodeURI(FILENAME_CN)}\r\n`,
      ),
      Buffer.from(`Content-Type: ${DOCX_TYPE}\r\n\r\n`),
      Buffer.from("bytes"),
      Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
    ]);
    const sanitized = stripFilenameStarFromParts(body, BOUNDARY);
    const text = sanitized.toString("latin1");
    expect(text).not.toContain("filename*");
    // The raw UTF-8 bytes of the name round-trip through the latin1 view.
    expect(text).toContain(
      Buffer.from(`filename="${FILENAME_CN}"`, "utf8").toString("latin1"),
    );
  });

  it("does not alter a plain multipart body", () => {
    const body = Buffer.concat([
      Buffer.from(`--${BOUNDARY}\r\n`),
      Buffer.from(`Content-Disposition: form-data; name="file"; filename="a.docx"\r\n`),
      Buffer.from(`Content-Type: ${DOCX_TYPE}\r\n\r\n`),
      Buffer.from("bytes"),
      Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
    ]);
    expect(stripFilenameStarFromParts(body, BOUNDARY).equals(body)).toBe(true);
  });
});
