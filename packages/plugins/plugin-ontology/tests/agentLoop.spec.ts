/**
 * The aide's agent loop.
 *
 * `createStream` is injected precisely so this can be driven by scripted fake
 * streams: no live model, no HTTP mock. The tests cover the multi-turn
 * tool_use handshake, the turn cap, and abort handling — the parts that decide
 * whether a lookup actually reaches the model.
 */
import { describe, expect, it, vi } from "vitest";
import {
  runAideAgent,
  type AideAssistantMessage,
  type AideStreamLike,
} from "../src/aide/agentLoop.js";
import type { AideToolSpec } from "../src/aide/agentTools.js";

const TOOLS: AideToolSpec[] = [
  { name: "get_instance", description: "look up an instance", input_schema: { type: "object", properties: {} } },
];

/** A fake MessageStream: emits its deltas when a text handler attaches. */
function makeStream(opts: { deltas?: string[]; final: AideAssistantMessage }): AideStreamLike {
  return {
    on(event, handler) {
      if (event !== "text") return;
      for (const delta of opts.deltas ?? []) handler(delta);
    },
    async finalMessage() {
      return opts.final;
    },
    controller: { abort() {} },
  };
}

function baseDeps(streams: AideStreamLike[], overrides: Record<string, unknown> = {}) {
  let index = 0;
  const createStream = vi.fn(
    (_args: { system: string; messages: unknown[]; tools: unknown[] }) => {
      const stream = streams[index];
      index += 1;
      if (!stream) throw new Error("ran out of scripted streams");
      return stream;
    },
  );
  return {
    deps: {
      createStream,
      systemPrompt: "system",
      tools: TOOLS,
      messages: [{ role: "user" as const, content: "Platform Team 有几个人?" }],
      executeTool: vi.fn(async () => ({ headcount: 12 })),
      onToken: vi.fn(),
      onTool: vi.fn(),
      isAborted: () => false,
      ...overrides,
    },
    createStream,
  };
}

describe("runAideAgent", () => {
  it("runs a tool round-trip and returns the text of every turn", async () => {
    const toolTurn = makeStream({
      deltas: ["让我查一下。"],
      final: {
        stop_reason: "tool_use",
        content: [
          { type: "text", text: "让我查一下。" },
          { type: "tool_use", id: "tu-1", name: "get_instance", input: { key: "team-platform" } },
        ],
      },
    });
    const answerTurn = makeStream({
      deltas: ["Platform Team 有 12 人。"],
      final: {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Platform Team 有 12 人。" }],
      },
    });

    const { deps, createStream } = baseDeps([toolTurn, answerTurn]);
    const result = await runAideAgent(deps as never);

    expect(createStream).toHaveBeenCalledTimes(2);
    expect(deps.executeTool).toHaveBeenCalledWith("get_instance", { key: "team-platform" });
    expect(deps.onTool).toHaveBeenCalledWith("get_instance", "start");
    expect(deps.onTool).toHaveBeenCalledWith("get_instance", "done");
    expect(result.toolCalls).toBe(1);
    expect(result.aborted).toBe(false);
    expect(result.text).toBe("让我查一下。Platform Team 有 12 人。");
    // Every streamed delta is forwarded to the UI.
    expect(deps.onToken).toHaveBeenCalledWith("Platform Team 有 12 人。");
  });

  it("feeds the tool result back as a user turn and echoes the assistant turn", async () => {
    const toolTurn = makeStream({
      final: {
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "tu-9", name: "get_instance", input: { key: "x" } }],
      },
    });
    const done = makeStream({ deltas: ["ok"], final: { stop_reason: "end_turn", content: [] } });

    const { deps, createStream } = baseDeps([toolTurn, done]);
    await runAideAgent(deps as never);

    const secondCall = createStream.mock.calls[1]![0] as { messages: Array<{ role: string; content: unknown }> };
    expect(secondCall.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(secondCall.messages[1]!.content).toEqual([
      { type: "tool_use", id: "tu-9", name: "get_instance", input: { key: "x" } },
    ]);
    expect(secondCall.messages[2]!.content).toEqual([
      { type: "tool_result", tool_use_id: "tu-9", content: JSON.stringify({ headcount: 12 }) },
    ]);
  });

  it("stops after a single turn when the model does not ask for a tool", async () => {
    const answer = makeStream({ deltas: ["你好"], final: { stop_reason: "end_turn", content: [] } });
    const { deps, createStream } = baseDeps([answer]);
    const result = await runAideAgent(deps as never);

    expect(createStream).toHaveBeenCalledTimes(1);
    expect(result.text).toBe("你好");
    expect(deps.executeTool).not.toHaveBeenCalled();
  });

  it("stops at maxTurns when the model keeps calling tools", async () => {
    const looping = () =>
      makeStream({
        final: {
          stop_reason: "tool_use",
          content: [{ type: "tool_use", id: "tu", name: "get_instance", input: {} }],
        },
      });
    const { deps, createStream } = baseDeps([looping(), looping(), looping()]);
    const result = await runAideAgent({ ...deps, maxTurns: 3 } as never);

    expect(createStream).toHaveBeenCalledTimes(3);
    expect(result.toolCalls).toBe(3);
    expect(result.aborted).toBe(false);
  });

  it("does not touch the model when already aborted", async () => {
    const { deps, createStream } = baseDeps([], { isAborted: () => true });
    const result = await runAideAgent(deps as never);

    expect(createStream).not.toHaveBeenCalled();
    expect(result.aborted).toBe(true);
  });

  it("returns aborted when the cancel lands between turns", async () => {
    let aborted = false;
    const toolTurn = makeStream({
      final: {
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "tu-1", name: "get_instance", input: {} }],
      },
    });
    const { deps, createStream } = baseDeps([toolTurn], {
      isAborted: () => aborted,
      executeTool: async () => {
        aborted = true;
        return { ok: true };
      },
    });

    const result = await runAideAgent(deps as never);
    expect(createStream).toHaveBeenCalledTimes(1);
    expect(result.aborted).toBe(true);
  });

  it("hands a throwing tool back as an error result instead of failing the turn", async () => {
    const toolTurn = makeStream({
      final: {
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "tu-1", name: "get_instance", input: {} }],
      },
    });
    const done = makeStream({ deltas: ["ok"], final: { stop_reason: "end_turn", content: [] } });

    const { deps, createStream } = baseDeps([toolTurn, done], {
      executeTool: async () => {
        throw new Error("tool exploded");
      },
    });
    const result = await runAideAgent(deps as never);

    expect(result.toolCalls).toBe(1);
    const secondCall = createStream.mock.calls[1]![0] as { messages: Array<{ content: unknown }> };
    expect(JSON.stringify(secondCall.messages[2]!.content)).toContain("tool exploded");
  });
});
