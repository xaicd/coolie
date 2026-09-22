import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import type { Issue } from "@coolie/api-client";
import { C, coolie, type NotificationItem, type NotificationKind } from "../coolie";
import { useNotificationsStore } from "../stores/notifications";
import { AppCard } from "../ui/AppCard";
import { EmptyState } from "../ui/EmptyState";
import { ErrorRetry } from "../ui/ErrorRetry";
import { LoadingState } from "../ui/LoadingState";
import { SegmentedControl } from "../ui/SegmentedControl";
import { ScreenHeader } from "../ui/ScreenHeader";
import { formatRelativeTime } from "../utils/format";

const KIND_ICON: Record<NotificationKind, React.ComponentProps<typeof Ionicons>["name"]> = {
  approval: "checkmark-done-outline",
  failure: "alert-circle-outline",
  mention: "at-outline",
  activity: "pulse-outline",
};

const KIND_COLOR: Record<NotificationKind, string> = {
  approval: C.warn,
  failure: C.err,
  mention: C.accent,
  activity: C.ink3,
};

/**
 * 通知中心。读 `useNotificationsStore` 里的同一份数据 —— 顶部铃铛的红点数字
 * 与这一屏的列表始终一致。点任一条即标记已读（乐观更新）并按 target 跳详情。
 */
export function NotificationsScreen({
  company,
  onOpenIssue,
  onOpenApproval,
  onBack,
}: {
  company: { id: string; name: string };
  onOpenIssue: (issue: Issue) => void;
  onOpenApproval: (approvalId: string) => void;
  onBack: () => void;
}) {
  const items = useNotificationsStore((s) => s.items);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const storeLoading = useNotificationsStore((s) => s.loading);
  const storeError = useNotificationsStore((s) => s.error);
  const load = useNotificationsStore((s) => s.load);
  const markRead = useNotificationsStore((s) => s.markRead);

  const [issues, setIssues] = useState<Issue[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [onlyUnread, setOnlyUnread] = useState(false);

  const refresh = useCallback(
    async (silent = false) => {
      await Promise.all([
        load(company.id, { silent }),
        coolie
          .listIssues(company.id, { limit: 50 })
          .then(setIssues)
          .catch(() => setIssues([])),
      ]);
    },
    [company.id, load],
  );

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  const issueById = useMemo(() => {
    const map = new Map<string, Issue>();
    for (const issue of issues) map.set(issue.id, issue);
    return map;
  }, [issues]);

  const openNotification = useCallback(
    (item: NotificationItem) => {
      void markRead(item.id);
      if (!item.target) return;
      if (item.target.kind === "approval") {
        onOpenApproval(item.target.id);
        return;
      }
      const known = issueById.get(item.target.id);
      onOpenIssue(
        known ?? ({ id: item.target.id, title: item.title, status: "todo", priority: "medium", companyId: company.id } as Issue),
      );
    },
    [markRead, issueById, onOpenIssue, onOpenApproval, company.id],
  );

  const visible = onlyUnread ? items.filter((item) => !item.read) : items;

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { paddingTop: Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 24) : 0 },
      ]}
    >
      <StatusBar style="light" />
      <View style={styles.header}>
        <ScreenHeader
          title="通知中心"
          onBack={onBack}
          backLabel="返回"
          right={
            <View style={styles.unreadChip}>
              <Text style={styles.unreadChipText}>{unreadCount} 未读</Text>
            </View>
          }
        />
        <SegmentedControl
          style={{ marginTop: 10 }}
          value={onlyUnread ? "unread" : "all"}
          onChange={(key) => setOnlyUnread(key === "unread")}
          options={[
            { key: "all", label: `全部 (${items.length})` },
            { key: "unread", label: `未读 (${unreadCount})` },
          ]}
        />
      </View>

      {storeLoading && items.length === 0 ? (
        <LoadingState mode="spinner" size="small" style={styles.loader} />
      ) : storeError && items.length === 0 ? (
        <ErrorRetry
          variant="card"
          title="通知加载失败"
          message={storeError}
          onRetry={() => void refresh()}
          style={styles.errorCard}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void refresh(true).finally(() => setRefreshing(false));
              }}
              tintColor={C.accent}
            />
          }
        >
          {visible.length === 0 ? (
            <EmptyState
              icon="🔔"
              title={onlyUnread ? "没有未读通知" : "暂无通知"}
              subtitle="审批、受阻任务、@你的消息都会出现在这里。"
              style={styles.emptyBox}
            />
          ) : (
            visible.map((item) => (
              <AppCard
                key={item.id}
                variant="surface"
                row
                style={[styles.row, !item.read && styles.rowUnread]}
                onPress={() => openNotification(item)}
              >
                <View style={styles.iconBox}>
                  <Ionicons name={KIND_ICON[item.type]} size={18} color={KIND_COLOR[item.type]} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.rowTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  {item.body ? (
                    <Text style={styles.rowBody} numberOfLines={2}>
                      {item.body}
                    </Text>
                  ) : null}
                  <Text style={styles.rowMeta}>{formatRelativeTime(item.createdAt)}</Text>
                </View>
                {!item.read ? <View style={styles.unreadDot} /> : null}
              </AppCard>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  unreadChip: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  unreadChipText: { color: C.err, fontSize: 11, fontWeight: "600", fontVariant: ["tabular-nums"] },
  loader: { flex: 0, marginTop: 32, padding: 0 },
  errorCard: { marginTop: 16, backgroundColor: C.surface, borderRadius: 14, borderWidth: 0 },
  list: { padding: 16, paddingBottom: 32, gap: 10 },
  emptyBox: { marginTop: 8, backgroundColor: C.surface, borderRadius: 14, borderWidth: 0 },
  row: { gap: 10 },
  rowUnread: { backgroundColor: "rgba(94, 106, 210, 0.06)" },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.03)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { color: C.ink, fontSize: 14, fontWeight: "500" },
  rowBody: { color: C.ink3, fontSize: 12, lineHeight: 17 },
  rowMeta: { color: C.ink4, fontSize: 11, fontVariant: ["tabular-nums"] },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.err },
});
