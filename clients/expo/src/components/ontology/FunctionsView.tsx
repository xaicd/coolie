import { useCallback } from "react";
import { ScrollView } from "react-native";
import { coolie } from "../../coolie";
import { ReadRow, ReadSection, ReadViewShell, useOntologyRows } from "./shared";

/** wave342 函数视图: 选中域的函数资产清单 (只读, 与 web FunctionsTab 同源) */
export function FunctionsView({ companyId, domainId }: { companyId: string; domainId: string }) {
  const functions = useOntologyRows(
    useCallback(() => coolie.listOntologyFunctions(companyId, domainId), [companyId, domainId]),
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <ReadSection title="函数" count={functions.rows.length} />
      <ReadViewShell
        loading={functions.loading}
        error={functions.error}
        empty={functions.rows.length === 0}
        reload={functions.reload}
        emptyTitle="该域暂无函数"
      >
        {functions.rows.map((f) => (
          <ReadRow
            key={f.id}
            title={f.name}
            sub={[f.type, f.version && `v${f.version}`].filter(Boolean).join(" · ")}
            pill={f.status || "函数"}
          />
        ))}
      </ReadViewShell>
    </ScrollView>
  );
}
