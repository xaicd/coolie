import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getTrustPreset, type IssuePriority } from "@coolie/api-client";
import { C, type AgentRow } from "../coolie";
import { ELEVATION, RADIUS, SPACING } from "../ui/tokens";
import { openCoolieWeb } from "../utils/openCoolieWeb";
import {
  ISSUE_PRIORITIES,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
} from "../components/issue-status";
import { AssigneeOptionsPanel } from "../components/composer/AssigneeOptionsPanel";
import { ComposerNote } from "../components/composer/ComposerNote";
import { ExecutionWorkspaceRow } from "../components/composer/ExecutionWorkspaceRow";
import { ForRow } from "../components/composer/ForRow";
import { MarkdownToolbar } from "../components/composer/MarkdownToolbar";
import { MoreMenu, MoreMenuList, type ComposerSection } from "../components/composer/MoreMenu";
import { ParticipantRow, WatchdogRow } from "../components/composer/ParticipantRow";
import {
  ParticipantsMenuList,
  ParticipantsTrigger,
  type ComposerParticipant,
} from "../components/composer/ParticipantsMenu";
import { ProjectRow } from "../components/composer/ProjectRow";
import { StatusChip, StatusMenu } from "../components/composer/StatusChip";
import { TagsRow } from "../components/composer/TagsRow";
import { TrustPolicyRow } from "../components/composer/TrustPolicyRow";
import { UploadRow } from "../components/composer/UploadRow";
import { VoiceInputButton } from "../components/composer/VoiceInputButton";
import { WorkModeChips } from "../components/composer/WorkModeChips";
import type { ComposerFieldsState } from "../components/composer/useComposerFields";

/**
 * 新建任务屏 —— Coolie Web `ui/src/components/NewIssueDialog.tsx` 的 App 版,
 * **字段与区块一一对应**, 三个入口共用这一份: 中央「+」浮层、任务页弹窗
 * (`CreateTaskModal`)、以及任何后续需要建单的地方。
 *
 * 与上游的对应关系 (自上而下, 与 dialog 的 JSX 同序):
 *
 * | NewIssueDialog | 这里 |
 * | --- | --- |
 * | 标题栏 `XROA › New task` + ↗ + ✕ | `header` |
 * | `Task title` 大输入框 | `titleInput` |
 * | `For [assignee] in [project]` + ⋯ | `ForRow` / `ProjectRow` / `ParticipantsTrigger` |
 * | ⋯ 展开的 Reviewer / Approver / Watchdog 行 | `ParticipantsMenuList` + `ParticipantRow` / `WatchdogRow` |
 * | Execution workspace (`select`) | `ExecutionWorkspaceRow` |
 * | `Claude/Codex/OpenCode options` (Model lane / Model / Thinking effort / Chrome) | `AssigneeOptionsPanel` |
 * | `Add description...` (Markdown + 图片上传/附件暂存) | `descriptionInput` + `MarkdownToolbar` |
 * | 已暂存文件列表 | `UploadRow` |
 * | 优先级 chips | `priority chips` |
 * | Work mode 胶囊 | `WorkModeChips` |
 * | 标签 / 信任策略 | `TagsRow` / `TrustPolicyRow` |
 * | 属性条 `[●Todo] ⋯` + `Upload` | `propsBar` |
 * | 底部 `[Discard Draft] [Create Task]` | `footer` |
 *
 * 与上游的两处有意偏离, 都是平台差异而非重新设计:
 * 1. 所有下拉 (`InlineEntitySelector` / `Popover` / `<select>`) 在 App 上展开为
 *    同一行下方或紧随其后的**胶囊轨/列表** —— 表单在浮层里, 没有悬浮层的余地。
 * 2. 暂存文件先选后传 (与上游一致): 上传要 issue id, 所以 `UploadRow` 只暂存,
 *    建单成功后再由 `useComposerFields` 统一上传。
 */
export function ComposeScreen({
  companyId,
  title,
  onTitle,
  description,
  onDescription,
  priority,
  onPriority,
  agents,
  fields,
  busy,
  onSubmit,
  onDiscard,
}: {
  companyId: string;
  title: string;
  onTitle: (v: string) => void;
  description: string;
  onDescription: (v: string) => void;
  priority: IssuePriority;
  onPriority: (p: IssuePriority) => void;
  agents: AgentRow[];
  fields: ComposerFieldsState;
  busy: boolean;
  onSubmit: () => void;
  onDiscard: () => void;
}) {
  const [sections, setSections] = useState<ReadonlySet<ComposerSection>>(new Set());
  const [participants, setParticipants] = useState<ReadonlySet<ComposerParticipant>>(new Set());
  const [statusOpen, setStatusOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [assigneeOptionsOpen, setAssigneeOptionsOpen] = useState(false);
  const [descriptionSelection, setDescriptionSelection] = useState({ start: 0, end: 0 });

  const toggleSection = useCallback((section: ComposerSection) => {
    setSections((current) => {
      const next = new Set(current);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }, []);

  /**
   * Show / hide a participant row. Hiding clears the value it held — upstream's
   * ⋯ does the same (`if (showReviewerRow) setReviewerValue("")`), so a hidden
   * row can never contribute a stage to the create payload.
   */
  const toggleParticipant = useCallback(
    (participant: ComposerParticipant) => {
      setParticipants((current) => {
        const next = new Set(current);
        if (next.has(participant)) {
          next.delete(participant);
          if (participant === "reviewer") fields.setReviewerAgentId(null);
          if (participant === "approver") fields.setApproverAgentId(null);
          if (participant === "watchdog") {
            fields.setWatchdogAgentId(null);
            fields.setWatchdogInstructions("");
          }
        } else {
          next.add(participant);
        }
        return next;
      });
    },
    [fields],
  );

  const canSubmit = title.trim().length > 0 && !busy;
  const selectedAssignee = fields.selectedAssigneeAgent;
  const selectedProject = fields.projects.find((project) => project.id === fields.projectId);
  const lowTrustAssignee = getTrustPreset(selectedAssignee?.permissions) === "low_trust_review";

  return (
    <>
      {/* 标题栏: 面包屑 + ↗ + ✕ (跟 NewIssueDialog 同款) */}
      <View style={styles.header}>
        <View style={styles.breadcrumb}>
          <Text style={styles.breadcrumbMuted}>XROA</Text>
          <Text style={styles.breadcrumbSep}>›</Text>
          <Text style={styles.breadcrumbCurrent}>New task</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => void openCoolieWeb()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="在 Coolie Web 打开"
            style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
          >
            <Ionicons name="expand-outline" size={17} color={C.ink3} />
          </Pressable>
          <Pressable
            onPress={onDiscard}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="关闭"
            style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
          >
            <Ionicons name="close" size={19} color={C.ink3} />
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
          onChangeText={onTitle}
          multiline
        />

        {/* For [assignee] in [project] ⋯ */}
        <ForRow
          agents={agents}
          value={fields.assigneeAgentId}
          onChange={(agentId) => {
            fields.setAssigneeAgentId(agentId);
            // 指派即「可执行」: backlog 只在刻意搁置时才留 (上游同款)。
            if (agentId && fields.status === "backlog") fields.setStatus("todo");
          }}
        />

        <ProjectRow
          projects={fields.projects}
          value={fields.projectId}
          onChange={fields.setProjectId}
        />

        <View style={styles.participantsBlock}>
          <ParticipantsTrigger
            expanded={participantsOpen}
            onPress={() => {
              setStatusOpen(false);
              setMoreOpen(false);
              setParticipantsOpen((v) => !v);
            }}
            disabled={busy}
          />
          <Text style={styles.participantsHint}>添加复核人 / 审批人 / 看守</Text>
        </View>

        {participantsOpen ? (
          <ParticipantsMenuList visible={participants} onToggle={toggleParticipant} />
        ) : null}

        {participants.has("reviewer") ? (
          <ParticipantRow
            label="Reviewer"
            icon="eye-outline"
            agents={agents}
            value={fields.reviewerAgentId}
            onChange={fields.setReviewerAgentId}
            noneLabel="No reviewer"
            disabled={busy}
          />
        ) : null}

        {participants.has("approver") ? (
          <ParticipantRow
            label="Approver"
            icon="shield-checkmark-outline"
            agents={agents}
            value={fields.approverAgentId}
            onChange={fields.setApproverAgentId}
            noneLabel="No approver"
            disabled={busy}
          />
        ) : null}

        {participants.has("watchdog") ? (
          <WatchdogRow
            agents={agents}
            agentId={fields.watchdogAgentId}
            instructions={fields.watchdogInstructions}
            onAgentChange={fields.setWatchdogAgentId}
            onInstructionsChange={fields.setWatchdogInstructions}
            disabled={busy}
          />
        ) : null}

        {/* Execution workspace —— 只在所选项目启用隔离工作区时出现 (上游同一门控) */}
        {selectedProject?.executionWorkspacePolicy?.enabled ? (
          <ExecutionWorkspaceRow
            value={fields.executionWorkspaceMode}
            onChange={fields.setExecutionWorkspaceMode}
          />
        ) : null}

        {/* 指派人的模型选项 —— 只在适配器支持覆盖时出现 (上游同一门控) */}
        {fields.supportsAssigneeOverrides ? (
          <AssigneeOptionsPanel
            companyId={companyId}
            open={assigneeOptionsOpen}
            onToggleOpen={() => setAssigneeOptionsOpen((v) => !v)}
            adapterType={fields.assigneeAdapterType}
            lane={fields.assigneeModelLane}
            onLaneChange={fields.setAssigneeModelLane}
            modelOverride={fields.assigneeModelOverride}
            onModelOverrideChange={fields.setAssigneeModelOverride}
            thinkingEffort={fields.assigneeThinkingEffort}
            onThinkingEffortChange={fields.setAssigneeThinkingEffort}
            chrome={fields.assigneeChrome}
            onChromeChange={fields.setAssigneeChrome}
          />
        ) : null}

        <TextInput
          style={styles.descriptionInput}
          placeholder="Add description..."
          placeholderTextColor={C.ink4}
          value={description}
          onChangeText={onDescription}
          onSelectionChange={(e) => setDescriptionSelection(e.nativeEvent.selection)}
          multiline
        />

        {sections.has("markdown") ? (
          <MarkdownToolbar
            value={description}
            selection={descriptionSelection}
            disabled={busy}
            onChange={({ text, selection }) => {
              onDescription(text);
              setDescriptionSelection(selection);
            }}
          />
        ) : null}

        {/* 语音输入 (brief §3.5) —— 长按说话, 转写按 PM 决策进标题 */}
        <VoiceInputButton
          companyId={companyId}
          disabled={busy}
          onTranscript={(text) => onTitle(title.trim() ? `${title.trim()} ${text}` : text)}
        />

        {/* 优先级 */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>优先级</Text>
          <View style={styles.chipRow}>
            {ISSUE_PRIORITIES.map((value) => (
              <ComposerPriorityChip
                key={value}
                value={value}
                active={priority === value}
                onPress={() => onPriority(value)}
              />
            ))}
          </View>
        </View>

        {sections.has("tags") ? (
          <TagsRow
            labels={fields.labels}
            selected={fields.labelIds}
            onChange={fields.setLabelIds}
          />
        ) : null}

        {sections.has("trustPolicy") ? (
          <TrustPolicyRow
            assigneeName={selectedAssignee?.name ?? null}
            permissions={selectedAssignee?.permissions}
          />
        ) : null}

        <WorkModeChips value={fields.workMode} onChange={fields.setWorkMode} />

        <UploadRow files={fields.attachments} onChange={fields.setAttachments} disabled={busy} />

        {/* 建单提示 (上游属性条与页脚之间的三条 note) */}
        {fields.assigneeAgentId && fields.status === "backlog" ? (
          <ComposerNote icon="flag-outline">
            Assigning implies executable intent - leave status as Backlog only to deliberately park
            this. The assignee will not be woken until status moves to Todo or In Progress.
          </ComposerNote>
        ) : null}

        {selectedAssignee?.status === "paused" ? (
          <ComposerNote icon="pause-circle-outline">
            {selectedAssignee.name} is paused and will not start work on this task until it is
            resumed. You can resume it from the task page after creating the task.
          </ComposerNote>
        ) : null}

        {lowTrustAssignee ? (
          <ComposerNote icon="shield-half-outline">
            Low-trust review agent. It can only act inside its assigned review boundary; task,
            project, or run policy defines the concrete scope.
          </ComposerNote>
        ) : null}
      </ScrollView>

      {/* 属性条 + 底部动作 —— 与上游 NewIssueDialog 一样**不进滚动区** (上游的 chips bar
          也是 `overflow-y-auto` 之外的一行)。放在滚动区里会被表单撑到屏幕外: 实测展开
          「⋯」时后两行 (信任策略 / Markdown 编辑器) 落在可视区之下, 点不到。
          展开的菜单落在属性条上方, 因此永远完整可见, 也不挤动旁边那颗胶囊。 */}
      <View style={styles.bottomBar}>
        {moreOpen ? <MoreMenuList sections={sections} onToggle={toggleSection} /> : null}
        {statusOpen ? (
          <StatusMenu
            value={fields.status}
            onChange={(status) => {
              fields.setStatus(status);
              setStatusOpen(false);
            }}
          />
        ) : null}

        <View style={styles.propsBar}>
          <StatusChip
            value={fields.status}
            onPress={() => {
              setMoreOpen(false);
              setStatusOpen((v) => !v);
            }}
            expanded={statusOpen}
            disabled={busy}
          />
          <MoreMenu
            onPress={() => {
              setStatusOpen(false);
              setMoreOpen((v) => !v);
            }}
            expanded={moreOpen}
            disabled={busy}
          />
        </View>

        {/* 底部动作 */}
        <View style={styles.footer}>
          <Pressable
            style={styles.discardBtn}
            onPress={onDiscard}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={styles.discardText}>放弃草稿</Text>
          </Pressable>
          <Pressable
            style={[styles.createBtn, !canSubmit && styles.disabled]}
            disabled={!canSubmit}
            onPress={onSubmit}
            accessibilityRole="button"
          >
            <Text style={styles.createText}>{busy ? "创建中…" : "创建任务"}</Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}

/** 优先级胶囊 —— 上游 `priorities` 表的四项 (图标 + 颜色 + 标签)。 */
function ComposerPriorityChip({
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
    backgroundColor: C.panel,
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
  breadcrumbSep: {
    color: C.ink4,
    fontSize: 13,
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
    borderRadius: RADIUS.sm,
  },
  headerBtnPressed: {
    backgroundColor: ELEVATION.active,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: SPACING.lg,
    gap: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  /**
   * 属性条 + 底部动作的固定容器 (不进滚动区)。展开的菜单在属性条上方, 所以容器
   * 只会向上长, 不会把菜单顶到屏幕外。
   */
  bottomBar: {
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: C.lineSubtle,
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
    minHeight: 96,
    textAlignVertical: "top",
  },
  participantsBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  participantsHint: {
    color: C.ink4,
    fontSize: 12,
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
  propsBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
    paddingTop: SPACING.sm,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.md,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.lg,
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
