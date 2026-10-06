import { useCallback } from "react";
import { ScrollView } from "react-native";
import { coolie } from "../../coolie";
import { ReadRow, ReadSection, ReadViewShell, useOntologyRows } from "./shared";

/** wave342 转换视图: 选中域的数据加工转换清单 (只读, 与 web TransformsTab 同源) */
export function TransformsView({ companyId, domainId }: { companyId: string; domainId: string }) {
  const transforms = useOntologyRows(
    useCallback(() => coolie.listOntologyTransforms(companyId, domainId), [companyId, domainId]),
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <ReadSection title="转换" count={transforms.rows.length} />
      <ReadViewShell
        loading={transforms.loading}
        error={transforms.error}
        empty={transforms.rows.length === 0}
        reload={transforms.reload}
        emptyTitle="该域暂无转换"
      >
        {transforms.rows.map((t) => (
          <ReadRow
            key={t.id}
            title={t.name || t.key}
            sub={`${t.key} · v${t.version ?? 1}`}
            pill={t.transform_type || t.status || "转换"}
            mono
          />
        ))}
      </ReadViewShell>
    </ScrollView>
  );
}
