#!/usr/bin/env node
/**
 * Would two instances on this host share a database port?
 *
 * The defect this exists for: `paperclipai db:backup` (and the pre-update backup
 * inside `update`, which calls the same function) resolves its connection from
 * `config.database.embeddedPostgresPort ?? 54329`, while the server falls back to
 * a free port **in memory only** when 54329 is taken. So with two instances on one
 * host, instance A's server can be listening on 54330 while its config still says
 * 54329 — and backing up A then connects to **B's database** and writes the dump
 * into **A's backup directory**, silently. One client's data lands in another
 * client's folder, and A is not actually backed up.
 *
 * The trigger is always the same: two instances, one port. So that is what this
 * checks, from configuration alone — no server cooperation, no writes, no
 * network. Pinning a distinct `database.embeddedPostgresPort` per instance means
 * the server never falls back, so config and reality agree.
 *
 * Deliberately plain JavaScript: it runs on a host before anything is built, and
 * the repo's TypeScript toolchain would otherwise have to be in the loop.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** The port every instance falls back to when its config does not pin one. */
export const DEFAULT_EMBEDDED_PORT = 54329;

/** What port an instance will actually use, and whether it was pinned. */
export function effectivePort(config) {
  const value = config?.database?.embeddedPostgresPort;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return { port: value, pinned: true };
  }
  return { port: DEFAULT_EMBEDDED_PORT, pinned: false };
}

/**
 * Group instances by effective port. A group of two or more is the hazard,
 * whether they collided by both defaulting or by both pinning the same number.
 */
export function findPortCollisions(instances) {
  const entries = instances.map((instance) => ({ id: instance.id, ...effectivePort(instance.config) }));
  const byPort = new Map();
  for (const entry of entries) {
    byPort.set(entry.port, [...(byPort.get(entry.port) ?? []), entry]);
  }
  const collisions = [];
  for (const [port, group] of byPort) {
    if (group.length < 2) continue;
    collisions.push({
      port,
      instances: group.map((entry) => entry.id),
      unpinned: group.filter((entry) => !entry.pinned).map((entry) => entry.id),
    });
  }
  return { entries, collisions };
}

/**
 * Three verdicts, and the middle one matters: with fewer than two instances
 * nothing can collide, and that is reported as not-applicable rather than as a
 * pass. A check that says "ok" when it had nothing to check is the thing this
 * whole exercise is against.
 */
export function verdictFor(instances) {
  const { entries, collisions } = findPortCollisions(instances);
  if (instances.length < 2) {
    return {
      verdict: "not-applicable",
      reason: "fewer than two instances on this host, so no port can be shared",
      entries,
      collisions,
    };
  }
  if (collisions.length > 0) {
    return { verdict: "hazard", entries, collisions };
  }
  return { verdict: "ok", entries, collisions };
}

function safeReadConfig(file) {
  try {
    const raw = readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    // A malformed or absent config is not this check's business: it means the
    // instance takes the default port, which is what effectivePort assumes.
    return {};
  }
}

/** Every instance directory under a Paperclip home, with its parsed config. */
export function readInstances(home = process.env.PAPERCLIP_HOME ?? path.join(homedir(), ".paperclip")) {
  const root = path.join(home, "instances");
  let names;
  try {
    names = readdirSync(root);
  } catch {
    return { home, root, instances: [] };
  }
  const instances = names
    .filter((name) => {
      try {
        return statSync(path.join(root, name)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort()
    .map((name) => ({ id: name, config: safeReadConfig(path.join(root, name, "config.json")) }));
  return { home, root, instances };
}

export function formatReport(result, { root } = {}) {
  const lines = [];
  lines.push(`instance port check — ${root ?? "(no instances directory)"}`);
  for (const entry of result.entries) {
    lines.push(`  ${entry.pinned ? "pinned " : "DEFAULT"} ${entry.port}  ${entry.id}`);
  }
  if (result.verdict === "not-applicable") {
    lines.push(`NOT APPLICABLE — ${result.reason}. Nothing checked; this is not a pass.`);
    return lines.join("\n");
  }
  if (result.verdict === "ok") {
    lines.push(`OK — every instance pins a distinct port, so the server never falls back.`);
    return lines.join("\n");
  }
  for (const collision of result.collisions) {
    lines.push(
      `HAZARD — port ${collision.port} is shared by ${collision.instances.join(", ")}` +
        (collision.unpinned.length > 0
          ? ` (unpinned: ${collision.unpinned.join(", ")} — they default to ${DEFAULT_EMBEDDED_PORT})`
          : ""),
    );
  }
  lines.push(
    "Fix: give each instance its own database.embeddedPostgresPort in its config.json, then",
    "     confirm with `paperclipai db:backup --json` that connectionSource names that port.",
  );
  return lines.join("\n");
}

function main() {
  const { root, instances } = readInstances();
  const result = verdictFor(instances);
  console.log(formatReport(result, { root }));
  process.exit(result.verdict === "hazard" ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
