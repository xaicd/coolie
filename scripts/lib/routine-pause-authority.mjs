/**
 * routine-pause-authority — 谁有权让一个 routine 保持停着
 *
 * ## 为什么需要这个模块
 *
 * `scripts/setup-long-term-routine.mjs` 的幂等 resume(心法 #49)原本写着:
 *   "不论当前 status 是什么, 都强制拉回 active"
 *
 * 这条规则救过一次真事故(调度器 paused 后静默停摆), 但它分不清两种截然不同的 paused:
 *
 *   a) 运行态丢了(迁移/重启/运维误操作, 没有任何人写过 pause) —— 该自愈, 否则守护网静默死掉;
 *   b) **有人显式写了 pause** —— 自愈就是越权: 把人的决定改回去, 而且下一轮再跑脚本还会再改一次。
 *
 * 真实事故(2026-10-17): 掌柜 00:49 CST 在面板上把心祖 routine 停掉
 * (revision 9, createdByUserId=local-board, snapshot.routine.status=paused);
 * 心跳 #265 按心法 #49 用 PATCH status=active 把它强行拉回, 之后 15 分钟一跳跑了一整夜,
 * 堆出 COOA-463~472 十余张执行单 —— 人的一次暂停被 agent 静默撤销, 且没有任何提示。
 *
 * ## 判定口径(保守, 可归因即尊重)
 *
 * 看最近一次 revision 把 routine 写成了什么:
 *   - 写的是非 active  → 有人显式停过它 ⇒ **尊重, 不 resume**(记清是谁/何时, 便于人复核)
 *   - 写的是 active    → 但运行时是非 active ⇒ 运行态与最后决策不一致(丢了)⇒ resume
 *   - 没有 revision 历史 → 无法归因 ⇒ resume(心法 #49 的自愈场景)
 *   - --force          → 人显式要求忽略保护(脚本逃生门)
 *
 * 这条口径同时放过 agent 自己的 pause(例如 agent 依照人的暂停意图把 routine 停回去),
 * 否则"恢复人的意图"这个动作会在下一轮被自己的自愈逻辑推翻。
 *
 * 纯函数, 无 IO —— 好测, 也好复用(体检脚本、心跳快照都能用同一口径)。
 */

/** revision 作者类型: human(board 用户) / agent / unknown。 */
export function revisionAuthorKind(revision) {
  if (!revision || typeof revision !== "object") return "unknown";
  const userId = revision.createdByUserId ?? null;
  const agentId = revision.createdByAgentId ?? null;
  if (agentId && !userId) return "agent";
  if (userId && !agentId) return "human";
  if (userId && agentId) return "human";
  return "unknown";
}

/** 兼容旧调用名。 */
export function isHumanAuthoredRevision(revision) {
  return revisionAuthorKind(revision) === "human";
}

/** revision 快照里 routine 当时的 status(缺失时返回 null, 不猜)。 */
export function revisionRoutineStatus(revision) {
  const snapshot = revision?.snapshot;
  if (!snapshot || typeof snapshot !== "object") return null;
  const routine = snapshot.routine;
  if (!routine || typeof routine !== "object") return null;
  return typeof routine.status === "string" ? routine.status : null;
}

/** revisions 端点可能返回数组, 也可能包一层 { revisions: [...] }; 统一成按新→旧排序的数组。 */
export function normalizeRevisions(input) {
  const list = Array.isArray(input)
    ? input
    : Array.isArray(input?.revisions)
      ? input.revisions
      : [];
  return [...list].sort((a, b) => {
    const at = Date.parse(a?.createdAt ?? "") || 0;
    const bt = Date.parse(b?.createdAt ?? "") || 0;
    if (bt !== at) return bt - at;
    return (b?.revisionNumber ?? 0) - (a?.revisionNumber ?? 0);
  });
}

/**
 * 决策: 当前非 active 的 routine, 该不该被脚本 resume 回 active?
 *
 * @param {object} input
 * @param {string} input.routineStatus   routine 当前 status
 * @param {Array|object} [input.revisions] revisions 端点原始回包
 * @param {boolean} [input.force]         显式忽略暂停保护
 * @returns {{action: "noop"|"resume"|"skip_paused", reason: string,
 *            status?: string, pausedBy?: "human"|"agent"|"unknown",
 *            revisionId?: string|null, actorUserId?: string|null,
 *            actorAgentId?: string|null, authoredAt?: string|null}}
 */
export function decideRoutineResume({ routineStatus, revisions, force = false } = {}) {
  if (routineStatus === "active") return { action: "noop", reason: "already_active" };

  if (force) {
    return { action: "resume", reason: "force_requested", status: routineStatus };
  }

  const latest = normalizeRevisions(revisions)[0] ?? null;
  if (!latest) {
    return { action: "resume", reason: "no_revision_history", status: routineStatus };
  }

  const recordedStatus = revisionRoutineStatus(latest);
  if (recordedStatus !== null && recordedStatus !== "active") {
    return {
      action: "skip_paused",
      reason: "explicit_pause_recorded",
      status: routineStatus,
      recordedStatus,
      pausedBy: revisionAuthorKind(latest),
      revisionId: latest.id ?? null,
      actorUserId: latest.createdByUserId ?? null,
      actorAgentId: latest.createdByAgentId ?? null,
      authoredAt: latest.createdAt ?? null,
    };
  }

  // 最后一次决策是 active(或快照没记 status), 运行时却是非 active ⇒ 运行态丢了, 自愈
  return {
    action: "resume",
    reason: "runtime_desync_with_active_revision",
    status: routineStatus,
  };
}

/** 人读一行: 为什么不动 / 为什么动。 */
export function describeRoutineResumeDecision(decision) {
  if (!decision || typeof decision !== "object") return "routine resume: 无决策";
  if (decision.action === "noop") return "routine 已是 active, 无需 resume";
  if (decision.action === "skip_paused") {
    const who = decision.pausedBy === "human"
      ? (decision.actorUserId ?? "human")
      : decision.pausedBy === "agent"
        ? `agent ${decision.actorAgentId ?? ""}`.trim()
        : "未署名变更";
    const when = decision.authoredAt ?? "未知时间";
    return `routine 当前 status=${decision.status}, 最近一次变更由 ${who} 于 ${when} 显式写成 ${decision.recordedStatus ?? decision.status} —— 属主动暂停, 尊重并跳过自愈 (需 --force 才覆盖)`;
  }
  return `routine 当前 status=${decision.status}, 归因为运行态丢失 (${decision.reason}), 幂等 resume → active`;
}
