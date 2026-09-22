import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  assigneeOptionsTitleFor,
  thinkingEffortOptionsFor,
  type AdapterModel,
  type IssueModelLane,
} from "@coolie/api-client";
import { C, coolie } from "../../coolie";
import { ELEVATION, RADIUS, SPACING } from "../../ui/tokens";
import { ComposerChip } from "./Chip";

/**
 * The assignee's model options — the App half of the upstream
 * `NewIssueDialog` "Claude / Codex / OpenCode options" panel.
 *
 * Upstream shows this panel only when the selected assignee runs an adapter that
 * understands config overrides (`ISSUE_OVERRIDE_ADAPTER_TYPES`), collapses it
 * behind a chevron, and inside offers:
 *
 *   - a **Model lane** radio: `primary` (the agent's own model) or `custom`
 *     (override model / effort / chrome for this task only);
 *   - when `custom`: the **model** picker (`agentsApi.adapterModels`), the
 *     **thinking effort** chips (adapter-specific), and for `claude_local` the
 *     **`--chrome`** toggle.
 *
 * All four values collapse into `assigneeAdapterOverrides` on submit
 * (`buildAssigneeAdapterOverrides`), which is why the panel is one component —
 * its state is one payload field.
 */
export function AssigneeOptionsPanel({
  companyId,
  open,
  onToggleOpen,
  adapterType,
  lane,
  onLaneChange,
  modelOverride,
  onModelOverrideChange,
  thinkingEffort,
  onThinkingEffortChange,
  chrome,
  onChromeChange,
}: {
  companyId: string;
  open: boolean;
  onToggleOpen: () => void;
  /** The selected assignee's adapter type; the caller only renders this panel when it is overridable. */
  adapterType: string | null;
  lane: IssueModelLane;
  onLaneChange: (lane: IssueModelLane) => void;
  modelOverride: string;
  onModelOverrideChange: (model: string) => void;
  thinkingEffort: string;
  onThinkingEffortChange: (effort: string) => void;
  chrome: boolean;
  onChromeChange: (enabled: boolean) => void;
}) {
  const [models, setModels] = useState<AdapterModel[]>([]);

  // Model list mirrors upstream's `agentsApi.adapterModels` query: fetched only
  // while the panel is open on the custom lane, and dropped when the adapter
  // changes so a stale list cannot be picked from.
  useEffect(() => {
    if (!open || lane !== "custom" || !adapterType) {
      setModels([]);
      return;
    }
    let cancelled = false;
    void coolie
      .listAdapterModels(companyId, adapterType)
      .then((rows) => {
        if (!cancelled) setModels(rows);
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, adapterType, open, lane]);

  const effortOptions = thinkingEffortOptionsFor(adapterType);
  const toggle = useCallback(() => onToggleOpen(), [onToggleOpen]);

  return (
    <View style={styles.block}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={toggle}
        style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}
      >
        <Ionicons
          name={open ? "chevron-down" : "chevron-forward"}
          size={13}
          color={C.ink4}
        />
        <Text style={styles.triggerText}>{assigneeOptionsTitleFor(adapterType)}</Text>
      </Pressable>

      {open ? (
        <View style={styles.panel}>
          <View style={styles.group}>
            <Text style={styles.groupLabel}>Model lane</Text>
            <View style={styles.laneRow}>
              {(["primary", "custom"] as const).map((value) => {
                const active = lane === value;
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    onPress={() => onLaneChange(value)}
                    style={({ pressed }) => [
                      styles.lane,
                      active && styles.laneActive,
                      pressed && styles.lanePressed,
                    ]}
                  >
                    <Text style={[styles.laneText, active && styles.laneTextActive]}>
                      {value === "primary" ? "Primary" : "Custom"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.hint}>
              {lane === "primary"
                ? "Runs on the agent's primary model."
                : "Override the model and effort for this task only."}
            </Text>
          </View>

          {lane === "custom" ? (
            <View style={styles.group}>
              <Text style={styles.groupLabel}>Model</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
                keyboardShouldPersistTaps="handled"
              >
                <ComposerChip
                  label="Default model"
                  active={modelOverride === ""}
                  onPress={() => onModelOverrideChange("")}
                />
                {models.map((model) => (
                  <ComposerChip
                    key={model.id}
                    label={model.label}
                    active={modelOverride === model.id}
                    onPress={() => onModelOverrideChange(model.id)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          {lane === "custom" ? (
            <View style={styles.group}>
              <Text style={styles.groupLabel}>Thinking effort</Text>
              <View style={styles.wrap}>
                {effortOptions.map((option) => (
                  <ComposerChip
                    key={option.value || "default"}
                    label={option.label}
                    active={thinkingEffort === option.value}
                    onPress={() => onThinkingEffortChange(option.value)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {adapterType === "claude_local" && lane === "custom" ? (
            <View style={styles.switchRow}>
              <Text style={styles.groupLabel}>Enable Chrome (--chrome)</Text>
              <Switch
                value={chrome}
                onValueChange={onChromeChange}
                trackColor={{ false: ELEVATION.active, true: C.brand }}
                thumbColor={chrome ? C.ink : C.ink3}
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: SPACING.sm,
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
  },
  triggerPressed: {
    opacity: 0.7,
  },
  triggerText: {
    color: C.ink3,
    fontSize: 12,
    fontWeight: "500",
  },
  panel: {
    gap: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: ELEVATION.base,
    padding: SPACING.md,
  },
  group: {
    gap: SPACING.sm,
  },
  groupLabel: {
    color: C.ink3,
    fontSize: 12,
  },
  laneRow: {
    flexDirection: "row",
    overflow: "hidden",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.line,
  },
  lane: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 6,
  },
  laneActive: {
    backgroundColor: ELEVATION.active,
  },
  lanePressed: {
    backgroundColor: ELEVATION.hover,
  },
  laneText: {
    color: C.ink3,
    fontSize: 12,
  },
  laneTextActive: {
    color: C.ink,
  },
  hint: {
    color: C.ink4,
    fontSize: 11,
  },
  chips: {
    gap: 6,
    paddingRight: SPACING.md,
  },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
  },
});
