import type { IssuePriority } from "@coolie/api-client";
import { C } from "../../coolie";

export const PRIORITY_LABEL: Record<IssuePriority, string> = {
  low: "低",
  medium: "中",
  high: "高",
  critical: "紧急",
};

// 胶囊内前缀色点 (DESIGN.md 第3节: P0 #EF4444 / P1 #F59E0B / P2 #8A8F98)
export const PRIORITY_DOT_COLOR: Record<IssuePriority, string> = {
  critical: C.err,
  high: C.warn,
  medium: C.ink3,
  low: C.ink4,
};

export const STATUS_LABEL: Record<string, string> = {
  open: "待处理",
  in_progress: "进行中",
  blocked: "受阻",
  done: "已完成",
};

export const STATUS_DOT_COLOR: Record<string, string> = {
  open: C.ink3,
  in_progress: C.accent,
  blocked: C.err,
  done: C.ok,
};
