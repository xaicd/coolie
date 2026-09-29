# wave152 审计 — 治理 (A/B) + 可观察性 (C/D)

范围: PM 从 Palantir 总 PM 视角挑出的 4 件——审计全留痕、数据隔离补全、失败率/周期/产能 metrics、
缺陷 KB + 自动 playbook。纪律见 `docs-coolie/evidence/wave152/QA-REPORT.md` §0。

## 1. 为什么要一张新表（而非复用 activity_log）

`activity_log`（migration 0177）是**信息流**：记录“发生了某事”，UI 当时间线读，**无 before/after**。
治理要的是**记录**：谁、把哪个受治对象、从什么改成什么，且不可变、可独立检索。二者职责不同，
故新增 `audit_log` 而不是塞进 activity_log（后者被大量读路径依赖，改其语义风险大）。

## 2. 设计决定（可追溯）

1. **写点不放在通用中间件**。审计需要对象的**语义 diff**（before→after），只有写点知道；
   通用 Express middleware 拿不到。故 `server/src/middleware/audit.ts` 只提供
   `auditActorFromRequest`/`pickFields`/`recordAudit` 三个原语，由各写点调用。
   → grep `recordAudit` / `writeAuditLog` 即可枚举“受治动作”全集。
2. **事务内写**：issue 的 status/assignee 审计写在 `issueService.update` 的同一事务里
   （`tx` 句柄），回滚则审计一并回滚——不会出现“记了但没发生”。
3. **噪音过滤**：heartbeat/read/list 不写。`issueService.update` 用既有的 `buildIssueChanges`
   真 diff，只记真正变化的字段。
4. **指纹口径**：`defect_kb.fingerprint = sha1(normalize(title) + '|' + severity)`。
   `source` 不入指纹（同一缺陷会从 web/app 两面被发现），`reproSteps/evidence` 每次不同，也不入。
5. **关闭钩子的并发安全**：issue 关闭走**事务**路径（`status==="done"` 强制
   `shouldUseTransactionalIssueUpdate`）。KB 计数写在该事务句柄上（原子），
   playbook 任务在**嵌套事务（SAVEPOINT）**里创建——任务失败只回滚任务，不炸老板的关闭。
   活机实测：直接在 HTTP 路径关闭缺陷 → `defect_kb.count` 递增（§QA §4）。

## 3. 与既有系统的关系

- 不动 CMMI（G1–G5）：本波是治理/可观察面，不碰 `ontology`/`cmmi` 命名空间。
- 不动 board-chat 行为：仅在 wave148 的 conversation 三路由**追加**审计写点。
- 与 wave154 ontology-graph 无耦合；两者只是共用 `app.ts`/`routes/index.ts` 注册位。

## 4. 已知偏差

- brief 号段 `9009` 被占、`9010` 被并发线抢注 → 表落在 **9011**（`9011_add_audit_log_and_defect_kb.sql`）。
- 无 SQL backfill：实例无 pgcrypto，无法在 SQL 侧复算与服务一致的 SHA1 指纹，故 `defect_kb`
  由运行时逐次累积（避免 SQL/Node 指纹不一致导致去重错乱）。
- UI 未做（延期）；审计未覆盖 agent 任命/停用、role/permission、app_releases 发布。
