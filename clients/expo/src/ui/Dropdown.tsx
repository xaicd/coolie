import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../coolie";
import { ELEVATION, RADIUS, SPACING } from "./tokens";

/**
 * 下拉框 —— boss 09-22 23:35「该用下拉框的别展开」。
 *
 * 上层表单里所有单选字段 (负责人 / 项目 / 状态 / 工作模式 / 复核人 …) 都走这一个
 * 组件: 触发行显示当前值, 点开在一层 Modal 里列出选项, 选一个即收起。
 * 用 RN Modal 而不是就地展开的胶囊轨 —— 后者会把下面的字段顶走 (实测点完状态再点
 * 旁边按钮会落空), 也正是 boss 说的「别展开」。
 *
 * 多选 (标签) 用同一个组件: `multiple` 打开后逐项勾选, 底部「完成」收起。
 *
 * 不引入第三方 picker: 跨平台行为一致, 也不增原生依赖。
 */
export interface DropdownOption {
  value: string;
  label: string;
  /** 选项下方的一行说明 (可选)。 */
  hint?: string;
  /** 选项前的小圆点 (状态色 / 项目色 / 标签色)。 */
  dotColor?: string;
}

export function Dropdown({
  label,
  options,
  selected,
  onToggle,
  multiple = false,
  placeholder = "请选择",
  disabled = false,
}: {
  /** 左侧字段名, 如「负责人」。 */
  label: string;
  options: DropdownOption[];
  /** 已选项 value; 单选取第一个。 */
  selected: string[];
  /** 选中/取消一项。单选由调用方负责替换, 多选由调用方负责增删。 */
  onToggle: (value: string) => void;
  multiple?: boolean;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const current = options.filter((option) => selected.includes(option.value));
  const summary =
    current.length === 0
      ? ""
      : multiple
        ? `已选 ${current.length} 项`
        : (current[0]?.label ?? "");

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${summary || placeholder}`}
        accessibilityState={{ expanded: open }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.trigger,
          pressed && styles.triggerPressed,
          disabled && styles.disabled,
        ]}
      >
        <Text
          style={[styles.value, !summary && styles.placeholder]}
          numberOfLines={1}
        >
          {summary || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={14} color={C.ink4} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          {/* 吃掉面板内的点击, 不让它穿透到背景关闭 */}
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{label}</Text>
              <Pressable hitSlop={10} onPress={() => setOpen(false)}>
                <Ionicons name="close" size={18} color={C.ink3} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.listContent}
            >
              {options.length === 0 ? (
                <Text style={styles.empty}>暂无可选项</Text>
              ) : (
                options.map((option) => {
                  const active = selected.includes(option.value);
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => {
                        onToggle(option.value);
                        if (!multiple) setOpen(false);
                      }}
                      style={({ pressed }) => [
                        styles.item,
                        active && styles.itemActive,
                        pressed && styles.itemPressed,
                      ]}
                    >
                      {option.dotColor ? (
                        <View style={[styles.dot, { backgroundColor: option.dotColor }]} />
                      ) : null}
                      <View style={styles.itemText}>
                        <Text style={[styles.itemLabel, active && styles.itemLabelActive]}>
                          {option.label}
                        </Text>
                        {option.hint ? <Text style={styles.itemHint}>{option.hint}</Text> : null}
                      </View>
                      {active ? <Ionicons name="checkmark" size={16} color={C.accent} /> : null}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>

            {multiple && options.length > 0 ? (
              <Pressable
                style={styles.doneBtn}
                onPress={() => setOpen(false)}
                accessibilityRole="button"
              >
                <Text style={styles.doneText}>完成</Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
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
    minWidth: 52,
  },
  trigger: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: ELEVATION.base,
  },
  triggerPressed: {
    backgroundColor: ELEVATION.active,
  },
  value: {
    flex: 1,
    color: C.ink,
    fontSize: 13,
    fontWeight: "500",
  },
  placeholder: {
    color: C.ink4,
    fontWeight: "400",
  },
  disabled: {
    opacity: 0.4,
  },
  backdrop: {
    flex: 1,
    justifyContent: "center",
    padding: SPACING.xl,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    maxHeight: "70%",
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.panel,
    overflow: "hidden",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  sheetTitle: {
    color: C.ink,
    fontSize: 15,
    fontWeight: "600",
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingVertical: SPACING.xs,
  },
  empty: {
    color: C.ink4,
    fontSize: 13,
    padding: SPACING.lg,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  itemActive: {
    backgroundColor: ELEVATION.active,
  },
  itemPressed: {
    backgroundColor: ELEVATION.hover,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  itemText: {
    flex: 1,
    minWidth: 0,
  },
  itemLabel: {
    color: C.ink2,
    fontSize: 14,
  },
  itemLabelActive: {
    color: C.ink,
    fontWeight: "600",
  },
  itemHint: {
    color: C.ink4,
    fontSize: 11,
    marginTop: 2,
  },
  doneBtn: {
    alignItems: "center",
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: C.lineSubtle,
  },
  doneText: {
    color: C.accent,
    fontSize: 14,
    fontWeight: "600",
  },
});
