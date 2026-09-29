# WAVE153 — 客户首接触 (登录 + Onboarding + App spec 编辑器 + 资产筛选)

- 日期: 2026-09-29
- wave: wave153（需求来源: boss —— 客户进不来其他都白搭; App 登录 100% 失效 (wave129 P1-B);
  Onboarding 向导; App 端 spec 编辑器; 资产中心项目筛选「真卡」）
- 分支: `main`
- 本报告: 勘察结论 / 根因 / 交付结构 / 真验证据 / 缺口 / 发版

> 证据分级沿用仓库口径: **已实现且已验证** / **已实现但未验证** / **缺失**。

---

## 0. 勘察结论（先查上游，别重复造）

| 问题 | 勘察结果 |
|---|---|
| App 登录为什么 100% 失败 | 服务端 `resolveSession` 只认 **Better Auth 写的签名 cookie**（`middleware/auth.ts:302-348`）。App 原生 `fetch` 的平台 cookie jar 没把登录 `Set-Cookie` 带到 `get-session`。curl 真值: 签名 cookie→200, 未签名 token→401。 |
| 资产筛选是服务端还是 UI 的 bug | **服务端本来就对**（`company-artifacts.ts:376/503-507/644` 三处 source 按 `issues.project_id` 过滤; curl 真值 33→3→2）。真正的 bug 在 **App 端 `ArtifactsScreen` 的请求竞态**: 挂载时「全部产物」慢请求后到, 覆盖掉用户选项目后的筛选结果。 |
| spec 编辑器在 web 有没有 | 有。`ui/src/components/SpecEditor.tsx`（3 步 stepper + 4 tab, `GET/POST /api/issues/:id/spec`）, 契约在 `packages/shared/src/validators/issue-spec.ts`。App 只有 `CreateTaskModal` 里的 spec 类型胶囊, **无完整编辑器**。 |
| App 有没有 onboarding 入口 | **没有**（Expo 侧 grep `onboarding` 原为 0）。Web 端向导存在但问的是组织名/首个员工/接模型, **不是** brief 里的「选行业/选员工/跑示范」3 步。 |
| `company.metadata.onboarded_step` 存在吗 | **不存在**。`companies` 表无 `metadata` 列（`packages/db/src/schema/companies.ts`、`packages/shared/src/types/company.ts` 均无）。 |
| 复用了什么 | 会话回放复用 `extractSessionTokenCookie`/`extractSessionCookieName`（api-client）+ `/api/auth/session-token` 刷新 + `/api/auth/exchange` 桥（未改）；spec 契约逐字复用 wave147；产物筛选服务端不动。 |

**结论**: A 是客户端鉴权缺口（服务端正确）；D 是客户端竞态（服务端正确）；
C 是纯补齐（契约已就绪）；B 只能做 App 侧入口（服务端 metadata/3 步向导缺失，不动 db 契约）。

---

## 1. 交付结构

### A) App 登录（已实现, 部分已验证）

`clients/expo/src/coolie.ts`:

- `getSessionCookieHeaderValue()` — 用**登录响应解析出的真名 + 真签名值**组装
  `Cookie: <name>=encodeURIComponent(<signed>)`。
- `getAuthHeader` — 无 bearer 时回放该 `Cookie` 头（iOS 仍走 jar, Android 走该头, 同值）。
- `signInWithEmail` — 存 last-email（仅邮箱）、cookie 名默认值回落、`getSession` 失败刷新重试。
- `refreshSessionToken()` — `GET /api/auth/session-token` 取新签名 token; 冷启动 +
  App 回前台触发（App.tsx `AppState`）。
- **已验证**: curl 签名 cookie→`get-session` 200、`session-token` 200(77 字符签名)。
- **未验证**: 老板 Samsung 真机 1 小时不掉登录（无实机）。

### B) Onboarding（部分实现）

- `shouldShowOnboarding` / `isOnboardingDone` / `markOnboardingDone`（SecureStore, 本机）。
- App.tsx HomeScreen: 无员工 + 未完成 → 打开 web `/<issuePrefix>/onboarding`。
- **缺失**: 服务端 `onboarded_step`、行业/员工/示范 3 步向导。

### C) App spec 编辑器（已实现, 未真机验证）

- `clients/api-client`: `getIssueSpec` + `saveIssueSpec({draft})`。
- `clients/expo/src/screens/SpecEditorScreen.tsx`（新）: 3 步 stepper + 4 tab, 契约同 web。
- 入口: `TaskDetailScreen`「Spec 编辑器」按钮 → App 壳内子页。

### D) 资产项目筛选（已实现, 服务端已验证 / 竞态未真机验证）

- `ArtifactsScreen`: `reqSeqRef` 请求序号（丢弃过期响应）、`loadError` 显式错误态、
  `initialProjectId` prop。
- `ProjectsScreen` 加「查看产物」→ `OrgAssetsScreen` 切 Tab 预设项目。

---

## 2. 真验证据

原始输出: `docs-coolie/evidence/wave153/curl/`。

| 断言 | 证据 | 结果 |
|---|---|---|
| 签名 cookie 能开 get-session | `curl/auth.txt` | HTTP 200 |
| 未签名 token 被拒 | `curl/auth.txt` | HTTP 401 Board authentication required |
| session-token 刷新路径可用 | `curl/auth.txt` | HTTP 200, tokenLen=77, signed=true |
| 产物无筛选 | `curl/artifacts.txt` | 33 |
| 产物按项目 939ff822 过滤 | `curl/artifacts.txt` | 3（全属该项目） |
| 产物按项目 c0e182ae 过滤 | `curl/artifacts.txt` | 2（全属该项目） |
| spec 读路径可用 | `curl/spec.txt` | HTTP 200 `{specKind:null,spec:null}` |

`clients/expo` 与 `clients/api-client` 的 `tsc --noEmit` 均为 **exit 0**。

---

## 3. 缺口（诚实清单）

| # | 缺口 | 原因 |
|---|---|---|
| G1 | 老板 Samsung 真机登录 1 小时不掉 | 无实机/无 Android 工具链 |
| G2 | App spec 全链路真机点击 | 同上; POST 未打生产以免污染客户数据 |
| G3 | App 竞态真机「快切项目」复现 | 同上 |
| G4 | `company.metadata.onboarded_step=3` | `companies` 无 `metadata` 列; 未动 db 契约 |
| G5 | 「选行业 8 类 / 选员工 / 一键示范 5 任务」3 步向导 | web 与 App 都从未实现 (wave146 未落地) |
| G6 | 发 0.6.2 | 工作树含并行线 (wave152) 改动, `release-app.sh` 前置门必拒; 无 Android 工具链 |

---

## 4. 发版

**未发出 0.6.2**。`version.json` 未 bump (仍 0.6.0)。本波只 commit 自己的客户端改动;
并行工作线 (wave152 audit/metrics、wave149 脚本) 保持未提交、未卷入。详见 QA 报告 §6。
