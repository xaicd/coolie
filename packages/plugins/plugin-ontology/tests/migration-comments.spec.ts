/**
 * No apostrophes in migration comments.
 *
 * The host classifies each statement by stripping string literals first, so an
 * apostrophe in a comment opens a literal that runs until the next quote — which
 * is usually on a later line, inside a statement. The corruption then surfaces as
 * a rejection of an unrelated statement: "migrations may contain DDL or
 * namespace-scoped backfill statements only", pointing at a CREATE TABLE that is
 * plainly DDL.
 *
 * This has cost three separate debugging sessions. The fix is one character, so
 * the guard belongs here rather than in a comment at the top of each file saying
 * please do not.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATIONS = new URL("../migrations/", import.meta.url);

describe("migration files", () => {
  const files = readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql"));

  it("has migrations to check", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  /**
   * These three predate the rule, and they are pinned **because they cannot be
   * fixed**: the host records a checksum per applied migration and rejects an
   * activation whose checksum changed, so editing an applied comment breaks the
   * plugin rather than repairing it. Their apostrophes happen to pair harmlessly.
   *
   * So this list is a locked inventory in both directions: a fourth file with an
   * apostrophe fails, and so does a well-meaning edit that "fixes" one of these.
   */
  const KNOWN = ["010_aide.sql", "011_aide_snapshots.sql", "013_schema_version.sql"];

  it("keeps apostrophes out of comments, except where the checksum forbids it", () => {
    const offenders: string[] = [];
    for (const name of files) {
      const lines = readFileSync(new URL(name, MIGRATIONS), "utf8").split("\n");
      lines.forEach((line, index) => {
        // Line comments only: a quote inside a statement is a literal the host
        // expects, and stripping those correctly is its job.
        if (/^\s*--/.test(line) && /['\u2019]/.test(line)) {
          offenders.push(`${name}:${index + 1}  ${line.trim().slice(0, 80)}`);
        }
      });
    }
    const found = [...new Set(offenders.map((line) => line.split(":")[0]!))].sort();
    expect(
      found,
      `apostrophes in a migration comment corrupt the host statement classifier.\n` +
        `A new migration must avoid them:\n${offenders.join("\n")}\n` +
        `The known files cannot be edited: the host checksums applied migrations and ` +
        `rejects a changed one, so fixing a comment would break activation.`,
    ).toEqual([...KNOWN].sort());
  });
});
