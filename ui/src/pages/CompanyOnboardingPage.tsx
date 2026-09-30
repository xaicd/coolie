import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@/lib/router";
import {
  ONBOARDING_INDUSTRIES,
  ONBOARDING_STEP_COUNT,
  type OnboardingIndustry,
} from "@paperclipai/shared";
import { useCompany } from "../context/CompanyContext";
import { onboardingApi } from "../api/onboarding";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";

/**
 * `/{prefix}/getting-started` — the 3-step first-run wizard (wave155).
 *
 *   Step 1  pick an industry (8 scenarios)
 *   Step 2  pick the employees to hire (six defaults, or custom)
 *   Step 3  run the demo — one project, five tasks — so the board opens onto a
 *           working graph instead of an empty one
 *
 * Progress is persisted server-side (`companies.onboarding_state`) after every
 * step, so a reload resumes where the customer left off. The company is
 * considered onboarded once step 3 completes; `CompanyOnboardingGate` is what
 * routes a never-onboarded company here in the first place.
 *
 * Why `getting-started` and not `/onboarding`: `/{prefix}/onboarding` already
 * hosts the org/add-agent wizard launcher, which is separately tested. Mounting
 * here keeps that surface intact while giving the first-run flow its own door.
 */

const DEFAULT_EMPLOYEES = [
  "产品经理",
  "研发工程师",
  "测试工程师",
  "设计师",
  "运营",
  "交付经理",
] as const;

const STEP_TITLE: Record<number, string> = {
  1: "选择行业",
  2: "招聘员工",
  3: "跑一个示范",
};

export function CompanyOnboardingPage() {
  const { selectedCompanyId, companies } = useCompany();
  const params = useParams<{ companyPrefix?: string; projectId?: string }>();
  const navigate = useNavigate();

  const company = useMemo(
    () => companies.find((entry) => entry.id === selectedCompanyId) ?? null,
    [companies, selectedCompanyId],
  );
  const prefix = params.companyPrefix ?? company?.issuePrefix ?? null;

  const { data } = useQuery({
    queryKey: queryKeys.onboarding.state(selectedCompanyId ?? ""),
    queryFn: () => onboardingApi.state(selectedCompanyId as string),
    enabled: Boolean(selectedCompanyId),
  });

  const [step, setStep] = useState(1);
  const [industry, setIndustry] = useState<OnboardingIndustry | null>(null);
  const [employees, setEmployees] = useState<string[]>([...DEFAULT_EMPLOYEES]);
  const [customEmployee, setCustomEmployee] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoProjectId, setDemoProjectId] = useState<string | null>(null);

  // Seed the form from stored progress (and resume at the stored step).
  useEffect(() => {
    if (!data?.state) return;
    setIndustry(data.state.industry ?? null);
    if (data.state.employees && data.state.employees.length > 0) setEmployees(data.state.employees);
    setStep(Math.min(Math.max(data.state.step, 1), ONBOARDING_STEP_COUNT));
    setDemoProjectId(data.state.demoProjectId ?? null);
  }, [data]);

  const persistStep = async (nextStep: number, extra: { industry?: OnboardingIndustry; employees?: string[] }) => {
    if (!selectedCompanyId) return;
    setBusy(true);
    setError(null);
    try {
      await onboardingApi.step(selectedCompanyId, { step: nextStep, ...extra });
      setStep(nextStep);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runDemo = async () => {
    if (!selectedCompanyId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await onboardingApi.complete(selectedCompanyId);
      setDemoProjectId(result.state?.demoProjectId ?? null);
      setStep(ONBOARDING_STEP_COUNT);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!selectedCompanyId) {
    return <p className="text-sm text-muted-foreground">请先选择一个公司。</p>;
  }

  const addCustomEmployee = () => {
    const name = customEmployee.trim();
    if (!name || employees.includes(name)) return;
    setEmployees((current) => [...current, name]);
    setCustomEmployee("");
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4" data-testid="company-onboarding">
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">
          第 {step} / {ONBOARDING_STEP_COUNT} 步 · {STEP_TITLE[step]}
        </p>
        <h1 className="text-lg font-semibold text-foreground">
          欢迎{company ? `，${company.name}` : ""}
        </h1>
        <div className="mt-1 flex gap-1">
          {Array.from({ length: ONBOARDING_STEP_COUNT }, (_, index) => index + 1).map((value) => (
            <span
              key={value}
              className={
                value <= step
                  ? "h-1 flex-1 rounded-full bg-primary"
                  : "h-1 flex-1 rounded-full bg-border"
              }
            />
          ))}
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {step === 1 ? (
        <section className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">先选一个最接近你业务的方向，我们会据此预置角色与示范内容。</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ONBOARDING_INDUSTRIES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setIndustry(value)}
                data-testid={`onboarding-industry-${value}`}
                className={
                  industry === value
                    ? "rounded-md border border-primary bg-accent px-3 py-2 text-sm font-medium text-foreground"
                    : "rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50"
                }
              >
                {value}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">默认给你 6 位员工，可按需增减。</p>
          <div className="flex flex-col gap-1">
            {employees.map((name) => (
              <label
                key={name}
                className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
              >
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked
                    onChange={() => setEmployees((current) => current.filter((entry) => entry !== name))}
                    data-testid={`onboarding-employee-${name}`}
                  />
                  {name}
                </span>
              </label>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
              自定义员工
              <input
                className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                value={customEmployee}
                placeholder="例如：数据分析师"
                onChange={(event) => setCustomEmployee(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCustomEmployee();
                  }
                }}
                data-testid="onboarding-employee-custom"
              />
            </label>
            <Button type="button" variant="outline" onClick={addCustomEmployee} disabled={busy}>
              添加
            </Button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            一键建一个示范项目（5 个任务），30 秒内你就能看到看板和对象图谱动起来。
          </p>
          {demoProjectId ? (
            <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
              <p className="text-sm text-foreground">示范项目已就绪。</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={() => prefix && navigate(`/${prefix}/projects/${demoProjectId}/graph`)}
                >
                  查看对象图谱
                </Button>
                <Button type="button" variant="outline" onClick={() => prefix && navigate(`/${prefix}/dashboard`)}>
                  回到主页
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" onClick={runDemo} disabled={busy} data-testid="onboarding-run-demo">
              {busy ? "正在创建…" : "创建示范项目"}
            </Button>
          )}
        </section>
      ) : null}

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setStep((current) => Math.max(1, current - 1))}
          disabled={step === 1 || busy}
        >
          上一步
        </Button>
        {step < ONBOARDING_STEP_COUNT ? (
          <Button
            type="button"
            onClick={() =>
              persistStep(step + 1, {
                ...(industry ? { industry } : {}),
                employees,
              })
            }
            disabled={busy || (step === 1 && !industry)}
            data-testid="onboarding-next"
          >
            下一步
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => prefix && navigate(`/${prefix}/dashboard`)}
            disabled={busy}
          >
            完成
          </Button>
        )}
      </div>
    </div>
  );
}
