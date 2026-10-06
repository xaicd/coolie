import { useCallback } from "react";
import { ScrollView } from "react-native";
import { coolie } from "../../coolie";
import { ReadRow, ReadSection, ReadViewShell, useOntologyRows } from "./shared";

/** wave342 接口视图: 选中域的对外接口契约清单 (只读, 与 web InterfacesTab 同源) */
export function InterfacesView({ companyId, domainId }: { companyId: string; domainId: string }) {
  const interfaces = useOntologyRows(
    useCallback(() => coolie.listOntologyInterfaces(companyId, domainId), [companyId, domainId]),
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <ReadSection title="接口" count={interfaces.rows.length} />
      <ReadViewShell
        loading={interfaces.loading}
        error={interfaces.error}
        empty={interfaces.rows.length === 0}
        reload={interfaces.reload}
        emptyTitle="该域暂无接口"
      >
        {interfaces.rows.map((i) => (
          <ReadRow
            key={i.id}
            title={i.display_name || i.key}
            sub={i.key}
            pill="接口"
            mono
          />
        ))}
      </ReadViewShell>
    </ScrollView>
  );
}
