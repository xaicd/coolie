# PROD-DEPLOY-REPORT — 请求日志脱敏投产与生产复核 (COOA-19)

**Wave**: wave284-附发现 · **Employee**: 兑底渊 (duidiyuan-pre-sre) · **Date**: 2026-10-03
**上游**: COOA-18 (代码修复, 铁匠) · commit `67f802d02` (redaction) → 本单投产基线 `d32203114`
**性质**: 投产 (deploy) + 生产复核 (smoke/journald) + 历史泄漏评估 (只读)
**本机投产源**: 干净 worktree (`git worktree add --detach`, tracked 树 0 改动), 非 --allow-dirty

---

## 1. 结论 (TL;DR)

1. **投产完成**: `d32203114` (main 快照, 含 `67f802d02` 脱敏修复 + `59b306059`/`e234e4c25` 服务端收尾) 经 `scripts/deploy-coolie.sh` 全绿上线 (22:49:39 CST 重启): upgrade feed 双断言、UI 重建 + `server/ui-dist` 刷新、health (loopback+公网)、ICP 备案号、www 全过。生产现跑 server 内容 == 当下 main (`6fbb1feb0` 与 `d32203114` 差异仅 toolchain/docs, 已核)。
2. **脱敏生产验证通过**: 带 `x-paperclip-api-key` 头的 3 条 smoke (公网 401×2 + loopback×1) 落 journal 后: 完整 key 值 **0 处**、伪造 key 串 **0 处**、`"x-paperclip-api-key":"[Redacted]"` **恰好 3 行** —— 逐条对应。采样行截到 `"x-paperclip-api-key":"[Redact` 即是打码点。
3. **历史泄漏比工单描述严重**: 保留期 (9/18 起) 内共 **627 行**请求日志 dump 了完整 `x-paperclip-api-key` 值, 涉及 **5 种凭证形态** (不止 16:32 smoke + 09:00 401 探测两处)。轮换决策已以 request_confirmation 提请 owner, 见 §4。

## 2. 投产过程与基线决策

**投产前生产现场** (勘定, 2026-10-03 20:0x–22:3x):
- 本日 ~17:10–17:17 有人从**在途脏树**同步过生产 (`client.ts` mtime 17:10 = COOA-17 终版内容 e40ea81e; `index.ts`/`companies.ts`/`cross-issue-influence-limit*` mtime 17:16–17:17 = 当时未提交 WIP), host 不对应任何 commit; 该 WIP 于 17:22–17:23 被铁匠落为 `59b306059`/`e234e4c25`。
- 16:32 进程之后另有两次重启 (17:17–19:56 间一次, 19:57:55 一次), 发起者均未在板上留痕; 19:57:55 起运行进程已含脱敏代码 (host `http-log-redaction.ts` md5 == main), 但 host 树不可复现。
- 本单此前一次投产尝试 (干净 worktree @ a2a3bdd27) 在 rsync 前被会话中断杀死, 未触碰生产。

**基线决策**: 等在途工作落地 (round-1 已落, `e234e4c25`) 而非 --allow-dirty; round-2 WIP (`board-hygiene-watchdog.ts` 迭代中, 截至投产时未提交) **不上生产**。部署源为 detached 干净 worktree, 快照 `d32203114`, 与共享工作树零接触。

**重启噪声对账** (已知签名, 勿再排查): 22:49:39 重启出现 plugin worker `SIGTERM…crashed` ×N 与 22:49:56 ontology worker 1 次 `host handler error: Failed query … companies` (启动竞态自愈, plugin-loader 5/5)。此外 journal 无新增异常; `databaseBackup status ok`。

## 3. 部署后验证 (交付 2)

| # | 路径 | 请求 | HTTP | journal 完整 key 值 | header 落盘形态 |
|---|---|---|---|---|---|
| 1 | 公网 `/api/agents/me` | 本 run 真 key | 401 | 0 | `[Redacted]` |
| 2 | 公网 `/api/agents/me` | 伪造 key `wrong-key-smoke-cooa19-redaction` | 401 | 0 | `[Redacted]` |
| 3 | loopback `127.0.0.1:3100/api/agents/me` | 本 run 真 key (经 stdin 传头, 不入 argv) | 401 | 0 | `[Redacted]` |

- 校验窗口 `--since 22:49:30` (298 行): 真 key 全值匹配 **0**; 伪造 key 串匹配 **0**; `"x-paperclip-api-key":"[Redacted]"` **3**。泄漏形态 (200 smoke 与 401 探测两条路) 均已堵上; 脱敏对值不敏感 (打码在中间件、先于鉴权), COOA-18 单测 200/401 两档已红→绿。
- **附带发现 (非本修回归)**: `x-paperclip-api-key` 头在 `/api/agents/me` 上即使 loopback 也 401 —— 该头的鉴权作用域应是 board-concierge 代理路由, agent 控制面调用走 `Authorization: Bearer` (本 run 全程如此)。密钥头与鉴权面的对应关系建议后续单独厘清 (不阻塞本单)。

## 4. 历史条目评估 (交付 3) — 事实与决策请求

**事实** (只读采集, 未对泄漏值做活性验证 —— 不应拿泄漏凭证打真实 API; 采集用临时文件 root:600, 用毕即删):

| 形态 (12 位前缀) | 行数 | 推断 |
|---|---|---|
| `b806deb5c7ac…` | 436 | 高频 board/concierge 凭证 (COOA-18 工单记录的 16:32 泄漏值 `b8…51` 即此形态) |
| `pcp_board_09…` | 88 | board API key |
| `pcp_board_a3…` | 48 | board API key |
| `eyJhbGciOiJI…` (JWT) | 39 | JWT 形态凭证 |
| `pcp_board_4f…` | 4 | board API key |
| `wrong-key…` | 3 | 无效探测值 (无危害) |

- 落盘窗口: journald 保留期自 9/18 (~半月), 即最长已暴露 ~2 周; journal 为 root:600 持久化, 单租户 VM, 读面 = root/adjacent log 组。
- **本 run 的 key 不在泄漏集** (全值 grep = 0), 本次复核未新增泄漏。
- 泄漏根因 (请求日志 dump 全量 headers) 已由 `67f802d02` 堵上并经 §3 验证。

**决策请求** (request_confirmation, owner 拍板):
- **A (建议) 轮换**: 对上表 5 种形态全部轮换 (board API key 生成/注入归 owner 侧, 轮换后需同步所有 agent 注入; deployer 待命做轮换后生产复核)。泄漏的是 board 级凭证且量大自然轮换, 唯此能根治。
- **B vacuum 收缩**: `journalctl --vacuum-time` 只能缩窗口、毁审计线索, 不解决"已泄漏", 不建议单独作为方案 (可作 A 的补充: 轮换完成后对旧 key 区间 vacuum)。
- **C 等自然过期**: 仅当 owner 接受 board 级凭证再暴露 ~2 周 (磁盘 root-only 前提下风险有限) 时可选; 零操作成本。

## 5. 遗留与移交

- owner: §4 决策 (A/B/C) → 轮换执行与 agent 注入同步。
- 铁匠 (在途, 不阻塞本单): round-2 `board-hygiene-watchdog.ts` WIP 落地后随常规 wave 投产即可 (届时 host 已回 commit 基线, 正常 sync 增量)。
- 复核命令模板沿用 [[coolie-production-environment]]; 泄漏计数复验: 对 journal 全量 grep 完整 key 值 (经 stdin 传 pattern, 勿入 argv/输出)。
