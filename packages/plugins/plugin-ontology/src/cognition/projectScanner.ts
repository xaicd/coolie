/**
 * Project-directory scanning: one pass over a real repository tree.
 *
 * This is the entry point the import wizard's "code" tab needed. Before it, the
 * directory picker only kept `.js/.ts/.jsx/.tsx` and ran a regex route scan — so
 * pointing it at a JEECGBoot monolith, a RuoYi-Pro multi-module build, a gRPC
 * contract repo or a hand-assembled Spring Boot stack produced **nothing at
 * all**. The plugin's own directory walk was missing, and so was any notion of
 * where a type came from.
 *
 * What it does, in order:
 *   1. applies the file/byte ceilings (the same ones the architecture pass uses,
 *      which until now no reachable path enforced);
 *   2. detects the deployable units — Maven/Gradle modules, `services/*` layouts,
 *      Spring apps named by `spring.application.name`;
 *   3. parses every file it understands, per language;
 *   4. stamps each discovered type with the service it belongs to.
 *
 * It reports what it could not read rather than dropping it silently, so the
 * wizard can say "we saw 412 MyBatis XML files and have no parser for them yet".
 *
 * Pure and browser-safe: the wizard previews with it and the worker runs the
 * same code.
 */

import type { RepoDraft, SourceFile } from "./AstExtractor.js";
import { extractRepoDraft } from "./AstExtractor.js";
import { analyzeArchitecture, applyLimits } from "../architecture/index.js";
import { MANIFEST_FILES } from "../architecture/serviceDetector.js";

/** Extensions at least one parser understands. */
export const PARSED_EXTENSIONS = new Set([
  ".java", ".kt", ".proto", ".sql",
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue",
  ".py", ".go",
]);

/** Files that are noise in an object-model scan, whatever the extension. */
const IGNORED_BASENAMES = /^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|\.DS_Store)$/i;
/**
 * Extensions with no chance of carrying the object model. Exported so the
 * browser side can skip reading them at all — a directory picker hands over
 * every asset in the tree, and reading a 40MB image as text is pure waste.
 */
export const IGNORED_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp", ".pdf", ".zip", ".gz", ".jar",
  ".woff", ".woff2", ".ttf", ".eot", ".map", ".min.js", ".mp4", ".mp3",
]);

export interface ScannedService {
  key: string;
  name: string;
  path: string;
  /** Sub-project type and microservice layer, from the architecture pass. */
  type: string;
  layer: string;
  /** Types discovered inside this service. */
  typeCount: number;
  fileCount: number;
}

export interface ProjectScanResult {
  draft: RepoDraft;
  services: ScannedService[];
  /** Extension → files read. */
  byExtension: Record<string, number>;
  /** Extension → files seen but unreadable by any parser. Surfaced, not dropped. */
  unsupported: Record<string, number>;
  /** Set when the ceilings dropped material. */
  truncationNote: string | null;
}

function extensionOf(path: string): string {
  const match = /(\.[A-Za-z0-9]+)$/.exec(path);
  return match ? match[1]!.toLowerCase() : "";
}

function basenameOf(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/** The most specific service whose directory contains this path. */
function serviceForPath(
  path: string,
  services: Array<{ name: string; path: string }>,
): string | undefined {
  let best: { name: string; path: string } | undefined;
  for (const service of services) {
    if (service.path !== "" && path !== service.path && !path.startsWith(`${service.path}/`)) {
      continue;
    }
    if (!best || service.path.length > best.path.length) best = service;
  }
  return best?.name;
}

function tally(into: Record<string, number>, key: string): void {
  into[key] = (into[key] ?? 0) + 1;
}

export function scanProject(
  files: SourceFile[],
  layerOverrides: Record<string, string> = {},
): ProjectScanResult {
  const { files: limited, note } = applyLimits(files);
  const architecture = analyzeArchitecture(limited, layerOverrides as never);
  const draft = extractRepoDraft(limited);

  // Stamp each type with the deployable unit its source files live in. The
  // parsers can only see a package (`org.jeecg.modules.system`); the service a
  // type ships in is a property of the tree, so it is resolved here.
  const serviceNames = architecture.services.map((s) => ({ name: s.name, path: s.path }));
  for (const seed of draft.seedNodeTypes) {
    for (const file of seed.sourceFiles) {
      const service = serviceForPath(file, serviceNames);
      if (!service) continue;
      seed.origin = { ...(seed.origin ?? { kind: "source" }), service };
      break;
    }
  }

  const byExtension: Record<string, number> = {};
  const unsupported: Record<string, number> = {};
  const filesPerService = new Map<string, number>();
  for (const file of limited) {
    const base = basenameOf(file.path);
    if (IGNORED_BASENAMES.test(base)) continue;
    // Build manifests are already consumed by the architecture pass; reporting
    // `pom.xml` as "unreadable" would drown the real gaps under build files.
    if ((MANIFEST_FILES as readonly string[]).includes(base)) continue;
    const ext = extensionOf(file.path);
    if (IGNORED_EXTENSIONS.has(ext)) continue;
    tally(PARSED_EXTENSIONS.has(ext) ? byExtension : unsupported, ext === "" ? "(none)" : ext);
    const service = serviceForPath(file.path, serviceNames);
    if (service) filesPerService.set(service, (filesPerService.get(service) ?? 0) + 1);
  }

  const typesPerService = new Map<string, number>();
  for (const seed of draft.seedNodeTypes) {
    const service = seed.origin?.service;
    if (service) typesPerService.set(service, (typesPerService.get(service) ?? 0) + 1);
  }

  const services: ScannedService[] = architecture.services.map((service) => ({
    key: service.key,
    name: service.name,
    path: service.path,
    type: service.type,
    layer: service.layer,
    typeCount: typesPerService.get(service.name) ?? 0,
    fileCount: filesPerService.get(service.name) ?? 0,
  }));

  return { draft, services, byExtension, unsupported, truncationNote: note };
}
