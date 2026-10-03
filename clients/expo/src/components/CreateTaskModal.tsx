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
import { C, coolie, type AgentRow } from "../coolie";
import { ELEVATION, RADIUS, SPACING } from "../ui/tokens";
import { Dropdown, type DropdownOption } from "../ui/Dropdown";
import { SectionCard } from "../ui/SectionCard";
import { AgentPickerSheet } from "./AgentPickerSheet";
import { useComposerFields } from "./composer/useComposerFields";
import { UploadRow, type StagedAttachment } from "./composer/UploadRow";
import { ISSUE_PRIORITIES, PRIORITY_COLOR, PRIORITY_LABEL } from "./issue-status";
import { matchIntentToAgent } from "../utils/intentMatcher";

/** 单选用「空 value」表示清除 (自动派发 / 无项目)。 */
const NONE = "";

/** spec-driven chain (wave147)。骨架内容与 `packages/shared/src/spec-templates.ts` 对应。 */
type SpecKind = "requirement" | "bugfix" | "design" | "task";
const SPEC_KINDS: SpecKind[] = ["requirement", "bugfix", "design", "task"];
const SPEC_KIND_LABEL: Record<SpecKind, string> = {
  requirement: "需求",
  bugfix: "缺陷修复",
  design: "设计",
  task: "任务",
};
function specSkeleton(kind: SpecKind): Record<string, unknown> {
  const todo = "（待填写）";
  switch (kind) {
    case "requirement":
      return {
        kind,
        requirement: {
          body: `${todo}描述要做什么 —— 1~3 句话。`,
          acceptanceCriteria: [`${todo}一条可判定的验收条件。`],
        },
      };
    case "bugfix":
      return {
        kind,
        bugfix: {
          reproSteps: `${todo}复现步骤 1、2、3…`,
          expectedBehavior: `${todo}预期行为。`,
          actualBehavior: `${todo}实际行为。`,
        },
      };
    case "design":
      return {
        kind,
        design: {
          approach: `${todo}怎么做：接口 / 数据 / 边界。`,
          tradeoffs: [`${todo}权衡 1。`],
          apiSurface: `${todo}接口或数据结构（可留空）。`,
        },
      };
    case "task":
      return {
        kind,
        task: {
          files: [`${todo}path/to/file.ts`],
          steps: [`${todo}改动点 1。`],
        },
      };
  }
}

/**
 * 新建任务弹窗 —— **两张卡** (主要内容 + 指派) + [放弃]/[创建任务]。
 *
 * boss 09-22「手机安排工作要简单点」的落地形态: 一屏两张卡, 一张写「要做什么」,
 * 一张定「派给谁」, 其余字段 (复核人 / 审批人 / 看守 / 状态 / 标签 / 工作模式 /
 * 模型选项) 不铺开上屏 —— 精简的是入口密度, 不是能力: 建单仍走同一份
 * `useComposerFields` (与上游 `NewIssueDialog` 字段一一对应)。
 *
 * 表单本体不再复用 `ComposeScreen`。入口走方案1 (`b56f6ac94`): 中央「+」与项目卡
 * 直通本弹窗; 「空状态 + 按住说话」的新会话页 (NewTaskPage) 是被方案1 替代的前代
 * 入口, 现未挂载 (停用预留), 勿当现役链路引用。
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
  initialAssigneeId,
  onClose,
  onCreated,
}: {
  visible: boolean;
  companyId: string;
  agents: AgentRow[];
  /** 预填标题 (转写或手打) —— 仅未挂载的 NewTaskPage 传, 现役入口 (+/项目卡) 不传。 */
  initialTitle?: string;
  /** 预填附件 (选图) —— 仅未挂载的 NewTaskPage 传, 现役入口不传。 */
  initialAttachments?: StagedAttachment[];
  /** 项目卡「创建任务」带上来的项目 —— 打开即预选 (boss: 项目要已经选好)。 */
  initialProjectId?: string | null;
  /** 意图识别预推荐负责人 id */
  initialAssigneeId?: string | null;
  onClose: () => void;
  onCreated: (issue: Issue) => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<IssuePriority>("medium");
  // 缺陷记录到任务 (wave132): 类型 任务/缺陷 + 严重度 P0-P3。
  const [issueKind, setIssueKind] = useState<"task" | "defect">("task");
  const [severity, setSeverity] = useState<"P0" | "P1" | "P2" | "P3">("P1");
  // spec-driven chain (wave147): 选定后建单成功即把该类型的 spec 骨架写进任务。
  const [specKind, setSpecKind] = useState<SpecKind | "">("");
  const [busy, setBusy] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);

  const fields = useComposerFields(companyId, agents);
  const { reset: resetFields, setAttachments, setProjectId, setAssigneeAgentId } = fields;

  /** 意图精准识别匹配结果 (根据输入的标题与描述即时推测) */
  const intentResult = useMemo(() => {
    const query = `${title} ${description}`.trim();
    if (!query) return null;
    return matchIntentToAgent(query, agents);
  }, [title, description, agents]);

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

  // 初始预选推荐负责人
  useEffect(() => {
    if (visible && initialAssigneeId && !fields.assigneeAgentId) {
      setAssigneeAgentId(initialAssigneeId);
    }
  }, [visible, initialAssigneeId, fields.assigneeAgentId, setAssigneeAgentId]);

  const reset = useCallback(() => {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setAssigneeOpen(false);
    setSpecKind("");
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
        ...(issueKind === "defect"
          ? { defect: { severity, source: null, reproSteps: null } }
          : {}),
      });
      // spec-driven chain (wave147): 建单成功后补写 spec 骨架（失败不阻塞建单）。
      if (specKind) {
        try {
          await coolie.saveIssueSpec(issue.id, specSkeleton(specKind));
        } catch {
          // 任务已存在；spec 写失败不改建单结果。
        }
      }
      setIssueKind("task");
      setSeverity("P1");
      setSpecKind("");
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
  }, [busy, description, fields, issueKind, onCreated, priority, reset, severity, specKind, title]);

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

            {/* 意图精准识别与责任人智能推荐 */}
            {intentResult?.recommendedAgent ? (
              <Pressable
                style={styles.intentCard}
                onPress={() => fields.setAssigneeAgentId(intentResult.recommendedAgent?.id ?? null)}
                accessibilityRole="button"
                accessibilityLabel="采纳推荐负责人"
              >
                <View style={styles.intentHeader}>
                  <View style={styles.intentBadge}>
                    <Ionicons name="sparkles" size={12} color="#FACC15" />
                    <Text style={styles.intentBadgeText}>意图精准识别</Text>
                  </View>
                  <View style={styles.intentSkillsRow}>
                    {intentResult.detectedSkills.slice(0, 4).map((s) => (
                      <View key={s} style={styles.intentSkillPill}>
                        <Text style={styles.intentSkillPillText}>{s}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                <View style={styles.intentBody}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.intentRecName} numberOfLines={1}>
                      推荐: {intentResult.recommendedAgent.name}
                      <Text style={styles.intentRecRole}>
                        {" "}
                        ({intentResult.recommendedAgent.roleLabel ?? "员工"} · {intentResult.score}% 匹配)
                      </Text>
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.intentActionBtn,
                      fields.assigneeAgentId === intentResult.recommendedAgent.id && styles.intentActionBtnActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.intentActionBtnText,
                        fields.assigneeAgentId === intentResult.recommendedAgent.id && styles.intentActionBtnTextActive,
                      ]}
                    >
                      {fields.assigneeAgentId === intentResult.recommendedAgent.id ? "✓ 已采纳" : "采纳推荐"}
                    </Text>
                  </View>
                </View>
              </Pressable>
            ) : null}

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
                <Text style={styles.fieldLabel}>类型</Text>
                <View style={styles.chipRow}>
                  {(["task", "defect"] as const).map((value) => (
                    <Pressable
                      key={value}
                      accessibilityRole="button"
                      accessibilityLabel={value === "defect" ? "缺陷" : "任务"}
                      accessibilityState={{ selected: issueKind === value }}
                      disabled={busy}
                      onPress={() => setIssueKind(value)}
                      style={({ pressed }) => [
                        styles.priorityChip,
                        issueKind === value && styles.priorityChipActive,
                        pressed && styles.priorityChipPressed,
                      ]}
                    >
                      <Text style={[styles.priorityText, issueKind === value && styles.priorityTextActive]}>
                        {value === "defect" ? "缺陷" : "任务"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {issueKind === "defect" ? (
                <View style={styles.priorityBlock}>
                  <Text style={styles.fieldLabel}>严重度</Text>
                  <View style={styles.chipRow}>
                    {(["P0", "P1", "P2", "P3"] as const).map((value) => (
                      <Pressable
                        key={value}
                        accessibilityRole="button"
                        accessibilityLabel={`严重度 ${value}`}
                        accessibilityState={{ selected: severity === value }}
                        disabled={busy}
                        onPress={() => setSeverity(value)}
                        style={({ pressed }) => [
                          styles.priorityChip,
                          severity === value && styles.priorityChipActive,
                          pressed && styles.priorityChipPressed,
                        ]}
                      >
                        <Text style={[styles.priorityText, severity === value && styles.priorityTextActive]}>
                          {value}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

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

              <View style={styles.priorityBlock}>
                <Text style={styles.fieldLabel}>Spec 类型</Text>
                <View style={styles.chipRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="无 Spec"
                    accessibilityState={{ selected: specKind === "" }}
                    disabled={busy}
                    onPress={() => setSpecKind("")}
                    style={({ pressed }) => [
                      styles.priorityChip,
                      specKind === "" && styles.priorityChipActive,
                      pressed && styles.priorityChipPressed,
                    ]}
                  >
                    <Text style={[styles.priorityText, specKind === "" && styles.priorityTextActive]}>
                      无
                    </Text>
                  </Pressable>
                  {SPEC_KINDS.map((kind) => (
                    <Pressable
                      key={kind}
                      accessibilityRole="button"
                      accessibilityLabel={`Spec ${SPEC_KIND_LABEL[kind]}`}
                      accessibilityState={{ selected: specKind === kind }}
                      disabled={busy}
                      onPress={() => setSpecKind(kind)}
                      style={({ pressed }) => [
                        styles.priorityChip,
                        specKind === kind && styles.priorityChipActive,
                        pressed && styles.priorityChipPressed,
                      ]}
                    >
                      <Text style={[styles.priorityText, specKind === kind && styles.priorityTextActive]}>
                        {SPEC_KIND_LABEL[kind]}
                      </Text>
                    </Pressable>
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
  intentCard: {
    backgroundColor: "rgba(250, 204, 21, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(250, 204, 21, 0.3)",
    borderRadius: RADIUS.lg,
    padding: 12,
    marginBottom: SPACING.md,
    gap: 8,
  },
  intentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  intentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(250, 204, 21, 0.16)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  intentBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#FACC15",
  },
  intentSkillsRow: {
    flexDirection: "row",
    gap: 4,
  },
  intentSkillPill: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: RADIUS.sm,
  },
  intentSkillPillText: {
    fontSize: 10,
    color: C.ink3,
  },
  intentBody: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  intentRecName: {
    fontSize: 13,
    fontWeight: "600",
    color: C.ink,
  },
  intentRecRole: {
    fontSize: 11,
    color: C.ink3,
    fontWeight: "normal",
  },
  intentActionBtn: {
    backgroundColor: "rgba(250, 204, 21, 0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.md,
  },
  intentActionBtnActive: {
    backgroundColor: "#10B981",
  },
  intentActionBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#FACC15",
  },
  intentActionBtnTextActive: {
    color: "#FFFFFF",
  },
});
