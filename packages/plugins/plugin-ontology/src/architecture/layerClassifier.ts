/**
 * Architecture extraction — microservice layering (L0…L4).
 *
 * `MICROSERVICE_LAYERS` has existed since the Drizzle parity pass with nothing
 * assigning it, so every sub-project carried an empty layer and a
 * runtime-architecture view had no bands to group by.
 *
 * The layer comes from the dependency direction: the things nothing depends on
 * are what users hit, so they are L0, and each step outward is one layer deeper.
 * A service with no dependency evidence at all is placed in the middle (L2) and
 * told why, rather than being invented as an entry point.
 */
import type { MicroserviceLayer } from "../enums.js";
import type { DetectedDependency } from "./dependencyExtractor.js";
import type { DetectedService } from "./serviceDetector.js";

export interface LayerVerdict {
  layer: MicroserviceLayer;
  reason: string;
}

const LAYERS: MicroserviceLayer[] = ["L0", "L1", "L2", "L3", "L4"];
const MIDDLE_LAYER: MicroserviceLayer = "L2";

export function classifyLayers(
  services: DetectedService[],
  dependencies: DetectedDependency[],
  /** Explicit values win — the caller passes anything already persisted. */
  overrides: Record<string, MicroserviceLayer> = {},
): Record<string, LayerVerdict> {
  const verdicts: Record<string, LayerVerdict> = {};
  if (services.length === 0) return verdicts;

  const keys = new Set(services.map((s) => s.key));
  const edges = dependencies.filter(
    (d) => d.toServiceKey !== null && keys.has(d.fromServiceKey) && keys.has(d.toServiceKey),
  );

  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();
  for (const key of keys) {
    outgoing.set(key, new Set());
    incoming.set(key, new Set());
  }
  for (const edge of edges) {
    outgoing.get(edge.fromServiceKey)!.add(edge.toServiceKey!);
    incoming.get(edge.toServiceKey!)!.add(edge.fromServiceKey);
  }

  const degree = new Map<string, number>();
  for (const service of services) {
    degree.set(service.key, (outgoing.get(service.key)?.size ?? 0) + (incoming.get(service.key)?.size ?? 0));
  }

  // Roots: something depends on nothing, but does depend on others. A service
  // with no edges at all is NOT an entry point — it is simply unconnected, and
  // the middle layer with an explanation is the honest answer for it. A frontend
  // is an entry point by definition, even when a build tool references it.
  const roots = services.filter(
    (service) =>
      service.type === "frontend"
      || ((incoming.get(service.key)?.size ?? 0) === 0 && (outgoing.get(service.key)?.size ?? 0) > 0),
  );

  const levels = new Map<string, number>();
  const clamped = new Set<string>();
  for (const root of roots) levels.set(root.key, 0);

  // Longest-path relaxation from the roots, bounded so a cycle cannot spin.
  for (let pass = 0; pass < services.length + 1; pass++) {
    let changed = false;
    for (const edge of edges) {
      const from = levels.get(edge.fromServiceKey);
      if (from === undefined) continue;
      const next = Math.min(from + 1, LAYERS.length - 1);
      if (from + 1 > LAYERS.length - 1) clamped.add(edge.toServiceKey!);
      const current = levels.get(edge.toServiceKey!);
      if (current === undefined || next > current) {
        levels.set(edge.toServiceKey!, next);
        changed = true;
      }
    }
    if (!changed) break;
  }

  for (const service of services) {
    const override = overrides[service.key];
    if (override) {
      verdicts[service.key] = { layer: override, reason: "已有值,保留(可覆盖推导结果)" };
      continue;
    }

    const level = levels.get(service.key);
    if (level === undefined) {
      verdicts[service.key] = {
        layer: MIDDLE_LAYER,
        reason: (degree.get(service.key) ?? 0) === 0 ? "无依赖信号,置于中间层" : "不在入口可达范围内",
      };
      continue;
    }

    const count = outgoing.get(service.key)?.size ?? 0;
    const incomingCount = incoming.get(service.key)?.size ?? 0;
    const reason = level === 0
      ? (service.type === "frontend" ? "前端入口" : "无服务依赖它,视为入口")
      : `由上一层调用(${incomingCount} 个上游),向下依赖 ${count} 个`;

    verdicts[service.key] = {
      layer: LAYERS[Math.min(level, LAYERS.length - 1)]!,
      reason: clamped.has(service.key) ? `${reason};比 L4 更深,已并入 L4` : reason,
    };
  }

  return verdicts;
}
