import type { IssueLabel } from "@coolie/api-client";
import { C } from "../../theme";
import { ComposerChip, rowChipsStyle, rowLabelStyle, rowStyle } from "./Chip";

/** 无 color 时的兜底色, 与 Coolie Web 标签胶囊的默认一致。 */
const SEED_COLOR = "#8A8F98";

/**
 * h5 任务标签行 —— Coolie Web 标签选择器的镜像, 与 expo 端 `TagsRow.tsx` 同一语义。
 *
 * 上游对话框里的 Labels 胶囊目前是注释掉的占位, 但建单契约支持标签
 * (`createIssueBaseSchema.labelIds` → `issue_labels` 关联表), 所以这里按 For / in
 * 两行同一形状把公司标签列出来, 选中的 id 走 `labelIds` 提交。
 *
 * 公司一个标签都没有时不显示空轨, 直接说明去哪里建。
 */
export function TagsRow({
  labels,
  selected,
  onChange,
}: {
  labels: IssueLabel[];
  selected: string[];
  onChange: (labelIds: string[]) => void;
}) {
  const toggle = (labelId: string) => {
    onChange(
      selected.includes(labelId)
        ? selected.filter((id) => id !== labelId)
        : [...selected, labelId],
    );
  };

  return (
    <div style={rowStyle}>
      <span style={rowLabelStyle}>标签</span>
      {labels.length === 0 ? (
        <span style={{ color: C.ink4, fontSize: 12 }}>暂无标签 (在 Coolie Web 的标签页新建)</span>
      ) : (
        <div style={rowChipsStyle}>
          {labels.map((label) => (
            <ComposerChip
              key={label.id}
              label={label.name}
              active={selected.includes(label.id)}
              onClick={() => toggle(label.id)}
              dotColor={label.color ?? SEED_COLOR}
              title={label.description ?? label.name}
            />
          ))}
        </div>
      )}
    </div>
  );
}
