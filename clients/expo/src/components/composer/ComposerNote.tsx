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
