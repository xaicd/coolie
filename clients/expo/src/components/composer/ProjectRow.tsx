import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { Project } from "@coolie/api-client";
import { C } from "../../coolie";
import { SPACING } from "../../ui/tokens";
import { ComposerChip } from "./Chip";

/** Fallback dot colour, matching the web picker's `--project-seed`. */
const SEED_COLOR = "#8A8F98";

/**
 * The composer's `in [project]` row — the App half of the Coolie Web
 * `NewIssueDialog` project selector.
 *
 * Upstream renders `projectsApi.list(companyId)` through `useProjectOrder` with
 * `noneLabel="No project"`, and the chosen id travels as `projectId` on the
 * create payload. Same option set here (none + active projects), rendered as a
 * chip rail; archived projects are filtered out the way the web picker's
 * `activeProjects` memo does.
 */
export function ProjectRow({
  projects,
  value,
  onChange,
}: {
  projects: Project[];
  /** Selected `projectId`; `null` files the task outside any project. */
  value: string | null;
  onChange: (projectId: string | null) => void;
}) {
  const activeProjects = projects.filter((project) => project.status !== "archived");

  return (
    <View style={styles.row}>
      <Text style={styles.label}>in</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        keyboardShouldPersistTaps="handled"
      >
        <ComposerChip
          label="无项目"
          active={value === null}
          onPress={() => onChange(null)}
          dotColor={value === null ? C.accent : C.ink4}
        />
        {activeProjects.map((project) => (
          <ComposerChip
            key={project.id}
            label={project.name}
            active={value === project.id}
            onPress={() => onChange(project.id)}
            dotColor={project.color ?? SEED_COLOR}
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
