import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import type { OntologyDomain, OntologyGraphSnapshot } from "@coolie/api-client";
import { C } from "../../coolie";
import { EmergencyKillSwitch } from "../../components/EmergencyKillSwitch";
import { StatusDot } from "../../components/StatusDot";
import {
  domainLabel,
  domainVersion,
  isLockedDomain,
  lifecycleOf,
  type OntologyDomainStats,
} from "../../components/ontology/OntologyDomainCard";
import { AppCard } from "../../ui/AppCard";
import { ErrorRetry } from "../../ui/ErrorRetry";
import { Pill } from "../../ui/Pill";
import { ScreenHeader } from "../../ui/ScreenHeader";
import { SectionHeader } from "../../ui/SectionHeader";
import { StatTile } from "../../ui/StatTile";
import { StatusBadge } from "../../ui/StatusBadge";
import { ELEVATION, RADIUS, SPACING, alpha } from "../../ui/tokens";

export interface OntologyDomainDetailScreenProps {
  domain: OntologyDomain;
  stats?: OntologyDomainStats;
  snapshot: OntologyGraphSnapshot | null;
  snapshotLoading: boolean;
  snapshotError: string | null;
  whoami?: string;
  onBack: () => void;
  onOpenGraph: () => void;
  onReloadSnapshot: () => void;
  onTriggerKill: (domain: OntologyDomain) => Promise<void>;
  onUnlock: (domain: OntologyDomain) => void;
}

/**
 * 第二层视图: 域基础信息卡 + 高危熔断闸门 + 图谱快照统计。
 * 快照 (300 条) 由外层按需拉取, 组件本身不发起请求。
 */
export function OntologyDomainDetailScreen({
  domain,
  stats,
  snapshot,
  snapshotLoading,
  snapshotError,
  whoami = "管理员",
  onBack,
  onOpenGraph,
  onReloadSnapshot,
  onTriggerKill,
  onUnlock,
}: OntologyDomainDetailScreenProps) {
  const isLocked = isLockedDomain(domain);
  const cfg = lifecycleOf(domain);
  const byNodeType = snapshot?.counts?.byNodeType;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={snapshotLoading}
            onRefresh={onReloadSnapshot}
            tintColor={C.accent}
          />
        }
      >
        {/* 顶部返回条 + 生命周期徽标 */}
        <ScreenHeader
          onBack={onBack}
          backLabel="返回本体域列表"
          style={styles.detailNav}
          right={
            <StatusBadge
              label={cfg.label}
              color={cfg.color}
              bg={cfg.bg}
              border={cfg.border}
              dotStatus={cfg.status}
            />
          }
        />

        {/* 域基础信息卡片 */}
        <AppCard padding={16} style={styles.heroCard}>
          <Text style={styles.heroTitle}>{domainLabel(domain)}</Text>
          <Text style={styles.heroSub}>标识: {domain.slug}</Text>
          {domain.description ? <Text style={styles.heroDesc}>{domain.description}</Text> : null}

          <View style={styles.metaRow}>
            <View style={styles.metaChip}>
              <Text style={styles.metaChipLabel}>分类</Text>
              <Text style={styles.metaChipValue}>{domain.category || "业务本体"}</Text>
            </View>
            <View style={styles.metaChip}>
              <Text style={styles.metaChipLabel}>架构版本</Text>
              <Text style={styles.metaChipValue}>v{domainVersion(domain)}</Text>
            </View>
            <View style={styles.metaChip}>
              <Text style={styles.metaChipLabel}>引导源</Text>
              <Text style={styles.metaChipValue}>{domain.bootstrap_source || "系统内置"}</Text>
            </View>
          </View>
        </AppCard>

        {/* 关系图谱交互入口 */}
        <AppCard variant="surface" row onPress={onOpenGraph} style={styles.graphEntryBtn}>
          <View style={styles.graphEntryLeft}>
            <Ionicons
              name="git-network-outline"
              size={20}
              color={C.accent}
              style={styles.graphEntryIcon}
            />
            <View>
              <Text style={styles.graphEntryTitle}>关系图谱拓扑</Text>
              <Text style={styles.graphEntrySub}>实体对象类型与关系连线交互浏览</Text>
            </View>
          </View>
          <Text style={styles.graphEntryArrow}>›</Text>
        </AppCard>

        {/* 高危熔断控制闸门区 */}
        <View style={styles.sectionBlock}>
          <SectionHeader
            emphasis
            title="高危安全闸门"
            hint="PRD 需求⑪ 熔断通道"
            style={styles.sectionHeaderMargin}
          />

          {isLocked ? (
            <View style={styles.lockedNoticeCard}>
              <View style={styles.lockedNoticeRow}>
                <StatusDot status="err" size={8} />
                <Text style={styles.lockedNoticeTitle}>
                  当前本体域已处于安全锁死状态 (LOCKED)
                </Text>
              </View>
              <Text style={styles.lockedNoticeDesc}>
                所有相关智能体对该域的写入权限已强制熔断，已拦截潜在数据污染风险。
              </Text>
              <Pressable style={styles.unlockBtn} onPress={() => onUnlock(domain)}>
                <Text style={styles.unlockBtnText}>解除锁死并恢复运行</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.killSwitchContainer}>
              <View style={styles.killNotice}>
                <Text style={styles.killNoticeTitle}>突发异常应急保护 · 一键熔断</Text>
                <Text style={styles.killNoticeDesc}>
                  如发现模型产生幻觉批量改写资产或发生业务冲突，向右滑脱即可在 50ms
                  内置为锁死归档，并写死审计日志。
                </Text>
              </View>
              <EmergencyKillSwitch
                domainId={domain.id}
                domainName={domain.display_name || domain.slug}
                isLocked={isLocked}
                actor={whoami}
                onTrigger={() => onTriggerKill(domain)}
              />
            </View>
          )}
        </View>

        {/* 快照摘要统计 (Snapshot Counts) */}
        <View style={styles.sectionBlock}>
          <SectionHeader
            emphasis
            title="图谱快照摘要"
            style={styles.sectionHeaderMargin}
            right={
              snapshotLoading ? (
                <ActivityIndicator size="small" color={C.accent} />
              ) : (
                <Text style={styles.sectionHint}>实时拓扑数据</Text>
              )
            }
          />

          {snapshotError && !snapshot ? (
            <ErrorRetry variant="inline" message={snapshotError} onRetry={onReloadSnapshot} />
          ) : (
            <View style={styles.statsGrid}>
              <StatTile
                flex={false}
                style={styles.metricCard}
                value={snapshot?.counts?.nodes ?? stats?.nodes ?? "0"}
                label="实体节点数"
              />
              <StatTile
                flex={false}
                style={styles.metricCard}
                value={snapshot?.counts?.edges ?? stats?.edges ?? "0"}
                valueColor={C.accent}
                label="关系连线数"
              />
              <StatTile
                flex={false}
                style={styles.metricCard}
                value={snapshot?.counts?.nodeTypes ?? "0"}
                label="节点类型数"
              />
              <StatTile
                flex={false}
                style={styles.metricCard}
                value={snapshot?.counts?.crossDomainEdges ?? "0"}
                valueColor={C.warn}
                label="跨域依赖数"
              />
            </View>
          )}
        </View>

        {/* 实体类型分布 breakdown */}
        {byNodeType && Object.keys(byNodeType).length > 0 ? (
          <View style={styles.sectionBlock}>
            <SectionHeader emphasis title="实体类型分布" />
            <View style={styles.cardList}>
              {Object.entries(byNodeType).map(([typeKey, count]) => (
                <View key={typeKey || "none"} style={styles.subItemRow}>
                  <Text style={styles.subItemKey}>{typeKey || "(未归类对象)"}</Text>
                  <Pill label={`${count} 实体`} tone="brand" size="sm" />
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  scrollContent: { padding: SPACING.lg, paddingBottom: 40 },
  detailNav: { marginBottom: SPACING.lg },
  heroCard: { marginBottom: SPACING.lg },
  heroTitle: { color: C.ink, fontSize: 20, fontWeight: "600", letterSpacing: -0.4 },
  heroSub: { color: C.ink4, fontSize: 12, fontFamily: "monospace", marginTop: 2 },
  heroDesc: { color: C.ink2, fontSize: 13, lineHeight: 19, marginTop: SPACING.sm },
  metaRow: {
    flexDirection: "row",
    gap: SPACING.md,
    marginTop: 14,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: C.lineSubtle,
  },
  metaChip: { flex: 1 },
  metaChipLabel: { color: C.ink4, fontSize: 10 },
  metaChipValue: { color: C.ink2, fontSize: 12, fontWeight: "500", marginTop: 2 },
  graphEntryBtn: { gap: 10, borderColor: C.line },
  graphEntryLeft: { flex: 1 },
  graphEntryIcon: { marginRight: 10 },
  graphEntryTitle: { color: C.ink, fontSize: 15, fontWeight: "600" },
  graphEntrySub: { color: C.ink3, fontSize: 12, marginTop: 3 },
  graphEntryArrow: { color: C.ink4, fontSize: 22 },
  sectionBlock: { marginBottom: 20 },
  sectionHeaderMargin: { marginBottom: 10 },
  sectionHint: { color: C.ink4, fontSize: 11 },
  killSwitchContainer: {
    backgroundColor: alpha(C.err, 0.04),
    borderColor: alpha(C.err, 0.2),
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    padding: 14,
  },
  killNotice: { marginBottom: SPACING.sm },
  killNoticeTitle: { color: C.err, fontSize: 13, fontWeight: "600" },
  killNoticeDesc: { color: C.ink3, fontSize: 11, lineHeight: 16, marginTop: 2 },
  lockedNoticeCard: {
    backgroundColor: alpha(C.err, 0.08),
    borderColor: alpha(C.err, 0.28),
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    padding: 14,
  },
  lockedNoticeRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  lockedNoticeTitle: { color: C.err, fontSize: 13, fontWeight: "600" },
  lockedNoticeDesc: {
    color: C.ink3,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
    marginBottom: SPACING.md,
  },
  unlockBtn: {
    backgroundColor: ELEVATION.hover,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    alignItems: "center",
  },
  unlockBtnText: { color: C.ink2, fontSize: 12, fontWeight: "500" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricCard: { width: "48%" },
  cardList: {
    backgroundColor: ELEVATION.base,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    padding: SPACING.sm,
  },
  subItemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  subItemKey: { color: C.ink2, fontSize: 12 },
});
