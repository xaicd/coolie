import type { CSSProperties } from "react";
import type { Agent } from "@coolie/api-client";
import { C } from "../../theme";
import { ComposerChip, rowChipsStyle, rowLabelStyle, rowStyle } from "./Chip";

/**
 * h5 Reviewer / Approver 行 —— Coolie Web NewIssueDialog 复核/审批选择器的镜像,
 * 与 expo 端 `ParticipantRow.tsx` 同一份 props/语义。
 *
 * 上游每行是一个 `InlineEntitySelector` (选项就是指派人那套 `assigneeOptions`,
 * `noneLabel="No reviewer"` / `"No approver"`), 选中值经 `buildExecutionPolicy`
 * 变成 `executionPolicy` 里的 review / approval stage。这里同样给「不设」+ 员工
 * 两组选项, 用 chips 呈现。
 */
export function ParticipantRow({
  label,
  glyph,
  agents,
  value,
  onChange,
  noneLabel,
  disabled = false,
}: {
  label: string;
  glyph: string;
  agents: Agent[];
  value: string | null;
  onChange: (agentId: string | null) => void;
  noneLabel: string;
  disabled?: boolean;
}) {
  return (
    <div style={rowStyle}>
      <span style={rowLabelStyle}>
        <span aria-hidden>{glyph}</span> {label}
      </span>
      <div style={{ ...rowChipsStyle, ...(disabled ? { opacity: 0.5 } : null) }}>
        <ComposerChip
          label={noneLabel}
          active={value === null}
          onClick={() => onChange(null)}
        />
        {agents.map((agent) => (
          <ComposerChip
            key={agent.id}
            label={agent.name}
            active={value === agent.id}
            onClick={() => onChange(agent.id)}
            /* wave65 — boss 25:00 '工坊 5 角色员工 描述都去掉'.
                复核/审批/守望 agent 选 chip 不再展示长 title. */
            title={agent.role ?? agent.name}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * h5 Watchdog 行 —— 员工选择 + 指令文本, 与 expo 端 `WatchdogRow.tsx` 同一语义。
 *
 * 上游把两者放进一个 popover (触发器摘要显示「Agent · instructions」, Remove 键
 * 同时清空), 落库时是 `watchdog: { agentId, instructions }`。这里两个字段同行
 * 展示, 发出去的仍是那两个值。
 */
export function WatchdogRow({
  agents,
  agentId,
  instructions,
  onAgentChange,
  onInstructionsChange,
  disabled = false,
}: {
  agents: Agent[];
  agentId: string | null;
  instructions: string;
  onAgentChange: (agentId: string | null) => void;
  onInstructionsChange: (instructions: string) => void;
  disabled?: boolean;
}) {
  return (
    <div style={blockStyle}>
      <div style={rowStyle}>
        <span style={rowLabelStyle}>
          <span aria-hidden>📡</span> Watchdog
        </span>
        <div style={rowChipsStyle}>
          <ComposerChip
            label="No watchdog agent"
            active={agentId === null}
            onClick={() => onAgentChange(null)}
          />
          {agents.map((agent) => (
            <ComposerChip
              key={agent.id}
              label={agent.name}
              active={agentId === agent.id}
              onClick={() => onAgentChange(agent.id)}
              title={agent.role ?? agent.name}
            />
          ))}
        </div>
      </div>

      {agentId ? (
        <textarea
          style={instructionsStyle}
          placeholder="What should the watchdog watch for and how should it keep work moving?"
          value={instructions}
          disabled={disabled}
          onChange={(event) => onInstructionsChange(event.target.value)}
        />
      ) : null}
    </div>
  );
}

const blockStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };

const instructionsStyle: CSSProperties = {
  minHeight: 64,
  borderRadius: 8,
  border: `1px solid ${C.line}`,
  background: "rgba(255,255,255,0.02)",
  color: C.ink2,
  fontSize: 13,
  lineHeight: "18px",
  padding: 8,
  resize: "vertical",
};
