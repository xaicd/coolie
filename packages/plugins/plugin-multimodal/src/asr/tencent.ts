import { createHash, createHmac } from "node:crypto";
import { DEFAULT_ASR_ENGINE_TYPE } from "../enums.js";

/**
 * Tencent Cloud ASR — one-sentence recognition (SentenceRecognition).
 * Clean-room implementation of the TC3-HMAC-SHA256 request signing and the
 * base64 direct-upload flow. Uses an injected `fetch` (the host
 * `ctx.http.fetch`, gated by the http.outbound capability) rather than any
 * heavyweight SDK.
 *
 * @see https://cloud.tencent.com/document/product/1093/35646
 */

export const ASR_HOST = "asr.tencentcloudapi.com";
export const ASR_SERVICE = "asr";
export const ASR_ACTION = "SentenceRecognition";
export const ASR_VERSION = "2019-06-14";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
function hmac(key: string | Buffer, msg: string): Buffer {
  return createHmac("sha256", key).update(msg, "utf8").digest();
}

export interface TencentAsrCredentials {
  secretId: string;
  secretKey: string;
}

export interface TencentSentencePayload {
  EngSerViceType: string;
  SourceType: number;
  VoiceFormat: string;
  Data: string;
  DataLen: number;
}

/**
 * Build the SentenceRecognition request payload (base64 direct upload,
 * SourceType=1). Exposed for testing.
 */
export function buildPayload(input: {
  audioBase64: string;
  format: string;
  engineType?: string;
}): TencentSentencePayload {
  const dataLen = Buffer.from(input.audioBase64, "base64").length;
  return {
    EngSerViceType: input.engineType ?? DEFAULT_ASR_ENGINE_TYPE,
    SourceType: 1,
    VoiceFormat: String(input.format).toLowerCase(),
    Data: input.audioBase64,
    DataLen: dataLen,
  };
}

/**
 * Compute the TC3-HMAC-SHA256 Authorization header for an ASR request.
 * `timestamp` is unix seconds. Exposed for testing against known vectors.
 */
export function buildAuthorization(
  secretId: string,
  secretKey: string,
  payloadStr: string,
  timestamp: number,
): string {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10); // UTC YYYY-MM-DD

  // 1) Canonical request
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${ASR_HOST}\n`;
  const signedHeaders = "content-type;host";
  const hashedPayload = sha256Hex(payloadStr);
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    hashedPayload,
  ].join("\n");

  // 2) String to sign
  const algorithm = "TC3-HMAC-SHA256";
  const credentialScope = `${date}/${ASR_SERVICE}/tc3_request`;
  const stringToSign = [
    algorithm,
    String(timestamp),
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  // 3) Derive signing key + sign
  const secretDate = hmac(`TC3${secretKey}`, date);
  const secretService = hmac(secretDate, ASR_SERVICE);
  const secretSigning = hmac(secretService, "tc3_request");
  const signature = createHmac("sha256", secretSigning)
    .update(stringToSign, "utf8")
    .digest("hex");

  // 4) Assemble Authorization
  return (
    `${algorithm} ` +
    `Credential=${secretId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, ` +
    `Signature=${signature}`
  );
}

export interface TranscribeResult {
  text: string;
  requestId: string;
}

/**
 * Call Tencent SentenceRecognition and return the recognized text. Throws on
 * transport or API error (caller maps to the transcription failed state).
 */
export async function transcribeTencent(
  fetchFn: (url: string, init?: RequestInit) => Promise<Response>,
  creds: TencentAsrCredentials,
  input: { audioBase64: string; format: string; engineType?: string },
): Promise<TranscribeResult> {
  const payload = buildPayload(input);
  const payloadStr = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const authorization = buildAuthorization(creds.secretId, creds.secretKey, payloadStr, timestamp);

  const res = await fetchFn(`https://${ASR_HOST}`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json; charset=utf-8",
      Host: ASR_HOST,
      "X-TC-Action": ASR_ACTION,
      "X-TC-Version": ASR_VERSION,
      "X-TC-Timestamp": String(timestamp),
    },
    body: payloadStr,
  });

  const body = (await res.json()) as {
    Response?: { Result?: string; RequestId?: string; Error?: { Code?: string; Message?: string } };
  };
  const r = body.Response ?? {};
  if (r.Error) {
    throw new Error(`Tencent ASR error ${r.Error.Code ?? ""}: ${r.Error.Message ?? "unknown"}`);
  }
  return { text: typeof r.Result === "string" ? r.Result : "", requestId: r.RequestId ?? "" };
}
