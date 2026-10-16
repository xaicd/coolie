import assert from "node:assert/strict";
import test from "node:test";
import {
  clampPromptForArgv,
  MAX_ARG_BYTES,
  truncateUtf8,
  truncateUtf8Tail,
} from "../adapters/prompt-clamp.mjs";

test("clampPromptForArgv leaves prompts <= MAX_ARG_BYTES unmodified", () => {
  const shortText = "Hello, world! This is a standard short prompt.";
  assert.equal(clampPromptForArgv(shortText, "test-adapter"), shortText);

  // Exact boundary
  const exact = "x".repeat(MAX_ARG_BYTES);
  assert.equal(clampPromptForArgv(exact, "test-adapter"), exact);
});

test("clampPromptForArgv clamps single-line prompts exceeding 100KB to <= MAX_ARG_BYTES", () => {
  const singleLine150k = "a".repeat(150 * 1024);
  const result = clampPromptForArgv(singleLine150k, "agy");
  const byteLen = Buffer.byteLength(result, "utf8");

  assert.ok(byteLen <= MAX_ARG_BYTES, `Result byte length ${byteLen} must be <= ${MAX_ARG_BYTES}`);
  assert.ok(result.includes("pruned by agy adapter to adhere to Linux 128KB argv limit"));
});

test("clampPromptForArgv clamps multi-line prompts with oversized lines", () => {
  const line1 = "a".repeat(70 * 1024);
  const line2 = "b".repeat(70 * 1024);
  const twoLines = `${line1}\n${line2}`;

  const result = clampPromptForArgv(twoLines, "cmd");
  const byteLen = Buffer.byteLength(result, "utf8");

  assert.ok(byteLen <= MAX_ARG_BYTES, `Result byte length ${byteLen} must be <= ${MAX_ARG_BYTES}`);
  assert.ok(result.includes("pruned by cmd adapter to adhere to Linux 128KB argv limit"));
  assert.ok(result.startsWith("a".repeat(100)));
  assert.ok(result.endsWith("b".repeat(100)));
});

test("clampPromptForArgv handles multi-byte UTF-8 Chinese characters without corruption", () => {
  const chineseLine = "工坊真实工单驱动平台自举成熟度闭环，这是测试中文字符长文本。\n";
  const lineBytes = Buffer.byteLength(chineseLine, "utf8");
  const count = Math.ceil((300 * 1024) / lineBytes);
  const largePrompt = chineseLine.repeat(count);

  const result = clampPromptForArgv(largePrompt, "claude");
  const byteLen = Buffer.byteLength(result, "utf8");

  assert.ok(byteLen <= MAX_ARG_BYTES, `Result byte length ${byteLen} must be <= ${MAX_ARG_BYTES}`);
  assert.ok(result.includes("pruned by claude adapter"));

  // Verify valid UTF-8 roundtrip
  const reEncoded = Buffer.from(result, "utf8").toString("utf8");
  assert.equal(reEncoded, result, "Result must remain valid, uncorrupted UTF-8 text");
  assert.ok(!result.includes("\uFFFD"), "Result must not contain replacement characters from mid-codepoint slices");
});

test("clampPromptForArgv enforces absolute hard ceiling on 1MB prompt", () => {
  const hugePrompt = "Line content ".repeat(100) + "\n";
  const oneMb = hugePrompt.repeat(800);

  const result = clampPromptForArgv(oneMb, "agy");
  const byteLen = Buffer.byteLength(result, "utf8");

  assert.ok(byteLen <= MAX_ARG_BYTES, `Result byte length ${byteLen} must never exceed ${MAX_ARG_BYTES}`);
  assert.ok(result.length > 0);
});

test("truncateUtf8 never cuts in the middle of a multi-byte UTF-8 sequence", () => {
  // '好' is 3 bytes: 0xE5 0xA5 0xBD
  const text = "你好世界";
  // Buffer of '你' (3) + '好' (3) = 6 bytes
  const buf = Buffer.from(text, "utf8");
  assert.equal(buf.length, 12);

  // Requesting 4 bytes should only keep '你' (3 bytes), not partial '好'
  const truncated4 = truncateUtf8(text, 4);
  assert.equal(Buffer.byteLength(truncated4, "utf8"), 3);
  assert.equal(truncated4, "你");

  // Requesting 5 bytes should still only keep '你' (3 bytes)
  const truncated5 = truncateUtf8(text, 5);
  assert.equal(Buffer.byteLength(truncated5, "utf8"), 3);
  assert.equal(truncated5, "你");

  // Requesting 6 bytes should keep '你好' (6 bytes)
  const truncated6 = truncateUtf8(text, 6);
  assert.equal(Buffer.byteLength(truncated6, "utf8"), 6);
  assert.equal(truncated6, "你好");
});

test("truncateUtf8Tail never cuts in the middle of a multi-byte UTF-8 sequence from tail", () => {
  const text = "你好世界"; // 12 bytes
  // Taking tail 4 bytes should keep '界' (3 bytes), not partial '世'
  const truncatedTail4 = truncateUtf8Tail(text, 4);
  assert.equal(Buffer.byteLength(truncatedTail4, "utf8"), 3);
  assert.equal(truncatedTail4, "界");

  const truncatedTail6 = truncateUtf8Tail(text, 6);
  assert.equal(Buffer.byteLength(truncatedTail6, "utf8"), 6);
  assert.equal(truncatedTail6, "世界");
});
