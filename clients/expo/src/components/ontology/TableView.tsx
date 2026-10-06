import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { C, coolie } from "../../coolie";
import { RADIUS } from "../../ui/tokens";
import { ReadRow, ReadSection, ReadViewShell, useOntologyRows } from "./shared";

/** wave342 表格视图: 控制面 9 类实体的实例浏览 (wave333 listOntologyInstances) */
const ENTITY_TYPES: { key: string; label: string }[] = [
  { key: "project", label: "项目" },
  { key: "issue", label: "任务" },
  { key: "agent", label: "员工" },
  { key: "conversation", label: "工坊" },
  { key: "work_product", label: "产物" },
];

export function TableView({ companyId }: { companyId: string }) {
  const [entityType, setEntityType] = useState("project");
  const instances = useOntologyRows(
    useCallback(
      async () =>
        (await coolie.listOntologyInstances(companyId, { entityType, limit: 100 })).instances,
      [companyId, entityType],
    ),
  );

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {ENTITY_TYPES.map((t) => {
          const active = t.key === entityType;
          return (
            <Pressable key={t.key} style={[styles.chip, active && styles.chipActive]}
              onPress={() => setEntityType(t.key)} testID={`OntologyTable__TypeChip__${t.key}`}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ReadSection title={`实例 (共 ${instances.rows.length})`} />
      <ReadViewShell
        loading={instances.loading}
        error={instances.error}
        empty={instances.rows.length === 0}
        reload={instances.reload}
        emptyTitle="该类型暂无实例"
      >
        {instances.rows.map((row) => (
          <ReadRow
            key={row.id}
            title={row.label}
            sub={row.ownerLabel ? `负责人: ${row.ownerLabel}` : undefined}
          />
        ))}
      </ReadViewShell>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  chips: { flexDirection: "row", gap: 8, paddingBottom: 4 },
  chip: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: RADIUS.sm,
    backgroundColor: C.panel,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { borderColor: C.accent, backgroundColor: "rgba(94, 106, 210, 0.12)" },
  chipText: { color: C.ink3, fontSize: 12, fontWeight: "500" },
  chipTextActive: { color: C.accent, fontWeight: "600" },
});

