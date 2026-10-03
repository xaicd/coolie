# Brief: wave284 — 生产服务器拉日志查关系图谱 Validation error 根因

**Wave**: wave284
**Date**: 2026-10-03
**PM**: Hermes (hermes-pm)
**Employee**: 兑底渊 (Operator) — duidiyuan-pre-sre
**Tool**: **claude-mm** (copilot 月度额度耗尽, 按 fallback 走 claude-mm, 见 `EMPLOYEE-OBJECTS.md` wave272 + `TOOLS.md` §1 真配表 fallback 列 + `duidiyuan-pre-sre.md` L17 fallback)
**Subagent Type**: `duidiyuan-pre-sre`
**Project**: Coolie (paperclip fork, prod = `xrobinai.cn` / `tc-coolie-claw` = `62.234.59.180`)

---

## 1. 老板原话 (Boss Input)

> 「你让运维看看服务器日志」 (WeChat DM 2026-10-03 上午, 跟「图谱没了」截图配套)

**真因**: v0.6.22 上线后, Expo App 「业务本体 > 关系图谱」页黑屏 + `Validation error` 文本 + 「重试」按钮. 截图 `img_b3e6483b27c5.jpg` 证据: 「业务本体 440 实体 / 147 关系」数据查到了 (说明 server 端 API 在跑), 但前端画布渲染层 Validation 失败. 需要从 prod server 端找 Validation 失败的具体堆栈/请求/响应.

## 2. 任务 (Task)

ssh 登录 `ubuntu@tc-coolie-claw` (62.234.59.180), 拉 coolie-server 进程/监听端口/最近 30 分钟日志, 重点找:

- **关系图谱** 端点请求 (`/api/companies/:id/ontology/instances` 或 `/api/companies/:id/ontology/types/:typeId/properties` 或 graph workbench 相关), 看最近 30 分钟是否有 500/Validation 错误堆栈
- coolie-server 用的运行时 (PM2 / systemd / Docker / next.js / tsx), 拉对应的进程清单 + 日志路径
- 服务器响应时间/P95/是否有最近的部署 (v0.6.22 上线后的 deploy 时间戳)
- 端口监听: `lsof -iTCP -sTCP:LISTEN` 或 `ss -tlnp` 看 3100/3101/3000/80/443 谁在监听

## 3. 派单约束 (Constraints)

- **只读** — 不重启服务, 不改文件, 不部署新代码, 不回滚
- **不要重试被 Hermes 卡住的命令** — 我之前 ssh 想跑 `systemctl list-units` + `docker ps` + `ss` 超时未响应, 不要重跑, 走你自己的判断
- **不允许动 v0.6.22 release tag / wave282 commit `e06a144ea`** — 已上线, 不能回滚
- **必须走 context-bus** — 落痕到 `.coolie-local/context-bus/wave284.json` (Hermes 自己手 ssh 跑的命令要补违规 audit entry)
- **必须写 receipt** — `.coolie-local/dispatch/20261003T<time>Z-wave284-duidiyuan-pre-sre.json` (按 `docs-coolie/specs/2026-10-02-local-dispatch-receipt.md` schema)

## 4. 不要做 (Out of Scope)

- 不要修 server 代码
- 不要改 Expo 客户端
- 不要 bump 版本号
- 不要 OTA 重发
- 不要替铁匠 (Core SWE) 写 fix

## 5. 验收 (Acceptance)

- `.coolie-local/dispatch/<id>.json` status = `done`, 含 `commit`(N/A, 只读), `verification`(跑过的命令), `evidence`(日志路径 + 关键行号)
- `docs-coolie/evidence/wave284/` 至少 1 份报告:
  - `PROD-LOG-REPORT.md` (关系图谱 Validation error 根因报告)
  - 含: 进程清单 + 错误堆栈 + 截图路径 + 铁匠修这个需要的输入
- 给老板 weixin 3 行内汇报 (≤200 字)

## 6. 工具状态 (Tool Health)

| 工具 | 状态 | 备注 |
|---|---|---|
| copilot | ⚠️ 月度额度耗尽 (老板 2026-10-03 确认) | fallback 用 claude-mm |
| claude-mm | ✅ 主线 | 百晓生 + 兑底渊 fallback 双用 |
| agy-gemini3.8 | ✅ 在 docker 容器 | 墨斗 FDA 主线, 不用 |
| claude-glm | ✅ | 铁匠主线, 不用 |

## 8. 出处 (Sources)

- `docs-coolie/EMPLOYEE-OBJECTS.md` wave278 + wave278b 命名锁定
- `docs-coolie/TOOLS.md` §1 真配表 fallback 列
- `docs-coolie/PM-DISPATCH-QUICKCARD.md` §A 项目核心信息
- `docs-coolie/specs/2026-10-02-local-dispatch-receipt.md` receipt schema
- `docs-coolie/specs/2026-10-03-multi-tool-context-bus.md` 多工具上下文总线
- `.agents/agents/duidiyuan-pre-sre.md` agent template
- `.agents/skills/sre-release-and-deploy/SKILL.md` 部署运维 skill