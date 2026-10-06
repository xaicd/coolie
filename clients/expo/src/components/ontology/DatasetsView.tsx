import { useCallback } from "react";
import { ScrollView } from "react-native";
import { coolie } from "../../coolie";
import { ReadRow, ReadSection, ReadViewShell, useOntologyRows } from "./shared";

/** wave342 数据集视图: 选中域的数据集清单 (只读, 与 web DatasetsTab 同源) */
export function DatasetsView({ companyId, domainId }: { companyId: string; domainId: string }) {
  const datasets = useOntologyRows(
    useCallback(() => coolie.listOntologyDatasets(companyId, domainId), [companyId, domainId]),
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <ReadSection title="数据集" count={datasets.rows.length} />
      <ReadViewShell
        loading={datasets.loading}
        error={datasets.error}
        empty={datasets.rows.length === 0}
        reload={datasets.reload}
        emptyTitle="该域暂无数据集"
      >
        {datasets.rows.map((ds) => (
          <ReadRow
            key={ds.id}
            title={ds.name || ds.key}
            sub={`${ds.key} · v${ds.current_version ?? 1}`}
            pill={ds.format || ds.lifecycle_state || "数据集"}
            mono
          />
        ))}
      </ReadViewShell>
    </ScrollView>
  );
}
