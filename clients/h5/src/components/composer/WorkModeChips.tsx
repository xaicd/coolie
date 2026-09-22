import { workModeOptions, type IssueWorkMode } from "@coolie/api-client";
import { C } from "../../theme";
import { ComposerChip, rowChipsStyle, rowLabelStyle, rowStyle } from "./Chip";

/**
 * h5 work-mode chips —— Coolie Web NewIssueDialog work-mode 选择器的镜像,
 * 与 expo 端 `WorkModeChips.tsx` 同一份选项与英文标签。
 *
 * 选项/标签来自 `@coolie/api-client` 的 `workModeOptions()` (上游
 * `ui/src/lib/work-mode-meta.ts` 的镜像): 三个可选模式, 顺序同上游。这里只多
 * 一点色调 —— 上游是 neutral / amber(planning) / sky(ask)。
 */
export function WorkModeChips({
  value,
  onChange,
}: {
  value: IssueWorkMode;
  onChange: (mode: IssueWorkMode) => void;
}) {
  return (
    <div style={rowStyle}>
      <span style={rowLabelStyle}>Mode</span>
      <div style={rowChipsStyle}>
        {workModeOptions().map((option) => (
          <ComposerChip
            key={option.value}
            label={option.label}
            active={option.value === value}
            onClick={() => onChange(option.value)}
            title={option.hint}
            icon={<span style={{ color: TINT[option.value], fontSize: 12 }}>{GLYPH[option.value]}</span>}
          />
        ))}
      </div>
    </div>
  );
}

const GLYPH: Record<IssueWorkMode, string> = {
  standard: "🔨",
  planning: "📋",
  ask: "❓",
  // 选择器不提供, 但映射保持完备
  skill_test: "🧪",
};

const TINT: Record<IssueWorkMode, string> = {
  standard: C.ink3,
  planning: C.warn,
  ask: C.accent,
  skill_test: C.ink3,
};
