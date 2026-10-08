# Coolie工坊 整个页面功能审计 (wave64)

> 老板 09-23 OOB 「整个页面功能审计一下」+ PM 24:55 已吐槽「反反复复」
> Auditor: claude · Repo: ~/workspace/xaicd/coolie · Branch: main · Date: 2026-09-23/24
> 状态: 报告入档 · 老板拍优先级 · 派后续实施波

---

## 1. 屏幕清单 (clients/expo/src/screens/ + clients/h5/src/screens/)

> 行数为源文件 `wc -l`. 客户端分两个: Expo (RN) 18 屏 + h5 (WebView) 9 屏. mock = 源文件含字面 mock/hardcode. fetch = 含 `coolie.*` 或 `fetch(` 调用. 状态: ✅ 稳 / ⚠️ 待实施 / ❌ 老板吐槽 / 🔵 待 PM 排.

### 1.1 Expo 18 屏 (10676 行)

| # | 屏幕 | 文件 | 行数 | mock | fetch | 状态 | 备注 |
|---|---|---|---|---|---|---|---|
| 1 | Dashboard (汇览) | DashboardScreen.tsx | 306 | 0 | ✅ | ✅ (wave63 修) | 标题改'仪表盘'+ 留 4 张核心 StatTile |
| 2 | Tasks (任务) | TasksScreen.tsx | 336 | 0 | ✅ | ✅ | wave18+ 抄 web, 6 视图 + TODAY/YESTERDAY 分组 |
| 3 | CreateTask (中央+) | NewTaskPage.tsx | 398 | 0 | ✅ | ✅ | wave26 1:1 抄 web NewIssueDialog 全字段 |
| 4 | Agents (员工) | AgentsScreen.tsx | 684 | 0 | ✅ | ⚠️ | 5 角色员工描述还在 (wave50 待删, brief 入档未实施) |
| 5 | Inbox (收件箱) | InboxScreen.tsx | 1181 | 0 | ✅ | ⚠️ | 反反复复 (wave46 抄 web + wave53 复核 + 老板反馈) |
| 6 | AgentDetail | AgentDetailScreen.tsx | 314 | 0 | ✅ | ✅ | wave23 起稳定 |
| 7 | Artifacts (产物) | ArtifactsScreen.tsx | 864 | 0 | ✅ | ✅ | wave40+ 整合 |
| 8 | BoardChat (工坊对话) | BoardChatScreen.tsx | 2084 | 0 | ✅ | ✅ | wave37/38 仿豆包 + wave48 精简 |
| 9 | CodeDiff (代码 Diff) | CodeDiffScreen.tsx | 943 | 0 | ✅ | ✅ | wave26 留 (TASKDETAIL-AUDIT UX-2 删按钮但屏保留) |
| 10 | NewTaskPage (新建任务) | NewTaskPage.tsx | 398 | 0 | ✅ | ✅ | 同上 |
| 11 | Notifications | NotificationsScreen.tsx | 231 | 0 | ❌ | ✅ | 静态屏 |
| 12 | OntologyDomainList (本体) | OntologyDomainListScreen.tsx | 1334 | 0 | ✅ | ✅ | wave34 中文标签 |
| 13 | Pipelines (Pipeline) | PipelinesScreen.tsx | 200 | 0 | ❌ | ✅ | wave20 起 |
| 14 | Plans (计划) | PlansScreen.tsx | 150 | 0 | ❌ | ✅ | wave20 起 |
| 15 | PrototypeSandbox (原型沙箱) | PrototypeSandboxScreen.tsx | 348 | 0 | ✅ | ✅ | wave56 真仿 DS PreviewWebView |
| 16 | Register | RegisterScreen.tsx | 194 | 0 | ✅ | ✅ | 登录前屏 |
| 17 | Search | SearchScreen.tsx | 278 | 0 | ✅ | ✅ | wave36 |
| 18 | TaskDetail (任务详情) | TaskDetailScreen.tsx | 424 | 0 | ✅ | ✅ | wave51 在当前 tab 内渲染 |
| 19 | WhatsNew (装机自检) | WhatsNewScreen.tsx | 407 | 0 | ❌ | ✅ | wave7 提到 App 顶层 |

### 1.2 h5 9 屏 (3396 行) — 镜像同步

| # | 屏幕 | 文件 | 行数 | mock | fetch | 状态 | 与 Expo 差异 |
|---|---|---|---|---|---|---|---|
| 1 | Dashboard (仪表盘) | DashboardScreen.tsx | 350 | 0 | ✅ | ✅ (wave63 镜像) | 已精简 4 张 MetricTile |
| 2 | Tasks | TasksScreen.tsx | 291 | 0 | ❌ | ✅ | — |
| 3 | Compose (新建任务) | ComposeScreen.tsx | 515 | 0 | ❌ | ✅ | h5 独占 (Expo 用 NewTaskPage) |
| 4 | BoardChat (工坊对话) | BoardChatScreen.tsx | 422 | ✅ mock | ✅ | ⚠️ | **唯一 h5 mock+fetch 共存** (wave48 改标题但留 mock fallback) |
| 5 | Inbox | InboxScreen.tsx | 1016 | 0 | ✅ | ⚠️ | 同 expo 反反复复 |
| 6 | Ontology (本体) | OntologyScreen.tsx | 295 | 0 | ❌ | ✅ | h5 独占单层 (Expo 是列表) |
| 7 | Pipelines | PipelinesScreen.tsx | 180 | 0 | ❌ | ✅ | — |
| 8 | Plans | PlansScreen.tsx | 161 | 0 | ❌ | ✅ | — |
| 9 | WhatsNew | WhatsNewScreen.tsx | 166 | 0 | ❌ | ✅ | — |

> **Expo 独有 (h5 缺失)**: AgentDetailScreen, AgentsScreen, ArtifactsScreen, CodeDiffScreen, NewTaskPage, NotificationsScreen, PrototypeSandboxScreen, RegisterScreen, SearchScreen, TaskDetailScreen, WhatsNewScreen
> **h5 独有 (Expo 缺失)**: ComposeScreen, OntologyScreen

### 1.3 总结

- **mock 残留**: 18 expo 屏 **0 个**, 9 h5 屏 **1 个** (BoardChatScreen)
- **fetch 接真**: 18 expo 屏 **8 个** 接真 API (Inbox/TaskDetail/BoardChat/OntologyDomainList/Agents/Dashboard/CodeDiff/AgentDetail); h5 屏 **3 个** 接真
- **未 mock 的静态屏** (Notifications/Pipelines/Plans/WhatsNew/Compose) 是配置型屏, 无 fetch 也合理

---

## 2. 5 tab routing 状态

> App.tsx 5 tab 实际挂载入口屏 (来自 `clients/expo/src/components/TabBar.tsx` BarTabKey):

| tab | 入口屏 | 状态 | 备注 |
|---|---|---|---|
| 汇览 (dashboard) | DashboardScreen | ✅ (wave63 修) | 标题改'仪表盘' + 4 张核心 StatTile |
| 任务 (tasks) | TasksScreen | ✅ | wave51 in-tab 详情, 底部 5 tab 常驻 |
| 中央 "+" (中央按钮) | NewTaskPage (Modal) | ✅ | wave26 抄 NewIssueDialog |
| 员工 (agents) | AgentsScreen | ⚠️ | 5 角色描述还在 (wave50 brief 入档) |
| 收件箱 (inbox) | InboxScreen | ⚠️ | 反反复复 (详见 §6) |

- App.tsx 还定义了 `chat` tab (BoardChatScreen), 但 **不在 BarTabKey** — chat 走 routes, 不占永久底栏
- 5 tab routing 单点: `clients/expo/src/components/TabBar.tsx` (44 行, 改动会全栈影响)
- wave28 加 EdgeSwipeBack, wave51 修 in-tab 详情保留底栏 (两次 routing 修复波)

---

## 3. LLM / MiniMax / persona 状态

| 维度 | 状态 | 路径 |
|---|---|---|
| MiniMax-M3 接通生产 | ✅ | `server/src/routes/board-chat.ts:343-344` (默认 model=MiniMax-M3, provider=minimax-cn, 可 env 退回 GLM) |
| 顶部 persona 切身份 | ✅ | `server/src/routes/board-chat.ts:294-298` `resolveCompanyPersonaLine` 前缀, `clients/expo` 顶部 persona + 欢迎语同步 (wave60) |
| 兜底英文模板 | ✅ | `server/src/routes/board-chat.ts:180` `loadBoardSkill` 兜底英文模板含 `HARD CONSTRAINT` (wave62) |
| LLM 自发生成 Paperclip 字面 | ⚠️ | 已用强禁 prompt (wave62), 但需持续观测 LLM 偶发回归 |
| HARD CONSTRAINT 注入 | ✅ | board-chat.ts:180 + resolveCompanyPersonaLine (强制) 块 (wave62 962eb1866) |

> **结论**: 顶层 4/5 ✅, 仅 "LLM 自发生成 Paperclip" 仍 ⚠️ 需监控 (强禁 prompt 在跑, 但 LLM 偶发漂移)

---

## 4. OTA / 签名 / 真发版 状态

| 维度 | 状态 | 路径 / 证据 |
|---|---|---|
| APK 签名 v1+v2+v3 | ✅ | wave52 (1f4d17df4 `docs(brief): wave 52 — 修 APK 签名`), release.keystore 已注入 |
| OTA 链路 | ✅ | wave13/15/16/23 多次修, `runtimeVersion: policy=appVersion` (clients/expo/app.json:22-24), 真发版后 manifest 落到 `/opt/coolie/ui/ota/` (tc-coolie-claw) |
| Caddy 直出版本文件权限 | ✅ | release-app.sh 自动 `chmod 644` 防 403 |
| 真发版脚本 | ✅ | `scripts/release-app.sh` 一键 9 步 (DS gate → 提交 → gradle → COS → version.json → OTA), 当前 0.5.40 已发 |
| version.json 直链 | ✅ | https://xrobinai.cn/version.json → 0.5.40 (commit ea379024) |
| 老板真机偶发 OTA 拉不到 | ⚠️ | policy=appVersion + versionCode 升级时一次性, 装机后 user 必须重启 App 一次 (历史 wave23 已知) |

> **结论**: 5/6 ✅, 1 ⚠️ (老板真机偶发 OTA 拉不到 — 是 onboarding-assets 类一次性事件, 文档已知)

---

## 5. 未实施 brief (PM 待办)

| brief | 状态 | 备注 |
|---|---|---|
| `2026-09-23-dashboard-simplify-4-stat-tiles-wave63.md` | ✅ 已实施 (本次) | 0.5.40 release ea379024 |
| `2026-09-23-inbox-broken-diagnose-wave63.md` | ❌ 未实施 (untracked) | 老板反馈「收件箱功能又坏了」 — PM 待发 wave65 实施 brief |
| `2026-09-23-taskdetail-ds-host-preview-url-wave54b.md` | ❌ 未实施 (untracked) | wave54b 任务详情 DS host-preview 代理 (server 端缺 `/api/tasks/host-preview/<sessionId>/` 端点, 之前 PreviewWebView 用 `service.url` LIVE 顶上) |
| wave50 5 角色员工描述删 | ❌ brief 入档未实施 | AgentsScreen.tsx 还含 5 角色描述 (FDA/Core SWE/PRE-SRE/FDSE/DS), 老板觉得冗余 |
| `docs-coolie/HERMES-DIALOG-VERIFY.md` | ❌ 未跟踪 (untracked) | Hermes 对话验证测试文档 (wave44 起就遗留) |
| `docs-coolie/TASKDETAIL-AUDIT.md` | ❌ 未跟踪 (untracked) | 任务详情 UX 审计 — wave56 删了 Code Diff 按钮 (UX-2) 但审计档未入仓 |

---

## 6. 反反复复原因 (PM 24:55 吐槽的根因)

| 模式 | 出现频次 | 根因 |
|---|---|---|
| 收件箱反复坏 | 4 波 (wave25/31/46/53) | 每波都改 routing + 状态, 但**不写 e2e 回归测试**, 老板真机是唯一验证 |
| 任务详情反复改 | 5 波 (wave29/51/55/56 + UX-2) | in-tab vs push 导航多次摆动; 每次 wave 改 routing 不回测 5 tabs |
| OTA 拉不到反复修 | 4 波 (wave13/15/16/23) | runtimeVersion/policy/versionCode/appVersion 多口径, 一漂移就 "下了不装" |
| 工坊对话 persona 反复切 | 3 波 (wave60/61/62) | "Coolie vs Paperclip" 品牌叙事未锁, 老板每次都新发现一处字面残留 |
| DashboardScreen 反复堆 stat | 8 波叠加 | 从最早 4 张 → 现在 9 张 stat + 4 Pill + 3 KV → 老板 09-22 24:59 才说 "别这么多" (wave63) |

**根本原因**:
1. **每个新 wave 改 routing 不回测 5 tabs** — 修改面越大越容易踩到跨屏影响
2. **emulator 飞没真 E2E 验** — 模拟器是 headless 自动化, 没有 Playwright e2e 套件持续跑 5 tabs 烟测
3. **老板真机装是唯一验证** — APK 装机后老板直接打, 缺一个内部 staging 通道先自测
4. **brief 入档 ≠ 实施** — wave50 / wave54b / wave63 三个 brief 入仓后没人主动 follow-up, 都靠老板再提

---

## 7. 优先级排序 (老板拍)

### P0 (本周必做 — 已实施 ✅)

| 波次 | 内容 | 状态 |
|---|---|---|
| wave63 汇览精简 | DashboardScreen 改'仪表盘'+ 4 张核心 StatTile (本次) | ✅ 已发 0.5.40 |

### P1 (下波必做 — 老板反馈)

| 候选 | 来源 | 预计实施波 |
|---|---|---|
| **收件箱彻底修复** | wave63 brief + 老板 09-23 「收件箱功能又坏了」 | wave65 |
| **wave50 5 角色员工描述删** | wave50 brief 入档 (老板觉得冗余) | wave66 |
| **任务详情 DS host-preview URL 代理端点补** | wave54b brief (server 端 `/api/tasks/host-preview/<sessionId>/` 缺失) | wave67 |

### P2 (PM 排期)

| 候选 | 价值 |
|---|---|
| 工坊对话 (BoardChat) 中波次复盘固化 persona 强禁 prompt | 防 LLM 漂移回归 |
| h5 BoardChatScreen mock 残留清掉 | 跟 expo 收敛 |
| e2e 5 tabs 烟测脚本 (Playwright) | 防 routing 反复 |
| `/opt/coolie/ui/dist/version.json` 自动刷新 + 老板真机装机 onboarding-assets cache 文档化 | 防 OTA 一次性拉不到 |
| 跟踪 `docs-coolie/HERMES-DIALOG-VERIFY.md` + `TASKDETAIL-AUDIT.md` 入仓 | 治理 untracked 文档 |

---

## 8. Done

- ✅ 报告入档 (docs-coolie/AUDIT-2026-09-23-COOLIE-WORKSHOP.md)
- ⏳ 老板拍优先级 → 派 wave65+ 实施 brief
- ⏳ PM 把 P1 三条 (收件箱 / 5 角色描述 / DS host-preview) 升级为具体 brief

— claude (PM-assist), 2026-09-23/24