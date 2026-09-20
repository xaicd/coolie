import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Company } from "@coolie/api-client";

export interface CompanyContextValue {
  company: Company;
  whoami: string;
  onSignOut: () => void;
}

const CompanyContext = createContext<CompanyContextValue | null>(null);

/**
 * 当前公司与身份上下文。原先 company / whoami / onSignOut 一路当 props 透传到
 * 每个屏幕, 任务页拆分后由这里统一供给, 屏幕不再关心自己处在第几层。
 */
export function CompanyProvider({
  company,
  whoami,
  onSignOut,
  children,
}: CompanyContextValue & { children: ReactNode }) {
  const value = useMemo(
    () => ({ company, whoami, onSignOut }),
    [company, whoami, onSignOut],
  );
  return (
    <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>
  );
}

export function useCompany(): CompanyContextValue {
  const value = useContext(CompanyContext);
  if (!value) {
    throw new Error("useCompany 必须在 CompanyProvider 内使用");
  }
  return value;
}
