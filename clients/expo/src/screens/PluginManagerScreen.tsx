import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Company, PluginRecord, PluginStatus } from "@coolie/api-client";
import { coolie } from "../coolie";
import { C } from "../theme";
import { RADIUS, SPACING } from "../ui/tokens";
import { AppCard } from "../ui/AppCard";
import { EmptyState } from "../ui/EmptyState";
import { ErrorRetry } from "../ui/ErrorRetry";
import { LoadingState } from "../ui/LoadingState";
import { ScreenHeader } from "../ui/ScreenHeader";
import { StatusBadge } from "../ui/StatusBadge";

interface PluginManagerScreenProps {
  company: Company;
  onBack?: () => void;
  /** wave235 — 点单插件打开设置 (会跳到 PluginSettingsScreen). */
  onOpenPluginSettings?: (plugin: PluginRecord) => void;
  /** 在 Web 端打开完整插件市场 (老板原话 "web 端有的功能抄过来"). */
  onOpenWebPluginManager?: () => void;
}

const STATUS_FILTERS: Array<{ key: "all" | PluginStatus; label: string }> = [
  { key: "all", label: "全部" },
  { key: "ready", label: "运行中" },
  { key: "disabled", label: "已停用" },
  { key: "error", label: "出错" },
];

/** 把后端的 status 翻译成给老板看的色块 + 文案 */
function pluginStatusDisplay(
  status: PluginStatus | undefined,
  enabled?: boolean,
): { label: string; tone: "ok" | "warn" | "err" | "neutral" } {
  if (!enabled || status === "disabled") {
    return { label: "已停用", tone: "neutral" };
  }
  switch (status) {
    case "ready":
      return { label: "运行中", tone: "ok" };
    case "error":
      return { label: "出错", tone: "err" };
    case "upgrade_pending":
      return { label: "待升级", tone: "warn" };
    case "installed":
      return { label: "初始化", tone: "warn" };
    case "uninstalled":
      return { label: "已卸载", tone: "neutral" };
    default:
      return { label: status ?? "未知", tone: "neutral" };
  }
}

/**
 * 插件管理屏 — 把 web 端 PluginManager 的核心搬过来:
 * 列出当前实例已装的所有插件 → 每行一个, 状态 + 启停 + 查看设置.
 *
 * 设计取舍 (wave235):
 * - 装/卸载走的是服务端 `POST /plugins/install` (需要 npm path / git url),
 *   App 端不引入"从仓库装"流程, 老板装机仍走 web. 这里只列已有插件.
 * - "启用 / 停用" 是核心 toggle, 一键切, 失败 alert 提示原因.
 * - "卸载" 是危险动作, 长按 + Alert 二次确认.
 */
export function PluginManagerScreen({
  company,
  onBack,
  onOpenPluginSettings,
  onOpenWebPluginManager,
}: PluginManagerScreenProps) {
  const [plugins, setPlugins] = useState<PluginRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | PluginStatus>("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  // wave239 — 顶部搜索 (agy 草图 §5)
  const [searchQuery, setSearchQuery] = useState("");

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const list = await coolie.listPlugins();
      setPlugins(list);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
      setPlugins([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const filtered = useMemo(() => {
    if (!plugins) return [];
    let list = plugins;
    if (filter !== "all") {
      list = list.filter((p) => p.status === filter);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => {
        const name = (p.displayName ?? p.pluginKey ?? "").toLowerCase();
        const key = (p.pluginKey ?? "").toLowerCase();
        return name.includes(q) || key.includes(q);
      });
    }
    return list;
  }, [plugins, filter, searchQuery]);

  // wave239 — 分组 (agy 草图 §5): 已启用 / 已停用.
  // SectionList 接受 section[].data[]; 当搜索时不分组 (单组, 名为 "搜索结果")
  // 避免来回切换时整屏闪烁.
  const sections = useMemo(() => {
    if (searchQuery.trim().length > 0) {
      return [{ title: `搜索结果 (${filtered.length})`, data: filtered }];
    }
    const enabled: PluginRecord[] = [];
    const disabled: PluginRecord[] = [];
    for (const p of filtered) {
      const isEnabled = (p.enabled ?? p.status === "ready") && p.status !== "disabled";
      if (isEnabled) enabled.push(p);
      else disabled.push(p);
    }
    const out: Array<{ title: string; data: PluginRecord[] }> = [];
    if (enabled.length > 0) out.push({ title: `已启用 (${enabled.length})`, data: enabled });
    if (disabled.length > 0) out.push({ title: `可用但已停用 (${disabled.length})`, data: disabled });
    return out;
  }, [filtered, searchQuery]);

  const onToggle = useCallback(
    async (plugin: PluginRecord) => {
      const enabled = plugin.enabled ?? plugin.status === "ready";
      setBusy(true);
      setPendingId(plugin.id);
      try {
        if (enabled) {
          await coolie.disablePlugin(plugin.id);
        } else {
          await coolie.enablePlugin(plugin.id);
        }
        await refresh();
      } catch (e) {
        Alert.alert("切换失败", String((e as Error)?.message ?? e));
      } finally {
        setBusy(false);
        setPendingId(null);
      }
    },
    [refresh],
  );

  const onUninstall = useCallback(
    (plugin: PluginRecord) => {
      Alert.alert(
        "卸载插件",
        `确定卸载 ${plugin.displayName ?? plugin.pluginKey}?\n\n卸载后需要重新安装才能再用.`,
        [
          { text: "取消", style: "cancel" },
          {
            text: "卸载",
            style: "destructive",
            onPress: async () => {
              setBusy(true);
              setPendingId(plugin.id);
              try {
                await coolie.uninstallPlugin(plugin.id);
                await refresh();
              } catch (e) {
                Alert.alert("卸载失败", String((e as Error)?.message ?? e));
              } finally {
                setBusy(false);
                setPendingId(null);
              }
            },
          },
        ],
      );
    },
    [refresh],
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="插件管理"
        subtitle={company.name}
        onBack={onBack}
        right={
          onOpenWebPluginManager ? (
            <Pressable onPress={onOpenWebPluginManager} hitSlop={8} style={styles.webLink}>
              <Ionicons name="open-outline" size={14} color={C.accent} />
              <Text style={styles.webLinkText}>完整市场</Text>
            </Pressable>
          ) : undefined
        }
      />

      {/* wave239 — 顶部搜索栏 (agy 草图 §5) */}
      <View style={styles.searchRow}>
        <View style={styles.searchInputWrap}>
          <Ionicons name="search" size={14} color={C.ink4} style={{ marginRight: 6 }} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="搜索插件名…"
            placeholderTextColor={C.ink4}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 ? (
            <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={14} color={C.ink4} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((opt) => {
          const active = filter === opt.key;
          return (
            <Pressable
              key={opt.key}
              onPress={() => setFilter(opt.key)}
              style={[styles.filterChip, active && styles.filterChipActive]}
              hitSlop={4}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {plugins === null && !error ? (
        <LoadingState text="加载插件列表…" />
      ) : error ? (
        <ErrorRetry message={error} onRetry={refresh} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Ionicons name="apps-outline" size={36} color={C.ink3} />}
          title={
            searchQuery
              ? "没有匹配的插件"
              : filter === "all"
              ? "暂无插件"
              : "没有该状态的插件"
          }
          subtitle={
            searchQuery
              ? "换一个关键词试试, 或者清空搜索."
              : filter === "all"
              ? "老板可以在 Web 端「设置 → 插件」安装新插件, 装完这里就能看到."
              : "换个筛选条件试试."
          }
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: SPACING.sm }} />}
          SectionSeparatorComponent={() => <View style={{ height: SPACING.xs }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={C.accent}
            />
          }
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item }) => {
            const display = pluginStatusDisplay(item.status, item.enabled);
            const isBusy = busy && pendingId === item.id;
            const enabled = item.enabled ?? item.status === "ready";
            return (
              <AppCard
                variant="surface"
                onPress={() => onOpenPluginSettings?.(item)}
                onLongPress={() => onUninstall(item)}
                padding={SPACING.md}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitleCol}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {item.displayName || item.pluginKey}
                    </Text>
                    <Text style={styles.cardSub} numberOfLines={1}>
                      {item.pluginKey} · v{item.version}
                    </Text>
                  </View>
                  <StatusBadge label={display.label} tone={display.tone} />
                </View>

                {item.lastError && display.tone === "err" ? (
                  <Text style={styles.errorLine} numberOfLines={2}>
                    {item.lastError}
                  </Text>
                ) : item.description ? (
                  <Text style={styles.descLine} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}

                <View style={styles.actionRow}>
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation();
                      void onToggle(item);
                    }}
                    disabled={isBusy}
                    style={[
                      styles.toggleBtn,
                      enabled ? styles.toggleBtnOff : styles.toggleBtnOn,
                      isBusy && styles.toggleBtnBusy,
                    ]}
                    hitSlop={4}
                  >
                    <Ionicons
                      name={enabled ? "power" : "power-outline"}
                      size={14}
                      color={enabled ? C.warn : C.ok}
                    />
                    <Text
                      style={[
                        styles.toggleText,
                        { color: enabled ? C.warn : C.ok },
                      ]}
                    >
                      {isBusy ? "处理中…" : enabled ? "停用" : "启用"}
                    </Text>
                  </Pressable>

                  {onOpenPluginSettings ? (
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        onOpenPluginSettings(item);
                      }}
                      style={styles.settingsBtn}
                      hitSlop={4}
                    >
                      <Ionicons name="settings-outline" size={14} color={C.ink2} />
                      <Text style={styles.settingsText}>配置</Text>
                    </Pressable>
                  ) : null}

                  <Text style={styles.hintText} numberOfLines={1}>
                    长按卸载
                  </Text>
                </View>
              </AppCard>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },
  // wave239 — 搜索栏
  searchRow: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  searchInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
  },
  searchInput: {
    flex: 1,
    color: C.ink,
    fontSize: 13,
    padding: 0,
  },
  sectionHeader: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.xs,
  },
  sectionHeaderText: {
    color: C.ink3,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.panel,
  },
  filterChipActive: {
    borderColor: C.accent,
    backgroundColor: "rgba(0, 200, 255, 0.12)",
  },
  filterChipText: {
    fontSize: 12,
    color: C.ink3,
  },
  filterChipTextActive: {
    color: C.accent,
    fontWeight: "600",
  },
  listContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  cardTitleCol: {
    flex: 1,
    marginRight: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: C.ink,
  },
  cardSub: {
    fontSize: 11,
    color: C.ink4,
    fontFamily: "monospace",
    marginTop: 2,
  },
  descLine: {
    fontSize: 12,
    color: C.ink3,
    marginTop: 6,
    lineHeight: 16,
  },
  errorLine: {
    fontSize: 12,
    color: C.err,
    marginTop: 6,
    lineHeight: 16,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  toggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  toggleBtnOn: {
    borderColor: C.ok,
    backgroundColor: "rgba(0, 200, 100, 0.08)",
  },
  toggleBtnOff: {
    borderColor: C.warn,
    backgroundColor: "rgba(255, 170, 0, 0.08)",
  },
  toggleBtnBusy: {
    opacity: 0.5,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: "500",
  },
  settingsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: C.line,
  },
  settingsText: {
    fontSize: 12,
    color: C.ink2,
  },
  hintText: {
    flex: 1,
    textAlign: "right",
    fontSize: 10,
    color: C.ink4,
  },
  webLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  webLinkText: {
    fontSize: 12,
    color: C.accent,
    fontWeight: "500",
  },
});
