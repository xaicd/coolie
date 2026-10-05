import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type {
  Company,
  OntologyDomain,
  OntologyLevelsResponse,
  OntologyStatsResponse,
} from "@coolie/api-client";
import { coolie } from "../coolie";
import { C } from "../theme";
import { SPACING } from "../ui/tokens";
import { AppCard } from "../ui/AppCard";
import { EmptyState } from "../ui/EmptyState";
import { ErrorRetry } from "../ui/ErrorRetry";
import { LoadingState } from "../ui/LoadingState";
import { StatusBadge } from "../ui/StatusBadge";

/**
 * 业务本体控制台 · 只读展示版 (wave314 老板拍板)
 *
 * 老板原话:「原生 App 资产 本体下 所有功能都清空删除一下」
 *
 * 按 AGENTS.md §13「零培训与无重复入口」+ §14「两字按钮铁律」+ 宪法第 5 条
 * 「现有能力组合优先」—— 砍掉所有创建/编辑/跳转/沙箱/web/原型/全屏/结构
 * 按钮、Modal、onPress 回调与 5 个对象类型多态引用；只展示图谱、对象计数、
 * 动作字典、数据管道、业务域状态 5 大只读视图。
 *
 * 任何变更/操作都走工坊或 web 控制面 (宪法定海神针)。
 */
export function OntologyCockpitScreen({ company }: { company: Company }) {
  const [stats, setStats] = useState<OntologyStatsResponse | null>(null);
  const [levels, setLevels] = useState<OntologyLevelsResponse | null>(null);
  const [domains, setDomains] = useState<OntologyDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [statsRes, levelsRes, domainsRes] = await Promise.all([
        coolie.getOntologyStats(company.id).catch(() => null),
        coolie.getOntologyLevels(company.id).catch(() => null),
        coolie.listOntologyDomains(company.id).catch(() => []),
      ]);
      if (statsRes) setStats(statsRes);
      if (levelsRes) setLevels(levelsRes);
      setDomains(domainsRes);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [company.id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadData();
  }, [loadData]);

  // 仅聚合各类型实体 count 与 edge count (展示用, 不触发任何动作)
  const objectCounts = useMemo(() => {
    const map = new Map<string, { type: string; count: number; edgeCount: number }>();
    if (levels?.byEntityType) {
      for (const item of levels.byEntityType) {
        map.set(item.entityType, {
          type: item.entityType,
          count: item.count,
          edgeCount: item.edgeCount,
        });
      }
    }
    if (stats?.nodeCounts) {
      for (const nc of stats.nodeCounts) {
        if (!map.has(nc.entityType)) {
          map.set(nc.entityType, { type: nc.entityType, count: nc.count, edgeCount: 0 });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [levels, stats]);

  if (loading) {
    return <LoadingState text="业务本体载入中..." />;
  }
  if (error) {
    return <ErrorRetry message={error} onRetry={loadData} />;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
    >
      {/* 老板 wave315: 图谱更要删 — 砍掉只读图谱视图 */}

      {/* 1. 只读对象计数 (Objects) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>对象实例</Text>
        <Text style={styles.sectionSub}>各业务对象类型在台下的实例与关联度</Text>
        <View style={styles.list}>
          {objectCounts.map((item) => (
            <View key={item.type} style={styles.row}>
              <Text style={styles.rowLabel}>{item.type}</Text>
              <Text style={styles.rowCount}>
                {item.count} 实例 · {item.edgeCount} 关联
              </Text>
            </View>
          ))}
          {objectCounts.length === 0 && (
            <EmptyState title="暂无对象" subtitle="从工坊创建实体后自动出现" />
          )}
        </View>
      </View>

      {/* 3. 只读业务域录 (Domains) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>业务域</Text>
        <Text style={styles.sectionSub}>租户隔离的领域边界与版本指纹</Text>
        {domains.length === 0 ? (
          <EmptyState title="暂无业务域" subtitle="创建项目时将自动初始化同名本体域" />
        ) : (
          <View style={styles.list}>
            {domains.map((dom) => (
              <AppCard key={dom.id} variant="surface" padding={SPACING.md} style={styles.domainCard}>
                <View style={styles.domainHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.domainTitle}>
                      {dom.display_name || dom.displayName || dom.slug}
                    </Text>
                    <Text style={styles.domainSlug}>slug: {dom.slug}</Text>
                  </View>
                  <StatusBadge
                    label={dom.lifecycle_state === "active" ? "运行中" : "已就绪"}
                    color={C.ok}
                    bg="rgba(39, 166, 68, 0.12)"
                    border="rgba(39, 166, 68, 0.3)"
                    dotStatus="ok"
                  />
                </View>
                <Text style={styles.domainDesc} numberOfLines={2}>
                  {dom.description || "企业业务与工程交付活体本体域"}
                </Text>
                <Text style={styles.domainVersion}>
                  版本: v{dom.schema_version ?? dom.version ?? 1}
                </Text>
              </AppCard>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: C.ink,
    marginBottom: 2,
  },
  sectionSub: {
    fontSize: 11,
    color: C.ink3,
    marginBottom: 10,
  },
  graphHost: {
    height: 360,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: C.lineSubtle,
    backgroundColor: C.panel,
  },
  list: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: C.panel,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  rowLabel: {
    fontSize: 13,
    color: C.ink,
    fontFamily: "monospace",
  },
  rowCount: {
    fontSize: 12,
    color: C.ink3,
  },
  domainCard: {
    gap: 6,
  },
  domainHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  domainTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: C.ink,
  },
  domainSlug: {
    fontSize: 11,
    color: C.ink3,
    fontFamily: "monospace",
    marginTop: 2,
  },
  domainDesc: {
    fontSize: 12,
    color: C.ink2,
    lineHeight: 16,
  },
  domainVersion: {
    fontSize: 11,
    color: C.ink3,
    marginTop: 4,
  },
});