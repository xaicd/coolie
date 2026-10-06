import { useCallback, useEffect, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { C } from "../../coolie";
import { EmptyState } from "../../ui/EmptyState";
import { ErrorRetry } from "../../ui/ErrorRetry";
import { LoadingState } from "../../ui/LoadingState";
import { Pill } from "../../ui/Pill";
import { RADIUS } from "../../ui/tokens";

/**
 * wave342 本体工作台只读视图的通用取数壳: 进入视图即拉一次, reload() 重拉。
 * fetcher 用 useCallback 由调用方钉住依赖 (companyId/domainId), 卸载后
 * 丢弃迟到响应, 防切换视图时旧请求覆盖新视图。
 */
export function useOntologyRows<T>(fetcher: () => Promise<T[]>) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetcher()
      .then((list) => {
        if (alive) setRows(list);
      })
      .catch((e) => {
        if (alive) setError(String((e as Error)?.message ?? e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [fetcher, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { rows, loading, error, reload };
}

/** 只读视图三态壳: 加载 → 错误重试 → 空态 → 内容 */
export function ReadViewShell({
  loading,
  error,
  empty,
  reload,
  emptyTitle = "暂无数据",
  children,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  reload: () => void;
  emptyTitle?: string;
  children: ReactNode;
}) {
  if (loading) return <LoadingState text="正在加载本体数据…" />;
  if (error) return <ErrorRetry message={error} onRetry={reload} />;
  if (empty) return <EmptyState variant="inline" icon="◇" title={emptyTitle} />;
  return <>{children}</>;
}

/** 只读行卡: 标题 + 次行说明 + 右侧状态 Pill, 14 视图统一行样式 */
export function ReadRow({
  title,
  sub,
  pill,
  mono,
}: {
  title: string;
  sub?: string;
  pill?: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {sub ? (
          <Text style={[styles.rowSub, mono && styles.rowSubMono]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {pill ? <Pill label={pill} size="sm" /> : null}
    </View>
  );
}

/** 只读视图小节标题 (SectionHeader 的轻量版, 免 emphasis 依赖) */
export function ReadSection({ title, count }: { title: string; count?: number }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {count !== undefined ? (
        <Text style={styles.sectionCount}>{count} 项</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    color: C.ink2,
    fontSize: 12,
    fontWeight: "600",
  },
  sectionCount: {
    color: C.ink4,
    fontSize: 11,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.panel,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  rowTitle: {
    color: C.ink,
    fontSize: 13,
    fontWeight: "500",
  },
  rowSub: {
    color: C.ink4,
    fontSize: 11,
    marginTop: 2,
  },
  rowSubMono: {
    fontFamily: "monospace",
  },
});
