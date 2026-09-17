/**
 * Architecture material → Archify diagram IR.
 *
 * Archify renders an authored vocabulary (components, connections, boundaries,
 * cards) into a self-contained HTML/SVG page. It has no idea what a
 * microservice layer or a `db-share` dependency is, and no auto-layout — that is
 * deliberate on its side, and it is exactly the part that has to be ours: our
 * semantics, our placement.
 *
 * So this module owns the translation and nothing else. It is pure, so the
 * output can be validated by Archify's own validator in a test, and the rendered
 * artefact stays a *product* of the ontology rather than a second place where
 * the architecture is described.
 *
 * Two things deliberately do not appear here:
 *
 *   - **Evidence (`sources`)**. Archify verifies a source link against a real
 *     git checkout pinned to a commit, and refuses to render otherwise. Our scan
 *     reads a picked directory with no git, so emitting `sources` would either
 *     fail validation or produce a link nobody can open. When the scan records
 *     the revision it read, this becomes possible — that is the missing link.
 *   - **Boundaries**. Archify's vocabulary is `region` and `security-group`;
 *     there is no "layer". Layers are expressed by placement instead, which is
 *     honest: they are a row order, not a security boundary.
 */

/** Archify's `componentType` vocabulary. */
export type ArchifyComponentType =
  | "frontend"
  | "backend"
  | "database"
  | "cloud"
  | "security"
  | "messagebus"
  | "external";

/** Archify's `variant` vocabulary. */
export type ArchifyVariant = "default" | "emphasis" | "security" | "dashed";

/**
 * Archify's card accent vocabulary. Its validator rejects anything else, which
 * is how `red` was caught — the closest allowed value is `rose`.
 */
export const ARCHIFY_CARD_DOTS = [
  "cyan",
  "emerald",
  "violet",
  "amber",
  "rose",
  "orange",
  "slate",
] as const;

/** A service, as the ontology stores it. Structural subset — no host types. */
export interface ArchifyServiceInput {
  code: string;
  name: string;
  /** `L0`–`L4`, or null when the scan could not classify it. */
  microserviceLayer?: string | null;
  type?: string | null;
  techStack?: string[] | null;
  buildConfig?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  dependencies?: Array<{ toServiceKey?: string | null; targetHint?: string; type?: string }> | null;
}

export interface ArchifyIrOptions {
  title: string;
  subtitle?: string;
  locale?: "en" | "zh-CN";
  /** Named views, from the ontology's perspectives. */
  views?: Array<{ id: string; label: string; focus: string[]; note?: string }>;
  /** Extra cards; the generator always adds the layer legend. */
  cards?: Array<{ dot: string; title: string; items: string[] }>;
}

export interface ArchifyIr {
  schema_version: 1;
  diagram_type: "architecture";
  meta: Record<string, unknown>;
  layout: { mode: "grid"; origin: [number, number]; cols: number; gapX: number; gapY: number; cellW: number; cellH: number };
  components: Array<Record<string, unknown>>;
  connections: Array<Record<string, unknown>>;
  cards: Array<{ dot: string; title: string; items: string[] }>;
}

/** Our sub-project types, mapped onto the vocabulary Archify can draw. */
const COMPONENT_TYPE: Record<string, ArchifyComponentType> = {
  backend: "backend",
  frontend: "frontend",
  database: "database",
  devops: "cloud",
  // An unclassified service is an external-looking box, not a wrong colour.
  other: "external",
};

/** A dependency's kind, mapped onto the weight of the line. */
const CONNECTION_VARIANT: Record<string, ArchifyVariant> = {
  "api-call": "default",
  "shared-lib": "dashed",
  "event-bus": "dashed",
  "db-share": "dashed",
};

const LAYER_ORDER: Record<string, number> = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4 };

const LAYER_LABELS: Record<string, string> = {
  L0: "边缘 / 入口",
  L1: "网关 / 编排",
  L2: "业务服务",
  L3: "共享能力",
  L4: "数据 / 基础设施",
};

/**
 * Archify validates that a connection label does not sit on top of a component
 * and rejects the render if it does. A fixed offset clears the boxes at the
 * default cell size; it is a layout decision, so it is made here rather than
 * left for the validator to complain about.
 */
const CONNECTION_LABEL_DY = 24;

function deploymentOf(service: ArchifyServiceInput): Record<string, unknown> {
  const fromMeta = service.metadata?.deploy;
  if (fromMeta && typeof fromMeta === "object") return fromMeta as Record<string, unknown>;
  const fromBuild = service.buildConfig?.deploy;
  return fromBuild && typeof fromBuild === "object" ? (fromBuild as Record<string, unknown>) : {};
}

/** `L1 · ×3 · :8081 · prod` — the facts a reader needs on the box itself. */
function serviceTag(service: ArchifyServiceInput): string | undefined {
  const deploy = deploymentOf(service);
  const ports = Array.isArray(deploy.ports) ? (deploy.ports as number[]) : [];
  const envs = Array.isArray(deploy.envs) ? (deploy.envs as string[]) : [];
  const replicas = typeof deploy.replicas === "number" ? deploy.replicas : null;
  const parts = [
    service.microserviceLayer ?? "未分层",
    replicas === null ? null : `×${replicas}`,
    ports.length === 0 ? null : `:${ports.join(",")}`,
    envs.length === 0 ? null : envs.join("/"),
  ].filter((part): part is string => Boolean(part));
  return parts.length === 0 ? undefined : parts.join(" · ");
}

export function architectureToArchifyIr(
  services: ArchifyServiceInput[],
  options: ArchifyIrOptions,
): ArchifyIr {
  const index = new Map<string, string>();
  for (const service of services) {
    index.set(service.code.toLowerCase(), service.code);
    index.set(service.name.toLowerCase(), service.code);
  }

  const layers = [...new Set(services.map((s) => s.microserviceLayer ?? "未分层"))].sort();
  // Multiples of the cell width keep the grid honest; Archify's grid mode places
  // by row/col, so the column is ours to choose and must not collide.
  const perLayer = new Map<string, number>();

  const components = services.map((service) => {
    const layer = service.microserviceLayer ?? "未分层";
    const col = perLayer.get(layer) ?? 0;
    perLayer.set(layer, col + 1);
    const tag = serviceTag(service);
    const stack = (service.techStack ?? []).slice(0, 2).join(" · ");
    return {
      id: service.code,
      type: COMPONENT_TYPE[(service.type ?? "other").toLowerCase()] ?? "external",
      label: service.name,
      ...(stack ? { sublabel: stack } : {}),
      ...(tag ? { tag } : {}),
      row: LAYER_ORDER[layer] ?? 4,
      col,
    };
  });

  const connections: Array<Record<string, unknown>> = [];
  const unresolved = new Set<string>();
  for (const service of services) {
    for (const [i, dependency] of (service.dependencies ?? []).entries()) {
      const targetCode = dependency.toServiceKey
        ? index.get(dependency.toServiceKey.toLowerCase())
        : undefined;
      if (!targetCode || targetCode === service.code) {
        // An unresolved call is a real finding, and a diagram that silently drops
        // it reads as "this service calls nothing".
        if (dependency.targetHint) unresolved.add(dependency.targetHint);
        continue;
      }
      connections.push({
        id: `${service.code}-dep-${i}`,
        from: service.code,
        to: targetCode,
        label: dependency.type ?? "调用",
        variant: CONNECTION_VARIANT[dependency.type ?? ""] ?? "dashed",
        labelDy: CONNECTION_LABEL_DY,
      });
    }
  }

  const withDeploy = services.filter((s) => Object.keys(deploymentOf(s)).length > 0);
  const cards: ArchifyIr["cards"] = [
    {
      dot: "cyan",
      title: "分层(L0–L4)",
      items: [
        layers
          .map((layer) => `${layer} ${LAYER_LABELS[layer] ?? ""}`.trim())
          .join(" · "),
        "Archify 的边界词汇只有 region / security-group,所以分层用摆放行表达",
      ],
    },
    ...(withDeploy.length > 0
      ? [
          {
            dot: "amber",
            title: `部署事实(${withDeploy.length}/${services.length} 个服务有记录)`,
            items: withDeploy.map((service) => {
              const deploy = deploymentOf(service);
              const ports = Array.isArray(deploy.ports) ? (deploy.ports as number[]) : [];
              const replicas = typeof deploy.replicas === "number" ? `副本 ${deploy.replicas}` : "未声明副本";
              return `${service.name}:${replicas}${ports.length > 0 ? ` · 端口 ${ports.join(",")}` : ""}`;
            }),
          },
        ]
      : []),
    ...(unresolved.size > 0
      ? [
          {
            dot: "rose",
            title: "未解析的依赖",
            items: [...unresolved].map((hint) => `${hint} —— 扫描见到了引用,但没能归到某个服务上`),
          },
        ]
      : []),
    ...(options.cards ?? []),
  ];

  return {
    schema_version: 1,
    diagram_type: "architecture",
    meta: {
      title: options.title,
      ...(options.subtitle ? { subtitle: options.subtitle } : {}),
      locale: options.locale ?? "zh-CN",
      quality_profile: "showcase",
      ...(options.views && options.views.length > 0 ? { views: options.views } : {}),
    },
    layout: { mode: "grid", origin: [40, 60], cols: 5, gapX: 40, gapY: 80, cellW: 150, cellH: 70 },
    components,
    connections,
    cards,
  };
}
