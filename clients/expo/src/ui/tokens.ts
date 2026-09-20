import { C } from "../coolie";

/** 8px 网格间距阶梯 (DESIGN.md 第4节) */
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** 圆角阶梯 */
export const RADIUS = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 18,
  pill: 999,
} as const;

/** 海拔靠背景亮度分层,不用 RN 阴影 (DESIGN.md 第3节) */
export const ELEVATION = {
  base: "rgba(255,255,255,0.02)",
  raised: "rgba(255,255,255,0.03)",
  soft: "rgba(255,255,255,0.04)",
  hover: "rgba(255,255,255,0.05)",
  active: "rgba(255,255,255,0.08)",
} as const;

export const FONT_SIZE = {
  meta: 11,
  sub: 13,
  body: 15,
  title: 17,
  h1: 20,
  display: 24,
} as const;

/** 语义色调: fg 文字/图标, bg 底色, border 边框 */
export const TONE = {
  neutral: {
    fg: C.ink2,
    bg: "rgba(255,255,255,0.05)",
    border: C.line,
  },
  brand: {
    fg: C.accent,
    bg: "rgba(94, 106, 210, 0.12)",
    border: "rgba(94, 106, 210, 0.35)",
  },
  accent: {
    fg: C.accent,
    bg: "rgba(113, 112, 255, 0.15)",
    border: "rgba(113, 112, 255, 0.4)",
  },
  ok: {
    fg: C.ok,
    bg: "rgba(39, 166, 68, 0.1)",
    border: "rgba(39, 166, 68, 0.25)",
  },
  warn: {
    fg: C.warn,
    bg: "rgba(245, 158, 11, 0.1)",
    border: "rgba(245, 158, 11, 0.25)",
  },
  err: {
    fg: C.err,
    bg: "rgba(239, 68, 68, 0.1)",
    border: "rgba(239, 68, 68, 0.28)",
  },
  muted: {
    fg: C.ink3,
    bg: ELEVATION.soft,
    border: C.lineSubtle,
  },
} as const;

export type ToneName = keyof typeof TONE;

/** 把 #RRGGBB 或 #RGB 令牌色转成带透明度的 rgba (裸写 alpha 的统一入口) */
export function alpha(hex: string, opacity: number): string {
  const raw = hex.replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : raw;
  const value = parseInt(full, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
