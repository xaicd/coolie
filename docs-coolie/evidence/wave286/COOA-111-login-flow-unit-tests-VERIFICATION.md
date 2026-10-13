# 用户登录流程单测 · 独立核验报告 — wave286 · COOA-111

**Wave**: wave286 · 老板微信诉求「单测一下用户登录流程」
**工单**: COOA-111 (`【微信·老板·wave286】单测一下用户登录流程`)
**角色**: 门神 / FDSE (`menshen-fdse`) · 工具 `cmd`
**仓库**: `/Users/mac/workspace/xaicd/coolie` · 分支 `main` · HEAD `b97f4dadd`
**性质**: 独立核验 (gold acceptance) — 对已落盘的 `auth-login-flow.test.ts` 做**复算 + 反同义反复 + 反噪声**三重验证, 不改产品代码
**被核验产物**: `server/src/__tests__/auth-login-flow.test.ts` + `docs-coolie/evidence/wave286/COOA-111-login-flow-unit-tests.md`

---

## 0. 结论 (TL;DR) — ✅ GO

| # | 核验项 | 命令/方法 | 结果 |
|---|---|---|---|
| 1 | 新套件复算 | `vitest run src/__tests__/auth-login-flow.test.ts` | ✅ 14/14 |
| 2 | 登录相关回归 | `vitest run` 5 套 (新增+4 既有) | ✅ 92/92 |
| 3 | 契约一致性 | 逐条比对 `routes/auth.ts` + `auth/better-auth.ts` 源码 | ✅ 断言与实现逐条吻合 |
| 4 | **反同义反复** (本腿新增) | 临时改坏被测路由 → 套件必须变红 | ✅ 4 例应声红; 已还原 |
| 5 | 治理门禁 | `pnpm check:governance` | ✅ 全绿 |
| 6 | 反噪声 (本腿新增) | 隔离 HEAD worktree 复现全部失败项 | ✅ 2 例**非登录**失败在 HEAD 即红 (与本任务无关) |

**判定: COOA-111 登录流程单测 = GO**。新增套件真实绑定产品行为 (见 §3 反同义反复证据), 非空跑。

---

## 1. 覆盖缺口与本套件定位

登录流程 4 条链路覆盖盘点 (本腿复核):

| 链路 | 路由 | 既有覆盖 | 结论 |
|---|---|---|---|
| 会话读取 | `GET /api/auth/get-session`, `/profile` | `auth-routes.test.ts` (13 例) | 已覆盖 |
| App↔Web 登录桥 | `GET /api/auth/exchange` | `app-web-login-bridge.test.ts` (30 例) | 已覆盖 |
| 凭证签入/签出 | Better Auth `sign-in|sign-up/email` | `better-auth.test.ts` (18 例) + integration | 已覆盖 |
| **活跃会话令牌** | **`GET /api/auth/session-token`** | **无** | ✅ 本套件补 |
| **移动端自助注册** | **`POST /api/auth/register`** | **无** | ✅ 本套件补 |

## 2. 真机命令结果存证

```sh
$ pnpm --filter @paperclipai/server exec vitest run src/__tests__/auth-login-flow.test.ts
 ✓ src/__tests__/auth-login-flow.test.ts (14 tests) 81ms
 Test Files  1 passed (1)
      Tests  14 passed (14)
```

```sh
$ pnpm --filter @paperclipai/server exec vitest run \
    auth-login-flow auth-routes app-web-login-bridge better-auth auth-session-route
 ✓ src/__tests__/app-web-login-bridge.test.ts (30 tests) 60ms
 ✓ src/__tests__/auth-session-route.test.ts   (12 tests) 33ms
 ✓ src/__tests__/better-auth.test.ts          (18 tests)  5ms
 Test Files  5 passed (5)
      Tests  92 passed (92)
```

```sh
$ pnpm check:governance
🎉 全面管局审计全绿通过！...
```

## 3. 反同义反复验证 (本腿核心增益)

**目的**: 证明套件不是「写得漂亮但恒真」——被测路由一旦回归, 断言必须红。

**方法**: 临时改坏 `server/src/routes/auth.ts` 两处, 跑套件, 再 `cp` 还原 (还原后 `git status` 该文件为空 = 与 HEAD 逐字节一致)。

| 临时注入的缺陷 | 预期应红的用例 | 实际 |
|---|---|---|
| `const status = outcome.status;` (去掉 5xx→400 钳制) | register「clamps a provider 5xx to a 400」 | ✅ 红 (501≠400) |
| `forClient = (token) => Promise.resolve(token)` (去掉签名) | session-token 4 条签名用例 | ✅ 红 (裸 token) |

```
Test Files  1 failed (1)
     Tests  4 failed | 10 passed (14)     ← 注入缺陷后应声红
```
还原后复跑: `Tests 14 passed (14)` ✅ —— 证明断言**真实绑定**产品行为。

## 4. 反噪声: 2 例非登录失败的去伪 (本腿新增)

`vitest run auth` 全量 504 例中 **2 例红**, 均**与本任务无关**, 且经隔离 HEAD worktree 复现证明为 **HEAD 级既有失败** (非工作区脏改动、非本任务引入):

| 失败套件 | 现象 | 归属 |
|---|---|---|
| `authz-existence-oracle-guard.test.ts` | 静态扫描报 `build.ts:336/372` 未加 `hasCompanyAccess` 门 — 而 `build.ts` 相对 HEAD **clean** | HEAD 级既有 |
| `agent-cross-tenant-authz-routes.test.ts` | 「create key」跨租户应 404 实得 500 | HEAD 级既有 |

**隔离复现命令** (git worktree at HEAD, 不触碰工作区):
```sh
git worktree add --detach <scratch>/head-check HEAD
# 软链 node_modules 后在 <scratch>/head-check/server 跑:
pnpm exec vitest run authz-existence-oracle-guard agent-cross-tenant-authz-routes
 → Test Files 2 failed (2); Tests 2 failed | 13 passed (15)   ← 与主工作区一致
```
结论: 这 2 例属既有基线红点, **不在 COOA-111 范围**, 未修 (遵守单写者纪律: 不去碰其他写者的在制路由清理与 `build.ts`)。

## 5. 契约一致性抽样 (逐条对源码)

- `session-token`: 非 board → 401 (`throw unauthorized`) ✅; 命中 `sessionId` → 查 `authSessions` 并按 `looksLikeSignedSessionCookieValue` 去重签名 ✅; 无 `sessionId` → `orderBy(updatedAt)` 回落 ✅; 无会话 → `randomBytes(32).toString("hex")` + 7 天 `expiresAt` 落库 ✅。
- `register`: 缺参走 `readRequiredString` → `badRequest` 400 **先于** provider ✅; provider 4xx 原样透传 ✅; 非 4xx 钳制为 400 ✅。
- `signUpWithEmailPassword`: 无端点 501 / 非 Response 502 / 失败透传 provider 文案 / 无文案回退 `Sign-up failed (<status>)` ✅。

## 6. 残余覆盖观察 (非阻塞, 遵「零功能膨胀」不扩写)

`POST /api/auth/register` 的**成功分支** (公司 bootstrap: `companies.create` + `ensureMembership` + `ensureRoleDefaultGrants` + `logActivity`) 目前**未做路由级断言**, 仅测了失败契约; 注册内核成功路径由 `signUpWithEmailPassword` 纯函数单测覆盖。此为**刻意的单测边界** (路由级成功需重 mock 4 个服务), 记录备查, 不建议本波扩写。

## 7. 变更文件列表 (本腿)

| 文件 | 动作 |
|---|---|
| `docs-coolie/evidence/wave286/COOA-111-login-flow-unit-tests-VERIFICATION.md` | 新增 (本核验报告) |
| `server/src/__tests__/auth-login-flow.test.ts` | 未改 (复算对象, 保持上游原样) |

**不碰**: 产品代码 / `build.ts` / 其他写者在制脏文件 (`server/src/routes/*`、`scripts/*`) / 任何 secret。临时的路由注入缺陷**已 100% 还原** (`git status` 验证 clean)。git commit 由外层会话统一处理。

## 8. CMMI 门禁对照

- **4.3 代码审查**: 纯测试增量, 无产品逻辑变更; 断言即契约 (签名格式 / 状态码 / 防泄漏)。
- **5.3 验收金标**: 真实 `vitest` 输出 + 反同义反复红/绿双证 + `check:governance` 全绿 + 隔离 HEAD worktree 反噪存证。
- **Delta 真实验证**: 目标为服务端路由逻辑单测, 证据形态为**命令结果存证** (非 UI 旅程), 无需 agent-browser/agent-device 真机。

---

*门神 (FDSE) · wave286 登录流程单测独立核验 · 2026-10-11 · COOA-111 · Model: cmd*
