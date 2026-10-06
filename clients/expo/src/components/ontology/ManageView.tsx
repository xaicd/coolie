import { useCallback } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { C, coolie } from "../../coolie";
import { StatTile } from "../../ui/StatTile";
import { ReadRow, ReadSection, ReadViewShell, useOntologyRows } from "./shared";

/** wave342 治理视图: 公司级图谱统计 + 本体资源挂链清单 (只读) */
export function ManageView({ companyId }: { companyId: string }) {
  // stats 是单对象, 借 list 壳包一层: 取到即单行
  const stats = useOntologyRows(
    useCallback(async () => {
      const s = await coolie.getOntologyGraphStats(companyId);
      return [s];
    }, [companyId]),
  );
  const links = useOntologyRows(
    useCallback(() => coolie.listOntologyResourceLinks(companyId, {}), [companyId]),
  );
  const s = stats.rows[0];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ReadSection title="图谱统计" />
      <ReadViewShell
        loading={stats.loading}
        error={stats.error}
        empty={!s}
        reload={stats.reload}
        emptyTitle="暂无图谱统计"
      >
        <View style={styles.statsGrid}>
          <StatTile flex={false} style={styles.tile} value={s?.totalNodes ?? 0} label="实体节点" />
          <StatTile flex={false} style={styles.tile} value={s?.totalRelations ?? 0} label="关系连线" />
          <StatTile flex={false} style={styles.tile} value={s?.averageDegree ?? 0} label="平均度" />
          <StatTile flex={false} style={styles.tile} value={s?.nodeCounts?.length ?? 0} label="节点类型" />
        </View>
        {s?.nodeCounts && s.nodeCounts.length > 0 ? (
          <Text style={styles.typeHint} numberOfLines={2}>
            {s.nodeCounts
              .slice(0, 6)
              .map((tc) => `${tc.entityType} ${tc.count}`)
              .join(" · ")}
          </Text>
        ) : null}
      </ReadViewShell>

      <ReadSection title="资源挂链" count={links.rows.length} />
      <ReadViewShell
        loading={links.loading}
        error={links.error}
        empty={links.rows.length === 0}
        reload={links.reload}
        emptyTitle="暂无本体资源挂链"
      >
        {links.rows.map((link) => (
          <ReadRow
            key={link.id}
            title={link.resource_label || link.resource_id}
            sub={`${link.resource_kind} · ${link.role}`}
            pill="挂链"
            mono
          />
        ))}
      </ReadViewShell>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { width: "48%" },
  typeHint: {
    color: C.ink4,
    fontSize: 11,
    marginTop: 10,
  },
});
