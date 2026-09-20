import { StyleSheet, Text, View } from "react-native";
import type { OntologyDomain } from "@coolie/api-client";
import { C } from "../../coolie";
import { AppCard } from "../../ui/AppCard";
import { Pill } from "../../ui/Pill";
import { StatusBadge } from "../../ui/StatusBadge";
import { ELEVATION, SPACING, alpha } from "../../ui/tokens";
import { EmergencyKillSwitch } from "../EmergencyKillSwitch";
import type { StatusDotKind } from "../StatusDot";

/** 域的节点/关系计数: 列表预取 (50 条) 与详情快照 (300 条) 共用一种形状 */
export interface OntologyDomainStats {
  nodes: number;
  edges: number;
}

export interface LifecyclePresentation {
  label: string;
  status: StatusDotKind;
  color: string;
  bg: string;
  border: string;
}

/** 生命周期 → 徽标文案/状态点/配色 (域卡片与域详情共用) */
export const LIFECYCLE_CONFIG: Record<string, LifecyclePresentation> = {
  active: {
    label: "运行中", status: "ok",
    color: C.ok, bg: alpha(C.ok, 0.1), border: alpha(C.ok, 0.25),
  },
  archived: {
    label: "已锁定", status: "err",
    color: C.err, bg: alpha(C.err, 0.1), border: alpha(C.err, 0.28),
  },
  locked: {
    label: "已锁定", status: "err",
    color: C.err, bg: alpha(C.err, 0.1), border: alpha(C.err, 0.28),
  },
  deprecated: {
    label: "弃用锁死", status: "idle",
    color: C.warn, bg: alpha(C.warn, 0.1), border: alpha(C.warn, 0.25),
  },
  draft: {
    label: "草稿中", status: "idle",
    color: C.ink3, bg: ELEVATION.soft, border: C.line,
  },
};

/**
 * 熔断态判定: archived / deprecated / locked 对 Agent 都是只读锁死。
 * 只看契约字段 `lifecycle_state`, 不猜 `lifecycle` / `status` (审计缺陷 1)。
 */
export function isLockedDomain(domain: OntologyDomain): boolean {
  const state = domain.lifecycle_state;
  return state === "archived" || state === "deprecated" || state === "locked";
}

export function lifecycleOf(domain: OntologyDomain): LifecyclePresentation {
  return LIFECYCLE_CONFIG[domain.lifecycle_state] ?? LIFECYCLE_CONFIG.draft;
}

export function domainLabel(domain: OntologyDomain): string {
  return domain.display_name || domain.displayName || domain.slug;
}

export function domainVersion(domain: OntologyDomain): number {
  return domain.schema_version ?? domain.version ?? 1;
}

export interface OntologyDomainCardProps {
  domain: OntologyDomain;
  stats?: OntologyDomainStats;
  whoami?: string;
  onPress: () => void;
  onTriggerKill: (domain: OntologyDomain) => Promise<void>;
}

/** 本体域卡片: 名称/分类/标识 + 节点数/关系数/版本 + 生命周期徽章 + 快速熔断 */
export function OntologyDomainCard({
  domain, stats, whoami = "管理员", onPress, onTriggerKill,
}: OntologyDomainCardProps) {
  const locked = isLockedDomain(domain);
  const cfg = lifecycleOf(domain);

  return (
    <AppCard style={[styles.domainCard, locked && styles.domainCardLocked]} onPress={onPress}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderMain}>
          <Text style={styles.domainTitle} numberOfLines={1}>{domainLabel(domain)}</Text>
          <Text style={styles.domainSlug}>
            标识: {domain.slug} · {domain.category || "业务本体"}
          </Text>
        </View>
        <StatusBadge
          label={cfg.label}
          color={cfg.color}
          bg={cfg.bg}
          border={cfg.border}
          dotStatus={cfg.status}
        />
      </View>

      {domain.description ? (
        <Text style={styles.domainDesc} numberOfLines={2}>{domain.description}</Text>
      ) : null}

      <View style={styles.cardFooter}>
        <View style={styles.footerPills}>
          <Pill label="节点" value={stats ? String(stats.nodes) : "--"} size="sm" mono />
          <Pill label="关系" value={stats ? String(stats.edges) : "--"} size="sm" mono />
          <Pill label={`v${domainVersion(domain)}`} size="sm" />
        </View>
        <Text style={styles.enterChevron}>快照摘要 ›</Text>
      </View>

      {domain.lifecycle_state === "active" ? (
        <View style={styles.cardKillSwitchWrap}>
          <EmergencyKillSwitch
            domainId={domain.id}
            domainName={domain.display_name || domain.slug}
            compact
            actor={whoami}
            onTrigger={() => onTriggerKill(domain)}
          />
        </View>
      ) : null}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  domainCard: { marginBottom: SPACING.md },
  domainCardLocked: { borderColor: alpha(C.err, 0.22) },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  cardHeaderMain: { flex: 1, marginRight: SPACING.sm },
  domainTitle: { color: C.ink, fontSize: 16, fontWeight: "600", letterSpacing: -0.3 },
  domainSlug: { color: C.ink4, fontSize: 11, fontFamily: "monospace", marginTop: 2 },
  domainDesc: { color: C.ink3, fontSize: 13, lineHeight: 18, marginTop: SPACING.sm },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: SPACING.md,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.lineSubtle,
  },
  footerPills: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  enterChevron: { color: C.accent, fontSize: 12, fontWeight: "500" },
  cardKillSwitchWrap: { marginTop: 10 },
});
