# DS-REPORT — 微信派单链路测试 (wave286)

**Wave**: wave286 · 派单链路验证 (COOA-50)
**日期**: 2026-10-04 21:47–21:5x CST
**角色**: 百晓生 / DS (`baixiaosheng-ds`) · 工具 `claude-glm` (glm-5.3[1m])
**仓库**: `/Users/mac/workspace/xaicd/coolie` · 分支 `main` · 只读验证 (不改产品代码)
**性质**: 本次派单本身就是被测链路的一次真实端到端运行; 本报告即交付物

---

## 0. 结论 (TL;DR) — 两个独立判定

| # | 判定对象 | 结论 | 一句话 |
|---|---|---|---|
| 1 | **派单链路本身是否可信** | ✅ **GO (有条件)** | 工单→Bridge→dispatch→receipt→执行→报告 全链真实在跑、证据可查; 但有 3 个机制缺陷 + 4 个风险需后续波次修补 (见 §3 R1–R6) |
| 2 | **业务交付 G3 是否放行** | ⛔ **NO-GO (维持, 但理由更新)** | 上游交接的「T-1/T-2 未实现、G3 BLOCKED」已过时 (COOA-13/22/23/27 均 done, G3 验收 6/6 PASS 含口径局限); 维持不放行的新理由: COOA-22 缺陷转介闭环未确认 + 仅 AVD 无实体真机 + 版本一致性红点 (R7/R8) |

**链路测试通过 ≠ 业务放行** — 两者证据面不同, 本报告分开判。

---

## 1. 验证项清单与结果

### V1 Receipt 状态机 (AGENTS.md §13.3) — ⚠️ 部分合规

- **本腿 (自己)**: `20261004T134712Z-wave286-baixiaosheng-ds.json` 存在, `queued→running` 跃迁完整 (pid 17772 实活, ps 验证), startedAt/completedAt/commit 字段齐。脚本退出时将自动写 `done` + HEAD commit (§4 机制)。
- **上游 (门神 wave285, 只读)**: 发现 **2 处状态漂移**:
  - `20261003T083551Z-…json`: `status:"done"` 但 `blockedReason` 非空 (内文自称"更正: 原落盘误记 status=done") — **更正只改了 reason 没改 status**, 残留矛盾态。
  - `20261003T085911Z-…json`: `status:"done"`、`blockedReason:null`、evidence/verification 空、`commit:"b276e54a3"` (无关 commit) — 与 QA-REPORT §10.4 声称的「本轮 receipt 置 blocked」**不符**, 文档与 receipt 互相矛盾。
- **机制缺陷 (重要)**: `dispatch-local-employee.sh` 的 `write_receipt` (L357-393) 整体重写 JSON (`verification:[] evidence:[]` 硬编码); 执行收口 (L582) 在 claude 退出后最后一次写入 → **腿内回填的 evidence/verification 会被清空**。只有 `--update` 路径 (L214-260) 是合并写。且门禁账本校验 (L198-209) 只在 `--update` 路径生效, 退出自动 done **绕过门禁检查** (双轨不一致)。

### V2 Context Bus 接力 (§13.2) — ⚠️ 滞后 3 腿 (活体实证)

- `wave286.json` 记录了 step 1-3 (Hermes→门神→门神), schema 完整, 最后更新 2026-10-03 17:12。
- **但 wave286 后续 3 腿未上车**: T-1 (receipt `20261003T161228Z-…T1…`, done, commit b56f6ac94)、T-2 (`20261004T012500Z-…T2…`, done, commit 501d4cb1b)、G3 (`20261004T024500Z-…G3…`, done, 6/6 PASS) 均未 push 到 bus。
- **实际毒化后果 (本腿亲历)**: 派单脚本注入给我的 Handover Context 原样取自滞后的 bus — 我的 prompt 仍称「T-1/T-2 未实现, G3 仍 BLOCKED」, 落后仓库真实状态 3 腿/约 36 小时。**bus 是交接注入的唯一真源, 不 push 就毒化下游 prompt, 本次是活案例。**
- 本腿已用 `scripts/context-bus.sh --push` 追加 step 4 (见 §5)。

### V3 链路活体证据 (端到端) — ✅ PASS

| 环节 | 证据 |
|---|---|
| 工单 | dev server (3100) `COOA-50 \| in_progress \| [wave286] 测试微信派单链路` (API 实查) |
| Runner Bridge | pid 22231 `node scripts/coolie-task-runner-bridge.mjs` 实活; crontab 每 5 分钟 `--check \|\| --start` 自愈看门兵 (wave297) |
| 派单脚本 | pid 17772 `dispatch-local-employee.sh --agent baixiaosheng-ds --task [wave286] 测试微信派单链路 --execute` 实活 (PPID=1, 属正常后台化) |
| 执行体 | pid 17836 `claude -p …` (承载本报告的进程) |
| 执行留痕 | `.coolie-local/logs/COOA-50.log`: receipt/prompt 落盘 + `running with pid=17772` + `[claude-code:unrecognized_model] {"model":"glm-5.3[1m]"}` 警告 (链路副作用, 未阻断) |
| 固定派单 cron | crontab 含 5 员工 wave282 固定派单条目 (墨斗/铁匠/门神/兑底渊/百晓生) |

### V4 监控 PID 活体探活 (commit 5812bf750) — ✅ PASS

- **代码核实**: diff 落在 `cron-team-status.sh` L449+ — `process.kill(pid, 0)` 探活; 死进程自动改写 receipt 为 `failed` + `blockedReason:"进程意外终止(已退出)"` 并回写 (自愈)。
- **现场实证**: 21:51 实跑 `--print`, 「卡」栏出现带 `进程意外终止(已退出)` 签名的铁匠贰号死单 (10h33m, release 0.6.27 中断); 全场 grep 仅 **1 个** running receipt (我, pid 活) — **无幽灵「跑」残留**。
- cron mail (`/var/mail/mac`) 21:30 与本次 21:51 输出交叉核对一致。

### V5 监控准确性残留 — ⚠️ WARN (幽灵的镜像: 误报)

- PID 表把本腿 claude (17836) 误归为「铁匠 · wave282 · claude-glm」(应百晓生/wave286); 基于 receipt 的汇总行正确 — 推断函数按工具猜员工, 与 receipt 真值打架。
- Hermes 常驻 daemon (pid 30133, `--external-supervisor`) 跑 2d3h 被按 ETIME>4h 误报「卡」— 长驻 daemon ≠ 任务, 误报噪声持续存在。

### V6 微信侧可观测性 — ⛔ GAP

- `TEAM_STATUS_CMD` (默认 `~/bin/team-status-notify.sh`) **只有定义, 无任何调用点**; usage 承诺的 `/tmp/team-status.log` 降级写入**未实现** (doc-code 不一致); 本机 notify 脚本与 /tmp 日志均不存在。
- 唯一可观测落点 = cron 本地邮件 `/var/mail/mac`。**微信推送是否到达, 本机无任何落盘证据可证。** (按 brief 约束未实际发微信、未触碰任何 secret。)

### V7 方案 B 规范 (commit 301461256) — ✅ PASS (文档+机制核实)

- QUICKCARD §4/§5 diff 核实: 「严禁 Hermes 终端同步阻塞, 统一 Dev Server 工单 + Runner Bridge 异步消费」已落文档; bridge 看门狗 cron + COOA-50 工单 + 本腿运行 = 机制在跑。
- 备注: bridge 进程 21:49 启动时加载的工作树代码, 已由外层会话于本次运行中固化为 commit `90a04d948` (并发单写者实证; 当前工作树对 bridge 两脚本 clean)。

### V8 业务 G3 现状 (复核, 只读)

- 最新 G3 验收 (COOA-27, receipt `20261004T024500Z`): **6/6 判据 PASS** (FPS p50 17-20ms 同轴 / web 30-30 / NFR 三项 / 400 回退), 明示口径局限: 仅 AVD 无实体机、jank% 跨环境不可比、共享宿主 load 5.1-7.5。
- **缺陷转介未闭环**: G3 将 `URLSearchParams.size 缺失 → 空 focus 视图无限 loadMore 8.7 req/s` 转介 COOA-22; COOA-22 issue 现为 done, 但标题/摘要无缺陷修复痕迹, G3 receipt 自述「wire 抓包在录」— **缺陷是否真修无法从 issue 状态确认**。空 focus 视图是普通用户可达旅程, 8.7 req/s 请求洪水属 go/no-go 级风险。

---

## 2. 两个判定的展开

### 2.1 链路判定: GO (有条件)

链路真实、可观测、自愈在岗 — 本腿本身就是证明 (我被正确派到、上下文被注入、receipt 在记、报告在写)。条件 = 修 §3 R1/R2/R3 (均为小改高收益)。

### 2.2 业务 G3 判定: NO-GO (维持, 理由更新)

- **过时理由 (作废)**: 「T-1/T-2 未实现」— 已被 COOA-22/23 (done) 与 QA-REPORT-T1/T2 否定。
- **现行理由**: ① COOA-22 缺陷转介闭环未确认 (V8); ② 帧率证据仅 AVD 口径, 无实体真机, 老板金标 (1% 真机) 未满足; ③ 版本一致性: wave292 bump 0.6.26/0.6.27 后远端/tag 未跟 (T2 receipt 自证当时 VERSION-CONSISTENCY exit 1), 且 release 进程中途死亡 — 发版面状态未收敛。
- **解阻路径**: PM 确认 COOA-22 缺陷真修或拆新票跟踪 → 版本源回绿 (跑 `scripts/VERSION-CONSISTENCY-CHECK.sh`) → 实体真机或老板认可的口径 → DS 复审放行。

---

## 3. 风险清单

| # | 风险 | 等级 | 建议 |
|---|---|---|---|
| R1 | dispatch 收口 `write_receipt` 整体重写 → evidence/verification 被清空; 且退出自动 done 绕过 G 门禁校验 (双轨不一致) | 高 | wave298+ 改收口为合并写 + 门禁校验两轨统一 |
| R2 | Context Bus 滞后 = 交接 prompt 毒化 (本腿活案例: 滞后 3 腿/36h) | 高 | 把「腿完成必 push bus」纳入 receipt done 的前置校验 (与 R1 同改) |
| R3 | 上游 receipt 状态漂移 (083551Z done+blockedReason / 085911Z 与 QA-REPORT 声称矛盾) → 监控「卡」栏与证据链失真 | 中 | PM 台账收敛: 一次性清理 wave285 两 receipt; 状态机以 receipt 为准, 文档引用之 |
| R4 | 固定派单 cron 无在飞去重: 本腿 21:47 手动派单 running, 22:00 周日百晓生 weekly cron 照常触发 → 同员工双进程并行 | 中 | dispatch 脚本加同 agent 在飞检测 (running 且 pid 活则跳过/顺延) |
| R5 | 微信推送无落盘证据 (TEAM_STATUS_CMD 未接线, /tmp 降级未实现) | 中 | 实现降级日志或接 notify 脚本, 让「推没推」可审计 |
| R6 | 监控误报: claude 进程按工具误归员工 (17836→铁匠); Hermes daemon 被「卡」 | 低 | 推断函数优先读 receipt 真值; daemon 白名单 |
| R7 | COOA-22 缺陷 (无限 loadMore 洪水) 闭环未确认 | 高 (业务) | PM 核实; 未修则拆票, 修前禁发版 |
| R8 | 版本一致性红点 + release 中断残留 (0.6.26/0.6.27 远端/tag 未跟) | 高 (发版) | 发版前必跑 VERSION-CONSISTENCY-CHECK 回绿 |
| R9 | G3 腿 receipt (024500Z) 用非 schemaVersion 结构 → 与标准 receipt 两套 schema, 解析/门禁分叉 | 低 | 统一走 dispatch-local-employee.sh 收口 |

---

## 4. 变更文件列表 (本腿)

| 文件 | 动作 |
|---|---|
| `docs-coolie/evidence/wave286/DS-REPORT.md` | 新增 (本报告) |
| `.coolie-local/context-bus/wave286.json` | 追加 step 4 (scripts/context-bus.sh --push) |
| `.coolie-local/dispatch/20261004T134712Z-wave286-baixiaosheng-ds.json` | 尝试回填 evidence/verification; **预期被脚本退出收口整体重写为 done+commit (R1), 需外层在收口后重跑 §6 回填命令** |

不碰: 产品代码 / briefs 未跟踪文件 / 非本腿 receipt / 任何 secret。git commit 由外层会话统一处理。

## 5. Context Bus 回写命令 (本腿已执行)

```sh
bash scripts/context-bus.sh --push --wave wave286 \
  --agent baixiaosheng-ds --tool claude-glm \
  --commit 90a04d948 \
  --files docs-coolie/evidence/wave286/DS-REPORT.md \
  --artifacts docs-coolie/evidence/wave286/DS-REPORT.md \
  --gate G4_DS_link_only \
  --note "百晓生 DS 链路测试: 链路 GO(有条件,R1-R6 修补); 业务 G3 NO-GO 维持(理由更新: COOA-22 缺陷闭环未确认+AVD 口径+版本红). 交接上下文滞后 3 腿系 bus 未 push 所致(活案例)."
```

## 6. Receipt 回填命令 (留给外层会话, 收口后执行)

```sh
bash scripts/dispatch-local-employee.sh \
  --update 20261004T134712Z-wave286-baixiaosheng-ds \
  --status done \
  --evidence docs-coolie/evidence/wave286/DS-REPORT.md \
  --verification "ps -p 17772/-p 17836/-p 22231 实活; COOA-50 in_progress(API); crontab 5 员工+看门狗在岗; cron-team-status --print 无幽灵跑; /var/mail/mac 21:30 留痕"
```

## 7. 验证命令与输出摘录

```
ps -p 17772 -o pid,ppid,etime,command   # 17772 PPID 1, dispatch-local-employee.sh --agent baixiaosheng-ds --execute (活)
ps aux | grep -E "runner-bridge|claude" # 22231 node coolie-task-runner-bridge.mjs (活); 17836 claude -p "…wave282 fixed dispatch…baixiaosheng-ds…" (活)
crontab -l                              # 5 员工 wave282 固定派单 + */5 bridge 看门狗 + */30 team-status
curl …/issues?limit=1000                # COOA-50|in_progress|[wave286] 测试微信派单链路; COOA-13/22/23/27 done
grep '"status": "running"' dispatch/*.json  # 仅 20261004T134712Z-wave286-baixiaosheng-ds.json (我, pid 活)
bash scripts/cron-team-status.sh --print    # 跑: 百晓生 (claude-glm) [wave286] 测试微信派单链路 [4m]; 卡: 铁匠贰号 …进程意外终止(已退出)
tail /var/mail/mac                      # 21:30 cron 留痕, 无幽灵「跑」
git show 5812bf750                      # process.kill(pid,0) 探活 + 死进程自愈回写 (L449+)
git show 301461256                      # QUICKCARD 方案B: Runner Bridge 异步派单规范
ls /var/mail/mac; ls ~/bin/team-status-notify.sh; ls /tmp/team-status.log   # 仅 /var/mail/mac 存在 → V6 GAP
git log --oneline -3                    # 90a04d948 (bridge 固化, 运行中落库) / 301461256 / 5812bf750
```

## 补遗 · 21:55 重复派单活体案例（第二腿，R10）

腿1 报告完成后，Bridge 机制缺陷当场产生一例活体重复派单，本腿即第二腿，判定记录如下。

**时间线与证据**（.coolie-local/logs/COOA-50.log + 两份 receipt + API 实查）：

- 21:47:12 旧 Bridge 认领 COOA-50 派腿1（receipt `20261004T134712Z`，dispatch pid 17772）
- 21:49:12 Bridge 重启为现进程 22231（腿1进行中重启，其 child close 收口绑定随旧进程丢失）
- 21:55:23 腿1退出 receipt 置 done；同一秒新 Bridge 轮询（5s 周期）见 COOA-50 仍 in_progress 且 `.coolie-local/locks/COOA-50.lock` 内 pid 17772 已死 → unlink 后重派第二腿（receipt `20261004T135523Z`，pid 35864）
- COOA-50 终态 `done`（API 实查 id 99053b4b…，completedAt 2026-10-04T13:56:24.102Z）；锁现值 35864 → 本腿退出后 Bridge 再 PATCH done（幂等），循环到此终止
- Bridge 日志摘录：`[dispatch] running with pid=17772 tool=claude-glm` 与 `[dispatch] running with pid=35864 tool=claude-glm` 两段连续并存

**根因**（R1-R9 之外的新机制缺陷）：「子进程退出 → PATCH 工单 done」的收口绑定只存在于 Bridge 进程内（child.on close）；重认领只查锁 pid 活性，不查同 task 是否已有 done receipt；锁亦不承载收口状态。三者叠加：Bridge 中途重启 → 孤儿腿 → 腿一完成即被重派。

**R10（高 / 机制缺陷）**：Bridge 重启产生孤儿腿并引发同任务重复派单。建议修法：认领前查同 task 最新 receipt，已 done 则直接收口不重派；或将收口状态落盘（receipt/lock），使新 Bridge 进程可继承收口责任。

**本腿（135523Z）receipt 回填命令**（留给下一外层会话，本腿退出后执行）：

```sh
bash scripts/dispatch-local-employee.sh \
  --update 20261004T135523Z-wave286-baixiaosheng-ds \
  --status done \
  --evidence docs-coolie/evidence/wave286/DS-REPORT.md \
  --verification "ps -p 35864 (ppid 22231) / -p 22231 (21:49:12 起) 实活; COOA-50 done (completedAt 13:56:24.102Z); Bridge 日志双派单段(17772/35864); 腿1 receipt 134712Z 已回填"
```

腿1 判定不变：链路 GO（有条件），业务 G3 维持 NO-GO；R10 并入条件项。

---

*百晓生 (DS) · wave286 派单链路测试 · 2026-10-04 · COOA-50*
