import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Company, Issue } from "@coolie/api-client";
import { C, coolie, type AgentRow } from "../coolie";
import { RADIUS, SPACING } from "../ui/tokens";
import { IssuesList } from "../components/IssuesList";
import { CreateTaskModal } from "../components/CreateTaskModal";
import { QuickApprovalCard } from "../components/QuickApprovalCard";

/**
 * 任务页 —— 底部栏第 2 个 tab 的落地屏。
 *
 * wave96 精简 (boss 22:14 OOB「更复杂了」): 删 6 个编排图标卡、右上角 4 个
 * 入口 icon、看板/分列/漏斗等视图切换。页面只剩「任务列表 + 新建任务」。
 *
 * 任务 Tab 与收件箱 Tab 的分工 (boss 09-25 OOB「功能重复」): 本页只显示
 * 「今日 + 进行中」两组 —— 收件箱 Tab 负责通知侧 (@提及/审批/阻塞),
 * 两边不重叠。语音入口只剩工坊会话内长按 mic (BoardChatScreen)。
 *
 * 旧的 TaskDetailScreen 保留: 点任务行由外层压入详情, 深链也仍走它。
 */
export function TasksScreen({
  company,
  whoami,
  refreshToken = 0,
  onOpenIssue,
}: {
  company: Company;
  whoami: string;
  /** 外层 (中央 "+") 建完任务后 +1, 让列表重新拉取 */
  refreshToken?: number;
  onOpenIssue: (issue: Issue) => void;
}) {
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [agents, setAgents] = useState<AgentRow[]>([]);

  useEffect(() => {
    void coolie
      .listAgents(company.id)
      .then(setAgents)
      .catch(() => setAgents([]));
  }, [company.id]);

  const handleCreated = useCallback((issue: Issue) => {
    setCreateOpen(false);
    setRefreshSignal((value) => value + 1);
    Alert.alert("任务已创建", issue.title);
  }, []);

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* 标题区: 「任务」 */}
        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.h1}>任务</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {company.name} · 今日 + 进行中
            </Text>
          </View>
        </View>

        {/* 搜索框 */}
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={15} color={C.ink3} />
          <TextInput
            style={styles.searchInput}
            placeholder="搜索任务…"
            placeholderTextColor={C.ink3}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search.length > 0 ? (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={15} color={C.ink4} />
            </Pressable>
          ) : null}
        </View>

        <IssuesList
          companyId={company.id}
          search={search}
          refreshSignal={refreshSignal + refreshToken}
          onIssuePress={onOpenIssue}
        />
      </ScrollView>

      {/* 待审批快捷卡 (沿用旧任务页的浮动审批入口, 不因换 UI 丢能力) */}
      <QuickApprovalCard companyId={company.id} floating={true} />

      {/* 右下角浮起 [+ 新建任务] */}
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => setCreateOpen(true)}
        accessibilityLabel="新建任务"
      >
        <Ionicons name="add" size={20} color="#FFFFFF" />
        <Text style={styles.fabText}>新建任务</Text>
      </Pressable>

      <CreateTaskModal
        visible={createOpen}
        companyId={company.id}
        agents={agents}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
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
    paddingBottom: 96,
    gap: SPACING.lg,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.md,
  },
  titleBlock: {
    flex: 1,
    gap: 4,
  },
  h1: {
    color: C.ink,
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: -0.4,
  },
  subtitle: {
    color: C.ink4,
    fontSize: 12,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: RADIUS.md,
    backgroundColor: "rgba(255,255,255,0.02)",
    paddingHorizontal: SPACING.md,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
  },
  searchInput: {
    flex: 1,
    color: C.ink,
    fontSize: 14,
    paddingVertical: 2,
  },
  fab: {
    position: "absolute",
    right: SPACING.lg,
    bottom: SPACING.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 12,
    borderRadius: RADIUS.pill,
    backgroundColor: C.brand,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  fabPressed: {
    backgroundColor: C.accentHover,
  },
  fabText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
});
