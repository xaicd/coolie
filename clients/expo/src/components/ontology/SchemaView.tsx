import { useCallback } from "react";
import { ScrollView } from "react-native";
import { coolie } from "../../coolie";
import { ReadRow, ReadSection, ReadViewShell, useOntologyRows } from "./shared";

/** wave342 结构视图: 选中域的对象类型 + 关系类型清单 (只读) */
export function SchemaView({ companyId, domainId }: { companyId: string; domainId: string }) {
  const nodeTypes = useOntologyRows(
    useCallback(() => coolie.listOntologyNodeTypes(companyId, domainId), [companyId, domainId]),
  );
  const relationTypes = useOntologyRows(
    useCallback(() => coolie.listOntologyRelationTypes(companyId, domainId), [companyId, domainId]),
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <ReadSection title="对象类型" count={nodeTypes.rows.length} />
      <ReadViewShell
        loading={nodeTypes.loading}
        error={nodeTypes.error}
        empty={nodeTypes.rows.length === 0}
        reload={nodeTypes.reload}
        emptyTitle="该域暂无对象类型"
      >
        {nodeTypes.rows.map((nt) => (
          <ReadRow
            key={nt.id}
            title={nt.display_name || nt.key}
            sub={`${nt.key}${nt.layer ? ` · ${nt.layer}` : ""} · ${
              Object.keys(nt.propertiesSchema ?? nt.properties_schema ?? {}).length
            } 属性`}
            pill={nt.layer || "对象"}
            mono
          />
        ))}
      </ReadViewShell>

      <ReadSection title="关系类型" count={relationTypes.rows.length} />
      <ReadViewShell
        loading={relationTypes.loading}
        error={relationTypes.error}
        empty={relationTypes.rows.length === 0}
        reload={relationTypes.reload}
        emptyTitle="该域暂无关系类型"
      >
        {relationTypes.rows.map((rt) => (
          <ReadRow
            key={rt.id}
            title={rt.display_name || rt.key}
            sub={`${rt.key}${rt.directed === false ? " · 无向" : " · 有向"}`}
            pill={rt.directed === false ? "无向" : "有向"}
            mono
          />
        ))}
      </ReadViewShell>
    </ScrollView>
  );
}
