import { useCallback } from "react";
import { ScrollView } from "react-native";
import { coolie } from "../../coolie";
import { ReadRow, ReadSection, ReadViewShell, useOntologyRows } from "./shared";

/** wave342 动作视图: 选中域的动作类型清单 (只读, 与 web ActionsTab 同源) */
export function ActionsView({ companyId, domainId }: { companyId: string; domainId: string }) {
  const actions = useOntologyRows(
    useCallback(() => coolie.listOntologyActionTypes(companyId, domainId), [companyId, domainId]),
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <ReadSection title="动作类型" count={actions.rows.length} />
      <ReadViewShell
        loading={actions.loading}
        error={actions.error}
        empty={actions.rows.length === 0}
        reload={actions.reload}
        emptyTitle="该域暂无动作类型"
      >
        {actions.rows.map((a) => (
          <ReadRow
            key={a.id}
            title={a.display_name || a.key}
            sub={`${a.key}${a.idempotent ? " · 幂等" : ""}`}
            pill={a.status || a.kind || "动作"}
            mono
          />
        ))}
      </ReadViewShell>
    </ScrollView>
  );
}
