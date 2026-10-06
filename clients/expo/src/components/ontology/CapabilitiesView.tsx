import { useCallback } from "react";
import { ScrollView } from "react-native";
import { coolie } from "../../coolie";
import { ReadRow, ReadSection, ReadViewShell, useOntologyRows } from "./shared";

/** wave342 能力视图: 公司级能力缺口 (CapabilityGap) 清单 (只读) */
export function CapabilitiesView({ companyId }: { companyId: string }) {
  const gaps = useOntologyRows(
    useCallback(() => coolie.listOntologyCapabilityGaps(companyId), [companyId]),
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <ReadSection title="能力缺口" count={gaps.rows.length} />
      <ReadViewShell
        loading={gaps.loading}
        error={gaps.error}
        empty={gaps.rows.length === 0}
        reload={gaps.reload}
        emptyTitle="暂无能力缺口记录"
      >
        {gaps.rows.map((gap) => (
          <ReadRow
            key={gap.id}
            title={gap.title || gap.gap_key}
            sub={`${gap.gap_key} · 源自 ${gap.detected_from || "-"}`}
            pill={`${gap.status} · ${gap.priority}`}
            mono
          />
        ))}
      </ReadViewShell>
    </ScrollView>
  );
}
