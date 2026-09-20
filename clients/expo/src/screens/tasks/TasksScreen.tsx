import { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { isAsrNotConfigured, type Issue, type IssuePriority } from "@coolie/api-client";
import { C, coolie } from "../../coolie";
import { useRecorder } from "../../useRecorder";
import { LoadingState } from "../../ui/LoadingState";
import { EmptyState } from "../../ui/EmptyState";
import { ErrorRetry } from "../../ui/ErrorRetry";
import { Pill } from "../../ui/Pill";
import { StatTile } from "../../ui/StatTile";
import { StatusDot } from "../../components/StatusDot";
import { QuickApprovalCard } from "../../components/QuickApprovalCard";
import { IssueBoardView } from "../../components/tasks/IssueBoardView";
import { TaskCard } from "../../components/tasks/TaskCard";
import { PRIORITY_DOT_COLOR, PRIORITY_LABEL } from "../../components/tasks/taskMeta";
import { useCompany } from "../../providers/CompanyProvider";
import { useIssues } from "../../providers/IssuesProvider";

export interface TasksScreenProps {
  onOpenIssue: (issue: Issue) => void;
  onOpenSettings: () => void;
  onOpenArtifacts: () => void;
}

const keyExtractor = (issue: Issue) => issue.id;

/**
 * 任务页: 标题栏 + 指标 + 创建/语音派发 + 列表或看板。
 *
 * 列表用单个 FlatList 承载 (表头是 ListHeaderComponent), 不再套 ScrollView +
 * scrollEnabled={false} 的假列表 —— 那个组合关掉了虚拟化, 任务一多只有首屏行活着。
 */
export function TasksScreen({
  onOpenIssue,
  onOpenSettings,
  onOpenArtifacts,
}: TasksScreenProps) {
  const { company, whoami } = useCompany();
  const {
    issues,
    loading,
    error,
    refresh,
    createTask,
    updateStatus,
    updatePriority,
  } = useIssues();

  const [boardView, setBoardView] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<IssuePriority>("medium");
  const [busy, setBusy] = useState(false);
  const { recording, start, stop } = useRecorder();

  const companyId = company.id;

  const handleCreateTask = useCallback(async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await createTask({
        title: title.trim(),
        priority,
        description: description.trim() || undefined,
      });
      setTitle("");
      setDescription("");
      setPriority("medium");
    } catch (e) {
      Alert.alert("创建失败", String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [title, priority, description, createTask]);

  const voiceDispatch = useCallback(async () => {
    try {
      if (!recording) {
        setBusy(true);
        try {
          await start();
        } finally {
          setBusy(false);
        }
        return;
      }
      const { base64, format } = await stop();
      setBusy(true);
      const res = await coolie.voiceDispatch({
        companyId,
        audioBase64: base64,
        format,
      });
      if (res.issue) Alert.alert("任务已创建", res.issue.title);
      else Alert.alert("转写结果", res.transcription.text || "(空)");
      await refresh();
    } catch (e) {
      if (isAsrNotConfigured(e)) {
        Alert.alert("语音未配置", "该实例尚未配置腾讯 ASR 凭据，请改用文字输入。");
      } else {
        Alert.alert("语音派发失败", String((e as Error)?.message ?? e));
      }
    } finally {
      setBusy(false);
    }
  }, [companyId, recording, start, stop, refresh]);

  const handleMove = useCallback(
    async (id: string, status: string) => {
      try {
        await updateStatus(id, status);
      } catch (e) {
        Alert.alert("状态更新失败", String((e as Error)?.message ?? e));
      }
    },
    [updateStatus],
  );

  const handleChangePriority = useCallback(
    async (id: string, prio: string) => {
      try {
        await updatePriority(id, prio);
      } catch (e) {
        Alert.alert("优先级更新失败", String((e as Error)?.message ?? e));
      }
    },
    [updatePriority],
  );

  const renderItem = useCallback(
    ({ item }: { item: Issue }) => (
      <TaskCard issue={item} onPress={onOpenIssue} />
    ),
    [onOpenIssue],
  );

  const open = issues.filter((i) => i.status !== "done").length;

  const header = (
    <View style={styles.headerWrap}>
      {/* 顶部标题与身份胶囊 */}
      <View style={styles.rowBetween}>
        <View style={styles.headerMain}>
          <Text style={styles.h1}>工坊控制台</Text>
          <Pill style={styles.companyCapsule}>
            <StatusDot status="ok" size={6} />
            <Text style={styles.companyCapsuleText} numberOfLines={1}>
              {company.name}
            </Text>
            <Text style={styles.companyCapsuleSubText}>· {whoami}</Text>
          </Pill>
        </View>
        <Pressable
          onPress={() => setBoardView((v) => !v)}
          hitSlop={12}
          style={styles.btnGhost}
        >
          <Ionicons name={boardView ? "list" : "grid"} size={20} color={C.ink2} />
        </Pressable>
        <Pressable onPress={onOpenArtifacts} hitSlop={12} style={styles.btnGhost}>
          <Ionicons name="cube-outline" size={20} color={C.ink2} />
        </Pressable>
        <Pressable onPress={onOpenSettings} hitSlop={12} style={styles.btnGhost}>
          <Ionicons name="settings-outline" size={20} color={C.ink2} />
        </Pressable>
      </View>

      {/* 概览统计卡片 (tabularNum + 亮度分层) */}
      <View style={styles.statRow}>
        <StatTile value={issues.length} label="全部任务" />
        <StatTile value={open} label="进行中" valueColor={C.accent} />
        <StatTile value={issues.length - open} label="已完成" valueColor={C.ok} />
      </View>

      {/* 创建任务输入框区域 */}
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="新任务标题…"
          placeholderTextColor={C.ink3}
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          placeholder="描述 (可选)"
          placeholderTextColor={C.ink3}
          multiline
          value={description}
          onChangeText={setDescription}
        />

        {/* 优先级徽标胶囊 (前缀色点) */}
        <View style={styles.chips}>
          {(["low", "medium", "high", "critical"] as IssuePriority[]).map((p) => (
            <Pill
              key={p}
              label={PRIORITY_LABEL[p]}
              dotColor={PRIORITY_DOT_COLOR[p]}
              active={priority === p}
              onPress={() => setPriority(p)}
            />
          ))}
        </View>

        <View style={styles.rowGap}>
          <Pressable
            style={[
              styles.btnPrimary,
              styles.btnFlex,
              (!title.trim() || busy) && styles.btnDisabled,
            ]}
            disabled={!title.trim() || busy}
            onPress={handleCreateTask}
          >
            <Text style={styles.btnPrimaryText}>添加任务</Text>
          </Pressable>
          <Pressable
            style={[
              styles.btnVoice,
              recording && styles.btnVoiceRecording,
              busy && styles.btnDisabled,
            ]}
            disabled={busy && !recording}
            onPress={voiceDispatch}
          >
            <Text style={[styles.btnVoiceText, recording && { color: C.err }]}>
              {recording ? "■ 停止并派发" : "🎤 语音派发"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  if (boardView && !loading && issues.length > 0) {
    return (
      <View style={styles.shell}>
        <ScrollView style={styles.scroller} contentContainerStyle={styles.screen}>
          {header}
          <IssueBoardView
            issues={issues}
            onMove={handleMove}
            onChangePriority={handleChangePriority}
            onOpen={onOpenIssue}
          />
        </ScrollView>
        <QuickApprovalCard companyId={companyId} floating={true} />
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      <FlatList
        data={issues}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? (
            <LoadingState style={styles.listLoader} />
          ) : error ? (
            <ErrorRetry
              variant="section"
              message={`⚠️ ${error}`}
              onRetry={() => void refresh()}
            />
          ) : (
            <EmptyState
              icon="📋"
              title="还没有任务"
              subtitle="在上方输入标题创建第一个任务，或用语音派发。"
            />
          )
        }
        contentContainerStyle={styles.screen}
        keyboardShouldPersistTaps="handled"
      />
      <QuickApprovalCard companyId={companyId} floating={true} />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scroller: {
    flex: 1,
    backgroundColor: C.bg,
  },
  screen: {
    padding: 16,
    paddingBottom: 32,
    backgroundColor: C.bg,
  },
  headerWrap: {
    gap: 16,
    marginBottom: 16,
  },
  headerMain: { flex: 1 },
  h1: {
    fontSize: 20,
    fontWeight: "600",
    color: C.ink,
    letterSpacing: -0.4,
  },
  companyCapsule: {
    marginTop: 6,
    gap: 6,
  },
  companyCapsuleText: {
    fontSize: 11,
    color: C.ink2,
    fontWeight: "500",
    maxWidth: 160,
  },
  companyCapsuleSubText: {
    fontSize: 11,
    color: C.ink4,
    fontWeight: "400",
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  // 幽灵按钮 (DESIGN.md 第3节: bg 0.02, border line, text ink2, radius 8)
  btnGhost: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  statRow: {
    flexDirection: "row",
    gap: 12,
  },
  composer: {
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
  },
  // 输入框 (DESIGN.md 第3节: bg 0.02, border line, radius 8, padding 12×14, text ink, placeholder ink3)
  input: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: C.ink,
  },
  inputMultiline: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  chips: {
    flexGrow: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  rowGap: {
    flexDirection: "row",
    gap: 8,
  },
  // 主按钮 (DESIGN.md 第3节: bg #5E6AD2, text ink, radius 8, padding 12×16, weight 500)
  btnPrimary: {
    backgroundColor: C.brand,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: {
    color: C.ink,
    fontWeight: "500",
    fontSize: 15,
  },
  btnFlex: {
    flex: 1,
  },
  // 语音按钮 (幽灵半透明微调)
  btnVoice: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  btnVoiceRecording: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  btnVoiceText: {
    color: C.ink2,
    fontWeight: "500",
    fontSize: 13,
  },
  btnDisabled: {
    opacity: 0.4,
  },
  listLoader: {
    flex: 0,
    marginTop: 24,
    paddingVertical: 0,
  },
});
