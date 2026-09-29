# WAVE153 — 客户首接触 (登录 + Onboarding + App spec 编辑器 + 资产筛选) · QA 报告

- 日期: 2026-09-29
- 客户生产实例: `https://www.xrobinai.cn` (公司 `4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e` / XROA)
- 老板实机: Samsung SM-G9860 (Android, 系统 WebView Chromium 73)
- 当前线上版本: **0.6.0** (本波**不 bump version** — 见 §6)
- 纪律: 未动 CMMI (wave140)、未动 spec-driven 后端 (wave147)、未改 `PAPERCLIP_API_KEY`/`DEPLOYMENT_MODE`、未启停 dev、未用 `eas build`。

> 诚实标注 (先读): 本波 4 件事 **不是全部发出**。
> - D 的「服务端按项目筛选」经 curl 真值证明 **本来就正确**; 真正修的是 App 端一处**请求竞态** (下方 §4)。
> - B 的 `company.metadata.onboarded_step=3` **无法实现** —— 本 fork 的 `companies` 表**没有 `metadata` 列** (§5)。故只做了 App 侧入口 + 本机完成态。
> - A/C 的代码已落，但**未在老板真机跑过** —— 本环境无 Samsung 实机、无 Android 工具链。凡未跑的都直说，不假装。

---

## 0. 结论速览

| 件 | 需求 | 结论 | 证据 |
|---|---|---|---|
| **A** | 修 App 邮箱/密码登录 (P0) | ✅ 代码已修 (根因=App 未回放签名会话 cookie) | §3 + `curl/auth.txt` |
| **D** | 资产中心项目筛选 (P0) | ✅ 根因=**App 端请求竞态** (非服务端) + 显式错误态 | §4 + `curl/artifacts.txt` |
| **C** | App 端 spec 编辑器 (P1) | ✅ 新增 `SpecEditorScreen` (3 步 + 4 tab) | §5.3 + `curl/spec.txt` |
| **B** | Onboarding 向导 (P0) | ⚠️ **部分** — App 入口已接; 服务端 metadata/3 步向导未做 | §5.1–5.2 |

---

## 1. 真值方法

- 用 Playwright 已保存的**真实签名会话 cookie** (`scripts/e2e/.auth/web-state.json`,
  `__Secure-paperclip-default.session_token=<token>.<HMAC>`) 直打生产 API。
- 原始输出留在 `docs-coolie/evidence/wave153/curl/{auth,spec,artifacts}.txt`。
- 未用 curl 假扮 UI; curl 仅用于**读真值**与**验证鉴权分支**。

---

## 2. A — App 邮箱/密码登录 (P0)

### 2.1 根因 (wave129 P1-B 复现 + 再证)

生产实测 (curl, 见 `curl/auth.txt`):

| 请求 | 凭证 | 结果 |
|---|---|---|
| `GET /api/auth/get-session` | 完整**签名** cookie (`token.HMAC`) | **200** |
| `GET /api/auth/get-session` | 只有**未签名** token | **401** `Board authentication required` |

服务端 `resolveSession` 只从 Better Auth 写的**签名 cookie** 解析会话
(`server/src/middleware/auth.ts:302-348` → `server/src/auth/better-auth.ts`
`resolveBetterAuthSession`)。而 App 的原生 `fetch` 走平台网络栈 (非 WebView),
它的 cookie jar 没有把 `POST /api/auth/sign-in/email` 的 `Set-Cookie` 带到随后的
`get-session` —— 于是登录 200、下一步 401。

### 2.2 修法 (代码)

`clients/expo/src/coolie.ts`:

1. **`getAuthHeader` 回放签名会话 cookie** (核心):
   ```ts
   const token = await getAuthToken();
   if (token) return { Authorization: `Bearer ${token}` };
   const cookie = await getSessionCookieHeaderValue(); // <name>=encodeURIComponent(<signed>)
   if (cookie) return { Cookie: cookie };
   return {};
   ```
   - 名字优先用登录响应解析出的真名 (`__Secure-paperclip-default.session_token`),
     解析不到时回落到该默认名 (prod HTTPS) —— 避免 wave96「别名被静默忽略」。
   - 值按 Better Auth 的口径 `encodeURIComponent` **再编码一层** (存的是逻辑值)。
2. **`signInWithEmail`**: 保存 last-email (仅邮箱, **不存密码**)、cookie 名回落、`getSession`
   失败时**刷新一次 token 再试**。
3. **主动刷新** (`refreshSessionToken`): `GET /api/auth/session-token` 返回**新签名的**
   token; 冷启动 (`restoreCredential`) 与 App 回前台 (`AppState === "active"`, App.tsx)
   都调用它。**不是** `expo-background-fetch` (需原生模块+重打包, 本波不引入),
   故只在 App 存活期间刷新 —— 诚实边界。
4. **失败重试**: 会话 401 → 刷新 token 重试一次; 仍失败则回登录页。

> 关于注释里「手动 Cookie 头会 401」的旧结论: 那是 iOS 上一次**发错值/错名**的测量。
> 本波用**登录响应里解析出的真名 + 真签名值**回放, 且 `credentials:"include"` 保留
> (iOS `NSURLSession` 仍走自己的 jar, Android 走本头)。两端发的是同一个值。

### 2.3 真值验证 (本环境可做的)

- `curl/auth.txt`: 用签名 cookie 打 `get-session` → **200**; 打 `session-token` → **200**,
  返回 **77 字符、带 `.` 的签名 token** (即刷新路径可用)。
- **未做**: 老板 Samsung 真机装新包跑 1 小时不掉登录 —— 无实机/无 Android 工具链,
  **未跑, 不假装**。

---

## 3. D — 资产中心项目筛选 (P0)

### 3.1 服务端本来就对 (curl 真值)

`curl/artifacts.txt`:

| 请求 | 结果 |
|---|---|
| `GET .../artifacts?limit=50` (无 projectId) | **33** 条 |
| `...&projectId=939ff822…` (某公司产融项目) | **3** 条 (全部该项目) |
| `...&projectId=c0e182ae…` (coolie工坊) | **2** 条 (全部该项目) |

服务端三处 source (documents / work_products / attachments) 都按 `issues.project_id` 过滤
(`server/src/services/company-artifacts.ts:376,503-507,644`)。**筛选逻辑无 bug**。

### 3.2 真正的 App bug = 请求竞态

`clients/expo/src/screens/ArtifactsScreen.tsx` 原 `loadArtifacts` **没有请求序号保护**:
挂载时发「全部产物」(projectId=undefined) 慢请求, 用户随后选项目发的筛选请求先回;
**慢的「全部」后到, 覆盖掉筛选结果** —— 现象正是老板说的「选了项目, 列表却还是全部」。

### 3.3 修法 (代码)

- 加 `reqSeqRef` 请求序号: 只接受**最新一次**请求的响应, 过期响应直接丢弃
  (不落库、不动 loading)。
- `catch` 不再静默 `setArtifacts([])`; 记 `loadError` 并在 UI **显式提示 + 重试**
  —— 「拉取失败」与「确实没产物」可区分。
- 新增 `initialProjectId` prop; 项目卡加「查看产物」按钮直达该项目产物
  (`ProjectsScreen` → `OrgAssetsScreen` 切到产物 Tab 并预设项目)。

### 3.4 验证

- 服务端筛选: curl 真值 (上表)。
- 竞态修法: 代码 + `tsc` 通过; **未**在真机复现「快切项目」动作 (无实机)。

---

## 4. C — App 端 spec 编辑器 (P1)

- 契约与 web wave147 完全一致 (`packages/shared/src/validators/issue-spec.ts`):
  `kind ∈ {requirement,bugfix,design,task}`, 3 步 = 需求/缺陷 → 设计 → 任务, 4 tab 按 kind 切。
- 新增:
  - `clients/api-client/src/client.ts`: `getIssueSpec(issueId)` (GET `/api/issues/:id/spec`)、
    `saveIssueSpec` 加 `{ draft }` (POST `?draft=1`)。
  - `clients/expo/src/screens/SpecEditorScreen.tsx` (新): 3 步 stepper + 4 tab 表单 +
    存草稿/保存; 切 kind 保留 `parentSpecId` (与 web 一致)。
  - 入口: `TaskDetailScreen` 加「Spec 编辑器」按钮 → `App.tsx` 壳内子页 (底栏常驻)。
- 真值: `curl/spec.txt` — `GET /api/issues/e20bd52f…/spec` → **200**
  `{"issueId":"…","specKind":null,"spec":null}` (未写过 spec 的正常起点)。
- **未做**: 真机「选项目 → 建 spec_kind=requirement → 走到 task」全链路点击 —— 无实机。
  POST 未打生产 (避免污染客户数据)。

---

## 5. B — Onboarding 向导 (P0) — 部分

### 5.1 先纠事实 (诚实)

- Web 端 **已有** onboarding 向导: `ui/src/components/OnboardingWizard.tsx`,
  路由 `/<companyPrefix>/onboarding`。但它问的是**组织名 / 首个员工 / 接模型**,
  **没有**「选行业 / 选员工 / 跑示范」3 步 —— 那是 wave146 计划但**从未落地**
  (`docs-coolie/evidence/wave146/FINDINGS.md`)。
- **`company.metadata.onboarded_step` 无处可存**: `companies` 表**没有 `metadata` 列**
  (`packages/db/src/schema/companies.ts`, `packages/shared/src/types/company.ts` 均无)。
  本波不新增迁移 (纪律: 不动 db 契约)。故 brief 里的「落 metadata」**未做**。

### 5.2 本波做了什么

- `clients/expo/src/coolie.ts`: `shouldShowOnboarding(companyId)` (无员工=未引导)、
  `isOnboardingDone` / `markOnboardingDone` (**本机** SecureStore 完成态)。
- `clients/expo/App.tsx`: HomeScreen 挂载时, 若公司**还没有员工**且本机未完成引导,
  自动打开 `WebContainerScreen` 加载 `/<issuePrefix>/onboarding`; 返回即记完成。
- 好处: 客户在手机上首次会话**不再直接落到空看板**, 有引导入口 (此前 Expo 侧
  grep `onboarding` = 0 命中)。

### 5.3 未做 / 缺口

- 服务端 `onboarded_step` 持久化 (无列)。
- 「选行业 8 类 / 选员工 / 一键示范项目 (5 任务)」3 步向导 —— web 与 App **都没有**。
- 完成态只在**本机**, 换设备/重装会再次触发。

---

## 6. 发版状态 (诚实)

- brief 要「发 0.6.2 (不 bump version)」。**本波未发出 0.6.2**:
  - `scripts/release-app.sh` 第 1 步硬门是「`clients/expo` 工作区干净、全仓 tracked 无改动」,
    当前工作树**同时**含**并行工作线** (wave152 audit/metrics: `server/src/routes/metrics.ts`
    `audit-log.ts` `defect-kb.ts` `ontology-graph.ts` 等) 与 wave149 未提交脚本 —— **必然被拒**;
    且纪律不允许把别人的改动卷进本波 commit。
  - 无 Android 工具链/实机, 出 APK 亦不可行。
- 本波只 **commit 自己的文件** (见 §7), `version.json` **未 bump** (仍 0.6.0)。

---

## 7. 本波改动文件 (仅这些, 不含并行线)

```
clients/api-client/src/client.ts        (+getIssueSpec, saveIssueSpec draft)
clients/api-client/src/types.ts         (+Company.issuePrefix?)
clients/expo/App.tsx                    (session keep-alive, last-email, spec 子页, onboarding gate)
clients/expo/src/coolie.ts              (cookie 回放, 刷新, last-email, onboarding helpers)
clients/expo/src/screens/ArtifactsScreen.tsx   (请求竞态保护, 错误态, initialProjectId)
clients/expo/src/screens/OrgAssetsScreen.tsx   (产物 Tab 预设项目)
clients/expo/src/screens/ProjectsScreen.tsx    (「查看产物」入口)
clients/expo/src/screens/TaskDetailScreen.tsx  (「Spec 编辑器」入口)
clients/expo/src/screens/SpecEditorScreen.tsx  (新)
docs-coolie/evidence/wave153/**          (本报告 + curl 真值)
docs-coolie/audit/wave153-customer-first-touch.md
docs-coolie/RELEASE-HISTORY.md           (v0.6.2 行, 标未发出)
```

**未触碰**: `clients/expo/app.json` (发版前已改, 非本波)、CMMI/wave140、spec-driven 后端/wave147、
`PAPERCLIP_API_KEY`/`DEPLOYMENT_MODE`、任何 dev 进程。

---

## 8. 复核 / 回滚

- `cd clients/expo && npx tsc --noEmit` → exit 0 (本波全程)。
- `cd clients/api-client && npx tsc --noEmit` → exit 0。
- 回滚: 本波提交为独立 commit; `git revert <commit>` 即可 (纯客户端, 无迁移、无服务端契约变更)。
