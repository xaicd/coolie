import { spawn } from "node:child_process";

/**
 * The one-shot `hermes chat` call the build-mode planners share.
 *
 * Two planners now need the same thing: send one prompt to the operator's local
 * `hermes` CLI, get one answer back, and treat "missing binary", "slow", "too
 * loud" and "non-zero exit" as the same kind of event — a planner that did not
 * answer. The build planner had this inlined and the ontology spec planner needs
 * it verbatim, so it lives here rather than being copied: a second copy is where
 * the timeout handling and the output cap quietly stop matching.
 *
 * What is deliberately NOT here: what the answer means. Extracting JSON from a
 * chatty model, and deciding whether the answer is usable, stays with each
 * planner, because those two answers have different shapes and different
 * fallbacks.
 */

export interface HermesOneShotInput {
  /** Passed to the CLI as `PAPERCLIP_COMPANY_ID`. */
  companyId: string;
  /** Passed as `PAPERCLIP_API_URL` when set. */
  apiUrl?: string;
  /**
   * Coolie fork: the active company's display name. Forwarded to the spawned
   * `hermes` as `$COMPANY_NAME` so persona-aware tooling (board concierge
   * relays, future agents) sees the same branding the SYSTEM block carries.
   * Optional: build/orchestrator callers leave it `undefined` and hermes'
   * own config is the source of truth for those flows.
   */
  companyName?: string;
  /** The `[SYSTEM]` block. */
  systemPrompt: string;
  /** The payload block's label, e.g. `BUILD REQUEST` -> `[BUILD REQUEST]`. */
  requestLabel: string;
  /** The payload inside the block. */
  requestBody: string;
  model: string;
  timeoutMs: number;
  maxOutputBytes: number;
  /** Names this caller in error messages, e.g. `build planner`. */
  label: string;
  /** Defaults to `/tmp`, the neutral cwd the existing callers use. */
  cwd?: string;
}

export async function requestHermesOneShot(input: HermesOneShotInput): Promise<string> {
  const query =
    `[SYSTEM]\n${input.systemPrompt}\n[/SYSTEM]\n\n` +
    `[${input.requestLabel}]\n${input.requestBody}\n[/${input.requestLabel}]`;

  return await new Promise<string>((resolve, reject) => {
    const proc = spawn(
      "hermes",
      ["chat", "--oneshot", "--quiet", "--query-file", "-", "-m", input.model],
      {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: input.cwd ?? "/tmp",
        env: {
          ...process.env,
          ...(input.apiUrl ? { PAPERCLIP_API_URL: input.apiUrl } : {}),
          PAPERCLIP_COMPANY_ID: input.companyId,
          // Coolie fork: optional persona name passthrough. Only set when
          // present so an empty value never blanks a downstream env.
          ...(input.companyName ? { COMPANY_NAME: input.companyName } : {}),
        },
      },
    );

    let stdout = "";
    let stderr = "";
    let settled = false;
    let overflowed = false;

    const finish = (error: Error | null, value = "") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      finish(new Error(`${input.label} timed out after ${input.timeoutMs}ms`));
    }, input.timeoutMs);

    proc.stdout.on("data", (data: Buffer) => {
      if (overflowed) return;
      stdout += data.toString();
      if (stdout.length > input.maxOutputBytes) {
        overflowed = true;
        proc.kill("SIGTERM");
        finish(new Error(`${input.label} produced more output than expected`));
      }
    });
    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });
    proc.on("error", (err) => finish(err));
    proc.on("close", (code) => {
      if (code === 0) return finish(null, stdout);
      finish(
        new Error(
          `${input.label} exited with code ${code ?? "unknown"}${
            stderr.trim() ? `: ${stderr.trim().slice(0, 500)}` : ""
          }`,
        ),
      );
    });

    proc.stdin.write(query);
    proc.stdin.end();
  });
}

/**
 * The outermost JSON object in a model's answer, tolerating a fenced block.
 *
 * Lives here rather than in either planner because both prompts ask for "ONE
 * JSON object and nothing else", and both have to survive the model wrapping it
 * in a fence anyway.
 */
export function extractJsonObject(raw: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  for (const candidate of [fenced?.[1], raw]) {
    if (!candidate) continue;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) continue;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}
