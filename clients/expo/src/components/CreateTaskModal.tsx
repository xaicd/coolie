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
import { C, type AgentRow } from "../coolie";
import { ELEVATION, RADIUS, SPACING } from "../ui/tokens";
import { openCoolieWeb } from "../utils/openCoolieWeb";
import { ISSUE_PRIORITIES, PRIORITY_COLOR, PRIORITY_LABEL, issueStatusColor } from "./issue-status";
import { ComposerChip } from "./composer/Chip";
import { ForRow } from "./composer/ForRow";
import { ProjectRow } from "./composer/ProjectRow";
import { UploadRow } from "./composer/UploadRow";
import { WorkModeChips } from "./composer/WorkModeChips";
import { useComposerFields } from "./composer/useComposerFields";

/**
 * 新建任务弹窗 —— 对齐 Coolie Web NewIssueDialog:
 * 面包屑标题 "XROA › New task" + ↗ (跳 Coolie Web) + ✕, 大标题输入框,
 * For [指派] / in [项目] / Mode [执行模式] / Upload [附件] 四行, 大描述区,
 * 优先级 4 选, 状态行, 底部 [放弃草稿] / [创建任务]。
 *
 * 标题必填, 其余可选; 指派默认「自动派发」(不传 assigneeAgentId, 由系统路由)。
 * 字段状态与「建完再传附件」的时序都在 useComposerFields 里, 与中央 "+"
 * 浮层 (App.tsx TaskComposer) 共用同一份 —— 两个浮层是同一个表单的两种呈现。
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
  const [busy, setBusy] = useState(false);

  const fields = useComposerFields(companyId);
  const { reset: resetFields } = fields;

  const reset = useCallback(() => {
    setTitle("");
    setDescription("");
    setPriority("medium");
    resetFields();
  }, [resetFields]);

  const discard = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const submit = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const { issue, failedUploads } = await fields.createTask({
        title: trimmed,
        priority,
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      reset();
      onCreated(issue);
      if (failedUploads.length > 0) {
        Alert.alert("附件未上传", `任务已创建, 但这些附件没传成功: ${failedUploads.join("、")}`);
      }
    } catch (e) {
      Alert.alert("创建失败", String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [busy, description, fields, onCreated, priority, reset, title]);

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

            <ForRow
              agents={agents}
              value={fields.assigneeAgentId}
              onChange={fields.setAssigneeAgentId}
            />

            <ProjectRow
              projects={fields.projects}
              value={fields.projectId}
              onChange={fields.setProjectId}
            />

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
                  <ComposerChip
                    key={value}
                    label={PRIORITY_LABEL[value]}
                    dotColor={PRIORITY_COLOR[value]}
                    active={priority === value}
                    onPress={() => setPriority(value)}
                  />
                ))}
              </View>
            </View>

            <WorkModeChips value={fields.workMode} onChange={fields.setWorkMode} />

            <UploadRow files={fields.attachments} onChange={fields.setAttachments} disabled={busy} />

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
