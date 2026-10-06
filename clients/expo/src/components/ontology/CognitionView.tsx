import { useCallback } from "react";
import { ScrollView } from "react-native";
import { coolie } from "../../coolie";
import { ReadRow, ReadSection, ReadViewShell, useOntologyRows } from "./shared";

/** wave342 认知视图: 公司级认知扫描任务 (RepoCognitionJob) 进度清单 (只读) */
export function CognitionView({ companyId }: { companyId: string }) {
  const jobs = useOntologyRows(
    useCallback(() => coolie.listOntologyCognitionJobs(companyId), [companyId]),
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <ReadSection title="认知扫描任务" count={jobs.rows.length} />
      <ReadViewShell
        loading={jobs.loading}
        error={jobs.error}
        empty={jobs.rows.length === 0}
        reload={jobs.reload}
        emptyTitle="暂无认知扫描任务"
      >
        {jobs.rows.map((job) => (
          <ReadRow
            key={job.id}
            title={job.app_name || job.job_key}
            sub={`${job.root_path || job.job_key} · ${job.stage_label || "-"}`}
            pill={`${job.status} ${job.progress_pct ?? 0}%`}
            mono
          />
        ))}
      </ReadViewShell>
    </ScrollView>
  );
}
