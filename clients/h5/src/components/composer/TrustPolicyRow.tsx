import type { CSSProperties } from "react";
import {
  TRUST_PRESET_DESCRIPTION,
  TRUST_PRESET_LABEL,
  getTrustPreset,
  type AgentPermissions,
} from "@coolie/api-client";
import { C } from "../../theme";

/**
 * h5 信任策略行 —— Coolie Web NewIssueDialog 信任级别提示的镜像,
 * 与 expo 端 `TrustPolicyRow.tsx` 同一语义。
 *
 * 上游不把信任级别做成可选项: 它是**被指派人自身的属性**
 * (`agent.permissions.trustPreset`), 表现为指派人选项上的盾牌徽标 + 选中低信任
 * 复核负责人时的黄色提示条。这里把同一条信息单独成一行 —— 数据同源
 * (`getTrustPreset`), 不新增可写字段。
 *
 * 没选负责人 (自动派发) 时不显示级别: 那时没有「谁的信任级别」可言, 编一个默认值
 * 出来只会让人以为已经定了。
 */
export function TrustPolicyRow({
  assigneeName,
  permissions,
}: {
  assigneeName: string | null;
  permissions?: AgentPermissions | null;
}) {
  if (!assigneeName) {
    return (
      <div style={rowStyle}>
        <span style={labelStyle}>信任策略</span>
        <span style={{ color: C.ink4, fontSize: 12 }}>未指派负责人 —— 信任级别随负责人确定</span>
      </div>
    );
  }

  const preset = getTrustPreset(permissions);
  const lowTrust = preset === "low_trust_review";
  // 接口给了 permissions 才敢说「这是当前值」; 没给就只说默认值, 不假装读到了。
  const known = permissions !== undefined && permissions !== null;

  return (
    <div style={blockStyle}>
      <div style={rowStyle}>
        <span style={labelStyle}>信任策略</span>
        <span style={{ ...chipStyle, ...(lowTrust ? chipWarnStyle : null) }}>
          <span aria-hidden>{lowTrust ? "🛡" : "✅"}</span>
          <span style={{ color: lowTrust ? C.warn : C.ink3 }}>{TRUST_PRESET_LABEL[preset]}</span>
        </span>
        <span style={{ color: C.ink4, fontSize: 12 }}>{assigneeName}</span>
      </div>
      <span style={hintStyle}>
        {TRUST_PRESET_DESCRIPTION[preset]}
        {known ? "" : " (实例未回传该负责人的权限文档, 按默认级别显示)"}
      </span>
    </div>
  );
}

const blockStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };

const rowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8, minWidth: 0 };

const labelStyle: CSSProperties = { color: C.ink4, fontSize: 13, flexShrink: 0 };

const chipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "6px 10px",
  borderRadius: 999,
  border: `1px solid ${C.line}`,
  background: "rgba(255,255,255,0.02)",
  fontSize: 12,
  fontWeight: 500,
};

const chipWarnStyle: CSSProperties = {
  borderColor: "rgba(245, 158, 11, 0.25)",
  background: "rgba(245, 158, 11, 0.1)",
};

const hintStyle: CSSProperties = { color: C.ink4, fontSize: 11, lineHeight: "16px" };
