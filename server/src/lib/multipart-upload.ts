import { PassThrough } from "node:stream";
import type { Request, Response } from "express";
import multer from "multer";

/**
 * Multipart parsing compatibility for React Native uploads.
 *
 * The Coolie App builds its upload bodies with React Native's `FormData`. Its
 * `getParts()` writes every file part as
 *
 *   Content-Disposition: form-data; name="file"; filename="…"; filename*=utf-8''<encodeURI(name)>
 *
 * `encodeURI` leaves RFC 7230 non-token characters — `(`, `)`, and friends — in
 * place, but busboy (the parser under multer) rejects an *unquoted* `filename*`
 * value that contains them. It then treats the whole `Content-Disposition` as
 * malformed and silently drops the part before multer ever sees it, so
 * `multer.single("file")` finds no file and the route answers
 * `400 Missing file field 'file'` — even though the bytes arrived intact.
 *
 * The plain `filename="…"` parameter carries the same name, so the redundant
 * `filename*` parameter is safe to remove (and must be removed, because busboy
 * does not decode its `utf-8''` prefix either). This module buffers the body,
 * normalizes only the part headers, and replays the sanitized bytes into the
 * configured multer instance. Buffering is bounded by the upload cap, which is
 * already the contract of the `memoryStorage` these routes use.
 */

/** Extra bytes allowed on top of the file cap for multipart framing and fields. */
const MULTIPART_FRAMING_SLACK_BYTES = 512 * 1024;

const HEADER_TERMINATOR = "\r\n\r\n";
const FILENAME_STAR_PARAM = /\s*;\s*filename\*=(?:"([^"]*)"|([^;]*))/i;

type UploadedFile = {
  fieldname: string;
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
};

/** Extract the multipart boundary from a `Content-Type` header value. */
export function multipartBoundary(contentType: string | undefined): string | null {
  if (!contentType) return null;
  const match = /;\s*boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const value = (match?.[1] ?? match?.[2])?.trim();
  return value ? value : null;
}

/**
 * Drop the `filename*` parameter from every part's `Content-Disposition`, or
 * materialize a plain `filename` from it when the client sent no plain one.
 * Only part-header regions are touched, so file bodies are never rewritten.
 */
export function stripFilenameStarFromParts(payload: Buffer, boundary: string): Buffer {
  if (!boundary) return payload;
  const text = payload.toString("latin1");
  const delimiter = `--${boundary}`;
  let output = "";
  let cursor = 0;

  while (cursor < text.length) {
    const boundaryAt = text.indexOf(delimiter, cursor);
    if (boundaryAt === -1) {
      output += text.slice(cursor);
      break;
    }
    output += text.slice(cursor, boundaryAt + delimiter.length);
    const afterDelimiter = boundaryAt + delimiter.length;
    if (text.startsWith("--", afterDelimiter)) {
      output += text.slice(afterDelimiter);
      break;
    }
    const headerEnd = text.indexOf(HEADER_TERMINATOR, afterDelimiter);
    if (headerEnd === -1) {
      output += text.slice(afterDelimiter);
      break;
    }
    output += rewritePartHeaders(text.slice(afterDelimiter, headerEnd));
    output += HEADER_TERMINATOR;
    cursor = headerEnd + HEADER_TERMINATOR.length;
  }

  return Buffer.from(output, "latin1");
}

function rewritePartHeaders(headers: string): string {
  if (!/filename\*/i.test(headers)) return headers;
  return headers
    .split("\r\n")
    .map((line) => (/^content-disposition:/i.test(line) ? rewriteDisposition(line) : line))
    .join("\r\n");
}

function rewriteDisposition(line: string): string {
  const match = FILENAME_STAR_PARAM.exec(line);
  if (!match) return line;
  const withoutStar = line.replace(FILENAME_STAR_PARAM, "");
  if (/;\s*filename=/i.test(withoutStar)) return withoutStar;
  const decoded = decodeRfc5987(match[1] ?? match[2] ?? "");
  return decoded === null ? withoutStar : `${withoutStar}; filename="${decoded}"`;
}

/**
 * Decode an RFC 5987 extended value (`utf-8''%E6%9F%90`) into the raw bytes it
 * names, returned as a latin1 string so the bytes round-trip through the
 * header's own latin1 view. Quotes and line breaks are stripped so the result
 * is safe to inline in a quoted parameter.
 */
function decodeRfc5987(value: string): string | null {
  const match = /^(?:[^']*)'[^']*'(.*)$/.exec(value);
  try {
    const decoded = decodeURIComponent(match ? match[1]! : value);
    return Buffer.from(decoded, "utf8").toString("latin1").replace(/["\\\r\n]/g, "");
  } catch {
    return null;
  }
}

function readBoundedBody(req: Request, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const settle = (run: () => void) => {
      if (settled) return;
      settled = true;
      run();
    };
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        settle(() => reject(new multer.MulterError("LIMIT_FILE_SIZE")));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => settle(() => resolve(Buffer.concat(chunks))));
    req.on("error", (error) => settle(() => reject(error)));
  });
}

/**
 * Run a configured multer instance over the request after normalizing
 * React Native's `filename*` part header, accepting a file under any single
 * field name. Sets `req.body` and `req.file` exactly as `upload.single` would.
 *
 * `upload.any()` is used rather than `.single("file")` so a client that names
 * the part differently is still accepted; only the first file is kept, matching
 * the single-file contract of these routes.
 */
export async function runTolerantMultipartUpload(
  upload: ReturnType<typeof multer>,
  req: Request,
  res: Response,
  fileSizeLimit: number,
): Promise<void> {
  const contentType = req.headers["content-type"];
  const raw = await readBoundedBody(req, fileSizeLimit + MULTIPART_FRAMING_SLACK_BYTES);
  const boundary = multipartBoundary(typeof contentType === "string" ? contentType : undefined);
  const body = boundary ? stripFilenameStarFromParts(raw, boundary) : raw;

  const stream = new PassThrough();
  const fakeReq = Object.assign(stream, {
    headers: req.headers,
    body: Object.create(null) as Record<string, unknown>,
  });

  await new Promise<void>((resolve, reject) => {
    const handler = upload.any() as unknown as (
      request: unknown,
      response: Response,
      callback: (error?: unknown) => void,
    ) => void;
    handler(fakeReq, res, (error?: unknown) => (error ? reject(error) : resolve()));
    stream.end(body);
  });

  const parsed = fakeReq as unknown as {
    body: Record<string, unknown>;
    files?: UploadedFile[];
  };
  req.body = parsed.body;
  (req as unknown as { file?: UploadedFile }).file = parsed.files?.[0];
}
