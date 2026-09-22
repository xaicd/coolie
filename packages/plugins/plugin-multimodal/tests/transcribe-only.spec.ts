import { describe, expect, it } from "vitest";
import { createTestHarness, type TestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

const COMPANY = "company-1";

/**
 * The harness in-memory DB always returns empty reads, but the store inserts a
 * row and then reads it back — so back the transcriptions table with a tiny map
 * here. Everything else (capabilities, activity log, issues.create) is the real
 * harness behavior.
 */
function createHarness(): TestHarness {
  const harness = createTestHarness({
    manifest,
    config: { tencentSecretIdRef: "secret-id", tencentSecretKeyRef: "secret-key" },
  });
  const rows = new Map<string, Record<string, unknown>>();

  harness.ctx.db.execute = async (sql: string, params: unknown[] = []) => {
    if (/INSERT INTO/i.test(sql)) {
      const [id, companyId, key, provider, engineType, audioFormat, audioBytes, sourceRef] =
        params as string[];
      rows.set(id, {
        id,
        company_id: companyId,
        transcription_key: key,
        provider,
        engine_type: engineType,
        audio_format: audioFormat,
        audio_bytes: audioBytes,
        status: "pending",
        text: "",
        error: "",
        duration_ms: 0,
        request_id: "",
        source_ref: sourceRef ?? null,
        created_at: new Date().toISOString(),
      });
      return { rowCount: 1 };
    }
    if (/UPDATE/i.test(sql)) {
      const [, id, text, durationMs, requestId] = params as string[];
      const row = rows.get(id);
      if (row) {
        rows.set(id, { ...row, status: "done", text, duration_ms: durationMs, request_id: requestId });
      }
      return { rowCount: row ? 1 : 0 };
    }
    return { rowCount: 0 };
  };

  harness.ctx.db.query = async <T = Record<string, unknown>>(
    _sql: string,
    params: unknown[] = [],
  ) => {
    const row = rows.get(params[1] as string);
    return (row ? [row] : []) as T[];
  };

  harness.ctx.http.fetch = async () =>
    new Response(
      JSON.stringify({ Response: { Result: "明天下午三点开产品评审会。", RequestId: "req-1" } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  return harness;
}

function createTranscriptionRequest(body: Record<string, unknown>) {
  return {
    routeKey: "create-transcription",
    method: "POST",
    path: "/transcriptions",
    params: {},
    query: {},
    body,
    actor: { actorType: "user" as const, actorId: "user-1" },
    companyId: COMPANY,
    headers: {},
  };
}

const AUDIO = { audioBase64: Buffer.from("fake-audio-bytes").toString("base64"), format: "m4a" };

describe("multimodal worker — transcribe-only mode", () => {
  it("returns the text and creates no issue", async () => {
    const harness = createHarness();
    await plugin.definition.setup(harness.ctx);

    const res = await plugin.definition.onApiRequest!(
      createTranscriptionRequest({ ...AUDIO, mode: "transcribe-only" }),
    );

    expect(res.status).toBe(201);
    const body = res.body as { text: string; transcriptionId: string; issue: unknown };
    expect(body.text).toBe("明天下午三点开产品评审会。");
    expect(body.transcriptionId).toBeTruthy();
    expect(body.issue).toBeNull();
    expect(harness.activity.some((entry) => entry.message.includes("Created task from voice"))).toBe(
      false,
    );
  });

  it("still creates a task on the default dispatch path", async () => {
    const harness = createHarness();
    await plugin.definition.setup(harness.ctx);

    const res = await plugin.definition.onApiRequest!(
      createTranscriptionRequest({ ...AUDIO, createIssue: true }),
    );

    expect(res.status).toBe(201);
    const body = res.body as { issue: { id: string; title: string } | null };
    expect(body.issue).not.toBeNull();
    expect(body.issue?.title).toBe("明天下午三点开产品评审会。");
    expect(harness.activity.some((entry) => entry.message.includes("Created task from voice"))).toBe(
      true,
    );
  });

  it("does not create a task when transcribe-only is combined with createIssue", async () => {
    const harness = createHarness();
    await plugin.definition.setup(harness.ctx);

    const res = await plugin.definition.onApiRequest!(
      createTranscriptionRequest({ ...AUDIO, mode: "transcribe-only", createIssue: true }),
    );

    expect((res.body as { issue: unknown }).issue).toBeNull();
    expect(harness.activity.some((entry) => entry.message.includes("Created task from voice"))).toBe(
      false,
    );
  });
});
