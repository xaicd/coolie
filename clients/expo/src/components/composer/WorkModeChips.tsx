/**
 * [停用预留 · d5e3fac7 问②B 裁决] 零挂载死件, 保留不删 (2026-10-04 复核仍零消费)。
 * 宿主 ComposeScreen 随方案1 (b56f6ac94「+号直通两卡」) 精简退役后, composer
 * 展示层家族整体失宅 (import 级复核见 COOA-4 评论 1a5edf60)。勿当现役链路引用,
 * 勿在无关波次顺手改造 (wave132 误养先例); 复活需先重建宿主入口。
 */
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { workModeOptions, type IssueWorkMode } from "@coolie/api-client";
import { C } from "../../coolie";
import { SPACING } from "../../ui/tokens";
import { ComposerChip } from "./Chip";

/**
 * The composer's work-mode chips — the App half of the Coolie Web
 * `NewIssueDialog` work-mode picker.
 *
 * The option list and labels come from `@coolie/api-client` (`workModeOptions()`),
 * which mirrors upstream `ui/src/lib/work-mode-meta.ts`: three selectable modes
 * in upstream order, English labels so the i18n patch can key on them. Only the
 * icon (lucide upstream, Ionicons here) and the tint come from this file — the
 * web tones are neutral / amber (planning) / sky (ask).
 */
export function WorkModeChips({
  value,
  onChange,
}: {
  value: IssueWorkMode;
  onChange: (mode: IssueWorkMode) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>Mode</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        keyboardShouldPersistTaps="handled"
      >
        {workModeOptions().map((option) => {
          const active = option.value === value;
          const tint = active ? C.ink : WORK_MODE_TINT[option.value];
          return (
            <ComposerChip
              key={option.value}
              label={option.label}
              active={active}
              onPress={() => onChange(option.value)}
              accessibilityLabel={`${option.label}: ${option.hint}`}
              icon={<Ionicons name={WORK_MODE_ICON[option.value]} size={13} color={tint} />}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

const WORK_MODE_ICON: Record<IssueWorkMode, React.ComponentProps<typeof Ionicons>["name"]> = {
  standard: "hammer-outline",
  planning: "clipboard-outline",
  ask: "help-circle-outline",
  // Never a chip (the picker excludes it), but the map stays total.
  skill_test: "flask-outline",
};

const WORK_MODE_TINT: Record<IssueWorkMode, string> = {
  standard: C.ink3,
  planning: C.warn,
  ask: C.accent,
  skill_test: C.ink3,
};

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
  chips: {
    gap: 6,
    paddingRight: SPACING.md,
  },
});
