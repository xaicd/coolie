/**
 * [停用预留 · d5e3fac7 问②B 裁决] 零挂载死件, 保留不删 (2026-10-04 复核仍零消费)。
 * 宿主 ComposeScreen 随方案1 (b56f6ac94「+号直通两卡」) 精简退役后, composer
 * 展示层家族整体失宅 (import 级复核见 COOA-4 评论 1a5edf60)。勿当现役链路引用,
 * 勿在无关波次顺手改造 (wave132 误养先例); 复活需先重建宿主入口。
 */
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../../coolie";
import { ELEVATION, RADIUS, SPACING } from "../../ui/tokens";

/**
 * The composer's inline note — the App half of the upstream `NewIssueDialog`
 * notes that sit between the property bar and the footer.
 *
 * Upstream renders four of them under `DialogContent`:
 *
 *   - **assigned + backlog**: "Assigning implies executable intent — leave status
 *     as Backlog only to deliberately park this…" (`Flag`, amber);
 *   - **paused assignee**: "X is paused and will not start work…"
 *     (`InlineBanner tone="warning"`, `PauseCircle`), including the
 *     "arrived paused from an organization import" variant;
 *   - **low-trust assignee**: "Low-trust review agent. It can only act inside its
 *     assigned review boundary…" (`ShieldAlert`, amber);
 *   - **missing user secrets**: the `MissingUserSecretsBanner` block.
 *
 * One component covers the first three, since they differ only in tone and icon;
 * the secrets banner has no client-side secrets API and is not reproduced here.
 */
export function ComposerNote({
  icon,
  children,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  children: React.ReactNode;
}) {
  return (
    <View style={styles.note}>
      <Ionicons name={icon} size={14} color={C.warn} style={styles.icon} />
      <Text style={styles.text}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.25)",
    backgroundColor: ELEVATION.base,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  icon: {
    marginTop: 1,
  },
  text: {
    flex: 1,
    color: C.ink2,
    fontSize: 12,
    lineHeight: 17,
  },
});
