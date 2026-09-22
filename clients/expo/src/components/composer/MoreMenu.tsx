import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../../coolie";
import { ELEVATION, RADIUS, SPACING } from "../../ui/tokens";

/**
 * 可选栏位的键 —— 与 `ComposerForm` 里四个二级区块一一对应。
 *
 * 上游 `NewIssueDialog` 的「⋯」有两处: For/in 行尾那个展开 Reviewer / Approver /
 * Watchdog 三个可选行, 属性条那个展开 Start date / Due date。App 的 For/in 只有
 * 一排胶囊没有行尾 ⋯, 所以这里合到属性条这一个「⋯」上, 展开 brief 指定的四项
 * (标签 / 截止日期 / 信任策略 / Markdown 编辑器), 每一项**开关**对应的区块 ——
 * 与上游「⋯ 切换可选行」是同一种交互, 展开的项都是真能写进任务或真能操作的,
 * 没有摆着不动的死按钮。
 */
export type ComposerSection = "tags" | "dueDate" | "trustPolicy" | "markdown";

const ROWS: { key: ComposerSection; icon: string; label: string }[] = [
  { key: "tags", icon: "pricetag-outline", label: "标签" },
  { key: "dueDate", icon: "calendar-outline", label: "截止日期" },
  { key: "trustPolicy", icon: "shield-checkmark-outline", label: "信任策略" },
  { key: "markdown", icon: "document-text-outline", label: "Markdown 编辑器" },
];

/**
 * 「⋯ 更多」——属性条最后一个胶囊, 展开二级菜单。
 *
 * `dueDate` 单独处理: 平台的 issue 模型没有截止日期字段
 * (`packages/db/src/schema/issues.ts` 里没有该列, `createIssueBaseSchema` 也不收),
 * 所以这一项**不能**做成一个选了却发不出去的日期选择器 —— 点开它会就地说明原因,
 * 而不是给一个静默丢弃输入的控件。上游的 Due date 同样是占位按钮。
 */
export function MoreMenu({
  sections,
  onToggle,
  disabled = false,
}: {
  /** 当前展开的可选区块。 */
  sections: ReadonlySet<ComposerSection>;
  onToggle: (section: ComposerSection) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [dueDateNoteShown, setDueDateNoteShown] = useState(false);

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="更多"
        onPress={() => setOpen((v) => !v)}
        disabled={disabled}
        style={({ pressed }) => [
          styles.chip,
          open && styles.chipOpen,
          pressed && styles.chipPressed,
          disabled && styles.disabled,
        ]}
      >
        <Ionicons name="ellipsis-horizontal" size={15} color={open ? C.ink : C.ink3} />
      </Pressable>

      {open && !disabled ? (
        <View style={styles.menu}>
          {ROWS.map((row) => {
            const active = sections.has(row.key);
            const unsupported = row.key === "dueDate";
            return (
              <Pressable
                key={row.key}
                accessibilityRole="button"
                accessibilityLabel={row.label}
                accessibilityState={{ selected: active }}
                onPress={() => {
                  if (unsupported) {
                    setDueDateNoteShown((v) => !v);
                    return;
                  }
                  onToggle(row.key);
                }}
                style={({ pressed }) => [
                  styles.menuItem,
                  active && styles.menuItemActive,
                  pressed && styles.menuItemPressed,
                ]}
              >
                <Ionicons
                  name={row.icon as React.ComponentProps<typeof Ionicons>["name"]}
                  size={14}
                  color={active ? C.ink : C.ink3}
                />
                <Text style={[styles.menuLabel, active && styles.menuLabelActive]}>
                  {row.label}
                </Text>
                {unsupported ? (
                  <Ionicons name="information-circle-outline" size={13} color={C.ink4} />
                ) : active ? (
                  <Ionicons name="checkmark" size={14} color={C.accent} />
                ) : null}
              </Pressable>
            );
          })}

          {dueDateNoteShown ? (
            <Text style={styles.note}>
              此实例的任务模型没有截止日期字段, 建任务时无法设置 —— 与上游
              NewIssueDialog 的 Due date 占位按钮一致。
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: SPACING.xs,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: ELEVATION.base,
  },
  chipOpen: {
    borderColor: C.brand,
  },
  chipPressed: {
    backgroundColor: ELEVATION.active,
  },
  disabled: {
    opacity: 0.4,
  },
  menu: {
    width: 240,
    gap: 2,
    padding: SPACING.xs,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.surface,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 7,
    borderRadius: RADIUS.sm,
  },
  menuItemActive: {
    backgroundColor: ELEVATION.active,
  },
  menuItemPressed: {
    backgroundColor: ELEVATION.hover,
  },
  menuLabel: {
    flex: 1,
    color: C.ink2,
    fontSize: 13,
  },
  menuLabelActive: {
    color: C.ink,
    fontWeight: "500",
  },
  note: {
    color: C.ink4,
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: SPACING.sm,
    paddingTop: SPACING.xs,
    maxWidth: 260,
  },
});
