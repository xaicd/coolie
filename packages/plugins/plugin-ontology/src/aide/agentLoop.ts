/**
 * The aide's agent loop.
 *
 * Replaces the single-shot `messages.stream()` call with a bounded tool-use
 * loop so the model can look up real domain data before answering. Split out
 * from the worker and given an injectable `createStream` so the multi-turn
 * behaviour is testable without a live model or an HTTP mock.
 *
 * Deliberately minimal: it owns turn control, tool dispatch and text
 * accumulation, and nothing else. Citation parsing, persistence and stream
 * emission stay in the worker, on the same contract as before.
 */
import type { AideToolSpec } from "./agentTools.js";

export interface AideContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

export interface AideToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

export type AideLoopMessage =
  | { role: "user"; content: string | AideToolResultBlock[] }
  | { role: "assistant"; content: string | AideContentBlock[] };

export interface AideAssistantMessage {
  content?: AideContentBlock[];
  stop_reason?: string | null;
}

/** The slice of the Anthropic MessageStream the loop depends on. */
export interface AideStreamLike {
  on(event: "text", handler: (delta: string) => void): void;
  finalMessage(): Promise<AideAssistantMessage>;
  controller?: { abort(): void };
}

export interface AideAgentDeps {
  createStream(args: {
    system: string;
    messages: AideLoopMessage[];
    tools: AideToolSpec[];
  }): AideStreamLike;
  systemPrompt: string;
  tools: AideToolSpec[];
  messages: AideLoopMessage[];
  executeTool(name: string, input: unknown): Promise<unknown>;
  /** Called for each streamed text delta; the caller forwards it to the UI. */
  onToken(delta: string): void;
  /** Tool lifecycle, for surfacing "looking up…" in the transcript. */
  onTool(name: string, phase: "start" | "done"): void;
  /** Handed the in-flight stream's controller so an abort can cancel the HTTP request. */
  onController?(controller: { abort(): void }): void;
  isAborted(): boolean;
  /** Hard cap on model turns; a run that keeps calling tools stops here. */
  maxTurns?: number;
}

export interface AideAgentResult {
  /** Everything streamed this turn, intermediate narration included. */
  text: string;
  aborted: boolean;
  toolCalls: number;
}

export async function runAideAgent(deps: AideAgentDeps): Promise<AideAgentResult> {
  const maxTurns = deps.maxTurns ?? 6;
  const messages: AideLoopMessage[] = [...deps.messages];
  let text = "";
  let toolCalls = 0;

  for (let turn = 0; turn < maxTurns; turn += 1) {
    if (deps.isAborted()) return { text, aborted: true, toolCalls };

    const stream = deps.createStream({
      system: deps.systemPrompt,
      messages,
      tools: deps.tools,
    });
    if (deps.onController && stream.controller) deps.onController(stream.controller);

    stream.on("text", (delta: string) => {
      if (deps.isAborted()) return;
      text += delta;
      deps.onToken(delta);
    });

    const final = await stream.finalMessage();
    if (deps.isAborted()) return { text, aborted: true, toolCalls };

    const toolUses = (final.content ?? []).filter(
      (block) => block.type === "tool_use" && typeof block.name === "string",
    );
    if (final.stop_reason !== "tool_use" || toolUses.length === 0) {
      return { text, aborted: false, toolCalls };
    }

    // The assistant turn that requested tools must be echoed back verbatim,
    // followed by one user turn carrying every tool_result.
    messages.push({ role: "assistant", content: final.content ?? [] });

    const results: AideToolResultBlock[] = [];
    for (const call of toolUses) {
      const name = call.name as string;
      toolCalls += 1;
      deps.onTool(name, "start");
      let result: unknown;
      try {
        result = await deps.executeTool(name, call.input);
      } catch (err) {
        // executeTool is meant not to throw, but never let one bad call kill
        // the turn — hand the failure back as the tool result instead.
        result = { error: String((err as Error)?.message ?? err) };
      }
      deps.onTool(name, "done");
      results.push({
        type: "tool_result",
        tool_use_id: call.id ?? "",
        content: JSON.stringify(result ?? null),
      });
    }

    if (deps.isAborted()) return { text, aborted: true, toolCalls };
    messages.push({ role: "user", content: results });
  }

  return { text, aborted: false, toolCalls };
}
