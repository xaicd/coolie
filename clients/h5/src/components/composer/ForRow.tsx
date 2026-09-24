import type { Agent } from "@coolie/api-client";
import { ComposerChip, rowChipsStyle, rowLabelStyle, rowStyle } from "./Chip";

/**
 * h5 `For [assignee]` 行 —— Coolie Web NewIssueDialog assignee 选择器的镜像,
 * 与 expo 端 `ForRow.tsx` 同一份 props/语义 (选中值就是 `assigneeAgentId`)。
 *
 * 上游那个行是 `InlineEntitySelector` (联想下拉, 选项 = 当前用户 + 公司成员 +
 * 智能体, `noneLabel="No assignee"`)。这里同样给「不指派」+ 智能体两组选项,
 * 但用 chips 呈现 —— h5 这版没有公司成员目录, 也还没有联想输入的必要。
 */
export function ForRow({
  agents,
  value,
  onChange,
}: {
  agents: Agent[];
  /** 选中的 `assigneeAgentId`; `null` 表示交给系统路由。 */
  value: string | null;
  onChange: (assigneeAgentId: string | null) => void;
}) {
  return (
    <div style={rowStyle}>
      <span style={rowLabelStyle}>For</span>
      <div style={rowChipsStyle}>
        <ComposerChip
          label="自动派发"
          active={value === null}
          onClick={() => onChange(null)}
          title="不指定负责人, 由系统自动派发"
        />
        {agents.map((agent) => (
          <ComposerChip
            key={agent.id}
            label={agent.name}
            active={value === agent.id}
            onClick={() => onChange(agent.id)}
            /* wave65 — boss 25:00 '工坊 5 角色员工 描述都去掉'.
                选 agent 悬浮 tooltip 不再显示长描述, 只用 role 短标签. */
            title={agent.role ?? agent.name}
          />
        ))}
      </div>
    </div>
  );
}
