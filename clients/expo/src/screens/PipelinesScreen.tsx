import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Company } from "@coolie/api-client";
import { C, COOLIE_BASE_URL, coolie, type PipelineListRow } from "../coolie";
import { RADIUS, SPACING } from "../ui/tokens";
import { AppCard } from "../ui/AppCard";
import { EmptyState } from "../ui/EmptyState";
import { ErrorRetry } from "../ui/ErrorRetry";
import { LoadingState } from "../ui/LoadingState";
import { ScreenHeader } from "../ui/ScreenHeader";

/**
 * Pipeline 列表 (任务页顶部 [🛤️ Pipeline] 的落地屏)。
 *
 * 只读: 列公司的 pipeline (GET /api/companies/:id/pipelines, paperclip 上游路由)。
 * 新建与编辑仍在 Coolie Web 的 PipelineEditor (`/pipelines/new`, `/pipelines/:id`),
 * 这里不重发明编辑器 —— 点 [+] / 点某条即用系统浏览器打开对应 Web 页。
 */
export function PipelinesScreen({
  company,
  onBack,
  onOpenWeb: onOpenWebProp,
}: {
  company: Company;
  onBack: () => void;
  onOpenWeb?: (path: string, title?: string) => void;
}) {
  const [rows, setRows] = useState<PipelineListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await coolie.listPipelines(company.id));
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [company.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const openWeb = useCallback(
    (path: string, failTitle: string) => {
      if (onOpenWebProp) {
        onOpenWebProp(path, "流水线编辑器");
      } else {
        void Linking.openURL(`${COOLIE_BASE_URL}${path}`).catch(() => {
          Alert.alert(failTitle, "请在浏览器里打开 Coolie Web 查看该 pipeline。");
        });
      }
    },
    [onOpenWebProp],
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Pipeline"
        subtitle={
          <Text style={styles.subtitle} numberOfLines={1}>
            {company.name} · 编排流水线
          </Text>
        }
        onBack={onBack}
        backLabel="任务"
        right={
          <Pressable
            onPress={() => openWeb("/pipelines/new", "无法打开 Pipeline 编辑器")}
            hitSlop={8}
            style={styles.addBtn}
            accessibilityLabel="新建 Pipeline"
          >
            <Ionicons name="add" size={16} color={C.accent} />
            <Text style={styles.addText}>新建</Text>
          </Pressable>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <LoadingState size="small" text="正在加载 pipeline…" />
        ) : error ? (
          <ErrorRetry variant="section" message={`⚠️ ${error}`} onRetry={() => void load()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="🛤️"
            title="暂无 pipeline"
            subtitle="点右上角 [新建] 去 Coolie Web 的 Pipeline 编辑器创建第一条流水线。"
          />
        ) : (
          rows.map((row) => (
            <AppCard
              key={row.id}
              onPress={() => openWeb(`/pipelines/${encodeURIComponent(row.id)}`, "无法打开 Pipeline")}
              style={styles.card}
            >
              <View style={styles.cardTop}>
                <Text style={styles.name} numberOfLines={1}>
                  {row.name}
                </Text>
                <PipelineStatus row={row} />
              </View>
              <Text style={styles.meta}>
                {row.stageCount} 阶段 · {row.openCaseCount ?? 0} 进行中 case
                {row.inMotionCount ? ` · ${row.inMotionCount} 在跑` : ""}
              </Text>
            </AppCard>
          ))
        )}
      </ScrollView>
    </View>
  );
}

/** 状态徽标: 已归档 → Archived, 无阶段 → Draft, 其余 → Active */
function PipelineStatus({ row }: { row: PipelineListRow }) {
  const [label, tone] = row.archivedAt
    ? (["Archived", C.ink4] as const)
    : row.stageCount === 0
      ? (["Draft", C.warn] as const)
      : (["Active", C.ok] as const);

  return (
    <View style={[styles.statusPill, { borderColor: tone }]}>
      <Text style={[styles.statusText, { color: tone }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  subtitle: {
    color: C.ink4,
    fontSize: 12,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.line,
  },
  addText: {
    color: C.accent,
    fontSize: 13,
    fontWeight: "500",
  },
  card: {
    gap: 6,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  name: {
    flex: 1,
    color: C.ink,
    fontSize: 15,
    fontWeight: "500",
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  meta: {
    color: C.ink3,
    fontSize: 12,
  },
});
