import type { CSSProperties } from "react";
import type { IssueStatus } from "@coolie/api-client";
import { C } from "../../theme";
import { ISSUE_STATUS_COLOR, ISSUE_STATUS_LABEL } from "../IssuesList";

/**
 * h5 新建任务的「状态」胶囊 —— Coolie Web NewIssueDialog 状态选择器的镜像,
 * 与 expo 端 `StatusChip.tsx` 同一语义。
 *
 * 上游是一个 Popover: 触发器显示当前状态 (●Todo), 展开后列出 `buildStatusOptions()`
 * 的 5 个可选状态, 每项带状态色圆点 + 说明。h5 把同一份列表就地展开在属性条
 * **下方** (与 expo 端同样的原因: 菜单塞进触发器自己的 wrapper 会把旁边那颗胶囊
 * 挪走, 接下来就点不准了)。
 */

/**
 * 建单时可选的状态 —— 镜像上游 `buildStatusOptions()`: backlog / todo /
 * in_progress / in_review / done。比 `ISSUE_STATUS_ORDER` 少 blocked / cancelled:
 * 那两个是任务流转中的状态, 不是建单时的选择。
 */
export const COMPOSER_STATUSES: IssueStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
];

/** backlog / todo 的一行说明 —— 同上游 `buildStatusOptions()` 的 description。 */
export const COMPOSER_STATUS_HINT: Partial<Record<IssueStatus, string>> = {
  backlog: "搁置: 不唤醒负责人",
  todo: "可执行: 会唤醒负责人",
};

function label(status: string): string {
  return ISSUE_STATUS_LABEL[status] ?? status;
}

function color(status: string): string {
  return ISSUE_STATUS_COLOR[status] ?? C.ink3;
}

export function StatusChip({
  value,
  onClick,
  expanded = false,
  disabled = false,
}: {
  value: IssueStatus;
  onClick: () => void;
  expanded?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={`状态: ${label(value)}`}
      aria-expanded={expanded}
      disabled={disabled}
      style={{
        ...chipStyle,
        ...(expanded ? { borderColor: C.brand } : null),
        ...(disabled ? { opacity: 0.4 } : null),
      }}
      onClick={onClick}
    >
      <span style={{ ...dotStyle, background: color(value) }} />
      <span>{label(value)}</span>
    </button>
  );
}

/** 状态列表 —— 展开后落在属性条下方 (见上面为什么拆开)。 */
export function StatusMenu({
  value,
  onChange,
}: {
  value: IssueStatus;
  onChange: (status: IssueStatus) => void;
}) {
  return (
    <div style={menuStyle}>
      {COMPOSER_STATUSES.map((status) => {
        const active = status === value;
        const hint = COMPOSER_STATUS_HINT[status];
        return (
          <button
            key={status}
            type="button"
            aria-pressed={active}
            style={{ ...menuItemStyle, ...(active ? { background: "rgba(255,255,255,0.08)" } : null) }}
            onClick={() => onChange(status)}
          >
            <span style={{ ...dotStyle, background: color(status) }} />
            <span style={{ flex: 1, textAlign: "left" }}>
              <span style={{ display: "block", color: active ? C.ink : C.ink2, fontSize: 13 }}>
                {label(status)}
              </span>
              {hint ? (
                <span style={{ display: "block", color: C.ink4, fontSize: 11 }}>{hint}</span>
              ) : null}
            </span>
            {active ? <span style={{ color: C.accent }}>✓</span> : null}
          </button>
        );
      })}
    </div>
  );
}

const chipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 12px",
  borderRadius: 999,
  border: `1px solid ${C.line}`,
  background: "rgba(255,255,255,0.02)",
  color: C.ink2,
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
};

const dotStyle: CSSProperties = { width: 6, height: 6, borderRadius: 3, flexShrink: 0 };

const menuStyle: CSSProperties = {
  alignSelf: "flex-start",
  minWidth: 210,
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: 4,
  borderRadius: 8,
  border: `1px solid ${C.line}`,
  background: C.surface,
};

const menuItemStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "7px 8px",
  borderRadius: 6,
  border: "none",
  background: "transparent",
  cursor: "pointer",
};
