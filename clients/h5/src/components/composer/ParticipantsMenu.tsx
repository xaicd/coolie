import type { CSSProperties } from "react";
import { C } from "../../theme";

/**
 * The three optional participant rows upstream `NewIssueDialog` hides behind the
 * "⋯" at the end of its `For … in …` line.
 *
 * Same contract as the expo twin (`clients/expo/.../ParticipantsMenu.tsx`):
 * toggling a row shows it, untoggling it clears the value it held, so a hidden
 * row can never contribute a stage to the create payload.
 */
export type ComposerParticipant = "reviewer" | "approver" | "watchdog";

const ROWS: { key: ComposerParticipant; glyph: string; label: string }[] = [
  { key: "reviewer", glyph: "👁", label: "Reviewer" },
  { key: "approver", glyph: "🛡", label: "Approver" },
  { key: "watchdog", glyph: "📡", label: "Watchdog" },
];

/** The ⋯ trigger for the `For … in …` line. */
export function ParticipantsTrigger({
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
      title="添加复核人 / 审批人 / 看守"
      aria-expanded={expanded}
      disabled={disabled}
      style={{ ...triggerStyle, ...(expanded ? triggerOpenStyle : null), ...(disabled ? { opacity: 0.4 } : null) }}
      onClick={onClick}
    >
      ⋯
    </button>
  );
}

/** The menu the trigger opens — one toggle per optional row. */
export function ParticipantsMenuList({
  visible,
  onToggle,
}: {
  /** Which rows are currently shown. */
  visible: ReadonlySet<ComposerParticipant>;
  onToggle: (participant: ComposerParticipant) => void;
}) {
  return (
    <div style={menuStyle}>
      {ROWS.map((row) => {
        const active = visible.has(row.key);
        return (
          <button
            key={row.key}
            type="button"
            aria-pressed={active}
            style={{ ...menuItemStyle, ...(active ? menuItemActiveStyle : null) }}
            onClick={() => onToggle(row.key)}
          >
            <span aria-hidden>{row.glyph}</span>
            <span style={{ flex: 1, textAlign: "left", color: active ? C.ink : C.ink2 }}>
              {row.label}
            </span>
            {active ? <span style={{ color: C.accent }}>✓</span> : null}
          </button>
        );
      })}
    </div>
  );
}

const triggerStyle: CSSProperties = {
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

const triggerOpenStyle: CSSProperties = { borderColor: C.brand, color: C.ink };

const menuStyle: CSSProperties = {
  alignSelf: "flex-start",
  minWidth: 200,
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

const menuItemActiveStyle: CSSProperties = { background: "rgba(255,255,255,0.08)" };
