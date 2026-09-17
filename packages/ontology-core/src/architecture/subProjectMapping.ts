/**
 * Architecture material → `ontology_sub_projects` rows.
 *
 * The scanner has always produced services, layers, stacks, deployment facts and
 * the dependencies between services — but nothing persisted them, so they lived
 * only inside the import wizard's preview and vanished when the modal closed.
 * That is why "运行架构 / 部署架构" had nothing to render.
 *
 * Pure mapping, so the wizard's local preview and the worker's write use
 * identical logic and the whole thing is unit-testable.
 *
 * `code` is the service key, which is what makes re-importing the same project
 * idempotent: the caller updates the row with that code instead of adding a
 * second copy. `path` is the service's directory in whatever tree was scanned.
 */

import type { MicroserviceLayer, SubProjectType } from "../enums.js";
import type { DetectedDependency, ServiceArchitecture } from "./index.js";

export interface SubProjectDraft {
  name: string;
  code: string;
  type: SubProjectType;
  microserviceLayer: MicroserviceLayer | null;
  /** Flat, de-duplicated labels: language, frameworks, build tool, runtime. */
  techStack: string[];
  framework: Record<string, unknown>;
  /** Outgoing edges only — what this service calls. */
  dependencies: unknown[];
  /** Already the shape `ontology_sub_projects.build_config` expects, incl. `deploy`. */
  buildConfig: Record<string, unknown>;
  gitRepo: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

function compact(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((v): v is string => typeof v === "string" && v !== ""))];
}

export function subProjectsFromArchitecture(
  services: ServiceArchitecture[],
  dependencies: DetectedDependency[] = [],
): SubProjectDraft[] {
  return services.map((service) => {
    const outgoing = dependencies.filter((d) => d.fromServiceKey === service.key);
    const stack = service.stack;
    return {
      name: service.name,
      code: service.key,
      type: service.type,
      microserviceLayer: service.layer,
      techStack: compact([stack.language, ...stack.frameworks, stack.buildTool, stack.runtime]),
      framework: {
        primary: stack.primary,
        buildTool: stack.buildTool,
        runtime: stack.runtime,
        ...(stack.evidence.length > 0 ? { evidence: stack.evidence } : {}),
      },
      dependencies: outgoing.map((d) => ({
        // Unresolved targets are kept with a null key rather than dropped: "this
        // service calls something we could not identify" is a real finding.
        toServiceKey: d.toServiceKey,
        targetHint: d.targetHint,
        type: d.type,
        ...(d.evidence.length > 0 ? { evidence: d.evidence } : {}),
      })),
      buildConfig: service.buildConfig,
      // We know where the service lives in the scanned tree; we do not know a
      // remote. Naming the local path is honest, inventing a URL would not be.
      gitRepo: service.path === "" ? {} : { workspacePath: service.path },
      metadata: {
        ...(service.path === "" ? {} : { workspacePath: service.path }),
        ...(service.layerReason ? { layerReason: service.layerReason } : {}),
        ...(service.evidence.length > 0 ? { evidence: service.evidence } : {}),
        deploy: service.deploy,
      },
    };
  });
}
