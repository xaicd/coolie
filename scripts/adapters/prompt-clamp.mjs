/**
 * scripts/adapters/prompt-clamp.mjs
 *
 * Safe prompt length clamping utility for CLI ACP adapters (agy, cmd, claude).
 * Enforces Linux kernel MAX_ARG_STRLEN limits (128KB) by safely budgeting
 * prompts to <= 100KB (102,400 bytes) while preserving critical head context,
 * recent tail instructions, and ensuring zero UTF-8 code point corruption.
 */

export const MAX_ARG_BYTES = 100 * 1024; // 100KB safe margin under Linux 128KB limit

export function truncateUtf8(str, maxBytes) {
  const buf = Buffer.from(str, "utf8");
  if (buf.length <= maxBytes) return str;
  let end = maxBytes;
  // Step back past any UTF-8 continuation bytes (10xxxxxx)
  while (end > 0 && (buf[end] & 0xC0) === 0x80) {
    end--;
  }
  // If the preceding byte was a multi-byte sequence start that was cut short, step back past it
  if (end > 0) {
    const lead = buf[end - 1];
    let expectedLen = 1;
    if ((lead & 0xE0) === 0xC0) expectedLen = 2;
    else if ((lead & 0xF0) === 0xE0) expectedLen = 3;
    else if ((lead & 0xF8) === 0xF0) expectedLen = 4;
    if (expectedLen > 1 && maxBytes - end + 1 < expectedLen) {
      end = end - 1;
    }
  }
  return buf.subarray(0, end).toString("utf8");
}

export function truncateUtf8Tail(str, maxBytes) {
  const buf = Buffer.from(str, "utf8");
  if (buf.length <= maxBytes) return str;
  let start = buf.length - maxBytes;
  // Advance past any UTF-8 continuation bytes so we start on a valid leading byte
  while (start < buf.length && (buf[start] & 0xC0) === 0x80) {
    start++;
  }
  return buf.subarray(start).toString("utf8");
}

export function clampPromptForArgv(prompt, adapterName = "adapter") {
  if (typeof prompt !== "string") {
    return "";
  }
  const totalBytes = Buffer.byteLength(prompt, "utf8");
  if (totalBytes <= MAX_ARG_BYTES) {
    return prompt;
  }

  const targetHeadBytes = 45 * 1024;
  const targetTailBytes = 45 * 1024;

  const lines = prompt.split("\n");
  const headLines = [];
  let headBytes = 0;
  let i = 0;

  while (i < lines.length) {
    const lineBytes = Buffer.byteLength(lines[i] + "\n", "utf8");
    if (headBytes + lineBytes > targetHeadBytes && headLines.length > 0) {
      break;
    }
    if (headLines.length === 0 && lineBytes > targetHeadBytes) {
      headLines.push(truncateUtf8(lines[i], targetHeadBytes));
      headBytes = Buffer.byteLength(headLines[0] + "\n", "utf8");
      i++;
      break;
    }
    headBytes += lineBytes;
    headLines.push(lines[i]);
    i++;
  }

  const tailLines = [];
  let tailBytes = 0;
  let j = lines.length - 1;

  while (j >= i) {
    const lineBytes = Buffer.byteLength(lines[j] + "\n", "utf8");
    if (tailBytes + lineBytes > targetTailBytes && tailLines.length > 0) {
      break;
    }
    if (tailLines.length === 0 && lineBytes > targetTailBytes) {
      const truncated = truncateUtf8Tail(lines[j], targetTailBytes);
      tailLines.unshift(truncated);
      tailBytes = Buffer.byteLength(truncated + "\n", "utf8");
      j--;
      break;
    }
    tailBytes += lineBytes;
    tailLines.unshift(lines[j]);
    j--;
  }

  const prunedBytes = Math.max(0, totalBytes - headBytes - tailBytes);
  const notice = `\n[... Note: Historical context/receipts (~${Math.round(prunedBytes / 1024)} KB) pruned by ${adapterName} adapter to adhere to Linux 128KB argv limit ...]\n`;

  let result = headLines.join("\n") + notice + tailLines.join("\n");
  if (Buffer.byteLength(result, "utf8") > MAX_ARG_BYTES) {
    result = truncateUtf8(result, MAX_ARG_BYTES);
  }
  return result;
}
