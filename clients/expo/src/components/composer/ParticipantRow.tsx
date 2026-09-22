import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, type AgentRow } from "../../coolie";
import { ELEVATION, RADIUS, SPACING } from "../../ui/tokens";
import { ComposerChip } from "./Chip";

/**
 * The Reviewer / Approver rows — the App half of the upstream
 * `NewIssueDialog` review and approval selectors.
 *
 * Upstream renders each as an `InlineEntitySelector` over the same
 * `assigneeOptions` the assignee row uses, with an icon instead of the `For`
 * label, `noneLabel="No reviewer"` / `"No approver"`, and the chosen value then
 * travels as a review / approval stage in `executionPolicy` (see
 * `buildExecutionPolicy`). Same option set here (none + agents), rendered as a
 * chip rail like the assignee row already is.
 */
export function ParticipantRow({
  label,
  icon,
  agents,
  value,
  onChange,
  noneLabel,
  disabled = false,
}: {
  /** Row label, e.g. "Reviewer". */
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  agents: AgentRow[];
  /** Selected agent id; `null` means the row is unset. */
  value: string | null;
  onChange: (agentId: string | null) => void;
  /** Label of the clear chip, e.g. "No reviewer". */
  noneLabel: string;
  disabled?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.labelSlot}>
        <Ionicons name={icon} size={14} color={C.ink4} />
        <Text style={styles.label}>{label}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        keyboardShouldPersistTaps="handled"
      >
        <ComposerChip
          label={noneLabel}
          active={value === null}
          onPress={() => onChange(null)}
          icon={<Ionicons name="remove-outline" size={13} color={value === null ? C.ink : C.ink3} />}
        />
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

/**
 * The Watchdog row — agent picker plus its instructions.
 *
 * Upstream puts the agent and the instruction textarea inside one popover
 * (`watchdogEditorOpen`) with a trigger that summarises the pair
 * ("Agent · instructions"), and a Remove button that clears both. The App has no
 * room for that popover in a sheet, so both fields are shown inline in the same
 * row group and the same two values are what the create payload carries under
 * `watchdog: { agentId, instructions }`.
 */
export function WatchdogRow({
  agents,
  agentId,
  instructions,
  onAgentChange,
  onInstructionsChange,
  disabled = false,
}: {
  agents: AgentRow[];
  agentId: string | null;
  instructions: string;
  onAgentChange: (agentId: string | null) => void;
  onInstructionsChange: (instructions: string) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.block}>
      <View style={styles.row}>
        <View style={styles.labelSlot}>
          <Ionicons name="scan-outline" size={14} color={C.ink4} />
          <Text style={styles.label}>Watchdog</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          keyboardShouldPersistTaps="handled"
        >
          <ComposerChip
            label="No watchdog agent"
            active={agentId === null}
            onPress={() => onAgentChange(null)}
            icon={<Ionicons name="remove-outline" size={13} color={agentId === null ? C.ink : C.ink3} />}
          />
          {agents.map((agent) => (
            <ComposerChip
              key={agent.id}
              label={agent.name}
              active={agentId === agent.id}
              onPress={() => onAgentChange(agent.id)}
              icon={
                <Ionicons
                  name="person-circle-outline"
                  size={14}
                  color={agentId === agent.id ? C.ink : C.ink3}
                />
              }
            />
          ))}
        </ScrollView>
      </View>

      {agentId ? (
        <TextInput
          style={styles.instructions}
          placeholder="What should the watchdog watch for and how should it keep work moving?"
          placeholderTextColor={C.ink4}
          value={instructions}
          onChangeText={onInstructionsChange}
          editable={!disabled}
          multiline
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  labelSlot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 0,
  },
  label: {
    color: C.ink4,
    fontSize: 13,
  },
  chips: {
    gap: 6,
    paddingRight: SPACING.md,
  },
  instructions: {
    color: C.ink2,
    fontSize: 13,
    lineHeight: 18,
    minHeight: 56,
    textAlignVertical: "top",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: ELEVATION.base,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
});
