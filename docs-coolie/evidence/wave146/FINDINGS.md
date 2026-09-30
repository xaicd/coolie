# wave146 — 系统初始化「客户可用最后一公里」核查报告

- 日期: 2026-09-29
- 执行: CLI agent (coolie 仓库 main @ 078923ead)
- 状态: **核查完成；仅落地 1 处客户端修复 (P0-C 客户端侧)。P0-A 前提被证据推翻，P0-B 属不可逆生产发版，均未执行 —— 见 §6 需老板决策。**

> 诚实边界：本报告所有结论都带原始证据 (curl 真值 / API 返回行 / 命令输出)。凡没查到的，
> 明确写「未验证」，不凭印象下结论。凡基于推理的，标 **[假设]**。

---

## 0. 环境事实 (先厘清「paperslip-web 生产库」到底在哪)

| 项 | 真值 | 来源 |
|---|---|---|
| 生产站点 | `https://xrobinai.cn` (`deploymentMode: authenticated`, `exposure: public`) | `curl /api/health` |
| 生产主机 | `tc-coolie-claw` = `ubuntu@62.234.59.180:22` | `ssh -G tc-coolie-claw` |
| 生产服务 | systemd `coolie`, `WorkingDirectory=/opt/coolie/server`, `MainPID=449525`, 启动于 2026-09-29 17:31:15 CST | `ssh ... systemctl show` |
| 本地主服务 | `127.0.0.1:3100` (PID 51909) | `lsof` |
| 本地库 | embedded postgres `127.0.0.1:54329` (数据目录 `~/.paperclip/instances/default/db`) | `postmaster.pid` |
| `DATABASE_URL` 环境值 | `postgres://paperclip:paperclip@localhost:5432/paperclip` —— **端口 5432 无监听，是 stale 值，不要用它** | `lsof` 无 5432；连 5432 ECONNREFUSED |

**关键归属事实**：目标公司 `4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e` = **"xrobinai"（Coolie 数字员工团队）**，
只存在于**生产库**；本地库 (54329) 只有 2 家 `onboarding-cache-test-*`，共 3 个 agent。

- 登录方式：Better Auth `POST /api/auth/sign-in/email` + 同源 `Origin`（会话 cookie）。
  本次用 `robinschen1989@gmail.com` 登录成功 (HTTP 200，`set-cookie: __Secure-paperclip-default.session_token=…`)。
- 读接口/写接口都要同源 `Origin` header（`boardMutationGuard`）。

---

## 1. P0-A「6 名生产数字员工 adapter 全 None」—— **证据推翻**

### 1.1 生产 adapter 实测（`GET /api/companies/4cafeb9a.../agents`）

| agent | role | `adapterType` | `adapterConfig` |
|---|---|---|---|
| Hermes | ceo | **`hermes_local`** | `{paperclipSkillSync:{desiredSkills:[…]}}` |
| core-swe-agent | core-swe | **`claude_local`** | `{mode:"",model:"",effort:"",variant:"",modelReasoningEffort:""}` |
| fdse-agent | fdse | **`claude_local`** | 同上 |
| ds-agent | ds | **`claude_local`** | 同上 |
| pre-sre-agent | pre-sre | **`claude_local`** | 同上 |
| fda-agent | fda | **`claude_local`** | 同上 |

- 6/6 **都不是 None**，且**已经等于** boss 想要的分配（主 agent → Hermes；其余 → Claude）。
- DB 侧列名是 `agents.adapter_type` / `agents.adapter_config`（**不是** `adapter` / `adapter_config` 的 `adapter`）。
  `packages/db/src/schema/agents.ts:29-30`。有效 adapterType 枚举见 `GET /api/adapters`。

### 1.2 这些 agent **真的在跑**（`GET /api/companies/4cafeb9a.../heartbeat-runs?limit=30`）

最近 30 条 heartbeat run 全部 `succeeded` / `exitCode=0`，例如：

```
2026-09-29T07:56:38 succeeded agent=95069d63(core-swe) exit=0 model=claude-opus-5 err=None  cost=$0.20
2026-09-29T07:56:11 succeeded agent=95069d63           exit=0 model=claude-opus-5
2026-09-29T07:35:11 succeeded agent=95069d63           exit=0 model=claude-opus-5
2026-09-28T21:51:16 succeeded agent=5fdf1a19(fda)      exit=0 model=claude-opus-5
2026-09-28T20:56:31 succeeded agent=ac101a9e(Hermes)   exit=0 model=None
```

→ 「派了任务没真模型跑」与事实相反：`claude_local` 员工今天 (07:56Z) 仍以 `claude-opus-5`
成功执行并计费。Hermes 员工也 succeeded（其 `usageJson.model` 为空，未验证原因）。

### 1.3 为什么 boss 会看到「None」—— 未验证，仅给出候选解释

- Web/App 的 adapter 展示走 `getAdapterLabel()`（`ui/src/adapters/adapter-display-registry.ts`），
  `hermes_local`→"Hermes"、`claude_local`→"Claude Code"，**不会**显示 `None`。
- 全仓搜 `"None"` 字面量：`ui/` 与 `clients/` 里**没有任何**把 adapter 显示成 `None` 的路径。
- **[假设]** boss 看到的是某一刻的旧状态 / 另一家新公司 / 或某个不含 adapter 字段的视图。
  —— 需要 boss 给一张「看到 None」的截图或页面路径才能定位。**这一步我没查到根因。**

### 1.4 boss 给的 adapter 写入配方与真实 schema 不符（**重要**）

- boss 配方 A：`{kind:"hermes", baseUrl:"https://api.minimaxi.com/v1/models", model:"MiniMax-M3"}`
  - 真实类型是字符串 `hermes_local` / `hermes_gateway`，**无 `kind` 字段**。
  - 生产主机 `~/.hermes/config.yaml` 实际配的是 **GLM**（`model.default: glm-5.3`,
    `provider: glmcode`, `base_url: https://open.bigmodel.cn/...`），密钥 `GLMCODE_API_KEY`。
    不是 MiniMax。**按此配方写会覆盖生产上正在工作的 GLM 配置。**
- boss 配方 B：`{kind:"claude", command:"claude", args:["-p","--yolo","--max-turns","500"]}`
  - `claude_local` 的配置 schema 无 `args`；字段是 `engine/command/model/effort/…`
    （`packages/adapters/claude-local/src/index.ts` 的 `agentConfigurationDoc`）。
- 生产主机上 **`claude` 与 `hermes` 都不在 systemd 服务 PATH 上**：
  `hermes` 在 `/home/ubuntu/.local/bin/hermes`（服务 PATH 无此目录）；
  `/usr/lib/node_modules/@anthropic-ai/` 为空（无全局 claude），只有
  `/opt/coolie/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude`。
  **[假设]** `claude_local` 默认 engine=ACP，用包内自带的 ACP 二进制，所以不依赖全局 `claude`；
  这正是它仍能跑通的原因。hermes 的解析路径我**未**追到根因。

> 结论：P0-A 无需执行。若强行按 boss 配方改写 config，反而会**破坏**一个已在工作的配置。

---

## 2. P0-B「wave144 board-chat 未发版」—— **属实**

- 版本：本地 `version.json` = `0.5.97`；生产 `https://xrobinai.cn/version.json` = `0.5.97`。
- wave144 改动在 HEAD commit `078923ead`（含 `server/src/routes/board-chat.ts` 的
  `proc.on("close",(exitCode,signal))` / 首 token 看门狗 / `stoppedByClient`；
  以及 expo `ChatInput` / `BoardChatScreen`），**确未发版**。
- 生产 OTA manifest 可达 (`/ota/manifest` = 200)。
- 发版路径（`scripts/release-app.sh <ver> "<notes>"`）串起：gradle APK → coscli 上传 →
  scp `version.json` → OTA → `deploy-tc-coolie-claw.sh`（rsync + `systemctl restart coolie`）。
  **属不可逆的共享状态操作**，本轮**未执行**（见 §6）。

---

## 3. P0-C「浏览器打开按钮给错地址」—— **症状属实，但 boss 的修法在数据模型上不成立**

### 3.1 客户端现状（已修，见 §5）

`clients/expo/src/screens/PrototypeSandboxScreen.tsx` 原值：
```ts
const target = selected?.downloadUrl || selected?.url || url;   // 未选中时退到项目级 url
```

### 3.2 但 `downloadUrl` **不是**公开 URL（证据）

生产 `GET /api/companies/4cafeb9a.../artifacts`，每条交付物的三个路径**全是内部 API 路径**：

```
work_product | xrobinai 工坊欢迎页预览 | contentPath=/api/attachments/34bf58e7-…/content
             | openPath=/api/attachments/34bf58e7-…/content
             | downloadPath=/api/attachments/34bf58e7-…/content?download=1
```

直接验（**不带会话**，模拟外部浏览器）：
```
$ curl -o /dev/null -w '%{http_code}' https://xrobinai.cn/api/attachments/34bf58e7-…/content
404                     ← 外部浏览器拿不到
$ curl -b <prod-cookie> …/content
200  (text/html)        ← 只有带 Paperclip 会话才 200
```

根因：`GET /api/attachments/:id/content`（`server/src/routes/issues.ts:18767`）走
`getAccessibleResource` + `assertIssueReadAllowed`，**必须 board 会话**；无会话按 404 屏蔽。

### 3.3 全仓**没有**公开/预签名 URL 能力

- 全仓搜 `presign|getSignedUrl|signedUrl`：服务端**无实现**（只有测试/文档提到）。
- 有 `docs-coolie/specs/DELIVERABLE-STORAGE-MODULE.md` 提到「支持安全预签名下载 (Presigned URL)」，
  即这是**规划**能力，尚未落地。
- attachments / assets 路由无可匿名访问的 share 路径。

> 结论：boss 的验收「工具条浏览器打开 → 跳到 COS 公开 URL (200)」在**当前数据模型下做不到** ——
> 因为 `downloadUrl` 本身也是 `/api/...`，且该端点无会话即 404。
> **要真正修好，需要服务端新增「公开/预签名下载」能力**（安全敏感，需设计 + 老板确认），
> 不是改一行客户端就能达成。

---

## 4. P2-D「新公司首启向导」/ P2-E「默认示范项目」

### P2-D —— **Web 端已存在**，App 端缺失

- Web 已有完整向导：路由 `/onboarding`（`ui/src/App.tsx:156,772`），
  组件 `ui/src/components/OnboardingWizard.tsx`（含 adapter 选择、多步、动效 token、
  `OnboardingWizard.*.test.tsx`），另有 `company_onboarding_seeds` 表 + `server/src/routes/onboarding-seed.ts`。
- **App (Expo) 端没有 onboarding**：`clients/expo/src` 搜 `onboarding` = 0 命中 →
  boss 要的「App WebView 加载 /onboarding + step bar」**未做**。
- boss 要的 `company.metadata.onboarded_step` 状态位：全仓搜 `onboarded_step|onboardedStep` = 0 命中 → **未做**。

### P2-E —— **未做**

- 全仓搜 `示范项目/演示项目/demo project/seedDemoProject/starter project`：
  客户端只有「build 一个演示项目」这类**自然语言 prompt**（`clients/expo/App.tsx:699,713`），
  **没有**「建公司自动建 5 子任务示范项目并 mock 跑通」的服务端逻辑。
- 生产 xrobinai 现有 10 个项目，均为历史真实/演示项目，非自动 demo。

---

## 5. 本轮实际改动（唯一落地件）

`clients/expo/src/screens/PrototypeSandboxScreen.tsx`（沙箱工具条「浏览器打开」）：

1. 工具条「浏览器打开」：**未选中时 `disabled` 置灰** + `accessibilityHint`「先选中列表中的条目再打开」；
   选中时只开 `selected.downloadUrl || selected.url`，**不再回退到项目级 `url`**。
2. `handleOpenExternal(target?)` 支持显式目标，保留「Web 端不内嵌预览」与空态「外部应用打开」两个按钮的原有行为。
3. `ExternalOpenSheet` 的 url 同步收敛到 `selected?.downloadUrl || selected?.url`。

验证：`cd clients/expo && npx tsc --noEmit` → **EXIT=0**。

> ⚠️ 该改动**不能**达成 boss §3 验收（外部浏览器 200），原因见 §3.2/§3.3。
> 它只是消除了「未选中时把内部项目级 URL 丢给外部浏览器」这条错路径。

---

## 6. 未执行 / 需老板决策

| 项 | 为何未执行 |
|---|---|
| P0-A 改写 6 员工 adapter | 前提被推翻（已配好且在跑）；按 boss 配方改写会破坏生产 GLM 配置 |
| P0-B 发版 0.5.98 / 0.6.0 | 不可逆生产发版（gradle 出包 + COS + OTA + rsync + `systemctl restart coolie`）。任务虽预授权，但其主因 (P0-A) 不成立；请老板确认是否仅因 P1 (board-chat) 发版 |
| P0-C 真正修好 | 需新增服务端「公开/预签名下载」能力，属安全敏感新特性 |
| P2-D App 端向导 | 需设计 + 实现（Web 向导已有可复用） |
| P2-E 示范项目 | 需服务端 seeding 逻辑（公司创建钩子 + mock adapter 状态机） |

### 建议优先级（供老板拍板）
1. 若「adapter None」是 App 某视图看到的 → **请给截图/页面**，我按真因修展示层（可能只是展示 bug）。
2. P1 board-chat 发版：既然代码已就绪，可单独走 `release-app.sh`（是否含 0.6.0 版本号由老板定）。
3. P0-C：先做服务端**附件公开下载**（presigned 或短时 share token），再让 App 指向它。
4. P2-D/E：Web 向导已大半可用；补 App 入口 + 公司创建时 seed 示范项目。

---

## 7. 纪律遵守
- 未改 `PAPERCLIP_API_KEY` / `DEPLOYMENT_MODE`。
- 未动 server 他人未提交区（`git status` 仅本篇 + 既有 untracked e2e 目录；server/ tracked 无改动）。
- 未启停 dev 进程 (3100/3173)；未 `pm2 restart`。
- 所有 ssh/scp 走 `GIT_SSH_COMMAND='ssh -o ProxyCommand=none'`；无 ssh 报错。
