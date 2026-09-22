import type { CSSProperties } from "react";
import { EXECUTION_WORKSPACE_MODES } from "@coolie/api-client";
import { C } from "../../theme";
import { ComposerChip } from "./Chip";

/**
 * h5 执行工作区行 —— Coolie Web NewIssueDialog 执行工作区块的镜像,
 * 与 expo 端 `ExecutionWorkspaceRow.tsx` 同一语义。
 *
 * 上游是一个 `EXECUTION_WORKSPACE_MODES` 的 `<select>`, 且只在所选项目启用隔离
 * 工作区 (`project.executionWorkspacePolicy.enabled`) 时出现。这里保留那个门控,
 * 用同样三个选项的 chips 呈现; 选中值经 `executionWorkspacePreference` +
 * `executionWorkspaceSettings.mode` 发出。
 *
 * 上游 "reuse existing" 分支还会列出项目的可复用工作区; 客户端没有工作区摘要
 * 端点, 所以这一项可选但不预选 —— 由服务端回落到项目默认, 而不是 App 猜一个 id。
 */
export function ExecutionWorkspaceRow({
  value,
  onChange,
}: {
  value: string;
  onChange: (mode: string) => void;
}) {
  return (
    <div style={blockStyle}>
      <span style={titleStyle}>Execution workspace</span>
      <span style={descriptionStyle}>
        Control whether this task runs in the shared workspace, a new isolated workspace, or an
        existing one.
      </span>
      <div style={wrapStyle}>
        {EXECUTION_WORKSPACE_MODES.map((option) => (
          <ComposerChip
            key={option.value}
            label={option.label}
            active={value === option.value}
            onClick={() => onChange(option.value)}
          />
        ))}
      </div>
    </div>
  );
}

const blockStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };

const titleStyle: CSSProperties = { color: C.ink2, fontSize: 12, fontWeight: 500 };

const descriptionStyle: CSSProperties = { color: C.ink4, fontSize: 11, lineHeight: "16px" };

const wrapStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6 };
