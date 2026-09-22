import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, type AgentRow } from "../../coolie";
import { SPACING } from "../../ui/tokens";
import { ComposerChip } from "./Chip";

/**
 * The composer's `For [assignee]` row — the App half of the Coolie Web
 * `NewIssueDialog` assignee selector.
 *
 * Upstream, that row is an `InlineEntitySelector` over `assigneeOptions`, built
 * from `currentUserAssigneeOption` + company users + agents, with
 * `noneLabel="No assignee"` and a `parseAssigneeValue`-encoded `agent:`/`user:`
 * value. The App has no company-user directory to list and no room for a
 * type-ahead popover in a sheet, so this renders the same option set as a
 * horizontal chip rail: none + agents (+ the current user, when the caller can
 * name one). Selection is still a plain assignee id — the create payload field
 * stays `assigneeAgentId`/`assigneeUserId`, exactly like upstream.
 */
export function ForRow({
  agents,
  value,
  onChange,
  currentUser,
}: {
  agents: AgentRow[];
  /** Selected `assigneeAgentId`; `null` means "let the system route it". */
  value: string | null;
  onChange: (assigneeAgentId: string | null) => void;
  /** Optional human assignee. Omitted when the caller cannot name a user id. */
  currentUser?: { id: string; label: string };
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>For</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        keyboardShouldPersistTaps="handled"
      >
        <ComposerChip
          label="自动派发"
          active={value === null}
          onPress={() => onChange(null)}
          icon={<Ionicons name="sparkles-outline" size={13} color={value === null ? C.ink : C.ink3} />}
        />
        {currentUser ? (
          <ComposerChip
            label={currentUser.label}
            active={value === currentUser.id}
            onPress={() => onChange(currentUser.id)}
            icon={
              <Ionicons
                name="person-outline"
                size={13}
                color={value === currentUser.id ? C.ink : C.ink3}
              />
            }
          />
        ) : null}
        {agents.map((agent) => (
          <ComposerChip
            key={agent.id}
            label={agent.name}
            active={value === agent.id}
            onPress={() => onChange(agent.id)}
            icon={
              <Ionicons
                name="person-circle-outline"
                size={14}
                color={value === agent.id ? C.ink : C.ink3}
              />
            }
          />
        ))}
      </ScrollView>
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
  chips: {
    gap: 6,
    paddingRight: SPACING.md,
  },
});
