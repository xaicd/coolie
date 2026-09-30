import type { Page } from "@playwright/test";
import type { ApiClient } from "./api.js";
import type { E2EEnv } from "./env.js";
import { appUrl } from "./env.js";
import { note } from "./notes.js";

export interface Company {
  id: string;
  name: string;
  issuePrefix: string;
  status: string;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: string;
}

export interface BoardContext {
  companies: Company[];
  company: Company;
  companyPrefix: string;
  agents: Agent[];
  agent: Agent | null;
}

/** Agents in these states cannot be assigned tasks from the board picker. */
const UNAVAILABLE_AGENT_STATUSES = new Set(["terminated", "pending_approval"]);

export async function listCompanies(api: ApiClient): Promise<Company[]> {
  const companies = await api.get<Company[]>("/api/companies?scope=accessible");
  return Array.isArray(companies) ? companies : [];
}

export async function listAgents(api: ApiClient, companyId: string): Promise<Agent[]> {
  const agents = await api.get<Agent[]>(`/api/companies/${companyId}/agents`);
  return Array.isArray(agents) ? agents : [];
}

function matchesCompany(company: Company, selector: string): boolean {
  const needle = selector.toLowerCase();
  return (
    company.name.toLowerCase() === needle ||
    company.issuePrefix.toLowerCase() === needle
  );
}

export function pickCompany(companies: Company[], selector: string | null): Company {
  const active = companies.filter((c) => c.status !== "archived");
  const pool = active.length > 0 ? active : companies;
  if (selector) {
    const found = pool.find((c) => matchesCompany(c, selector));
    if (!found) {
      const names = pool.map((c) => `${c.name} (${c.issuePrefix})`).join(", ");
      throw new Error(`E2E_COMPANY="${selector}" matched no company. Accessible: ${names}`);
    }
    return found;
  }
  if (pool.length === 0) {
    throw new Error("The signed-in account has no accessible companies.");
  }
  return pool[0]!;
}

export function pickAgent(agents: Agent[], preferredName: string): Agent | null {
  const assignable = agents.filter((a) => !UNAVAILABLE_AGENT_STATUSES.has(a.status));
  const pool = assignable.length > 0 ? assignable : agents;
  if (pool.length === 0) return null;
  const exact = pool.find((a) => a.name.toLowerCase() === preferredName.toLowerCase());
  if (exact) return exact;
  const partial = pool.find((a) => a.name.toLowerCase().includes(preferredName.toLowerCase()));
  return partial ?? pool[0]!;
}

export async function resolveBoard(api: ApiClient, env: E2EEnv): Promise<BoardContext> {
  const companies = await listCompanies(api);
  const company = pickCompany(companies, env.company);
  const agents = await listAgents(api, company.id);
  const agent = pickAgent(agents, env.agentName);
  note("board resolved", {
    company: `${company.name} (${company.issuePrefix})`,
    companies: companies.length,
    agents: agents.length,
    agent: agent?.name ?? null,
  });
  return { companies, company, companyPrefix: company.issuePrefix, agents, agent };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Drive the real sidebar organization switcher and land on the company
 * dashboard. The trigger's accessible name is hardcoded English
 * (locale-independent), so this works on a zh-CN deployment too.
 *
 * `SidebarCompanyMenu.selectCompany` only routes when the active company
 * actually changes, so re-selecting the company that is already active closes
 * the menu without navigating; in that case we walk to its dashboard directly.
 * Either way the dead giveaway of a switch that never happened is a URL for a
 * different company, which the final assertion rules out.
 */
export async function switchCompany(page: Page, company: Company): Promise<void> {
  const pathPrefix = new URL(page.url()).pathname.split("/")[1]?.toUpperCase();
  const alreadyActive = pathPrefix === company.issuePrefix.toUpperCase();

  const trigger = page.getByRole("button", { name: /organization switcher$/i }).first();
  await trigger.waitFor({ state: "visible", timeout: 45_000 });
  await trigger.click();
  const item = page.getByRole("menuitem").filter({ hasText: company.issuePrefix }).first();
  await item.waitFor({ state: "visible", timeout: 15_000 });
  await item.click();

  const dashboard = new RegExp(`/${escapeRegExp(company.issuePrefix)}/dashboard`, "i");
  if (alreadyActive) {
    await page.goto(`/${company.issuePrefix}/dashboard`, { waitUntil: "domcontentloaded" });
  } else {
    await page.waitForURL(dashboard, { timeout: 45_000 });
  }
}

export async function gotoBoard(page: Page, env: E2EEnv, pathname: string): Promise<void> {
  await page.goto(appUrl(env, pathname), { waitUntil: "domcontentloaded" });
}
