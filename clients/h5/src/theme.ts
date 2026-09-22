/**
 * h5 色彩令牌 —— 与 Coolie Web / App 同一套 Linear 深色阶梯。
 *
 * 各屏原先各自内联一份 `C`, 新增的 composer 子组件如果继续各写一份就会漂移;
 * 这里收一份给新组件用 (老屏的内联副本本波不动, 值本身一致)。
 */
export const C = {
  bg: "#08090A",
  panel: "#0F1011",
  surface: "#191A1B",
  surfaceHover: "#28282C",
  ink: "#F7F8F8",
  ink2: "#D0D6E0",
  ink3: "#8A8F98",
  ink4: "#62666D",
  accent: "#7170FF",
  brand: "#5E6AD2",
  accentHover: "#828FFF",
  ok: "#27A644",
  done: "#10B981",
  warn: "#F59E0B",
  err: "#EF4444",
  violet: "#8B5CF6",
  line: "rgba(255,255,255,0.08)",
  lineSubtle: "rgba(255,255,255,0.05)",
} as const;
