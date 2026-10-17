import { test } from "node:test";
import assert from "node:assert/strict";

import {
  decideRoutineResume,
  describeRoutineResumeDecision,
  isHumanAuthoredRevision,
  normalizeRevisions,
  revisionAuthorKind,
  revisionRoutineStatus,
} from "./routine-pause-authority.mjs";

const humanPause = {
  id: "rev-9",
  revisionNumber: 9,
  createdAt: "2026-10-17T16:49:12.518Z",
  createdByAgentId: null,
  createdByUserId: "local-board",
  changeSummary: "Updated routine",
  snapshot: { routine: { status: "paused" } },
};

const agentActive = {
  id: "rev-10",
  revisionNumber: 10,
  createdAt: "2026-10-17T17:28:06.867Z",
  createdByAgentId: "5419bef9-6b72-477b-a5e4-0fe19aac5b77",
  createdByUserId: null,
  changeSummary: "Updated routine",
  snapshot: { routine: { status: "active" } },
};

const agentPause = {
  id: "rev-12",
  revisionNumber: 12,
  createdAt: "2026-10-17T18:55:00.000Z",
  createdByAgentId: "5419bef9-6b72-477b-a5e4-0fe19aac5b77",
  createdByUserId: null,
  changeSummary: "Updated routine",
  snapshot: { routine: { status: "paused" } },
};

test("revision 作者归因: human / agent / unknown 三分类", () => {
  assert.equal(revisionAuthorKind(humanPause), "human");
  assert.equal(revisionAuthorKind(agentActive), "agent");
  assert.equal(revisionAuthorKind({ createdByUserId: "local-board", createdByAgentId: "a1" }), "human");
  assert.equal(revisionAuthorKind({}), "unknown");
  assert.equal(revisionAuthorKind(null), "unknown");
  assert.equal(isHumanAuthoredRevision(humanPause), true);
  assert.equal(isHumanAuthoredRevision(agentActive), false);
});

test("revision 快照 status 读取: 缺字段返回 null 而不是猜", () => {
  assert.equal(revisionRoutineStatus(humanPause), "paused");
  assert.equal(revisionRoutineStatus({ snapshot: {} }), null);
  assert.equal(revisionRoutineStatus({}), null);
});

test("revisions 回包归一: 数组 / {revisions} 都接, 按新→旧排序", () => {
  assert.deepEqual(normalizeRevisions([humanPause, agentActive]).map((r) => r.id), ["rev-10", "rev-9"]);
  assert.deepEqual(normalizeRevisions({ revisions: [humanPause, agentActive] }).map((r) => r.id), ["rev-10", "rev-9"]);
  assert.deepEqual(normalizeRevisions(null), []);
  const same = [
    { id: "b", revisionNumber: 2, createdAt: "2026-10-17T00:00:00Z" },
    { id: "a", revisionNumber: 1, createdAt: "2026-10-17T00:00:00Z" },
  ];
  assert.deepEqual(normalizeRevisions(same).map((r) => r.id), ["b", "a"]);
});

test("routine 已是 active → noop (不写库)", () => {
  assert.deepEqual(decideRoutineResume({ routineStatus: "active", revisions: [humanPause] }), {
    action: "noop",
    reason: "already_active",
  });
});

test("★ 真人暂停 (local-board, revision 9) 是最近一条 → skip_paused, 不自愈覆盖", () => {
  const olderAgent = { ...agentActive, id: "rev-8", revisionNumber: 8, createdAt: "2026-10-16T09:31:57.476Z" };
  const decision = decideRoutineResume({ routineStatus: "paused", revisions: [humanPause, olderAgent] });
  assert.equal(decision.action, "skip_paused");
  assert.equal(decision.reason, "explicit_pause_recorded");
  assert.equal(decision.pausedBy, "human");
  assert.equal(decision.actorUserId, "local-board");
  assert.equal(decision.revisionId, "rev-9");
  assert.equal(decision.authoredAt, "2026-10-17T16:49:12.518Z");
});

test("★ agent 依人的意图把 routine 停回去 (revision 12) → 也被尊重, 不被自己的自愈推翻", () => {
  const decision = decideRoutineResume({ routineStatus: "paused", revisions: [agentPause, humanPause] });
  assert.equal(decision.action, "skip_paused");
  assert.equal(decision.pausedBy, "agent");
  assert.equal(decision.revisionId, "rev-12");
});

test("最后一次决策是 active, 运行时却是 paused → 运行态丢了, 自愈 resume", () => {
  const decision = decideRoutineResume({ routineStatus: "paused", revisions: [agentActive, humanPause] });
  assert.equal(decision.action, "resume");
  assert.equal(decision.reason, "runtime_desync_with_active_revision");
});

test("快照没记 status 的 revision 不构成暂停证据 → 交给运行态一致性判断", () => {
  const noStatus = { id: "rev-13", revisionNumber: 13, createdAt: "2026-10-17T19:00:00Z", createdByUserId: "local-board", snapshot: {} };
  const decision = decideRoutineResume({ routineStatus: "paused", revisions: [noStatus] });
  assert.equal(decision.action, "resume");
  assert.equal(decision.reason, "runtime_desync_with_active_revision");
});

test("没有 revision 历史 → 无法归因, 按心法 #49 当运行态丢失自愈", () => {
  assert.equal(decideRoutineResume({ routineStatus: "paused", revisions: [] }).action, "resume");
  assert.equal(decideRoutineResume({ routineStatus: "paused" }).action, "resume");
  assert.equal(decideRoutineResume({ routineStatus: "paused" }).reason, "no_revision_history");
});

test("--force 逃生门: 即使有明确暂停记录也 resume", () => {
  const decision = decideRoutineResume({ routineStatus: "paused", revisions: [humanPause], force: true });
  assert.equal(decision.action, "resume");
  assert.equal(decision.reason, "force_requested");
});

test("人读描述: 各自说清 '为什么不动 / 为什么动'", () => {
  assert.match(describeRoutineResumeDecision({ action: "noop" }), /已是 active/);
  const human = describeRoutineResumeDecision({
    action: "skip_paused",
    status: "paused",
    recordedStatus: "paused",
    pausedBy: "human",
    actorUserId: "local-board",
    authoredAt: "2026-10-17T16:49:12.518Z",
  });
  assert.match(human, /local-board/);
  assert.match(human, /主动暂停/);
  assert.match(human, /--force/);
  const agent = describeRoutineResumeDecision({
    action: "skip_paused",
    status: "paused",
    recordedStatus: "paused",
    pausedBy: "agent",
    actorAgentId: "5419bef9",
    authoredAt: "2026-10-17T18:55:00.000Z",
  });
  assert.match(agent, /agent 5419bef9/);
  assert.match(
    describeRoutineResumeDecision({ action: "resume", status: "paused", reason: "no_revision_history" }),
    /运行态丢失/,
  );
});
