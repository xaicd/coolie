/**
 * Group an object-type index for drill-down, the way a map app decides what to
 * draw at each zoom level. A real domain can hold thousands of types — Kingdee
 * K3 ships 3000+ tables — and a flat list at that size is unreadable, so the
 * index is grouped and collapsed by default and you descend group → type →
 * field.
 *
 * Group precedence, most trustworthy signal first:
 *
 *   0. `service` — the deployable unit an importer actually recorded (a Maven
 *      module, a Spring app, a gRPC service). This is a fact read out of the
 *      source, so it beats every heuristic below.
 *   1. `module` — the business module an importer recorded from a Java package
 *      (`org.jeecg.modules.system.entity` → `system`). Also a fact.
 *   2. `prefix` — the leading token of a legacy-style key (`t_sale_order` →
 *      `sale`), when several types share it. In a prefix-structured schema this
 *      is the module family and it is *authoritative*, which is why it outranks
 *      the keyword match: `t_ic_order` is an inventory table even though it
 *      contains "order". Labelled by the prefix code — see `familyLabel`.
 *   3. `module` (keyword) — a confident business-keyword match against the key
 *      or display name (66 entries, Chinese and English), for sources that
 *      record no structure at all.
 *   4. `layer`  — the living-ontology layer, when the type is not `generic`
 *      (`aggregate_root | child_entity | action | state | event`).
 *   5. `other`  — everything left.
 *
 * An axis is used only when it *carries information*: if every type belongs to
 * the same service, grouping by service would reproduce the flat list this
 * function exists to avoid, so the axis is skipped and the next one is tried.
 *
 * A keyword match is a heuristic: a short English synonym can catch an
 * unrelated key. That is tolerable here because the group label is visible and
 * search always bypasses grouping entirely.
 */
import { matchModuleFromText } from "../legacy/modulePrefixMap.js";
import { readOrigin } from "@paperclipai/ontology-core/provenance.js";

export interface IndexableType {
  key: string;
  display_name?: string | null;
  layer?: string | null;
  /** Node-type metadata; provenance lives in `metadata.origin`. */
  metadata?: unknown;
}

export interface TypeGroup<T> {
  key: string;
  label: string;
  kind: "service" | "module" | "layer" | "prefix" | "other";
  types: T[];
}

const LAYER_LABELS: Record<string, string> = {
  aggregate_root: "聚合根",
  child_entity: "子实体",
  action: "动作",
  state: "状态",
  event: "事件",
};

/** Canonical living-ontology order — more meaningful than alphabetical Chinese. */
const LAYER_ORDER: Record<string, number> = {
  aggregate_root: 0,
  child_entity: 1,
  action: 2,
  state: 3,
  event: 4,
};

const LEGACY_PREFIX = /^(?:t|tb|tbl)_/i;

/** Leading token of a legacy-style key, or null when there is no separator. */
function legacyPrefix(key: string): string | null {
  const withoutPrefix = key.replace(LEGACY_PREFIX, "");
  const separator = withoutPrefix.indexOf("_");
  if (separator < 1) return null;
  const token = withoutPrefix.slice(0, separator).toLowerCase();
  return token.length >= 2 ? token : null;
}

/**
 * A family is labelled by its prefix code (`SA`, `IC`, `PU` — the module codes
 * an ERP's own table list uses), never by a guessed keyword. A family can be
 * uniformly misattributed by the keyword table (`t_ic_order_*` says "order" but
 * is inventory), so a keyword-derived label would confidently state something
 * false. The code is opaque to a newcomer but it is never wrong, and the Chinese
 * display names of the members are right underneath it.
 */
function familyLabel(prefix: string): string {
  return prefix.toUpperCase();
}

export function groupTypesForIndex<T extends IndexableType>(types: T[]): TypeGroup<T>[] {
  const families = new Map<string, number>();
  for (const type of types) {
    const prefix = legacyPrefix(type.key);
    if (!prefix) continue;
    families.set(prefix, (families.get(prefix) ?? 0) + 1);
  }

  // A structural axis is only worth using when it splits the set. With one
  // service (a monolith, or a single-app import) grouping by it would hand back
  // one giant group — exactly the flat list this exists to avoid.
  const originOf = (type: T): { service?: string; module?: string } =>
    readOrigin(type.metadata) ?? {};
  const distinct = (pick: (t: T) => string | undefined): number =>
    new Set(types.map(pick).filter((v): v is string => Boolean(v))).size;
  const serviceAxis = distinct((t) => originOf(t).service) > 1;
  const moduleAxis = !serviceAxis && distinct((t) => originOf(t).module) > 1;

  const groups = new Map<string, TypeGroup<T>>();
  const push = (
    key: string,
    label: string,
    kind: TypeGroup<T>["kind"],
    type: T,
  ): void => {
    const existing = groups.get(key);
    if (existing) existing.types.push(type);
    else groups.set(key, { key, label, kind, types: [type] });
  };

  for (const type of types) {
    const origin = originOf(type);
    if (serviceAxis && origin.service) {
      push(`service:${origin.service}`, origin.service, "service", type);
      continue;
    }
    if (moduleAxis && origin.module) {
      push(`origin:${origin.module}`, origin.module, "module", type);
      continue;
    }

    const prefix = legacyPrefix(type.key);
    // A prefix shared by one type is noise, not a family.
    if (prefix && (families.get(prefix) ?? 0) > 1) {
      push(`prefix:${prefix}`, familyLabel(prefix), "prefix", type);
      continue;
    }

    const match = matchModuleFromText(`${type.key} ${type.display_name ?? ""}`);
    if (match) {
      push(`module:${match.module}`, match.pattern, "module", type);
      continue;
    }

    const layer = (type.layer ?? "").trim();
    if (layer !== "" && layer !== "generic") {
      push(`layer:${layer}`, LAYER_LABELS[layer] ?? layer, "layer", type);
      continue;
    }

    push("other", "其他", "other", type);
  }

  const order: Record<TypeGroup<T>["kind"], number> = {
    service: 0,
    module: 1,
    layer: 2,
    prefix: 3,
    other: 4,
  };
  const layerRank = (group: TypeGroup<T>): number =>
    group.kind !== "layer"
      ? 0
      : LAYER_ORDER[group.key.slice("layer:".length)] ?? Number.MAX_SAFE_INTEGER;

  return [...groups.values()].sort(
    (a, b) =>
      order[a.kind] - order[b.kind] ||
      layerRank(a) - layerRank(b) ||
      b.types.length - a.types.length ||
      a.label.localeCompare(b.label),
  );
}
