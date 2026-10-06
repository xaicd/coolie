import { useCallback } from "react";
import { ScrollView } from "react-native";
import { coolie } from "../../coolie";
import { ReadRow, ReadSection, ReadViewShell, useOntologyRows } from "./shared";

/** wave342 连接器视图: 选中域的数据源连接器清单 (只读, 与 web ConnectorsTab 同源) */
export function ConnectorsView({ companyId, domainId }: { companyId: string; domainId: string }) {
  const connectors = useOntologyRows(
    useCallback(() => coolie.listOntologyConnectors(companyId, domainId), [companyId, domainId]),
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <ReadSection title="连接器" count={connectors.rows.length} />
      <ReadViewShell
        loading={connectors.loading}
        error={connectors.error}
        empty={connectors.rows.length === 0}
        reload={connectors.reload}
        emptyTitle="该域暂无连接器"
      >
        {connectors.rows.map((c) => (
          <ReadRow
            key={c.id}
            title={c.name || c.key}
            sub={c.key}
            pill={c.connector_type || c.status || "连接器"}
            mono
          />
        ))}
      </ReadViewShell>
    </ScrollView>
  );
}
