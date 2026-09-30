import fs from "node:fs";
import path from "node:path";
import { resolveRunInfo } from "./run-info.js";

let headerWritten = false;

/**
 * Append a line to `<evidenceDir>/notes.log` (the machine-readable run trail)
 * and echo it to stdout so it appears in the captured run output too.
 */
export function note(message: string, data?: unknown): void {
  const info = resolveRunInfo();
  const file = path.join(info.evidenceDir, "notes.log");
  if (!headerWritten) {
    fs.appendFileSync(file, `# run ${info.runId} · ${info.appBaseUrl}\n`);
    headerWritten = true;
  }
  const suffix = data === undefined ? "" : ` ${JSON.stringify(data)}`;
  fs.appendFileSync(file, `${new Date().toISOString()} ${message}${suffix}\n`);
  console.log(`[e2e] ${message}${suffix}`);
}
