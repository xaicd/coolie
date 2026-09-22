import { useState } from "react";
import type { CSSProperties } from "react";
import { C } from "../../theme";

/**
 * h5「⋯ 更多」菜单 —— 与 expo 端 `MoreMenu.tsx` 同一份区块键与同一套说明。
 *
 * 上游 `NewIssueDialog` 的「⋯」有两处: For/in 行尾那个展开 Reviewer / Approver /
 * Watchdog 三个可选行 (h5 由 `ParticipantsMenu.tsx` 负责), 属性条那个展开
 * Start date / Due date。h5 的 ⋯ 合到属性条这一个上, 展开 brief 指定的四项
 * (标签 / 截止日期 / 信任策略 / Markdown 编辑器), 每一项**开关**对应区块 ——
 * 与上游「⋯ 切换可选行」是同一种交互, 展开的项都真能写进任务或真能操作。
 */
export type ComposerSection = "tags" | "dueDate" | "trustPolicy" | "markdown";

const ROWS: { key: ComposerSection; glyph: string; label: string }[] = [
  { key: "tags", glyph: "🏷", label: "标签" },
  { key: "dueDate", glyph: "📅", label: "截止日期" },
  { key: "trustPolicy", glyph: "🛡", label: "信任策略" },
  { key: "markdown", glyph: "📝", label: "Markdown 编辑器" },
];

/** 「⋯ 更多」触发胶囊 (与 `StatusChip` 同理拆成触发器 + 列表)。 */
export function MoreMenu({
  onClick,
  expanded = false,
  disabled = false,
}: {
  onClick: () => void;
  expanded?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title="更多"
      aria-expanded={expanded}
      disabled={disabled}
      style={{
        ...chipStyle,
        ...(expanded ? { borderColor: C.brand, color: C.ink } : null),
        ...(disabled ? { opacity: 0.4 } : null),
      }}
      onClick={onClick}
    >
      ⋯
    </button>
  );
}

/**
 * 「⋯」展开的二级菜单。
 *
 * `dueDate` 单独处理: 平台的 issue 模型没有截止日期字段
 * (`packages/db/src/schema/issues.ts` 里没有该列, `createIssueBaseSchema` 也不收),
 * 所以这一项**不能**做成一个选了却发不出去的日期选择器 —— 点开它会就地说明原因。
 * 上游的 Due date 同样是占位按钮。
 */
export function MoreMenuList({
  sections,
  onToggle,
}: {
  sections: ReadonlySet<ComposerSection>;
  onToggle: (section: ComposerSection) => void;
}) {
  const [dueDateNoteShown, setDueDateNoteShown] = useState(false);

  return (
    <div style={menuStyle}>
      {ROWS.map((row) => {
        const active = sections.has(row.key);
        const unsupported = row.key === "dueDate";
        return (
          <button
            key={row.key}
            type="button"
            aria-pressed={active}
            style={{ ...menuItemStyle, ...(active ? { background: "rgba(255,255,255,0.08)" } : null) }}
            onClick={() => {
              if (unsupported) {
                setDueDateNoteShown((v) => !v);
                return;
              }
              onToggle(row.key);
            }}
          >
            <span aria-hidden>{row.glyph}</span>
            <span style={{ flex: 1, textAlign: "left", color: active ? C.ink : C.ink2 }}>
              {row.label}
            </span>
            {unsupported ? (
              <span style={{ color: C.ink4 }}>ⓘ</span>
            ) : active ? (
              <span style={{ color: C.accent }}>✓</span>
            ) : null}
          </button>
        );
      })}

      {dueDateNoteShown ? (
        <p style={noteStyle}>
          此实例的任务模型没有截止日期字段, 建任务时无法设置 —— 与上游 NewIssueDialog
          的 Due date 占位按钮一致。
        </p>
      ) : null}
    </div>
  );
}

const chipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "6px 12px",
  borderRadius: 999,
  border: `1px solid ${C.line}`,
  background: "rgba(255,255,255,0.02)",
  color: C.ink3,
  fontSize: 13,
  cursor: "pointer",
};

const menuStyle: CSSProperties = {
  alignSelf: "flex-start",
  minWidth: 240,
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
  fontSize: 13,
  cursor: "pointer",
};

const noteStyle: CSSProperties = {
  margin: 0,
  padding: "4px 8px 0",
  color: C.ink4,
  fontSize: 11,
  lineHeight: "16px",
};
