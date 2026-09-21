import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Issue, IssuePriority } from "@coolie/api-client";
import { C, coolie, type AgentRow } from "../coolie";
import { ELEVATION, RADIUS, SPACING } from "../ui/tokens";
import { openCoolieWeb } from "../utils/openCoolieWeb";
import { ISSUE_PRIORITIES, PRIORITY_COLOR, PRIORITY_LABEL, issueStatusColor } from "./issue-status";

/**
 * 新建任务弹窗 —— 对齐 Coolie Web 0.6.2 的 New Task 弹窗:
 * 面包屑标题 "XROA › New task" + ↗ (跳 Coolie Web) + ✕, 大标题输入框,
 * For [指派] 选择行, 大描述区, 状态行, 底部 [放弃草稿] / [创建任务]。
 *
 * 标题必填, 其余可选; 指派默认「自动派发」(不传 assigneeAgentId, 由系统路由)。
 */
export function CreateTaskModal({
  visible,
  companyId,
  agents,
  onClose,
  onCreated,
}: {
  visible: boolean;
  companyId: string;
  agents: AgentRow[];
  onClose: () => void;
  onCreated: (issue: Issue) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<IssuePriority>("medium");
  const [assigneeAgentId, setAssigneeAgentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = useCallback(() => {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setAssigneeAgentId(null);
  }, []);

  const discard = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const submit = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const issue = await coolie.createIssue({
        companyId,
        title: trimmed,
        priority,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(assigneeAgentId ? { assigneeAgentId } : {}),
      });
      reset();
      onCreated(issue);
    } catch (e) {
      Alert.alert("创建失败", String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [assigneeAgentId, busy, companyId, description, onCreated, priority, reset, title]);

  const canSubmit = title.trim().length > 0 && !busy;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={discard}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          style={styles.sheet}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {/* 头部: 面包屑 + ↗ + ✕ */}
          <View style={styles.header}>
            <View style={styles.breadcrumb}>
              <Text style={styles.breadcrumbMuted}>XROA</Text>
              <Ionicons name="chevron-forward" size={12} color={C.ink4} />
              <Text style={styles.breadcrumbCurrent}>New task</Text>
            </View>
            <View style={styles.headerActions}>
              <Pressable onPress={() => void openCoolieWeb()} hitSlop={8} style={styles.headerBtn}>
                <Ionicons name="open-outline" size={16} color={C.ink3} />
              </Pressable>
              <Pressable onPress={discard} hitSlop={8} style={styles.headerBtn}>
                <Ionicons name="close" size={18} color={C.ink3} />
              </Pressable>
            </View>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
          >
            <TextInput
              style={styles.titleInput}
              placeholder="Task title"
              placeholderTextColor={C.ink4}
              value={title}
              onChangeText={setTitle}
              multiline
              autoFocus
            />

            {/* For [指派人] */}
            <View style={styles.forRow}>
              <Text style={styles.forLabel}>For</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.forChips}
              >
                <AssigneeChip
                  label="自动派发"
                  active={assigneeAgentId === null}
                  onPress={() => setAssigneeAgentId(null)}
                />
                {agents.map((agent) => (
                  <AssigneeChip
                    key={agent.id}
                    label={agent.name}
                    active={assigneeAgentId === agent.id}
                    onPress={() => setAssigneeAgentId(agent.id)}
                  />
                ))}
              </ScrollView>
            </View>

            <TextInput
              style={styles.descriptionInput}
              placeholder="Add description..."
              placeholderTextColor={C.ink4}
              value={description}
              onChangeText={setDescription}
              multiline
            />

            {/* 优先级 */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>优先级</Text>
              <View style={styles.chipRow}>
                {ISSUE_PRIORITIES.map((value) => (
                  <Chip
                    key={value}
                    label={PRIORITY_LABEL[value]}
                    dotColor={PRIORITY_COLOR[value]}
                    active={priority === value}
                    onPress={() => setPriority(value)}
                  />
                ))}
              </View>
            </View>

            {/* 状态行 (新建默认待处理) */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>状态</Text>
              <View style={styles.chipRow}>
                <View style={styles.statusChip}>
                  <View style={[styles.dot, { backgroundColor: issueStatusColor("todo") }]} />
                  <Text style={styles.statusChipText}>待处理</Text>
                </View>
                <Pressable
                  style={styles.iconChip}
                  onPress={() => Alert.alert("新建任务", "新任务默认进入「待处理」，创建后可在详情页改状态。")}
                >
                  <Ionicons name="ellipsis-horizontal" size={15} color={C.ink3} />
                </Pressable>
              </View>
            </View>

            {/* 附件 / 智能模式 */}
            <View style={styles.chipRow}>
              <Pressable
                style={styles.iconChip}
                onPress={() => Alert.alert("附件", "App 端暂不支持上传附件，请在 Coolie Web 中追加。")}
              >
                <Ionicons name="cloud-upload-outline" size={15} color={C.ink3} />
                <Text style={styles.iconChipText}>Upload</Text>
              </Pressable>
              <Pressable
                style={styles.iconChip}
                onPress={() => Alert.alert("Auto mode", "创建后由系统按任务内容自动路由执行，无需手动选择。")}
              >
                <Ionicons name="sparkles-outline" size={15} color={C.ink2} />
                <Text style={[styles.iconChipText, { color: C.ink2 }]}>Auto mode</Text>
              </Pressable>
            </View>
          </ScrollView>

          {/* 底部动作 */}
          <View style={styles.footer}>
            <Pressable style={styles.discardBtn} onPress={discard} disabled={busy}>
              <Text style={styles.discardText}>放弃草稿</Text>
            </Pressable>
            <Pressable
              style={[styles.createBtn, !canSubmit && styles.disabled]}
              disabled={!canSubmit}
              onPress={() => void submit()}
            >
              {busy ? (
                <ActivityIndicator size="small" color={C.ink} />
              ) : (
                <Text style={styles.createText}>创建任务</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function AssigneeChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.assigneeChip, active && styles.chipActive]}>
      <Ionicons
        name="person-circle-outline"
        size={14}
        color={active ? C.ink : C.ink3}
      />
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function Chip({
  label,
  dotColor,
  active,
  onPress,
}: {
  label: string;
  dotColor: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    maxHeight: "92%",
    backgroundColor: C.bg,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.line,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  breadcrumb: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  breadcrumbMuted: {
    color: C.ink4,
    fontSize: 13,
    fontWeight: "500",
  },
  breadcrumbCurrent: {
    color: C.ink,
    fontSize: 13,
    fontWeight: "600",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  headerBtn: {
    padding: SPACING.xs,
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    padding: SPACING.lg,
    gap: SPACING.lg,
  },
  titleInput: {
    color: C.ink,
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: -0.3,
    paddingVertical: SPACING.xs,
    minHeight: 32,
  },
  forRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  forLabel: {
    color: C.ink4,
    fontSize: 13,
  },
  forChips: {
    gap: 6,
    paddingRight: SPACING.md,
  },
  assigneeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: ELEVATION.base,
    maxWidth: 160,
  },
  descriptionInput: {
    color: C.ink2,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 120,
    textAlignVertical: "top",
  },
  section: {
    gap: SPACING.sm,
  },
  sectionLabel: {
    color: C.ink4,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: ELEVATION.base,
  },
  chipActive: {
    borderColor: C.brand,
    backgroundColor: "rgba(94, 106, 210, 0.18)",
  },
  chipText: {
    color: C.ink3,
    fontSize: 12,
    fontWeight: "500",
  },
  chipTextActive: {
    color: C.ink,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: ELEVATION.base,
  },
  statusChipText: {
    color: C.ink2,
    fontSize: 12,
    fontWeight: "500",
  },
  iconChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: ELEVATION.base,
  },
  iconChipText: {
    color: C.ink3,
    fontSize: 12,
    fontWeight: "500",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl,
    borderTopWidth: 1,
    borderTopColor: C.lineSubtle,
  },
  discardBtn: {
    paddingVertical: 11,
    paddingHorizontal: SPACING.md,
  },
  discardText: {
    color: C.ink3,
    fontSize: 14,
    fontWeight: "500",
  },
  createBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.brand,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
  },
  createText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  disabled: {
    opacity: 0.4,
  },
});
