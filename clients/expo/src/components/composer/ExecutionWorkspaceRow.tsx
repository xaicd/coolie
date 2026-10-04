/**
 * [停用预留 · d5e3fac7 问②B 裁决] 零挂载死件, 保留不删 (2026-10-04 复核仍零消费)。
 * 宿主 ComposeScreen 随方案1 (b56f6ac94「+号直通两卡」) 精简退役后, composer
 * 展示层家族整体失宅 (import 级复核见 COOA-4 评论 1a5edf60)。勿当现役链路引用,
 * 勿在无关波次顺手改造 (wave132 误养先例); 复活需先重建宿主入口。
 */
import { StyleSheet, Text, View } from "react-native";
import { EXECUTION_WORKSPACE_MODES } from "@coolie/api-client";
import { C } from "../../coolie";
import { SPACING } from "../../ui/tokens";
import { ComposerChip } from "./Chip";

/**
 * The Execution workspace row — the App half of the upstream
 * `NewIssueDialog` execution-workspace block.
 *
 * Upstream renders a `<select>` of `EXECUTION_WORKSPACE_MODES` ("Project
 * default" / "New isolated workspace" / "Reuse existing workspace"), and only
 * when the chosen project enables isolated workspaces
 * (`project.executionWorkspacePolicy.enabled`). The App has no native select, so
 * the same three options render as a chip rail; the chosen value travels as
 * `executionWorkspacePreference` + `executionWorkspaceSettings.mode` on create.
 *
 * Upstream's "reuse existing" branch also lists the reusable workspaces of the
 * project. The clients have no workspace-summary endpoint, so `reuse_existing`
 * is offered but nothing is pre-selected — the server falls back to its project
 * default instead of the App sending a guessed workspace id.
 */
export function ExecutionWorkspaceRow({
  value,
  onChange,
}: {
  value: string;
  onChange: (mode: string) => void;
}) {
  return (
    <View style={styles.block}>
      <Text style={styles.title}>Execution workspace</Text>
      <Text style={styles.description}>
        Control whether this task runs in the shared workspace, a new isolated workspace, or an
        existing one.
      </Text>
      <View style={styles.chips}>
        {EXECUTION_WORKSPACE_MODES.map((option) => (
          <ComposerChip
            key={option.value}
            label={option.label}
            active={value === option.value}
            onPress={() => onChange(option.value)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: SPACING.sm,
  },
  title: {
    color: C.ink2,
    fontSize: 12,
    fontWeight: "500",
  },
  description: {
    color: C.ink4,
    fontSize: 11,
    lineHeight: 16,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
});
