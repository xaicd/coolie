/**
 * Citation helpers shared between the worker (writes) and unit tests (reads).
 *
 * The LLM is asked to append a single trailing line to every assistant
 * message: `[cite:kind:id,kind:id,...]`. kind is one of a fixed whitelist;
 * anything outside the whitelist is dropped. The trailer is stripped before
 * the rest of the content is persisted so the DB stores a clean content
 * column plus a structured citations array.
 */
import type { AideCitation } from "./AideStore.js";

export const ALLOWED_CITATION_KINDS = new Set<AideCitation["kind"]>([
  "node-type",
  "relation-type",
  "node",
  "sub-project",
  "action-type",
  "business-system",
]);

/**
 * Parse the trailing `[cite:kind:id,...]` line from an LLM response. Returns
 * an empty array if no trailer is present. Malformed entries are silently
 * dropped — never throw, since this runs on every streamed turn.
 */
export function extractCitations(text: string): AideCitation[] {
  const match = /\[cite:([^\]]*)\]\s*$/u.exec(text);
  if (!match) return [];
  const raw = match[1] ?? "";
  const entries = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const out: AideCitation[] = [];
  for (const entry of entries) {
    const colonIdx = entry.indexOf(":");
    if (colonIdx < 0) continue;
    const kind = entry.slice(0, colonIdx).trim();
    const id = entry.slice(colonIdx + 1).trim();
    if (!ALLOWED_CITATION_KINDS.has(kind as AideCitation["kind"])) continue;
    if (id.length === 0) continue;
    out.push({ kind: kind as AideCitation["kind"], id });
  }
  return out;
}

/**
 * Strip the trailing `[cite:...]` line so the persisted content column is
 * citation-free. Idempotent — running it twice has the same effect as once.
 */
export function stripCitationTrailer(text: string): string {
  return text.replace(/\s*\[cite:[^\]]*\]\s*$/u, "").trimEnd();
}