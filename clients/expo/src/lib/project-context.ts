import type { Project } from "@coolie/api-client";
import * as SecureStore from "expo-secure-store";

/**
 * wave383 — 工坊项目上下文 (老板拍: 生产 coolie 工坊是对外项目建设, 不是建设自己)。
 *
 * 工坊 (BoardChatScreen) 进屏时 MUST 自动锁定一个「对客户」的项目上下文, 而不是落进
 * 一个没有项目的通用对话, 也不是「建设自己」的本体项目。这里集中两件事:
 *   1. 默认项目启发式 —— 排除「建设自己」的本体项目, 优先推进中的对外项目;
 *   2. 「最近活动项目」的本机持久化 —— 冷启动也能延续老板上一回的项目上下文。
 *
 * 归口规则: 变更本文件即变更工坊默认上下文口径。
 */

/** 自用 (平台本体) 企业名。生产工坊是对外项目建设, 默认上下文 MUST 排除本企业本体项目。 */
export const SELF_COMPANY_NAME = "Coolie 本地施工总社";

/**
 * api-client 的 `Project` 未声明归档 / 更新时间字段, 但 projects 列表端点 (server
 * serializeProject) 会返回它们。工坊默认项目启发式按状态 + 最近更新排序, 故在此补声明。
 */
export type ProjectLike = Project & {
  archivedAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

/** 本体 / 自建项目的名称标记 (如「Coolie 工坊 AI 原生交付工厂本体系统」)。 */
const SELF_PROJECT_PATTERNS: readonly RegExp[] = [
  /Coolie\s*工坊/i,
  /本体系统/,
  /本地施工总社/,
];

/**
 * 是否是「建设自己」的本体项目。对外客户交付项目 MUST 返回 false。
 * 判定为纯名称启发式 —— 平台本体项目名称稳定含「Coolie 工坊 / 本体系统」标记。
 */
export function isSelfProject(project: Pick<Project, "name"> | null | undefined): boolean {
  const name = (project?.name ?? "").trim();
  if (!name) return false;
  return SELF_PROJECT_PATTERNS.some((re) => re.test(name));
}

/** 是否是平台本体企业 (Coolie 本地施工总社) —— 生产工坊是对外项目建设, 不是建设自己。 */
export function isSelfCompany(companyName: string | null | undefined): boolean {
  return (companyName ?? "").trim() === SELF_COMPANY_NAME;
}

/** 项目状态优先级: 进行中 > 计划中 > 待规划 > 已完成 > 已取消。 */
const STATUS_RANK: Record<string, number> = {
  in_progress: 0,
  planned: 1,
  backlog: 2,
  completed: 3,
  cancelled: 4,
};

/**
 * 从公司项目列表里挑出工坊默认上下文项目。
 *
 * 顺序: 对外项目优先 (排除本体项目) → 状态优先级 → 最近更新优先。
 * 若清一色都是本体项目, 退回第一个未归档项目, 至少不空手。
 */
export function pickDefaultProject(
  projects: ProjectLike[] | null | undefined,
): ProjectLike | null {
  const list = Array.isArray(projects)
    ? projects.filter((p): p is ProjectLike => Boolean(p && p.id && p.name && !p.archivedAt))
    : [];
  if (list.length === 0) return null;

  const external = list.filter((p) => !isSelfProject(p));
  const pool = external.length > 0 ? external : list;

  const time = (p: ProjectLike) => (p.updatedAt ? new Date(p.updatedAt).getTime() : 0);
  return (
    [...pool].sort((a, b) => {
      const ra = STATUS_RANK[a.status ?? ""] ?? 9;
      const rb = STATUS_RANK[b.status ?? ""] ?? 9;
      if (ra !== rb) return ra - rb;
      return time(b) - time(a);
    })[0] ?? null
  );
}

const LAST_PROJECT_KEY_PREFIX = "coolie.lastProject.";

/** 读取本机记住的「最近活动项目」id (按公司隔离, 失败即无记忆)。 */
export async function getLastProjectId(companyId: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(`${LAST_PROJECT_KEY_PREFIX}${companyId}`);
  } catch {
    return null;
  }
}

/** 记住「最近活动项目」id (按公司隔离)。写失败不阻断工坊。 */
export async function setLastProjectId(
  companyId: string,
  projectId: string | null,
): Promise<void> {
  if (!projectId) return;
  try {
    await SecureStore.setItemAsync(`${LAST_PROJECT_KEY_PREFIX}${companyId}`, projectId);
  } catch {
    // 记忆失败不影响本次会话
  }
}
