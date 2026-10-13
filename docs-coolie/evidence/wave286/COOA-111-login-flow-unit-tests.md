# 用户登录流程单测 — wave286 · COOA-111

**Wave**: wave286 · 老板微信诉求「单测一下用户登录流程」
**工单**: COOA-111 (`【微信·老板·wave286】单测一下用户登录流程`)
**角色**: 门神 / FDSE (`58dc794d-ae28-47f4-9e6e-5e798ef55df2`) · 工具 `claude-mm`
**仓库**: `/Users/mac/workspace/xaicd/coolie` · 分支 `main`
**性质**: 单测交付 — 为登录流程中**零覆盖**的两条凭证路由补齐单测, 真机命令结果存证

---

## 0. 结论 (TL;DR)

登录流程的 4 条链路里, `get-session` / `sign-in|sign-up`(Better Auth) / `exchange`(App↔Web 桥) 已有测试;
**`GET /api/auth/session-token`**(App 取活跃会话令牌) 与 **`POST /api/auth/register`**(移动端自助注册)**此前零单测**。
本次新增 `server/src/__tests__/auth-login-flow.test.ts` **14 例**, 全绿; 连同既有登录相关套件共 **92 例全绿**;
`pnpm check:governance` 全绿。

| 项 | 命令 | 结果 |
|---|---|---|
| 新增套件 | `vitest run src/__tests__/auth-login-flow.test.ts` | ✅ 14/14 |
| 登录相关回归 | `vitest run` 5 套 (新增+既有) | ✅ 92/92 |
| 治理门禁 | `pnpm check:governance` | ✅ 全绿 |
| 类型门禁 | — | 不适用: `server/tsconfig.json` `exclude: ["src/__tests__"]`, 测试文件不进 `tsc --noEmit` |

---

## 1. 覆盖缺口与设计

现有覆盖盘点:

- `server/src/__tests__/auth-routes.test.ts` — 仅 `get-session` / `profile`
- `server/src/__tests__/app-web-login-bridge.test.ts` — `GET /api/auth/exchange`
- `server/src/__tests__/better-auth-credential-signup.integration.test.ts` — 真 Better Auth 依赖嵌入式 Postgres (不支持则 skip)
- **缺口**: `GET /api/auth/session-token`、`POST /api/auth/register` 两条路由无任何断言

新增断言面:

1. `GET /api/auth/session-token`
   - 非 board actor → 401 且**不铸造**任何会话 (防会话泄漏)
   - 命中请求自带 sessionId → 返回并签名 (`<token>.<base64 HMAC-SHA256>`)
   - 无 sessionId → 回落取用户最新活跃会话 (覆盖 `.orderBy(updatedAt).then()` 分支)
   - 无任何活跃会话 → **铸造并落库**新会话 (token 64 hex + 7 天有效期)
   - 无实例 secret → 原样返回裸 token (测试/未签名部署)
   - 已签名 token → **不二次签名**
2. `POST /api/auth/register`
   - 缺参 → 400 且**不触达** Better Auth provider
   - provider 4xx (422 用户已存在) → 原样 4xx + provider 文案
   - provider 5xx → **钳制为 400** (客户端永不见 501/502)
3. `signUpWithEmailPassword` 纯函数 (注册内核)
   - 成功 → 返回用户 + Better Auth 铸的 `set-cookie`
   - 无端点 → 501; 非 Response → 502; 失败 → provider 文案; 无文案 → `Sign-up failed (500)`

---

## 2. 真机命令结果存证

```sh
$ cd /Users/mac/workspace/xaicd/coolie
$ pnpm --filter @paperclipai/server exec vitest run src/__tests__/auth-login-flow.test.ts

 RUN  v4.1.11 /Users/mac/workspace/xaicd/coolie/server
 ✓ src/__tests__/auth-login-flow.test.ts (14 tests) 66ms
 Test Files  1 passed (1)
      Tests  14 passed (14)
   Duration  7.73s
```

```sh
$ pnpm --filter @paperclipai/server exec vitest run \
    src/__tests__/auth-login-flow.test.ts \
    src/__tests__/auth-routes.test.ts \
    src/__tests__/app-web-login-bridge.test.ts \
    src/__tests__/better-auth.test.ts \
    src/__tests__/auth-session-route.test.ts

 ✓ src/__tests__/app-web-login-bridge.test.ts (30 tests) 61ms
 ✓ src/__tests__/auth-session-route.test.ts   (12 tests) 35ms
 ✓ src/__tests__/better-auth.test.ts          (18 tests)  5ms
 Test Files  5 passed (5)
      Tests  92 passed (92)
   Duration  13.77s
```

```sh
$ pnpm check:governance
🎉 全面管局审计全绿通过！ ...
```

---

## 3. 变更文件

- 新增: `server/src/__tests__/auth-login-flow.test.ts` (345 行, 14 例)
- 未改动任何产品代码 / 未触碰工作区既有脏文件

---

## 4. 防退化守卫

新套件位于 `server/vitest.config.ts` 的 `include: ["src/**/*.test.ts"]` 收集面内,
随 `pnpm test:run` (CI 常规门禁) 自动执行 —— 后续任何对 `session-token` 签名规则、
回落/铸造逻辑, 或 `register` 错误码契约的改动都会在此套件红掉, 无需额外登记。

---

## 5. CMMI 门禁对照 (Phase 4.3 / 5.3)

- **4.3 代码审查**: 新增纯测试, 无产品逻辑变更; 断言即契约 (签名格式 / 状态码 / 防泄漏)。
- **5.3 验收金标**: 真实 `vitest` 运行输出 + `check:governance` 全绿存证 (见 §2)。
- **Delta 真实验证**: 本工单目标为服务端路由逻辑单测, 证据形态为**命令结果存证** (非 UI 流),
  故无需 agent-browser/agent-device 真机; 已附真实 vitest 退出日志。
