import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import {
  assigneeOptionsTitleFor,
  thinkingEffortOptionsFor,
  type AdapterModel,
  type IssueModelLane,
} from "@coolie/api-client";
import { C } from "../../theme";
import { coolie } from "../../coolie";
import { ComposerChip } from "./Chip";

/**
 * h5 指派人的模型选项面板 —— Coolie Web NewIssueDialog
 * 「Claude / Codex / OpenCode options」区块的镜像, 与 expo 端
 * `AssigneeOptionsPanel.tsx` 同一语义。
 *
 * 门控同上游: 只有所选负责人的适配器在 `ISSUE_OVERRIDE_ADAPTER_TYPES` 里才出现;
 * 面板里是 **Model lane** (primary / custom)、以及 custom 下的 **模型**选择、
 * **Thinking effort** 胶囊, 和 `claude_local` 专属的 **--chrome** 开关。四个值
 * 最终合并成一个 `assigneeAdapterOverrides` 字段 (见 `buildAssigneeAdapterOverrides`)。
 */
export function AssigneeOptionsPanel({
  companyId,
  open,
  onToggleOpen,
  adapterType,
  lane,
  onLaneChange,
  modelOverride,
  onModelOverrideChange,
  thinkingEffort,
  onThinkingEffortChange,
  chrome,
  onChromeChange,
}: {
  companyId: string | null;
  open: boolean;
  onToggleOpen: () => void;
  adapterType: string | null;
  lane: IssueModelLane;
  onLaneChange: (lane: IssueModelLane) => void;
  modelOverride: string;
  onModelOverrideChange: (model: string) => void;
  thinkingEffort: string;
  onThinkingEffortChange: (effort: string) => void;
  chrome: boolean;
  onChromeChange: (enabled: boolean) => void;
}) {
  const [models, setModels] = useState<AdapterModel[]>([]);

  // 模型列表同上游的 `agentsApi.adapterModels`: 只在面板打开且处于 custom lane
  // 时拉取, 适配器一变就丢掉旧列表, 免得从一个过期的候选里选。
  useEffect(() => {
    if (!companyId || !open || lane !== "custom" || !adapterType) {
      setModels([]);
      return;
    }
    let cancelled = false;
    void coolie
      .listAdapterModels(companyId, adapterType)
      .then((rows) => {
        if (!cancelled) setModels(rows);
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, adapterType, open, lane]);

  const effortOptions = thinkingEffortOptionsFor(adapterType);
  const toggle = useCallback(() => onToggleOpen(), [onToggleOpen]);

  return (
    <div style={blockStyle}>
      <button
        type="button"
        aria-expanded={open}
        style={triggerStyle}
        onClick={toggle}
      >
        <span aria-hidden>{open ? "▾" : "▸"}</span>
        <span>{assigneeOptionsTitleFor(adapterType)}</span>
      </button>

      {open ? (
        <div style={panelStyle}>
          <div style={groupStyle}>
            <span style={groupLabelStyle}>Model lane</span>
            <div style={laneRowStyle}>
              {(["primary", "custom"] as const).map((value) => {
                const active = lane === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    style={{ ...laneStyle, ...(active ? laneActiveStyle : null) }}
                    onClick={() => onLaneChange(value)}
                  >
                    {value === "primary" ? "Primary" : "Custom"}
                  </button>
                );
              })}
            </div>
            <span style={hintStyle}>
              {lane === "primary"
                ? "Runs on the agent's primary model."
                : "Override the model and effort for this task only."}
            </span>
          </div>

          {lane === "custom" ? (
            <div style={groupStyle}>
              <span style={groupLabelStyle}>Model</span>
              <div style={chipsStyle}>
                <ComposerChip
                  label="Default model"
                  active={modelOverride === ""}
                  onClick={() => onModelOverrideChange("")}
                />
                {models.map((model) => (
                  <ComposerChip
                    key={model.id}
                    label={model.label}
                    active={modelOverride === model.id}
                    onClick={() => onModelOverrideChange(model.id)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {lane === "custom" ? (
            <div style={groupStyle}>
              <span style={groupLabelStyle}>Thinking effort</span>
              <div style={wrapStyle}>
                {effortOptions.map((option) => (
                  <ComposerChip
                    key={option.value || "default"}
                    label={option.label}
                    active={thinkingEffort === option.value}
                    onClick={() => onThinkingEffortChange(option.value)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {adapterType === "claude_local" && lane === "custom" ? (
            <label style={switchRowStyle}>
              <span style={groupLabelStyle}>Enable Chrome (--chrome)</span>
              <input
                type="checkbox"
                checked={chrome}
                onChange={(event) => onChromeChange(event.target.checked)}
              />
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const blockStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };

const triggerStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  alignSelf: "flex-start",
  border: "none",
  background: "transparent",
  color: C.ink3,
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  padding: 0,
};

const panelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  borderRadius: 8,
  border: `1px solid ${C.line}`,
  background: "rgba(255,255,255,0.02)",
  padding: 12,
};

const groupStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };

const groupLabelStyle: CSSProperties = { color: C.ink3, fontSize: 12 };

const laneRowStyle: CSSProperties = {
  display: "flex",
  overflow: "hidden",
  borderRadius: 8,
  border: `1px solid ${C.line}`,
};

const laneStyle: CSSProperties = {
  flex: 1,
  padding: "6px 0",
  border: "none",
  background: "transparent",
  color: C.ink3,
  fontSize: 12,
  cursor: "pointer",
};

const laneActiveStyle: CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  color: C.ink,
};

const hintStyle: CSSProperties = { color: C.ink4, fontSize: 11 };

const chipsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  overflowX: "auto",
  paddingBottom: 2,
};

const wrapStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6 };

const switchRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  borderRadius: 8,
  border: `1px solid ${C.line}`,
  padding: "6px 8px",
  cursor: "pointer",
};
