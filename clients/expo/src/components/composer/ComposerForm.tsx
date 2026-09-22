import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { IssuePriority } from "@coolie/api-client";
import { C, type AgentRow } from "../../coolie";
import { ELEVATION, RADIUS, SPACING } from "../../ui/tokens";
import { openCoolieWeb } from "../../utils/openCoolieWeb";
import {
  ISSUE_PRIORITIES,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
} from "../issue-status";
import { ComposerChip } from "./Chip";
import { ForRow } from "./ForRow";
import { MarkdownToolbar } from "./MarkdownToolbar";
import { MoreMenu, MoreMenuList, type ComposerSection } from "./MoreMenu";
import { ProjectRow } from "./ProjectRow";
import { StatusChip, StatusMenu } from "./StatusChip";
import { TagsRow } from "./TagsRow";
import { TrustPolicyRow } from "./TrustPolicyRow";
import { UploadRow } from "./UploadRow";
import { WorkModeChips } from "./WorkModeChips";
import type { ComposerFieldsState } from "./useComposerFields";

/**
 * 新建任务表单 —— Coolie Web `NewIssueDialog` 的 App 版, **两个入口共用这一份**:
 * 中央「+」浮层 (`App.tsx`) 与任务页弹窗 (`CreateTaskModal`)。两个入口此前各自
 * 写了一份表单 (字段行重复、状态行一个有一个没有), 现在只有这一份, 谁也不会
 * 落在后面 —— 这正是 wave25 要补的「跟网页同款」。
 *
 * 对齐上游的四处 (wave25):
 * 1. 标题栏: 面包屑「XROA › New task」+ ↗ (跳 Coolie Web) + ✕
 * 2. 状态: `StatusChip` —— 可选状态与 color 取 `issue-status.ts` 单一来源, 并随
 *    create 请求提交 (不是只改显示)
 * 3. 「⋯ 更多」: 展开标签 / 截止日期 / 信任策略 / Markdown 编辑器四项可选区块
 * 4. 底部: [放弃草稿] + [创建任务]
 *
 * 字段 (For / in / Mode / Upload / 标签) 与「建完再传附件」的时序都在
 * `useComposerFields` 一份实现里; 这里只负责排布与交互。
 */
export function ComposerForm({
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
  const [statusOpen, setStatusOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [descriptionSelection, setDescriptionSelection] = useState({ start: 0, end: 0 });

  const toggleSection = useCallback((section: ComposerSection) => {
    setSections((current) => {
      const next = new Set(current);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }, []);

  const assigneeAgent = agents.find((agent) => agent.id === fields.assigneeAgentId) ?? null;
  const canSubmit = title.trim().length > 0 && !busy;

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
            assigneeName={assigneeAgent?.name ?? null}
            permissions={assigneeAgent?.permissions}
          />
        ) : null}

        <WorkModeChips value={fields.workMode} onChange={fields.setWorkMode} />

        <UploadRow files={fields.attachments} onChange={fields.setAttachments} disabled={busy} />
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
