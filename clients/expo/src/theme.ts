/**
 * Coolie App 色彩令牌 — 与 Coolie Web (clients/expo-paperclip-web, 0.6.x) 同一套。
 *
 * 这是全 App 唯一的颜色来源: 屏/组件只 import { C } from "../theme",
 * 不要在各处裸写 hex (DESIGN.md 第 1 节)。
 *
 * 与 Coolie Web 对齐的键 (boss wave10 要求「参考web做expo」):
 *   bg #08090A / panel #0F1011 / surface #191A1B
 *   ink #E6E6E6 / ink2 #9BA1A6 / ink3 #8A8F98
 *   line rgba(255,255,255,0.08) / accent #5E6AD2 / err #EF4444
 * 其余键 (surfaceHover/ink4/brand/accentHover/ok/done/warn/lineSubtle) 是
 * 驾驶舱自有能力需要的扩展色, 保持 Linear 深色阶梯不变。
 */
export const C = {
  // 背景三层(亮度阶梯 = 海拔)
  bg: "#08090A", // 页面最底(marketing black)
  panel: "#0F1011", // AppBar / TabBar / 侧栏
  surface: "#191A1B", // 卡片 / 浮层
  surfaceHover: "#28282C",
  // 文字四级(禁纯白 #FFF)
  ink: "#E6E6E6", // 主文字
  ink2: "#9BA1A6", // 次文字
  ink3: "#8A8F98", // 占位 / 元数据
  ink4: "#62666D", // 时间戳 / 禁用
  // 品牌紫蓝(全 App 唯一彩色, 只用于 CTA/激活/选中)
  brand: "#5E6AD2", // 按钮底 / 品牌标记
  accent: "#5E6AD2", // 链接 / 激活态(与 Coolie Web 一致)
  accentHover: "#828FFF",
  // 状态(仅状态指示)
  ok: "#27A644",
  done: "#10B981",
  warn: "#F59E0B",
  err: "#EF4444",
  violet: "#8B5CF6", // 评审中(in_review)状态色, 与 Coolie Web 的 violet 对齐
  // 边框(半透明白, 不用实色深边)
  line: "rgba(255,255,255,0.08)",
  lineSubtle: "rgba(255,255,255,0.05)",
} as const;

export type ColorToken = keyof typeof C;
