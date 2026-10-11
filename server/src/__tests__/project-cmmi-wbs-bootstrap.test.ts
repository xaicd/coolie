import { beforeEach, describe, expect, it, vi } from "vitest";
import { issues as issuesTable, issueWorkProducts, agents as agentsTable } from "@paperclipai/db";
import type { Db } from "@paperclipai/db";
import {
  ensureProjectCmmiWbsTasks,
  advanceProjectCmmiStage,
} from "../services/project-cmmi-wbs-bootstrap.js";

describe("project-cmmi-wbs-bootstrap progressive pipeline", () => {
  let insertedIssues: any[] = [];
  let insertedWorkProducts: any[] = [];
  let existingIssues: any[] = [];
  let companyAgents: any[] = [];

  function makeMockDb(): Db {
    return {
      select: vi.fn((fields?: any) => {
        let currentTable: any = null;
        const chain: any = {
          from: vi.fn((t: any) => {
            currentTable = t;
            return chain;
          }),
          where: vi.fn(() => chain),
          limit: vi.fn(() => chain),
          then: (resolve: any, reject: any) => {
            if (currentTable === issuesTable) {
              const res = existingIssues.map((i) => ({
                id: i.id,
                title: i.title,
                wbsCode: i.wbsCode,
              }));
              return Promise.resolve(res).then(resolve, reject);
            }
            if (currentTable === agentsTable) {
              return Promise.resolve(companyAgents).then(resolve, reject);
            }
            return Promise.resolve([]).then(resolve, reject);
          },
        };
        return chain;
      }),
      insert: vi.fn((table: any) => {
        const chain: any = {
          values: vi.fn((vals: any) => {
            if (table === issuesTable) {
              const id = `issue-${insertedIssues.length + 1}`;
              const row = { id, ...vals };
              insertedIssues.push(row);
              existingIssues.push(row);
              return {
                returning: vi.fn(() => Promise.resolve([{ id }])),
              };
            }
            if (table === issueWorkProducts) {
              insertedWorkProducts.push(vals);
              return Promise.resolve();
            }
            return chain;
          }),
        };
        return chain;
      }),
    } as unknown as Db;
  }

  beforeEach(() => {
    insertedIssues = [];
    insertedWorkProducts = [];
    existingIssues = [];
    companyAgents = [
      { id: "agent-fda", name: "墨斗", role: "fda" },
      { id: "agent-swe", name: "铁匠", role: "core-swe" },
    ];
  });

  it("Day 0: only bootstraps G1 requirement task and SRS deliverable", async () => {
    const db = makeMockDb();
    const result = await ensureProjectCmmiWbsTasks(db, {
      companyId: "comp-1",
      projectId: "proj-1",
      projectName: "测试项目",
      actorUserId: "user-1",
    });

    expect(result.status).toBe("created");
    expect(result.count).toBe(1);
    expect(insertedIssues).toHaveLength(1);
    expect(insertedIssues[0].title).toContain("[G1·需求]");
    expect(insertedIssues[0].assigneeAgentId).toBe("agent-fda");
    expect(insertedIssues[0].wbsCode).toBe("2.1");

    expect(insertedWorkProducts).toHaveLength(1);
    expect(insertedWorkProducts[0].title).toBe("[SRS] 软件需求规格说明书与 RTM");
    expect(insertedWorkProducts[0].metadata?.resourceRef?.relativePath).toBe(
      "docs/02_requirements/software-requirements.md",
    );
  });

  it("Stage advance: advances to architecture and design upon G1 completion", async () => {
    const db = makeMockDb();
    // Pre-populate with G1 task
    existingIssues = [
      {
        id: "issue-g1",
        title: "[G1·需求] EARS 软件需求规格说明书 (SRS + RTM)",
        wbsCode: "2.1",
      },
    ];

    const result = await advanceProjectCmmiStage(db, {
      companyId: "comp-1",
      projectId: "proj-1",
      completedGate: "gate_g1_spec",
      actorUserId: "user-1",
    });

    expect(result.status).toBe("created");
    expect(result.count).toBe(2);
    expect(insertedIssues).toHaveLength(2);
    expect(insertedIssues[0].title).toContain("[G2·架构]");
    expect(insertedIssues[1].title).toContain("[G3-PRE·契约]");
    expect(insertedWorkProducts).toHaveLength(2);
  });

  it("Stage advance is idempotent: returns exists when tasks are already created", async () => {
    const db = makeMockDb();
    existingIssues = [
      {
        id: "issue-g1",
        title: "[G1·需求] EARS 软件需求规格说明书 (SRS + RTM)",
        wbsCode: "2.1",
      },
      {
        id: "issue-g2",
        title: "[G2·架构] 概要架构设计与选型 (HLD + DAR)",
        wbsCode: "3.1",
      },
      {
        id: "issue-g3",
        title: "[G3-PRE·契约] 详细设计说明书与接口契约 (LLD + ERD)",
        wbsCode: "3.2",
      },
    ];

    const result = await advanceProjectCmmiStage(db, {
      companyId: "comp-1",
      projectId: "proj-1",
      completedGate: "gate_g1_spec",
      actorUserId: "user-1",
    });

    expect(result.status).toBe("exists");
    expect(result.count).toBe(0);
    expect(insertedIssues).toHaveLength(0);
  });

  it("Full Pipeline Progression: G2 -> G3/G4 -> G5 -> G6 -> G7", async () => {
    const db = makeMockDb();

    // 1. Advance through G2 (Architecture complete -> Implementation & Eval)
    const resG2 = await advanceProjectCmmiStage(db, {
      companyId: "comp-1",
      projectId: "proj-1",
      completedGate: "gate_g2_arch",
      actorUserId: "user-1",
    });
    expect(resG2.status).toBe("created");
    expect(resG2.count).toBe(2);
    expect(insertedIssues.some((i) => i.title.includes("[G3·研发]"))).toBe(true);
    expect(insertedIssues.some((i) => i.title.includes("[G4·验收]"))).toBe(true);

    // 2. Advance through G4 (Verification complete -> Release)
    const resG4 = await advanceProjectCmmiStage(db, {
      companyId: "comp-1",
      projectId: "proj-1",
      completedGate: "gate_g4_eval",
      actorUserId: "user-1",
    });
    expect(resG4.status).toBe("created");
    expect(insertedIssues.some((i) => i.title.includes("[G5·投产]"))).toBe(true);

    // 3. Advance through G5 (Release complete -> SRE)
    const resG5 = await advanceProjectCmmiStage(db, {
      companyId: "comp-1",
      projectId: "proj-1",
      completedGate: "gate_g5_release",
      actorUserId: "user-1",
    });
    expect(resG5.status).toBe("created");
    expect(insertedIssues.some((i) => i.title.includes("[G6·SRE]"))).toBe(true);

    // 4. Advance through G6 (SRE complete -> Operations G7)
    const resG6 = await advanceProjectCmmiStage(db, {
      companyId: "comp-1",
      projectId: "proj-1",
      completedGate: "gate_g6_sre",
      actorUserId: "user-1",
    });
    expect(resG6.status).toBe("created");
    expect(insertedIssues.some((i) => i.title.includes("[G7·运营]"))).toBe(true);
  });
});
