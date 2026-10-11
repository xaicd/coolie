import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { boardConversations, projects } from "@paperclipai/db";
import { issueService } from "./index.js";
import {
  ensureProjectCmmiWbsTasks,
  type ProjectCmmiWbsBootstrapResult,
} from "./project-cmmi-wbs-bootstrap.js";

export interface ProjectBoardConversationInput {
  companyId: string;
  projectId: string;
  projectName?: string;
  createdByUserId?: string | null;
}

export type ProjectBoardConversationResult =
  | { status: "created"; conversationId: string; title: string; issueId: string; cmmiWbs: ProjectCmmiWbsBootstrapResult | null }
  | { status: "exists"; conversationId: string; title: string; issueId: string | null; cmmiWbs: ProjectCmmiWbsBootstrapResult | null };

/**
 * Coolie 交付工厂核心铁律：项目立项即建工坊 (Project as Workshop Conversation).
 *
 * 伴随项目创建事务原子落盘：为每个新项目自动创建专属的 Board Conversation（工坊会话），
 * 并锚定其独立的 Issue，确保项目从诞生第一秒即可在工坊展开需求讨论与工件上传，
 * 彻底杜绝跨项目上下文污染与全局会话杂糅。
 *
 * 同时幂等补齐首发的需求主线任务 (CMMI G1 SRS)：无论会话是随立项事务创建还是由工坊
 * 懒加载 (board-chat) 触发，本路径都保证项目拥有且仅拥有首发的需求主线任务，历史项目
 * (会话先于任务引导逻辑存在) 打开工坊即自愈。
 */
export async function ensureProjectBoardConversation(
  db: Db,
  input: ProjectBoardConversationInput,
): Promise<ProjectBoardConversationResult> {
  // 1. 检查该项目是否已存在未归档的专属工坊会话
  const existing = await db
    .select()
    .from(boardConversations)
    .where(
      and(
        eq(boardConversations.companyId, input.companyId),
        eq(boardConversations.projectId, input.projectId),
        isNull(boardConversations.archivedAt),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);

  // 2. 解析项目名称（会话创建与需求任务引导共用）
  let projectName = input.projectName;
  if (!projectName) {
    const proj = await db
      .select({ name: projects.name })
      .from(projects)
      .where(and(eq(projects.id, input.projectId), eq(projects.companyId, input.companyId)))
      .limit(1)
      .then((rows) => rows[0] ?? null);
    projectName = proj?.name ?? "项目";
  }

  let conversationId: string;
  let title: string;
  let issueId: string | null;
  let status: "created" | "exists";

  if (existing) {
    conversationId = existing.id;
    title = existing.title;
    issueId = existing.issueId;
    status = "exists";
  } else {
    // 插入专属工坊会话，标题格式化为「[项目名] 工坊」
    title = `${projectName} 工坊`;
    const [created] = await db
      .insert(boardConversations)
      .values({
        companyId: input.companyId,
        projectId: input.projectId,
        title,
        createdByUserId: input.createdByUserId ?? null,
        lastMessageAt: new Date(),
      })
      .returning();

    // 为该会话锚定一个常驻聚合 Issue (支持在发送首条消息前即可挂载需求附件)
    const issueSvc = issueService(db);
    const createdIssue = await issueSvc.create(input.companyId, {
      title: `Conversation ${title}`,
      description: `Standing issue for project ${projectName} board concierge conversation`,
      status: "todo",
      priority: "medium",
      projectId: input.projectId,
      createdByUserId: input.createdByUserId ?? null,
      responsibleUserId: input.createdByUserId ?? null,
      trustExplicitResponsibleUserId: Boolean(input.createdByUserId),
    });

    await db
      .update(boardConversations)
      .set({ issueId: createdIssue.id })
      .where(eq(boardConversations.id, created.id));

    conversationId = created.id;
    issueId = createdIssue.id;
    status = "created";
  }

  // 3. 首发需求主线任务引导（幂等；历史项目打开工坊即自愈）
  const cmmiWbs = await ensureProjectCmmiWbsTasks(db, {
    companyId: input.companyId,
    projectId: input.projectId,
    projectName,
    actorUserId: input.createdByUserId ?? null,
  }).catch((err) => {
    console.warn("[project-board-conversation] Failed to ensure CMMI initial requirement task:", err);
    return null;
  });

  return status === "created"
    ? { status: "created", conversationId, title, issueId: issueId as string, cmmiWbs }
    : { status: "exists", conversationId, title, issueId, cmmiWbs };
}
