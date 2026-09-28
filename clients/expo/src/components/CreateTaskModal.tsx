import { useCallback, useEffect, useMemo, useState } from "react";
import {
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
import { Dropdown, type DropdownOption } from "../ui/Dropdown";
import { SectionCard } from "../ui/SectionCard";
import { AgentPickerSheet } from "./AgentPickerSheet";
import { useComposerFields } from "./composer/useComposerFields";
import { UploadRow, type StagedAttachment } from "./composer/UploadRow";
import { ISSUE_PRIORITIES, PRIORITY_COLOR, PRIORITY_LABEL } from "./issue-status";

/** 单选用「空 value」表示清除 (自动派发 / 无项目)。 */
const NONE = "";

/**
 * 新建任务弹窗 —— **两张卡** (主要内容 + 指派) + [放弃]/[创建任务]。
 *
 * boss 09-22「手机安排工作要简单点」的落地形态: 一屏两张卡, 一张写「要做什么」,
 * 一张定「派给谁」, 其余字段 (复核人 / 审批人 / 看守 / 状态 / 标签 / 工作模式 /
 * 模型选项) 不铺开上屏 —— 精简的是入口密度, 不是能力: 建单仍走同一份
 * `useComposerFields` (与上游 `NewIssueDialog` 字段一一对应)。
 *
 * 表单本体不再复用 `ComposeScreen`: 新会话页 (NewTaskPage) 是「空状态 + 按住说话」
 * 的入口, 真正填字段发生在这里。
 *
 * 提交走 `coolie.createIssue` → `POST /api/companies/:id/issues` (现有接口)。
 */
export function CreateTaskModal({
  visible,
  companyId,
  agents,
  initialTitle = "",
  initialAttachments,
  initialProjectId,
  onClose,
  onCreated,
}: {
  visible: boolean;
  companyId: string;
  agents: AgentRow[];
  /** 新会话页带上来的标题 (转写或手打), 打开即预填。 */
  initialTitle?: string;
  /** 新会话页上先挑好的附件 (选图), 打开即并入待传列表。 */
  initialAttachments?: StagedAttachment[];
  /** 项目卡「创建任务」带上来的项目 —— 打开即预选 (boss: 项目要已经选好)。 */
  initialProjectId?: string | null;
  onClose: () => void;
  onCreated: (issue: Issue) => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<IssuePriority>("medium");
  const [busy, setBusy] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);

  const fields = useComposerFields(companyId, agents);
  const { reset: resetFields, setAttachments, setProjectId } = fields;

  // 入口页先挑好的附件并进 composer 的待传列表。上传要 issue id, 所以这里只暂存,
  // 建单成功后由 useComposerFields 统一 flush。
  useEffect(() => {
    if (initialAttachments && initialAttachments.length > 0) {
      setAttachments(initialAttachments);
    }
  }, [initialAttachments, setAttachments]);

  // 项目卡「创建任务」预选项目 —— 每次打开把入口带来的项目落进 composer,
  // 建单时随 projectId 提交, 服务端据此绑定该项目的主工作区。
  useEffect(() => {
    if (visible && initialProjectId) {
      setProjectId(initialProjectId);
    }
  }, [visible, initialProjectId, setProjectId]);

  const reset = useCallback(() => {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setAssigneeOpen(false);
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

  const selectedAssigneeName = useMemo(() => {
    if (!fields.assigneeAgentId) return "自动派发";
    return (
      agents.find((agent) => agent.id === fields.assigneeAgentId)?.name ?? "自动派发"
    );
  }, [agents, fields.assigneeAgentId]);
  const projectOptions = useMemo<DropdownOption[]>(
    () =>
      fields.projects
        .filter((project) => project.status !== "archived")
        .map((project) => ({
          value: project.id,
          label: project.name,
          dotColor: project.color ?? undefined,
        })),
    [fields.projects],
  );

  const canSubmit = title.trim().length > 0 && !busy;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={discard}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          style={styles.sheet}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.header}>
            <Text style={styles.headerTitle}>新建任务</Text>
            <Pressable onPress={discard} hitSlop={10} accessibilityLabel="关闭">
              <Ionicons name="close" size={19} color={C.ink3} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
          >
            <SectionCard title="主要内容">
              <TextInput
                style={styles.titleInput}
                placeholder="任务标题"
                placeholderTextColor={C.ink4}
                value={title}
                onChangeText={setTitle}
                multiline
              />
              <TextInput
                style={styles.descriptionInput}
                placeholder="补充描述…"
                placeholderTextColor={C.ink4}
                value={description}
                onChangeText={setDescription}
                multiline
              />
            </SectionCard>

            <SectionCard title="指派">
              <View style={styles.assigneeRow}>
                <Text style={styles.dropdownLabel}>负责人</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`负责人: ${selectedAssigneeName}`}
                  accessibilityState={{ expanded: assigneeOpen }}
                  disabled={busy}
                  onPress={() => setAssigneeOpen(true)}
                  style={({ pressed }) => [
                    styles.assigneeTrigger,
                    pressed && styles.assigneeTriggerPressed,
                    busy && styles.assigneeTriggerDisabled,
                  ]}
                >
                  <Text style={styles.assigneeValue} numberOfLines={1}>
                    {selectedAssigneeName}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color={C.ink4} />
                </Pressable>
              </View>

              <Dropdown
                label="项目"
                options={[{ value: NONE, label: "无项目" }, ...projectOptions]}
                selected={[fields.projectId ?? NONE]}
                disabled={busy}
                onToggle={(value) => fields.setProjectId(value === NONE ? null : value)}
              />

              <View style={styles.priorityBlock}>
                <Text style={styles.fieldLabel}>优先级</Text>
                <View style={styles.chipRow}>
                  {ISSUE_PRIORITIES.map((value) => (
                    <PriorityChip
                      key={value}
                      value={value}
                      active={priority === value}
                      onPress={() => setPriority(value)}
                    />
                  ))}
                </View>
              </View>

              <UploadRow
                files={fields.attachments}
                onChange={fields.setAttachments}
                disabled={busy}
              />
            </SectionCard>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              style={styles.discardBtn}
              onPress={discard}
              disabled={busy}
              accessibilityRole="button"
            >
              <Text style={styles.discardText}>放弃</Text>
            </Pressable>
            <Pressable
              style={[styles.createBtn, !canSubmit && styles.disabled]}
              disabled={!canSubmit}
              onPress={() => void submit()}
              accessibilityRole="button"
            >
              <Text style={styles.createText}>{busy ? "创建中…" : "创建任务"}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>

        <AgentPickerSheet
          visible={assigneeOpen}
          title="负责人"
          emptyLabel="自动派发"
          agents={agents}
          selectedAgentId={fields.assigneeAgentId}
          busy={busy}
          onSelect={(agentId) => {
            setAssigneeOpen(false);
            fields.setAssigneeAgentId(agentId);
            // 指派即「可执行」: backlog 只在刻意搁置时才留 (上游同款)。
            if (agentId && fields.status === "backlog") fields.setStatus("todo");
          }}
          onClose={() => setAssigneeOpen(false)}
        />
      </View>
    </Modal>
  );
}

/** 优先级胶囊 —— 上游 `priorities` 表的四项 (颜色 + 标签)。 */
function PriorityChip({
  value,
  active,
  onPress,
}: {
  value: IssuePriority;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={PRIORITY_LABEL[value]}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.priorityChip,
        active && styles.priorityChipActive,
        pressed && styles.priorityChipPressed,
      ]}
    >
      <View style={[styles.priorityDot, { backgroundColor: PRIORITY_COLOR[value] }]} />
      <Text style={[styles.priorityText, active && styles.priorityTextActive]}>
        {PRIORITY_LABEL[value]}
      </Text>
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
  headerTitle: {
    color: C.ink,
    fontSize: 15,
    fontWeight: "600",
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
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.3,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.xs,
    minHeight: 28,
  },
  descriptionInput: {
    color: C.ink2,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 72,
    textAlignVertical: "top",
    paddingHorizontal: SPACING.xs,
  },
  priorityBlock: {
    gap: SPACING.sm,
  },
  fieldLabel: {
    color: C.ink4,
    fontSize: 13,
  },
  assigneeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  dropdownLabel: {
    color: C.ink4,
    fontSize: 13,
    minWidth: 52,
  },
  assigneeTrigger: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: ELEVATION.base,
  },
  assigneeTriggerPressed: {
    backgroundColor: ELEVATION.active,
  },
  assigneeTriggerDisabled: {
    opacity: 0.4,
  },
  assigneeValue: {
    flex: 1,
    color: C.ink,
    fontSize: 13,
    fontWeight: "500",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  priorityChip: {
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
  priorityChipActive: {
    borderColor: C.brand,
    backgroundColor: "rgba(94, 106, 210, 0.18)",
  },
  priorityChipPressed: {
    backgroundColor: ELEVATION.active,
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  priorityText: {
    color: C.ink3,
    fontSize: 12,
    fontWeight: "500",
  },
  priorityTextActive: {
    color: C.ink,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: C.lineSubtle,
  },
  discardBtn: {
    paddingVertical: 11,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
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
