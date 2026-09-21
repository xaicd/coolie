import { describe, expect, it } from "vitest";
import { runDshHarness } from "./harness.js";
import type { DeepSeekChatResponse, DshChatClient } from "./deepseek.js";

function fakeClient(responses: DeepSeekChatResponse[]): DshChatClient {
  let index = 0;
  return {
    model: "deepseek-chat",
    async chat() {
      const response = responses[Math.min(index, responses.length - 1)];
      index += 1;
      return response;
    },
  };
}

const toolCallResponse: DeepSeekChatResponse = {
  choices: [
    {
      message: {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call-1",
            type: "function",
            function: { name: "ontology_list_domains", arguments: "{}" },
          },
        ],
      },
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 4 },
};

const finalResponse: DeepSeekChatResponse = {
  choices: [{ message: { role: "assistant", content: "There are two domains." } }],
  usage: { prompt_tokens: 20, completion_tokens: 6 },
};

const noopLog = async () => {};

describe("runDshHarness", () => {
  it("runs a tool call and returns the final answer with accumulated usage", async () => {
    const seen: string[] = [];
    const result = await runDshHarness({
      client: fakeClient([toolCallResponse, finalResponse]),
      messages: [{ role: "user", content: "list domains" }],
      tools: [],
      callTool: async (name) => {
        seen.push(name);
        return { domains: ["orders", "billing"] };
      },
      maxSteps: 5,
      onLog: noopLog,
      isCancelled: () => false,
    });

    expect(result.ok).toBe(true);
    expect(result.summary).toBe("There are two domains.");
    expect(seen).toEqual(["ontology_list_domains"]);
    expect(result.steps).toBe(2);
    expect(result.toolCalls).toBe(1);
    expect(result.inputTokens).toBe(30);
    expect(result.outputTokens).toBe(10);

    const toolMessage = result.transcript[2];
    expect(toolMessage.role).toBe("tool");
    expect(toolMessage.tool_call_id).toBe("call-1");
    expect(JSON.parse(String(toolMessage.content))).toEqual({ domains: ["orders", "billing"] });
  });

  it("feeds a tool failure back to the model instead of aborting the run", async () => {
    const result = await runDshHarness({
      client: fakeClient([toolCallResponse, finalResponse]),
      messages: [{ role: "user", content: "list domains" }],
      callTool: async () => {
        throw new Error("MCP endpoint refused the call");
      },
      maxSteps: 5,
      onLog: noopLog,
      isCancelled: () => false,
    });

    expect(result.ok).toBe(true);
    expect(result.summary).toBe("There are two domains.");
    const toolMessage = result.transcript[2];
    expect(JSON.parse(String(toolMessage.content))).toEqual({
      error: "MCP endpoint refused the call",
    });
  });

  it("reports a missing MCP endpoint as a tool error rather than crashing", async () => {
    const result = await runDshHarness({
      client: fakeClient([toolCallResponse, finalResponse]),
      messages: [{ role: "user", content: "list domains" }],
      maxSteps: 5,
      onLog: noopLog,
      isCancelled: () => false,
    });

    const toolMessage = result.transcript[2];
    expect(String(toolMessage.content)).toContain("No MCP endpoint configured");
    expect(result.toolCalls).toBe(1);
  });

  it("stops at maxSteps when the model keeps calling tools", async () => {
    const result = await runDshHarness({
      client: fakeClient([toolCallResponse]),
      messages: [{ role: "user", content: "loop" }],
      callTool: async () => ({}),
      maxSteps: 2,
      onLog: noopLog,
      isCancelled: () => false,
    });

    expect(result.ok).toBe(false);
    expect(result.steps).toBe(2);
    expect(result.toolCalls).toBe(2);
    expect(result.summary).toContain("maximum of 2 steps");
  });

  it("returns cancelled before the first request when the run is aborted", async () => {
    const result = await runDshHarness({
      client: fakeClient([finalResponse]),
      messages: [{ role: "user", content: "hi" }],
      maxSteps: 3,
      onLog: noopLog,
      isCancelled: () => true,
    });

    expect(result.cancelled).toBe(true);
    expect(result.steps).toBe(0);
  });
});
