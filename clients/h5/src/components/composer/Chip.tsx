import type { CSSProperties, ReactNode } from "react";
import { C } from "../../theme";

/**
 * h5 composer 的胶囊控件 —— expo 端 `composer/Chip.tsx` 的 Web 镜像。
 *
 * 三个选择行 (For / in / Mode) 共用这一个触发器, 视觉对齐 Coolie Web
 * NewIssueDialog 的 `InlineEntitySelector` (圆角胶囊 + 边框 + 选中描边)。
 */
export function ComposerChip({
  label,
  active,
  onClick,
  icon,
  dotColor,
  title,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  /** 前置字形 (emoji 或文字), 与 dotColor 互斥。 */
  icon?: ReactNode;
  dotColor?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      style={{ ...chipStyle, ...(active ? chipActiveStyle : null) }}
      onClick={onClick}
    >
      {icon}
      {dotColor ? <span style={{ ...dotStyle, background: dotColor }} /> : null}
      <span>{label}</span>
    </button>
  );
}

/** 行容器 (「For / in / Mode」标签 + 可横向滚动的 chips) */
export const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
};

export const rowLabelStyle: CSSProperties = { color: C.ink4, fontSize: 13, flexShrink: 0 };

export const rowChipsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  overflowX: "auto",
  paddingBottom: 2,
};

const chipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "6px 10px",
  borderRadius: 999,
  border: `1px solid ${C.line}`,
  background: "rgba(255,255,255,0.02)",
  color: C.ink3,
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  whiteSpace: "nowrap",
  maxWidth: 200,
};

const chipActiveStyle: CSSProperties = {
  borderColor: C.brand,
  background: "rgba(94,106,210,0.18)",
  color: C.ink,
};

const dotStyle: CSSProperties = { width: 6, height: 6, borderRadius: 3, flexShrink: 0 };
