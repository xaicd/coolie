/**
 * Architecture extraction — service-to-service dependencies.
 *
 * This is the one thing no other pass produces: `AstExtractor` emits a single
 * relation kind (a SQL foreign key) and nothing at all between services, so a
 * runtime-architecture view had no edges to draw.
 *
 * Two rules keep it honest:
 *   1. Every edge carries the evidence (file + matched text) it came from.
 *   2. A reference that cannot be resolved to a known service is reported as
 *      unresolved rather than turned into an edge to a guessed target. A wrong
 *      edge in an architecture diagram is worse than a missing one.
 */
import type { DependencyType } from "../enums.js";
import type { DetectedService, SourceFile } from "./serviceDetector.js";
import { readPackageJson } from "./serviceDetector.js";

export interface DetectedDependency {
  fromServiceKey: string;
  /** `null` when the reference could not be tied to a known service. */
  toServiceKey: string | null;
  /** What the code actually said (host, package name, topic, table). */
  targetHint: string;
  type: DependencyType;
  evidence: string[];
}

/** Hosts that are infrastructure rather than a sibling service. */
const HOST_DENYLIST = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "example.com",
  "github.com",
  "npmjs.org",
  "registry.npmjs.org",
  "w3.org",
  "schema.org",
  "googleapis.com",
  "gstatic.com",
  "cloudflare.com",
  "amazonaws.com",
  "docker.io",
];

interface Signal {
  type: DependencyType;
  hint: string;
  index: number;
  text: string;
}

const URL_RE = /\bhttps?:\/\/([A-Za-z0-9._-]+)(?::\d+)?([^\s"'`)]*)/g;
const PUBLISH_RE = /\.(?:publish|emit|send|produce|dispatch)\s*\(\s*(?:['"`]([^'"`]{2,})['"`]|\{[^}]*topic\s*:\s*['"`]([^'"`]{2,})['"`])/g;
const SUBSCRIBE_RE = /\.(?:subscribe|consume|listen|on)\s*\(\s*['"`]([^'"`]{2,})['"`]/g;

function owningService(path: string, services: DetectedService[]): DetectedService | null {
  let best: DetectedService | null = null;
  for (const service of services) {
    if (service.path === "" || path === service.path || path.startsWith(`${service.path}/`)) {
      if (!best || service.path.length > best.path.length) best = service;
    }
  }
  return best;
}

/** Tokens that could tie a reference back to a service. */
function serviceTokens(service: DetectedService, files: SourceFile[]): string[] {
  const tokens = new Set<string>();
  const add = (value: string | undefined) => {
    if (!value) return;
    for (const part of value.toLowerCase().split(/[^a-z0-9\u4e00-\u9fa5]+/)) {
      if (part.length >= 3) tokens.add(part);
    }
  };
  add(service.key);
  add(service.name);
  add(service.path.split("/").filter(Boolean).pop());
  const packageJson = readPackageJson(files, service.path);
  add(packageJson?.name);
  return [...tokens];
}

function buildIndex(services: DetectedService[], files: SourceFile[]): Map<string, DetectedService> {
  const index = new Map<string, DetectedService>();
  for (const service of services) {
    for (const token of serviceTokens(service, files)) {
      if (!index.has(token)) index.set(token, service);
    }
  }
  return index;
}

function resolveHint(hint: string, index: Map<string, DetectedService>): DetectedService | null {
  const host = hint.toLowerCase().replace(/^https?:\/\//, "").split("/")[0] ?? "";
  if (host === "" || HOST_DENYLIST.some((denied) => host === denied || host.endsWith(`.${denied}`))) return null;
  const candidates = [hint.toLowerCase(), host, ...host.split(/[.\-_:]/)];
  for (const candidate of candidates) {
    const hit = index.get(candidate);
    if (hit) return hit;
  }
  // Fall back to substring containment, longest token first, so `order` does not
  // win over `order-service` when both are keys.
  const tokens = [...index.keys()].sort((a, b) => b.length - a.length);
  for (const token of tokens) {
    if (token.length >= 4 && (host.includes(token) || hint.toLowerCase().includes(token))) {
      return index.get(token) ?? null;
    }
  }
  return null;
}

function collectSignals(content: string): Signal[] {
  const signals: Signal[] = [];
  const lines = content.split("\n");

  lines.forEach((line, index) => {
    for (const match of line.matchAll(URL_RE)) {
      const host = match[1] ?? "";
      signals.push({ type: "api-call", hint: match[0], index, text: host });
    }
    for (const match of line.matchAll(PUBLISH_RE)) {
      const topic = match[1] ?? match[2] ?? "";
      if (topic) signals.push({ type: "event-bus", hint: topic, index, text: topic });
    }
    for (const match of line.matchAll(SUBSCRIBE_RE)) {
      const topic = match[1] ?? "";
      // `.on("click")` and friends are DOM events, not an event bus.
      if (topic && !/^(click|change|input|submit|load|error|message|data|end|close|open|keydown|keyup|focus|blur|scroll|resize)$/.test(topic)) {
        signals.push({ type: "event-bus", hint: topic, index, text: topic });
      }
    }
  });

  return signals;
}

function collectImports(content: string): string[] {
  const packages = new Set<string>();
  for (const match of content.matchAll(/(?:from\s+|require\(\s*)['"]([^'"]+)['"]/g)) {
    const specifier = match[1] ?? "";
    if (specifier.startsWith(".") || specifier.startsWith("/")) continue;
    if (specifier.startsWith("node:")) continue;
    // Keep the scope when present (`@acme/shared`).
    const parts = specifier.split("/");
    packages.add(specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!);
  }
  return [...packages];
}

/**
 * Extract the dependencies between detected services.
 *
 * `tablesByService` maps a table name to the service whose DDL declares it, so
 * code reading another service's table can be reported as `db-share`.
 */
export function extractDependencies(
  files: SourceFile[],
  services: DetectedService[],
  tablesByService: Map<string, string> = new Map(),
): { dependencies: DetectedDependency[]; unresolved: DetectedDependency[] } {
  if (services.length === 0) return { dependencies: [], unresolved: [] };

  const index = buildIndex(services, files);
  const packageNames = new Map<string, DetectedService>();
  for (const service of services) {
    const name = readPackageJson(files, service.path)?.name;
    if (name) packageNames.set(name, service);
  }

  const resolved: DetectedDependency[] = [];
  const unresolved: DetectedDependency[] = [];
  const seen = new Set<string>();

  const push = (dependency: DetectedDependency, from: DetectedService) => {
    // A service calling itself is not an architecture edge.
    if (dependency.toServiceKey === from.key) return;
    const dedupeKey = `${dependency.fromServiceKey}::${dependency.type}::${dependency.toServiceKey ?? dependency.targetHint}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    if (dependency.toServiceKey === null) unresolved.push(dependency);
    else resolved.push(dependency);
  };

  for (const file of files) {
    if (!/\.(ts|tsx|js|jsx|mjs|cjs|py|go|java|kt|rs|rb|php|cs|vue|svelte|sql)$/i.test(file.path)) continue;
    const owner = owningService(file.path, services);
    if (!owner) continue;

    for (const signal of collectSignals(file.content)) {
      // A published topic names an event, not necessarily a service — an
      // `order.created` topic would otherwise resolve to the `order` service and
      // then be dropped as a self-edge. Report the topic and leave the consumer
      // unknown.
      const target = signal.type === "event-bus" ? null : resolveHint(signal.hint, index);
      push(
        {
          fromServiceKey: owner.key,
          toServiceKey: target?.key ?? null,
          targetHint: signal.text || signal.hint,
          // A URL we could not tie to a service is still an outbound call.
          type: signal.type,
          evidence: [`${file.path}:${signal.index + 1}`],
        },
        owner,
      );
    }

    for (const specifier of collectImports(file.content)) {
      const target = packageNames.get(specifier) ?? resolveHint(specifier, index);
      if (!target) continue; // Third-party imports are not architecture edges.
      push(
        {
          fromServiceKey: owner.key,
          toServiceKey: target.key,
          targetHint: specifier,
          type: "shared-lib",
          evidence: [`${file.path}`],
        },
        owner,
      );
    }

    for (const [table, tableOwner] of tablesByService) {
      if (tableOwner === owner.key) continue;
      if (new RegExp(`\\b${table}\\b`, "i").test(file.content)) {
        push(
          {
            fromServiceKey: owner.key,
            toServiceKey: tableOwner,
            targetHint: table,
            type: "db-share",
            evidence: [`${file.path}`],
          },
          owner,
        );
      }
    }
  }

  return { dependencies: resolved, unresolved };
}
