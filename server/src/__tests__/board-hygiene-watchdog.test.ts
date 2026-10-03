import { beforeEach, describe, expect, it, vi } from "vitest";
import { companies, heartbeatRuns, issues } from "@paperclipai/db";
import type { Db } from "@paperclipai/db";
import { boardHygieneWatchdogService } from "../services/board-hygiene-watchdog.js";
import { logActivity } from "../services/activity-log.js";

vi.mock("../services/activity-log.js", () => ({
  logActivity: vi.fn(async () => ({ id: "activity-row" })),
}));

const COMPANY_ID = "22222222-2222-4222-8222-222222222222";
const ISSUE_ID = "55555555-5555-4555-8555-555555555555";
const RUN_ID = "11111111-1111-4111-8111-111111111111";
const AGENT_ID = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-10-04T04:00:00.000Z");

type Row = Record<string, unknown>;

// 有描述、有负责人的正常工单: 规则 1-3 都不应命中, 孤儿检测独立判定。
function issueRow(overrides: Row = {}): Row {
  return {
    id: ISSUE_ID,
    identifier: "COOA-4",
    title: "真实工单",
    description: "有描述有负责人的真实工单",
    status: "in_progress",
    assigneeAgentId: AGENT_ID,
    createdAt: new Date(NOW.getTime() - 3 * 3600_000),
    updatedAt: new Date(NOW.getTime() - 3600_000),
    checkoutRunId: null,
    ...overrides,
  };
}

function runRow(overrides: Row = {}): Row {
  return {
    id: RUN_ID,
    status: "failed",
    agentId: AGENT_ID,
    finishedAt: new Date(NOW.getTime() - 3600_000),
    createdAt: new Date(NOW.getTime() - 3_700_000),
    error: "acpx_turn_failed: terminal access failure",
    ...overrides,
  };
}

// 查询链按表分发; 工单行/运行行由用例直接给定 (孤儿检测每次只对通过
// 廉价前置条件的候选工单发一次 runs 查询, 单候选用例无需区分 where)。
function makeWatchdogDb(config: { issues: Row[]; runs: Row[] }) {
  return {
    select: () => ({
      from: (table: unknown) => {
        if (table === issues) {
          return {
            where: () => ({
              then: (resolve: (rows: Row[]) => unknown) => resolve(config.issues),
            }),
          };
        }
        if (table === heartbeatRuns) {
          return {
            where: () => ({
              orderBy: () => ({
                limit: () => ({
                  then: (resolve: (rows: Row[]) => unknown) => resolve(config.runs),
                }),
              }),
            }),
          };
        }
        throw new Error(`unexpected select from ${String(table)}`);
      },
    }),
    update: () => ({
      set: () => ({
        where: () => ({ then: (resolve: (rows: Row[]) => unknown) => resolve([]) }),
      }),
    }),
    insert: () => {
      throw new Error("insert not expected: logActivity is mocked in this suite");
    },
  } as unknown as Db;
}

function audit(config: { issues: Row[]; runs: Row[] }) {
  return boardHygieneWatchdogService(makeWatchdogDb(config)).auditCompany(COMPANY_ID, {
    now: NOW,
  });
}

describe("board hygiene watchdog orphan fake-death detection", () => {
  beforeEach(() => {
    vi.mocked(logActivity).mockClear();
  });

  it("flags an issue whose latest run terminally failed with no active follow-up", async () => {
    const result = await audit({
      issues: [issueRow({ checkoutRunId: RUN_ID })],
      runs: [runRow({})],
    });

    expect(result.orphanIssues).toHaveLength(1);
    expect(result.orphanIssues[0]).toMatchObject({
      id: ISSUE_ID,
      identifier: "COOA-4",
      failedRunId: RUN_ID,
      failedRunStatus: "failed",
      agentId: AGENT_ID,
      checkoutRunId: RUN_ID,
    });
    expect(logActivity).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logActivity).mock.calls[0][1]).toMatchObject({
      actorType: "system",
      actorId: "board-hygiene-watchdog",
      action: "board.orphan_issue_detected",
      entityType: "issue",
      entityId: ISSUE_ID,
      details: { failedRunId: RUN_ID, failedRunStatus: "failed" },
    });
  });

  it("does not flag when an active run exists after the failure", async () => {
    const result = await audit({
      issues: [issueRow({})],
      runs: [
        runRow({ id: RUN_ID, status: "running", finishedAt: null, createdAt: new Date(NOW.getTime() - 300_000) }),
        runRow({}),
      ],
    });

    expect(result.orphanIssues).toHaveLength(0);
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("does not flag when a scheduled_retry is pending behind the failure", async () => {
    const result = await audit({
      issues: [issueRow({})],
      runs: [
        runRow({ id: RUN_ID, status: "scheduled_retry", finishedAt: null, createdAt: new Date(NOW.getTime() - 600_000) }),
        runRow({}),
      ],
    });

    expect(result.orphanIssues).toHaveLength(0);
  });

  it("does not flag when the latest run succeeded after an older failure", async () => {
    const result = await audit({
      issues: [issueRow({})],
      runs: [
        runRow({ id: RUN_ID, status: "succeeded", finishedAt: new Date(NOW.getTime() - 300_000), error: null }),
        runRow({}),
      ],
    });

    expect(result.orphanIssues).toHaveLength(0);
  });

  it("stays silent when the terminal failure itself is still inside the grace window", async () => {
    // 工单 updatedAt 早失新 (前置条件放行, runs 查询真正发出), 但失败本身
    // 还在宽限期内 —— 由 run 时间戳分支独立兜住。
    const result = await audit({
      issues: [issueRow({ updatedAt: new Date(NOW.getTime() - 2 * 3600_000) })],
      runs: [runRow({ finishedAt: new Date(NOW.getTime() - 300_000), createdAt: new Date(NOW.getTime() - 400_000) })],
    });

    expect(result.orphanIssues).toHaveLength(0);
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("ignores waiting-path statuses (in_review/blocked) while scans still count them", async () => {
    const result = await audit({
      issues: [
        issueRow({ status: "in_review" }),
        issueRow({ id: "66666666-6666-4666-8666-666666666666", status: "blocked" }),
      ],
      runs: [runRow({})],
    });

    expect(result.scannedCount).toBe(2);
    expect(result.orphanIssues).toHaveLength(0);
    expect(logActivity).not.toHaveBeenCalled();
  });
});
