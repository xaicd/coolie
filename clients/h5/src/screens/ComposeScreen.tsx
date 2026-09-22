import { useCallback, useState } from "react";
import type { CSSProperties } from "react";
import { getTrustPreset, type Agent, type IssuePriority } from "@coolie/api-client";
import { C } from "../theme";
import { ISSUE_PRIORITIES, PRIORITY_COLOR, PRIORITY_LABEL } from "../components/IssuesList";
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
import { WorkModeChips } from "../components/composer/WorkModeChips";
import type { ComposerFieldsState } from "../components/composer/useComposerFields";

/**
 * h5 新建任务屏 —— Coolie Web `ui/src/components/NewIssueDialog.tsx` 的 Web 镜像,
 * 与 expo 端 `screens/ComposeScreen.tsx` **字段与区块一一对应** (同一张对照表),
 * 差别只在这里是 HTML 元素而不是 RN 组件:
 *
 * - 上游的悬浮下拉 (`InlineEntitySelector` / `Popover` / `<select>`) → 同一形状的
 *   `<button>` 胶囊轨 + 就地展开的列表;
 * - 上游的拖放/`<input type=file>` 暂存 → `UploadRow` 的可见 file input;
 * - 描述区的 `MarkdownEditor` → `<textarea>` + `MarkdownToolbar`。
 *
 * 区块顺序、门控条件 (只在该项目启用隔离工作区时显示执行工作区; 只在适配器支持时
 * 显示模型选项) 与上游一致。
 *
 * 没有语音按钮: brief §3.5 那个 mic 走的是 App 端 wave21 的录音链路, 浏览器侧
 * MediaRecorder 默认产出 webm/opus, 与实例的腾讯 ASR 一句话识别容器不匹配, 需要
 * 额外转码。App 端已有一条真链路, 这里不塞一条未验证的旁路 (与任务页顶部的同一
 * 取舍, 见 `TasksScreen.tsx` 的文件头注释)。
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
  companyId: string | null;
  title: string;
  onTitle: (v: string) => void;
  description: string;
  onDescription: (v: string) => void;
  priority: IssuePriority;
  onPriority: (p: IssuePriority) => void;
  agents: Agent[];
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
   * 显示 / 隐藏一个可选行。隐藏会清掉它持有的值 —— 上游的 ⋯ 同样这么做
   * (`if (showReviewerRow) setReviewerValue("")`), 所以隐藏的行永远不会往
   * 建单请求里塞 stage。
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
      <div style={headerStyle}>
        <span style={breadcrumbStyle}>
          <span style={{ color: C.ink4 }}>XROA</span>
          <span style={{ color: C.ink4 }}>›</span>
          <span style={{ color: C.ink }}>New task</span>
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            style={iconBtnStyle}
            aria-label="在 Coolie Web 打开"
            onClick={() => window.open("https://xrobinai.cn", "_blank", "noopener")}
          >
            ↗
          </button>
          <button type="button" style={iconBtnStyle} aria-label="关闭" onClick={onDiscard}>
            ✕
          </button>
        </div>
      </div>

      <div style={bodyStyle}>
        <input
          autoFocus
          style={titleInputStyle}
          placeholder="Task title"
          value={title}
          onChange={(e) => onTitle(e.target.value)}
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

        <div style={participantsRowStyle}>
          <ParticipantsTrigger
            expanded={participantsOpen}
            onClick={() => {
              setStatusOpen(false);
              setMoreOpen(false);
              setParticipantsOpen((v) => !v);
            }}
            disabled={busy}
          />
          <span style={{ color: C.ink4, fontSize: 12 }}>添加复核人 / 审批人 / 看守</span>
        </div>

        {participantsOpen ? (
          <ParticipantsMenuList visible={participants} onToggle={toggleParticipant} />
        ) : null}

        {participants.has("reviewer") ? (
          <ParticipantRow
            label="Reviewer"
            glyph="👁"
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
            glyph="🛡"
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

        <textarea
          style={descriptionInputStyle}
          placeholder="Add description..."
          value={description}
          onChange={(e) => onDescription(e.target.value)}
          onSelect={(e) => {
            const el = e.currentTarget;
            setDescriptionSelection({
              start: el.selectionStart ?? 0,
              end: el.selectionEnd ?? 0,
            });
          }}
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
        <div style={sectionStyle}>
          <span style={sectionLabelStyle}>优先级</span>
          <div style={chipRowStyle}>
            {ISSUE_PRIORITIES.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={priority === value}
                style={{ ...priorityChipStyle, ...(priority === value ? priorityChipActiveStyle : null) }}
                onClick={() => onPriority(value)}
              >
                <span style={{ ...dotStyle, background: PRIORITY_COLOR[value] }} />
                <span style={{ color: priority === value ? C.ink : C.ink3 }}>
                  {PRIORITY_LABEL[value]}
                </span>
              </button>
            ))}
          </div>
        </div>

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
          <ComposerNote glyph="🚩">
            Assigning implies executable intent - leave status as Backlog only to deliberately park
            this. The assignee will not be woken until status moves to Todo or In Progress.
          </ComposerNote>
        ) : null}

        {selectedAssignee?.status === "paused" ? (
          <ComposerNote glyph="⏸">
            {selectedAssignee.name} is paused and will not start work on this task until it is
            resumed. You can resume it from the task page after creating the task.
          </ComposerNote>
        ) : null}

        {lowTrustAssignee ? (
          <ComposerNote glyph="🛡">
            Low-trust review agent. It can only act inside its assigned review boundary; task,
            project, or run policy defines the concrete scope.
          </ComposerNote>
        ) : null}
      </div>

      {/* 属性条 + 底部动作 —— 与上游 NewIssueDialog 一样**不进滚动区**。展开的菜单
          落在属性条上方, 因此永远完整可见, 也不挤动旁边那颗胶囊。 */}
      <div style={bottomBarStyle}>
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

        <div style={propsBarStyle}>
          <StatusChip
            value={fields.status}
            onClick={() => {
              setMoreOpen(false);
              setStatusOpen((v) => !v);
            }}
            expanded={statusOpen}
            disabled={busy}
          />
          <MoreMenu
            onClick={() => {
              setStatusOpen(false);
              setMoreOpen((v) => !v);
            }}
            expanded={moreOpen}
            disabled={busy}
          />
        </div>

        {/* 底部动作 */}
        <div style={footerStyle}>
          <button type="button" style={discardBtnStyle} onClick={onDiscard} disabled={busy}>
            放弃草稿
          </button>
          <button
            type="button"
            style={{ ...createBtnStyle, ...(canSubmit ? null : { opacity: 0.4, cursor: "not-allowed" }) }}
            disabled={!canSubmit}
            onClick={onSubmit}
          >
            {busy ? "创建中…" : "创建任务"}
          </button>
        </div>
      </div>
    </>
  );
}

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 16px",
  borderBottom: `1px solid ${C.lineSubtle}`,
};

const breadcrumbStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 13,
  fontWeight: 600,
};

const iconBtnStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: C.ink3,
  fontSize: 15,
  cursor: "pointer",
  padding: 4,
};

const bodyStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  padding: 16,
  overflowY: "auto",
  maxHeight: "64vh",
};

const titleInputStyle: CSSProperties = {
  border: "none",
  outline: "none",
  background: "transparent",
  color: C.ink,
  fontSize: 20,
  fontWeight: 600,
  letterSpacing: "-0.3px",
};

const descriptionInputStyle: CSSProperties = {
  minHeight: 120,
  border: "none",
  outline: "none",
  background: "transparent",
  color: C.ink2,
  fontSize: 14,
  lineHeight: "20px",
  resize: "vertical",
};

const participantsRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8 };

const sectionStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };

const sectionLabelStyle: CSSProperties = {
  color: C.ink4,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.6px",
  textTransform: "uppercase",
};

const chipRowStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8 };

const priorityChipStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 12px",
  borderRadius: 999,
  border: `1px solid ${C.line}`,
  background: "rgba(255,255,255,0.02)",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
};

const priorityChipActiveStyle: CSSProperties = {
  borderColor: C.brand,
  background: "rgba(94,106,210,0.18)",
};

const dotStyle: CSSProperties = { width: 6, height: 6, borderRadius: 3, flexShrink: 0 };

const bottomBarStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: "8px 16px 16px",
  borderTop: `1px solid ${C.lineSubtle}`,
};

const propsBarStyle: CSSProperties = { display: "flex", alignItems: "flex-start", gap: 8 };

const footerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const discardBtnStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: C.ink3,
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  padding: "10px 12px",
};

const createBtnStyle: CSSProperties = {
  flex: 1,
  padding: "10px 16px",
  borderRadius: 8,
  border: "none",
  background: C.brand,
  color: "#FFFFFF",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};
