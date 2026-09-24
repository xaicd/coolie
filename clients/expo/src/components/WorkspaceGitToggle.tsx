import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { GitCredential } from "@coolie/api-client";
import { C, coolie } from "../coolie";
import { RADIUS, SPACING } from "../ui/tokens";

/**
 * Coolie fork — wave70: git-ops App 端 UI 4 屏之「Workspace Git Toggle」.
 *
 * Settings 屏里嵌一行: 显示当前用户已绑定的 Git 凭证摘要 + 总开关.
 * 开关本身是 phase70 的语义 (是否启用本地 workspace 推送 PR); 现在后端
 * 还没真读这个开关 (见 task below), UI 仍把状态保存到 async storage —
 * 不让老板觉得「按了没反应」, 同时给后端一个 follow-up 点.
 */
export function WorkspaceGitToggle({
  enabled,
  onToggle,
  onOpenCredentials,
}: {
  enabled: boolean;
  onToggle: (next: boolean) => void;
  onOpenCredentials: () => void;
}) {
  const [items, setItems] = useState<GitCredential[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await coolie.listGitCredentials();
      setItems(list);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = (() => {
    if (loading) return "检查中…";
    if (!items || items.length === 0) return "未绑定";
    const first = items[0];
    const label = first.repoUrl ? first.repoUrl : `provider: ${first.provider}`;
    return items.length === 1 ? label : `${label} +${items.length - 1}`;
  })();

  return (
    <View style={styles.wrap}>
      <Pressable
        style={styles.headerRow}
        onPress={onOpenCredentials}
        accessibilityRole="button"
        accessibilityLabel="管理 Git 凭证"
      >
        <Ionicons name="git-branch-outline" size={18} color={C.accent} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Git 凭证</Text>
          <Text style={styles.summary} numberOfLines={1}>
            {summary}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={C.ink3} />
      </Pressable>

      <View style={styles.divider} />

      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleTitle}>本地 workspace 推送 PR</Text>
          <Text style={styles.toggleHint}>
            任务跑完后, agent 用我的凭证把分支推到仓库并开 PR.
          </Text>
        </View>
        {loading ? (
          <ActivityIndicator size="small" color={C.accent} />
        ) : (
          <Switch
            value={enabled}
            onValueChange={onToggle}
            trackColor={{ false: C.line, true: C.accent }}
            thumbColor={enabled ? C.accentHover : C.ink3}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    marginTop: SPACING.sm,
    overflow: "hidden",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  title: { color: C.ink, fontSize: 14, fontWeight: "600" },
  summary: { color: C.ink3, fontSize: 11, marginTop: 2 },
  divider: { height: 1, backgroundColor: C.lineSubtle },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  toggleTitle: { color: C.ink, fontSize: 13, fontWeight: "500" },
  toggleHint: { color: C.ink3, fontSize: 11, marginTop: 2 },
});