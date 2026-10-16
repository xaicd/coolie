/**
 * App 强更 / 热更 呈现仲裁 —— 纯函数模块。
 *
 * 刻意不 import 任何 React Native / expo-* 运行时, 好处是 node 端 (vitest
 * `tests/ota-runtime`) 可直接覆盖分流规则; App 端只消费结果。
 * 协议契约以 `docs/09_operations/ota-version-protocol.md` 为准。
 *
 * `checkAppVersion()` 给出的是「是否要打扰用户 + 是否强制」两个布尔:
 *   - updateAvailable=false              → 静默 (热更已由 expo-updates 后台接管或已最新)
 *   - updateAvailable=true, force=false  → 可关闭的整包升级提示 (banner)
 *   - updateAvailable=true, force=true   → 强更门禁 (gate, 不可关闭, 只能升级)
 *
 * 仲裁优先级: 强更 > 可选升级 > 静默热更。
 */

/** 与 `AppVersion.ts` 的 `VersionCheckResult` 对齐的最小结构 (避免循环依赖) */
export interface UpdateVerdictLike {
  updateAvailable: boolean;
  forceUpdate: boolean;
}

export type UpdatePresentation = "gate" | "banner" | "none";

export function resolveUpdatePresentation(verdict: UpdateVerdictLike): UpdatePresentation {
  if (!verdict.updateAvailable) return "none";
  return verdict.forceUpdate ? "gate" : "banner";
}
