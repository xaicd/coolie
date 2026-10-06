import { useCallback } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { C, coolie } from "../../coolie";
import { StatTile } from "../../ui/StatTile";
import { ReadRow, ReadSection, ReadViewShell, useOntologyRows } from "./shared";

/**
 * wave342 驾驶视图: 选中域的实例驾驶舱 (只读 cockpit)。web 端 SandboxTab
 * 是拖拽编辑台, 移动端收成快照驾驶舱 —— 计数仪表 + 类型分布 + 节点抽样,
 * 数据与 web 同源 (getOntologySnapshot)。
 */
export function SandboxView({ companyId, domainId }: { companyId: string; domainId: string }) {
  const snapshot = useOntologyRows(
    useCallback(async () => {
      const snap = await coolie.getOntologySnapshot(companyId, domainId, 200);
      return snap ? [snap] : [];
    }, [companyId, domainId]),
  );
  const snap = snapshot.rows[0];
  const byType = snap?.counts?.byNodeType
    ? Object.entries(snap.counts.byNodeType).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ReadSection title="实例仪表" />
      <ReadViewShell
        loading={snapshot.loading}
        error={snapshot.error}
        empty={!snap}
        reload={snapshot.reload}
        emptyTitle="该域暂无快照数据"
      >
        <View style={styles.grid}>
          <StatTile flex={false} style={styles.tile} value={snap?.counts?.nodes ?? 0} label="实体节点" />
          <StatTile flex={false} style={styles.tile} value={snap?.counts?.edges ?? 0} label="关系连线" />
          <StatTile flex={false} style={styles.tile} value={byType.length} label="节点类型" />
          <StatTile flex={false} style={styles.tile} value={snap?.counts?.crossDomainEdges ?? 0} label="跨域依赖" />
        </View>
      </ReadViewShell>

      <ReadSection title="类型分布" count={byType.length} />
      <ReadViewShell
        loading={snapshot.loading}
        error={snapshot.error}
        empty={byType.length === 0}
        reload={snapshot.reload}
        emptyTitle="暂无类型分布"
      >
        {byType.map(([type, count]) => (
          <ReadRow key={type || "none"} title={type || "(未归类)"} sub={`${count} 实体`} mono />
        ))}
        {snap?.nodes?.length ? (
          <Text style={styles.sampleHint} numberOfLines={1}>
            抽样: {snap.nodes.slice(0, 5).map((n) => n.label).join(" / ")}
          </Text>
        ) : null}
      </ReadViewShell>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { width: "48%" },
  sampleHint: { color: C.ink4, fontSize: 11, marginTop: 4 },
});
