import { memo, useCallback } from "react";
import { SegmentedControl } from "../ui/SegmentedControl";
import { VIEW_OPTIONS, type IssuesView } from "../hooks/useTasksFilter";

/**
 * 任务页视图切换: 列表 / 分组 / 看板 (wave254 抽出 + memo)。
 *
 * 用 useCallback 包 onChange, SegmentedControl 收到稳定回调 + 稳定 options,
 * 视图态切换之外的重渲不会让它动。
 */
export const TasksScreenViewSwitch = memo(function TasksScreenViewSwitch({
  value,
  onChange,
}: {
  value: IssuesView;
  onChange: (next: IssuesView) => void;
}) {
  const handleChange = useCallback(
    (key: string) => onChange(key as IssuesView),
    [onChange],
  );
  const options = VIEW_OPTIONS.map((o) => ({ key: o.key, label: o.label }));
  return <SegmentedControl options={options} value={value} onChange={handleChange} />;
});