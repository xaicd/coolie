import { beforeEach, describe, expect, it, vi } from "vitest";
import { boardConversations, issues as issuesTable, projects as projectsTable } from "@paperclipai/db";
import type { Db } from "@paperclipai/db";
import { ensureProjectBoardConversation } from "../services/project-board-conversation.js";

const mockIssueService = vi.hoisted(() => ({
  create: vi.fn(),
}));

const mockCmmiBootstrap = vi.hoisted(() => ({
  ensureProjectCmmiWbsTasks: vi.fn(),
}));

vi.mock("../services/index.js", () => ({
  issueService: () => mockIssueService,
}));

vi.mock("../services/project-cmmi-wbs-bootstrap.js", () => ({
  ensureProjectCmmiWbsTasks: mockCmmiBootstrap.ensureProjectCmmiWbsTasks,
}));

function makeFakeDb(opts: { conversations?: any[]; issues?: any[]; projects?: any[] } = {}) {
  const conversations = opts.conversations ?? [];
  const issueRows = opts.issues ?? [];
  const projectRows = opts.projects ?? [];
  const rowsFor = (table: unknown) =>
    table === boardConversations
      ? conversations
      : table === issuesTable
        ? issueRows
        : table === projectsTable
          ? projectRows
          : [];

  const select = vi.fn(() => {
    let table: unknown;
    const chain: any = {
      from: (t: unknown) => {
        table = t;
        return chain;
      },
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      then: (resolve: any, reject: any) =>
        Promise.resolve(rowsFor(table)).then(resolve, reject),
    };
    return chain;
  });

  const update = vi.fn(() => {
    const chain: any = {
      set: (val: Record<string, unknown>) => {
        if (conversations.length > 0 && val.issueId) {
          conversations[0].issueId = val.issueId;
        }
        return chain;
      },
      where: () => chain,
      then: (resolve: any, reject: any) => Promise.resolve([]).then(resolve, reject),
    };
    return chain;
  });

  const insert = vi.fn(() => {
    let captured: Record<string, unknown> = {};
    const chain: any = {
      values: (v: Record<string, unknown>) => {
        captured = { id: "conv-new-1", issueId: null, ...v };
        conversations.push(captured);
        return chain;
      },
      returning: () => Promise.resolve([captured]),
      then: (resolve: any, reject: any) => Promise.resolve([captured]).then(resolve, reject),
    };
    return chain;
  });

  return { select, insert, update } as unknown as Db;
}

describe("ensureProjectBoardConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCmmiBootstrap.ensureProjectCmmiWbsTasks.mockResolvedValue({ status: "created", count: 1, issueIds: ["issue-g1"] });
  });

  it("creates a project board conversation and anchors its issue for a new project", async () => {
    mockIssueService.create.mockResolvedValueOnce({ id: "issue-anchored-1" });
    const db = makeFakeDb({ conversations: [] });

    const result = await ensureProjectBoardConversation(db, {
      companyId: "comp-1",
      projectId: "proj-1",
      projectName: "产融智能体平台",
      createdByUserId: "user-1",
    });

    expect(result.status).toBe("created");
    expect(result.title).toBe("产融智能体平台 工坊");
    expect(result.issueId).toBe("issue-anchored-1");
    expect(mockIssueService.create).toHaveBeenCalledWith("comp-1", expect.objectContaining({
      title: "Conversation 产融智能体平台 工坊",
      projectId: "proj-1",
    }));
    // 首发需求主线任务随工坊会话一并幂等引导
    expect(mockCmmiBootstrap.ensureProjectCmmiWbsTasks).toHaveBeenCalledWith(db, expect.objectContaining({
      companyId: "comp-1",
      projectId: "proj-1",
      projectName: "产融智能体平台",
      actorUserId: "user-1",
    }));
    expect(result.cmmiWbs).toEqual({ status: "created", count: 1, issueIds: ["issue-g1"] });
  });

  it("returns existing conversation without duplicating when called again", async () => {
    const existing = {
      id: "conv-existing-1",
      companyId: "comp-1",
      projectId: "proj-1",
      title: "产融智能体平台 工坊",
      issueId: "issue-anchored-1",
      archivedAt: null,
    };
    const db = makeFakeDb({ conversations: [existing] });

    const result = await ensureProjectBoardConversation(db, {
      companyId: "comp-1",
      projectId: "proj-1",
      projectName: "产融智能体平台",
      createdByUserId: "user-1",
    });

    expect(result.status).toBe("exists");
    expect(result.conversationId).toBe("conv-existing-1");
    expect(result.title).toBe("产融智能体平台 工坊");
    expect(result.issueId).toBe("issue-anchored-1");
    expect(mockIssueService.create).not.toHaveBeenCalled();
  });

  it("self-heals a pre-existing conversation by bootstrapping the initial requirement task", async () => {
    const existing = {
      id: "conv-existing-1",
      companyId: "comp-1",
      projectId: "proj-1",
      title: "极速流水线验证项目 工坊",
      issueId: "issue-anchored-1",
      archivedAt: null,
    };
    const db = makeFakeDb({ conversations: [existing] });
    mockCmmiBootstrap.ensureProjectCmmiWbsTasks.mockResolvedValueOnce({ status: "created", count: 1, issueIds: ["issue-g1-new"] });

    const result = await ensureProjectBoardConversation(db, {
      companyId: "comp-1",
      projectId: "proj-1",
      projectName: "极速流水线验证项目",
      createdByUserId: "user-1",
    });

    expect(result.status).toBe("exists");
    expect(mockCmmiBootstrap.ensureProjectCmmiWbsTasks).toHaveBeenCalledTimes(1);
    expect(result.cmmiWbs).toEqual({ status: "created", count: 1, issueIds: ["issue-g1-new"] });
  });

  it("resolves project name from projects table when projectName is omitted", async () => {
    mockIssueService.create.mockResolvedValueOnce({ id: "issue-anchored-lazy" });
    const db = makeFakeDb({
      projects: [{ id: "proj-2", companyId: "comp-1", name: "云南移动企微" }],
    });

    const result = await ensureProjectBoardConversation(db, {
      companyId: "comp-1",
      projectId: "proj-2",
      createdByUserId: "user-1",
    });

    expect(result.status).toBe("created");
    expect(result.title).toBe("云南移动企微 工坊");
    expect(result.issueId).toBe("issue-anchored-lazy");
  });
});
