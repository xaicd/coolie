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
import { BuildModeModal } from "../components/BuildModeModal";
import { QuickApprovalCard } from "../components/QuickApprovalCard";

/**
 * 任务页 —— 底部栏第 2 个 tab 的落地屏。
 *
 * 对齐 Coolie Web 的 Tasks 页: 标题「任务」+ 搜索框 + 6 视图任务列表 (IssuesList),
 * 右下角浮起 [+ 新建任务]。语音入口只剩工坊会话内长按 mic (BoardChatScreen);
 * 任务页与全局顶栏上独立的「语音派发」按钮已在 wave22 删除。
 *
 * 顶部另有编排按钮组 [🔨 Build 5 步链] [🛤️ Pipeline] [📋 Plan] (wave20): 把工坊
 * 对话里能触发的三种编排, 在任务页给出直接入口, 不必先学会说触发词。
 *
 * 旧的 TaskDetailScreen 保留: 这里点任务行由外层压入详情, 深链也仍走它。
 */
export function TasksScreen({
  company,
  whoami,
  refreshToken = 0,
  onOpenIssue,
  onOpenBuildIssue,
  onOpenSettings,
  onOpenWorkshop,
  onOpenOntology,
  onOpenArtifacts,
  onOpenPipelines,
  onOpenPlans,
  onOpenGitCredentials,
}: {
  company: Company;
  whoami: string;
  /** 外层 (中央 "+") 建完任务后 +1, 让列表重新拉取 */
  refreshToken?: number;
  onOpenIssue: (issue: Issue) => void;
  /** Build 进度卡点某环节: 按 issueId 补全 Issue 后压详情, 由外层实现 */
  onOpenBuildIssue: (issueId: string) => void;
  onOpenSettings: () => void;
  onOpenWorkshop: () => void;
  onOpenOntology: () => void;
  onOpenArtifacts: () => void;
  onOpenPipelines: () => void;
  onOpenPlans: () => void;
  /** wave70 — 「新建仓库绑定」入口 (跳到凭证管理屏) */
  onOpenGitCredentials?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [buildOpen, setBuildOpen] = useState(false);
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

  // Build 进度卡点某环节: 先收起弹窗, 再让外层按 id 补全任务压详情
  const handleBuildIssue = useCallback(
    (issueId: string) => {
      setBuildOpen(false);
      onOpenBuildIssue(issueId);
    },
    [onOpenBuildIssue],
  );

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* 标题区: 「任务」+ 入口菜单 */}
        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.h1}>任务</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {company.name} · {whoami}
            </Text>
          </View>
          <View style={styles.entryRow}>
            <EntryIcon icon="chatbubbles-outline" label="工坊" onPress={onOpenWorkshop} />
            <EntryIcon icon="git-network-outline" label="本体" onPress={onOpenOntology} />
            <EntryIcon icon="cube-outline" label="产物" onPress={onOpenArtifacts} />
            <EntryIcon icon="settings-outline" label="设置" onPress={onOpenSettings} />
          </View>
        </View>

        {/* 编排按钮组 (wave20): 工坊能做的三种编排在任务页给直达入口 */}
        <View style={styles.orchestrationRow}>
          <Pressable
            style={({ pressed }) => [styles.orchBtn, pressed && styles.orchBtnPressed]}
            onPress={() => setBuildOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Build 5 步链"
          >
            <Text style={styles.orchEmoji}>🔨</Text>
            <Text style={styles.orchLabel}>Build 5 步链</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.orchBtn, pressed && styles.orchBtnPressed]}
            onPress={onOpenPipelines}
            accessibilityRole="button"
            accessibilityLabel="Pipeline"
          >
            <Text style={styles.orchEmoji}>🛤️</Text>
            <Text style={styles.orchLabel}>Pipeline</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.orchBtn, pressed && styles.orchBtnPressed]}
            onPress={onOpenPlans}
            accessibilityRole="button"
            accessibilityLabel="Plan"
          >
            <Text style={styles.orchEmoji}>📋</Text>
            <Text style={styles.orchLabel}>Plan</Text>
          </Pressable>
          {onOpenGitCredentials ? (
            <Pressable
              style={({ pressed }) => [styles.orchBtn, pressed && styles.orchBtnPressed]}
              onPress={onOpenGitCredentials}
              accessibilityRole="button"
              accessibilityLabel="新建仓库绑定"
            >
              <Text style={styles.orchEmoji}>🔗</Text>
              <Text style={styles.orchLabel}>仓库绑定</Text>
            </Pressable>
          ) : null}
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
          agents={agents}
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

      <BuildModeModal
        visible={buildOpen}
        companyId={company.id}
        onClose={() => setBuildOpen(false)}
        onOpenIssue={handleBuildIssue}
      />
    </View>
  );
}

function EntryIcon({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={styles.entryIcon}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={19} color={C.ink2} />
    </Pressable>
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
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  entryIcon: {
    padding: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  // 编排按钮组: 3 个按钮平分宽度, 紫蓝 accent 描边
  orchestrationRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  orchBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: SPACING.sm,
    borderWidth: 1,
    borderColor: C.accent,
    borderRadius: RADIUS.md,
    backgroundColor: "rgba(94, 106, 210, 0.08)",
  },
  orchBtnPressed: {
    backgroundColor: "rgba(94, 106, 210, 0.18)",
  },
  orchEmoji: {
    fontSize: 16,
  },
  orchLabel: {
    color: C.ink2,
    fontSize: 12,
    fontWeight: "500",
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
