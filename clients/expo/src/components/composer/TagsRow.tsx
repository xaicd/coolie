import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { IssueLabel } from "@coolie/api-client";
import { C } from "../../coolie";
import { SPACING } from "../../ui/tokens";
import { ComposerChip } from "./Chip";

/** 无 color 时的兜底色, 与 Coolie Web 标签胶囊的默认一致。 */
const SEED_COLOR = "#8A8F98";

/**
 * 新建任务的「标签」行 —— App 侧的 Coolie Web 标签选择器。
 *
 * 上游对话框里的 Labels 胶囊目前是注释掉的占位 (「not wired up yet」), 但
 * **建单契约本身支持标签**: `createIssueBaseSchema.labelIds` → `issue_labels`
 * 关联表。所以这里按 For / in 两行的同一形状 (横向胶囊轨) 把公司标签列出来,
 * 选中的 id 走 `labelIds` 提交 —— 用的是上游字段, 不是自创的一套。
 *
 * 公司一个标签都没有时不显示空轨, 直接说明去哪里建。
 */
export function TagsRow({
  labels,
  selected,
  onChange,
}: {
  labels: IssueLabel[];
  /** 已选中的 label id。 */
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
    <View style={styles.row}>
      <Text style={styles.label}>标签</Text>
      {labels.length === 0 ? (
        <Text style={styles.empty}>暂无标签 (在 Coolie Web 的标签页新建)</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          keyboardShouldPersistTaps="handled"
        >
          {labels.map((label) => (
            <ComposerChip
              key={label.id}
              label={label.name}
              active={selected.includes(label.id)}
              onPress={() => toggle(label.id)}
              dotColor={label.color ?? SEED_COLOR}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  label: {
    color: C.ink4,
    fontSize: 13,
  },
  empty: {
    color: C.ink4,
    fontSize: 12,
    flexShrink: 1,
  },
  chips: {
    gap: 6,
    paddingRight: SPACING.md,
  },
});
