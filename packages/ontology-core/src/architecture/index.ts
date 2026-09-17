/**
 * Architecture extraction — one entry point over the four passes.
 *
 * Turns a scanned legacy tree into the material the architecture views need:
 * services, the dependencies between them, their layer, their stack, and their
 * deployment facts. It is deliberately separate from `AstExtractor` (which
 * produces object types and routes): that pass answers "what is this system
 * made of as data", this one answers "how is it deployed and wired".
 *
 * Pure and browser-safe, so the import wizard previews it locally and the worker
 * runs the same code.
 */
import type {
  DependencyType,
  MicroserviceLayer,
  SubProjectType,
} from "../enums.js";
import type { SourceFile, SpringDatasource } from "./serviceDetector.js";
import { detectServices, MANIFEST_FILES } from "./serviceDetector.js";
import { detectStack, type DeployInfo, type StackInfo } from "./stackDetector.js";
import { extractDependencies, type DetectedDependency } from "./dependencyExtractor.js";
import { classifyLayers, type LayerVerdict } from "./layerClassifier.js";

export type { SourceFile, DetectedService, SpringDatasource } from "./serviceDetector.js";
export type { DetectedDependency } from "./dependencyExtractor.js";
export type { LayerVerdict } from "./layerClassifier.js";
export type { StackInfo, DeployInfo } from "./stackDetector.js";

/** Hard ceilings so a huge tree cannot lock up the tab. Reported, never silent. */
export const MAX_FILES = 2000;
export const MAX_BYTES = 8 * 1024 * 1024;

export interface ServiceArchitecture {
  key: string;
  name: string;
  path: string;
  type: SubProjectType;
  layer: MicroserviceLayer;
  layerReason: string;
  stack: StackInfo;
  deploy: DeployInfo;
  /** Ready for `ontology_sub_projects.build_config`. */
  buildConfig: Record<string, unknown>;
  evidence: string[];
  /** The database it connects to, when its config states one. */
  datasource?: SpringDatasource;
}

/**
 * Several services connecting to one database.
 *
 * This is the coupling a legacy map most needs and the least likely to be written
 * down: two services on one schema are invisible to a table-name match when they
 * touch different tables. Reported as a *finding* rather than a dependency edge,
 * because a shared database is symmetric — neither service owns it the way a
 * table's declaring service owns the table, so a directed edge would be inventing
 * which end depends on which.
 */
export interface SharedDatabase {
  database: string;
  /** `host:port` as declared; "" when the url named no host. */
  where: string;
  /** Service keys connecting to it, in scan order. */
  services: string[];
  /** The config files that declared it. */
  evidence: string[];
}

export interface ArchitectureAnalysis {
  services: ServiceArchitecture[];
  dependencies: DetectedDependency[];
  /** Databases more than one service connects to. Empty when none are shared. */
  sharedDatabases: SharedDatabase[];
  /** References we saw but could not tie to a service. Surfaced, not dropped. */
  unresolved: DetectedDependency[];
  coverage: {
    fileCount: number;
    serviceCount: number;
    dependencyCount: number;
    unresolvedDeps: number;
    byType: Record<DependencyType, number>;
    truncated: boolean;
    truncationNote: string | null;
  };
}

/**
 * Drop files once the ceilings are hit.
 *
 * Structural files go first (manifests, container files): losing one of those
 * loses an entire service, whereas losing a source file only loses a detail.
 * The note is returned so the caller can say what was dropped.
 *
 * Exported so the project scanner applies the *same* ceilings to object-type
 * extraction. They used to live only here, in a module nothing called, which
 * meant no reachable import path enforced any limit at all.
 */
export function applyLimits(files: SourceFile[]): { files: SourceFile[]; note: string | null } {
  const weight = (path: string): number => {
    const base = path.split("/").pop() ?? "";
    // A workspace declaration defines where the services ARE — dropping it
    // collapses a monorepo into its root package, so it outranks everything.
    if (base === "pnpm-workspace.yaml" || base === "pnpm-workspace.yml") return 0;
    if ((MANIFEST_FILES as readonly string[]).includes(base)) return 0;
    // Losing one of these loses a whole service (or its deployment shape).
    if (/^(Dockerfile|docker-compose\.ya?ml)$/.test(base) || /\.sql$/i.test(base)) return 1;
    return 2;
  };
  const sorted = [...files].sort((a, b) => weight(a.path) - weight(b.path) || a.path.localeCompare(b.path));
  const kept: SourceFile[] = [];
  let bytes = 0;

  for (const file of sorted) {
    if (kept.length >= MAX_FILES) {
      return { files: kept, note: `文件数超过 ${MAX_FILES} 上限,已截断(共 ${files.length} 个)` };
    }
    const size = file.content.length;
    if (bytes + size > MAX_BYTES) {
      return { files: kept, note: `内容超过 ${Math.round(MAX_BYTES / 1024 / 1024)}MB 上限,已截断(共 ${files.length} 个)` };
    }
    bytes += size;
    kept.push(file);
  }
  return { files: kept, note: null };
}

/** Table name → the service whose DDL declares it. Enables `db-share` edges. */
function buildTableOwnership(files: SourceFile[], servicePaths: Array<{ key: string; path: string }>): Map<string, string> {
  const ownership = new Map<string, string>();
  for (const file of files) {
    if (!file.path.endsWith(".sql")) continue;
    const owner = servicePaths
      .filter((s) => s.path !== "" && (file.path === s.path || file.path.startsWith(`${s.path}/`)))
      .sort((a, b) => b.path.length - a.path.length)[0];
    if (!owner) continue;
    for (const match of file.content.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`[]?([\w.]+)["`\]]?/gi)) {
      const name = match[1]?.split(".").pop();
      if (name && !ownership.has(name)) ownership.set(name, owner.key);
    }
  }
  return ownership;
}

export function analyzeArchitecture(
  files: SourceFile[],
  overrides: Record<string, MicroserviceLayer> = {},
): ArchitectureAnalysis {
  const { files: limited, note } = applyLimits(files);
  const services = detectServices(limited);

  const tablesByService = buildTableOwnership(limited, services.map((s) => ({ key: s.key, path: s.path })));
  const { dependencies, unresolved } = extractDependencies(limited, services, tablesByService);
  const layers = classifyLayers(services, dependencies, overrides);

  // Grouped on `where/database`, not on the database name alone: `ruoyi` on two
  // different hosts is two databases, and calling that a shared schema would put
  // a coupling in the map that nobody could act on.
  const byDatabase = new Map<string, SharedDatabase>();
  for (const service of services) {
    const datasource = service.datasource;
    if (!datasource) continue;
    const where = `${datasource.host ?? ""}${datasource.port ? `:${datasource.port}` : ""}`;
    const found = byDatabase.get(`${where}/${datasource.database}`)
      ?? { database: datasource.database, where, services: [], evidence: [] };
    found.services.push(service.key);
    found.evidence.push(datasource.evidence);
    byDatabase.set(`${where}/${datasource.database}`, found);
  }
  const sharedDatabases = [...byDatabase.values()].filter((entry) => entry.services.length > 1);

  const byType: Record<DependencyType, number> = {
    "api-call": 0,
    "shared-lib": 0,
    "db-share": 0,
    "event-bus": 0,
    other: 0,
  };
  for (const dependency of dependencies) byType[dependency.type] += 1;

  const enriched: ServiceArchitecture[] = services.map((service) => {
    // The name matters: a root compose file describes every service, and only the
    // service's own name says which `services:` block is its.
    const { stack, buildConfig, deploy } = detectStack(limited, service.path, service.name);
    const verdict: LayerVerdict = layers[service.key] ?? { layer: "L2", reason: "未分层" };
    return {
      key: service.key,
      name: service.name,
      path: service.path,
      type: service.type,
      layer: verdict.layer,
      layerReason: verdict.reason,
      stack,
      deploy,
      buildConfig,
      evidence: service.evidence,
      ...(service.datasource ? { datasource: service.datasource } : {}),
    };
  });

  return {
    services: enriched,
    dependencies,
    sharedDatabases,
    unresolved,
    coverage: {
      fileCount: limited.length,
      serviceCount: enriched.length,
      dependencyCount: dependencies.length,
      unresolvedDeps: unresolved.length,
      byType,
      truncated: note !== null,
      truncationNote: note,
    },
  };
}

/** Files the scan does not need for architecture purposes at all. */
export function isArchitectureRelevant(path: string): boolean {
  const base = path.split("/").pop() ?? "";
  if ((MANIFEST_FILES as readonly string[]).includes(base)) return true;
  if (/^(Dockerfile|docker-compose\.ya?ml)$/.test(base)) return true;
  return /\.(ts|tsx|js|jsx|mjs|cjs|py|go|java|kt|rs|rb|php|cs|vue|svelte|sql|ya?ml)$/i.test(base);
}
