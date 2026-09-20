# Coolie PM 路线图 — 2026-09-20

本文件是「掌柜 Hermes」的官方路线图 + 派单规则 + 团队职责 + 发版策略。boss 拍板后落地。

## 1. 路线图（撞版本）

| 版本 | 主题 | 核心交付 | 来源 |
|---|---|---|---|
| **0.3.x OTA**（done）| bug fix hot-patch | 0.3.0 → 0.3.5 紧急通道 | 工坊对话/审批/语音/本体数据/AVC 修复 |
| **0.4.0** | 重构收尾 | phase A 抽组件 + phase B 本体重设计 + phase C 任务页重设计 + phase D 性能（FlashList） | 体检报告 bf40dbafb |
| **0.5.0** | DS 同款 build 模式 | build orchestrator (b9f5017a6) + pacing rules (0df489620) + DS audit + spec workflow + UI 入口补全 | DS 学习报告 343b13b75 |
| **0.6.0** | 多公司/多租户 | worksace 多租户隔离 + 审计 + 跨实例通讯 | 后续 |

## 2. 团队（匠人池）

| 角色 | 调度工具 | 默认冷却 | 负责文档范围 | 备注 |
|---|---|---|---|---|
| **门神**（cmd）| `commandcode` CLI | 180s | `clients/expo/**` + `clients/api-client/**` + Android 构建 + 发版脚本 + keystore | 装机敏感（速率限制）|
| **铁匠**（claude）| `claude -p` | 30s | `server/**` + `tests/**` + 安全 + e2e | sandbox 限制（要 commit 需在外面）|
| **墨斗**（agy）| Gemini 配额 | 待 09-23 | 模型调用 + 远端容器 | 等配额恢复 |
| **匠人副炉**（mm）| Claude Sonnet | 待派 | 与铁匠并行 | 备用 |
| **掌柜**（Hermes 自己）| — | — | `docs-coolie/**` + 路线图 + 派单规则 + 验收 + 老板对话 | 派单 + 验证 + 文档 |

### 团队责任原则
- **人撞限速能优雅排队**，不是 PM 抢着每 3 分钟派下一个 → Coolie 系统内 `pacing rules` 强制执行
- **每个人只关心自己那一片文件树**，其他人不会动
- **派单时 owner + 文件范围写清楚**，匠人各自守护
- **代码改完后 commit 是匠人责任**，PM 不该代 commit

## 3. 派单规则（落 Coolie build orchestrator）

派单时简报必须含：

```
任务: <一句话目标>
背景: <为何要做 + 关联 commit / 文档>
分支: <release/x.y 或 main 或新分支>
文件范围: <绝对路径列表 — 匠人碰任何列表外的都该回退>
验收: <tsc 0 错误 / commit message / output 报告>
规则: <NO PUSH / 不动 X / 最大变更范围 / commit 模板>
参考: <docs-coolie/briefs/*.md 或 /tmp/cmd-brief-*.md 路径>
```

简报文件放在 `docs-coolie/briefs/<job>.md`（仓库内，claude 可读）或 `/tmp/cmd-brief-*.md`（仅 cmd 可读，因 cmd sandbox 不读仓库内 /tmp 路径）。

## 4. 发版策略

| 通道 | 触发 | 例子 |
|---|---|---|
| **OTA 热更** | JS-only 改动，runtimeVersion 不变 | 0.3.x 系列 |
| **APK 重发** | 原生模块动 / keystore / gradle / 新权限 | 0.3.0、0.3.4、0.3.5 |
| **大版本** | 跨多个 PR / API 重大调整 | 0.4.0、0.5.0、0.6.0 |

**rules:**
- `release-app.sh` 默认走 main 分支，撞 release/x.y 分支先合回
- `expo.version` 由脚本升；`android.versionCode` 必须 pin 到 `app.json`（不然 `expo prebuild` 会重置为 1 — 这是 0.3.4 → 0.3.5 的真坑）
- 发版前必须在 prod 上做 curl 烟测（chat stream / approvals / 域 inject），不能信本地

## 5. 未推 commit 清单

(自动生成，按分支)

### main
- `343b13b75` docs(ds-learn): DigitalStaff ontology + spec-driven audit + Coolie 0.5.0 recommendation
- `2023ae59e` release: v0.3.5 — 热修: 语音派发 Object is not a function
- `bf6dafd80` fix(expo): hotfix voice dispatch Object-is-not-a-function (v0.3.5)
- `24baece6f` chore(expo): track android versionCode in app.json
- `99b2bcf3e` release: v0.3.4 — release keystore signing
- `1ad05c8be` feat(build): DS-style build mode — orchestrator + UI progress card
- `c08e050be` chore(briefs): move 4 outstanding task briefs into repo workdir
- `908f3cf32` docs(audit): security audit
- `ae0530748` release: v0.3.3 — 原型沙箱轻量直开 + 共享 UI 组件抽取 + 审批跳转 bug 修
- `87367089d` fix(expo): approval click navigates to tasks tab
- `68bb5bba9` refactor(expo): phase A — extract shared UI component library
- `9e37bda77` feat(expo): lightweight URL preview fallback in prototype sandbox
- `5aec7285b` release: v0.3.2 — 语音派发录音停止修复
- `4b8708d9f` fix(expo): voice-dispatch recorder stop-hang + busy lock
- `fd99bdcf5` release: v0.3.1 — 审批点击化
- `1c67e2d09` feat(expo): inline approval buttons + detail deep-link
- `67023cabb` feat(expo): approval click-through
- `bf40dbafb` docs(audit): UI 体检报告

**main 领先 origin/main 18 个 commit — 推一波吧。**

### release/0.4.0
- `e7c6f56b7` refactor(expo): phase C task page redesign — split App.tsx
- `fe07cfa33` refactor(expo): phase B ontology redesign — split OntologyDomainListScreen
- + main 基线

### release/0.5.0
- `0df489620` feat(build): pacing rules — per-worker rate limit + cool-down UI
- `b9f5017a6` feat(build): DS-style build mode — orchestrator + UI progress card
- `908f3cf32` docs(audit): security audit
- + main 基线（未合）

## 6. 老板对话纪律（给 Hermes 自己）

- **不连环派单** — 同一匠人之间至少 3 分钟间隔，避免速率限制
- **默认批量** — 多文件可一次派，不要 5KB 小 brief 反复起进程
- **不主动追完工** — 让匠人后台跑，PM 自己转去做别的事（写文档 / 派下一个）
- **验收有真信号** — tsc / curl 烟测 / 用户场景，不只看 commit message
- **代码层面没 bug 就不发版** — 门神拒发是合理的，不要硬压

## 7. 知识库（docs-coolie/）

- `BRANCHING.md` — 分支策略
- `FORK-SURFACE-AUDIT.md` — 上游 fork 差距清单
- `P1-I18N-BRANDING-PLAN.md` — i18n + 品牌（旧的）
- `P2-NATIVE-ENGINE-AND-WORKFLOW-PLAN.md` — 原生引擎（旧）
- `ui-audit-2026-09-20.md` — UI 体检报告（bf40dbafb）
- `security-audit-2026-09-20.md` — 安全审计（908f3cf32）
- `ds-learn/2026-09-20-ontology-and-spec-driven.md` — DS 学习报告（343b13b75）
- `briefs/` — 派单简报池
- `PM-ROADMAP.md` — 本文件

## 8. 已知风险

- **cmd 撞限速** — 派活间隔需 ≥3min，已落 Coolie pacing rules（系统强制）
- **claude sandbox** — git commit / pnpm / npx tsc / keytool / gradle / scp / coscli 拦着，简报要 fallback
- **cmd heredoc 反引号炸** — 用单行 brief 或 cat /tmp/brief.md 命令替换
- **老板截图边界** — 每张图必问「场景 + 哪个 tab + 之前做了什么动作」，否则门神无从下手
- **keystore 密码在 transcript** — coolie-keystore-2026 后续需轮换
- **v0.3.6 chat 热修未发** — boss 报「普通对话不行」，但代码静态查不出 bug，需要 logcat 或 server stderr 才能定根

## 9. 下一步（撞 0.5.0 一次性发版时排）

| 工 | 估时 | 依赖 |
|---|---|---|
| 合并 release/0.5.0 + main（解 build-orchestrator.ts 冲突）| 1h | 人 |
| spec 词表冻结（type/layer/cardinality/kind）| 0.5h | 文档 |
| build-on-spec 后端 P0（chat → spec → 审批 → provisioner → 派工）| 1 周 | 词表 + 冲突解 |
| spec workflow UI 入口（替换 PlaceholderTab）| 0.5 周 | 后端 |
| 多租户隔离（多 instance / 多 company 路由）| 1 周 | — |