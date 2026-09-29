import { useMemo } from "react";
import { Link, useParams } from "@/lib/router";
import { useCompany } from "@/context/CompanyContext";
import { SpecEditor } from "@/components/SpecEditor";

/**
 * `/issues/:issueId/spec` — the three-step spec editor for one task (wave147).
 */
export function IssueSpecPage() {
  const { issueId = "", companyPrefix } = useParams();
  const { companies, selectedCompanyId } = useCompany();

  const companyId = useMemo(() => {
    if (!companyPrefix) return selectedCompanyId ?? null;
    const requested = companyPrefix.toUpperCase();
    return (
      companies.find((company) => company.issuePrefix.toUpperCase() === requested)?.id ??
      selectedCompanyId ??
      null
    );
  }, [companies, companyPrefix, selectedCompanyId]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4">
      <div className="flex flex-col gap-1">
        <Link
          to={`/issues/${issueId}`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← 返回任务
        </Link>
        <h1 className="text-sm font-semibold text-foreground">规格（Spec）</h1>
        <p className="text-xs text-muted-foreground">
          需求 / 缺陷 → 设计 → 任务。CMMI 管项目治理，这条链管本次改动。
        </p>
      </div>
      <SpecEditor issueId={issueId} companyId={companyId} />
    </div>
  );
}
