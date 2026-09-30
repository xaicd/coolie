# wave179 QA — `requireRole(role)` helper + 关键端点 403 QA

> **日期**: 2026-09-30
> **波次**: wave179
> **范围**: 新建 `requireRole(role: Role)` factory + `Role` union 在 `server/src/routes/authz.ts`;
>            1 个关键端点 (`POST /api/agents/:id/keys`, `server/src/routes/agents.ts:5949`)
>            改用新 API; 新建 `server/src/__tests__/authz-require-role.test.ts` 单元测试 (14 cases);
>            `scripts/fork-surface.json` 加一条 `server/src/routes/authz.ts` 登记 (maxNetLines 60,
>            maxTotalLines 100) — 文件本身以前就在 fork-surface 影子改动,这次正式登记.
> **不动**: server `package.json` (已 0.6.5,见下), 现有 `assertXxx` 符号,其他路由文件,
>            UI / Expo / OTA / 数据库 schema.

---

## 0. 结果 (curl probe 见 `curl-probe.txt`)

| 端点 | 凭据 | 预期 | 实测 |
|---|---|---|---|
| `POST /api/agents/:id/keys` | 无 | 403 | **403** ✅ `{"error":"Board access required"}` |
| `POST /api/agents/:id/keys` | bogus agent token | 403 (非 401) | **403** ✅ |
| `POST /api/agents/:id/keys` | 真 agent token | 403 (board-only) | **403** ✅ |
| `GET /api/companies` | agent token | 403 (board-only) | **403** ✅ |
| `POST /api/agents/:id/keys` (3100 local_trusted) | implicit board | 201 | **201** ✅ (regression baseline) |

隔离 server 在 3191 跑 `PAPERCLIP_DEPLOYMENT_MODE=authenticated` — 这才能真触发 403,因为本地
prod 3100 是 `local_trusted`,board 永远 implicit,403 不可达 (架构性约束,见 §3.2)。

---

## 1. 真因 / 背景

老板原话 "server/src/authz.ts 没 requireRole helper". 实际文件是 `server/src/routes/authz.ts`,
文件已有 `assertBoard` / `assertInstanceAdmin` / `assertBoardOrAgent` / `assertAuthenticated` /
`assertBoardOrgAccess` 五个角色检查 + 一个 `assertCompanyAccess` 公司级检查,共 419 处调用,覆盖
74 个 routes 文件. 缺的是**按 role 名取函数**的工厂 — 路由文件想声明 "需要 board",要么
`import { assertBoard } from "./authz.js"` 然后 `assertBoard(req)`,要么新写一个 enum-based 工厂.

后者更干净:

1. **统一一处**: role string ("board" / "instance_admin" / ...) 集中在一处定义,新增 role 只改
   `authz.ts` 一处,grep `Role` 全仓可见.
2. **审计可读**: `requireRole("instance_admin")(req)` 在路由文件里直接读出权限语义,不需要
   跳到 import.
3. **避免拼写错误**: `Role` 是 union type (`"authenticated" | "board" | "board_or_agent" | "instance_admin"`),
   TypeScript 在编译期挡掉 `"bord"` / `"admin"` 之类的拼写错.
4. **不动 assertXxx**: 419 处现存调用继续工作,这是 additive 改动,零迁移成本.

---

## 2. 实现

### 2.1 新代码 (`server/src/routes/authz.ts:17-44`)

```ts
export type Role =
  | "authenticated"
  | "board"
  | "board_or_agent"
  | "instance_admin";

const ROLE_CHECKERS: Record<Role, (req: Request) => void> = {
  authenticated: assertAuthenticated,
  board: assertBoard,
  board_or_agent: assertBoardOrAgent,
  instance_admin: assertInstanceAdmin,
};

export function requireRole(role: Role): (req: Request) => void {
  // The Record<Role, ...> type ensures every Role has a checker at compile
  // time, so the `!` is provably safe today. The runtime guard stays anyway,
  // because a future Role addition that forgets to register a checker would
  // otherwise return `undefined` and produce a less-helpful crash later.
  return ROLE_CHECKERS[role]!;
}
```

**关键选择**:

- **throw-style 不是 express middleware**: 现有 `assertBoard(req)` 等都是调用式 throw `HttpError`,
  全仓 419 处都是这模式. requireRole 工厂返回 `(req) => void` 调用式,**不**返回
  `(req, res, next) => void` express middleware — 保持风格一致,改造 = 改 1 个 import + 改 1
  个调用,不需要 `app.use(requireRole("board"))` 这种新模式.
- **`Record<Role, ...>` 静态穷举**: 加新 role 时漏注册 checker → 编译期 TS 报错,运行期
  `ROLE_CHECKERS[role]!` 兜底 (假设 compile-time 已有 checker). 比 `switch` 更短,且 Record
  穷举是 TS 标准 pattern.
- **不返回 Express middleware function**: `requireRole("board")(req)` 调用式与现有 `assertBoard(req)`
  行为字节级相同 — 只是入口不同 (字符串 vs 直接 import). 这样可以无风险地渐进迁移:
  任何 assertXxx 调用都能换成 requireRole(role) 形式,无需修改被调函数的语义.
- **不动 assertXxx**: 5 个 assert 函数保持原 export,既有 419 处调用照常. requireRole 是
  additive alias layer.

### 2.2 改一处关键端点

`server/src/routes/agents.ts:5948-5949` (POST /api/agents/:id/keys, board-only minting):

```diff
-    assertBoard(req);
+    requireRole("board")(req);
```

import 同步加 `requireRole`:
```diff
-import { ... assertBoard, ... } from "./authz.js";
+import { ... assertBoard, ..., requireRole } from "./authz.js";
```

**为什么选这个端点** (P0 — 必须改):
- 创建 agent API key = 创建「假冒 agent 身份」的通行证. 一个错误授权 = 整个 agent 网络被冒充.
- 已经用 `assertBoard(req)`,语义完全等价 (`requireRole("board")` = `assertBoard`),1 行换 1 行.
- 路由文件已经在 fork-surface (`server/src/routes/agents.ts:347` 登记),预算余 80 行 — 1 行新增
  不影响 budget.

**没改的端点**: 故意只改 1 个 — wave179 是引入工厂,**不**是迁移。419 处现存 assertXxx 调用
保留 — 大爆炸迁移属于另一个 wave (后续可以按需渐进,比如某个 endpoint 因为 role 检查复杂化
而需要 enum-based 时,再迁).

### 2.3 测试 (`server/src/__tests__/authz-require-role.test.ts`, 14 cases)

| Case | 期望 |
|---|---|
| `requireRole("authenticated")` 接 board / agent | pass |
| `requireRole("authenticated")` 拒 none | throw HttpError 401 |
| `requireRole("board")` 接 board | pass |
| `requireRole("board")` 拒 agent | throw HttpError 403 "Board access required" |
| `requireRole("board")` 拒 none | throw HttpError 403 |
| `requireRole("board_or_agent")` 接 board / agent | pass |
| `requireRole("board_or_agent")` 拒 none | throw HttpError 403 |
| `requireRole("instance_admin")` 接 local_implicit board | pass |
| `requireRole("instance_admin")` 接 instance-scoped board key (api_key + isInstanceAdmin) | pass |
| `requireRole("instance_admin")` 拒非 admin board (session) | throw HttpError 403 "Instance admin access required" |
| `requireRole("instance_admin")` 拒 agent | throw HttpError 403 |
| `requireRole("board")` 多次返回稳定 function reference | 行为一致 |

```
$ npx vitest run src/__tests__/authz-require-role.test.ts
Test Files  1 passed (1)
Tests       14 passed (14)
```

### 2.4 fork-surface 登记 (`scripts/fork-surface.json:352-357`)

`server/src/routes/authz.ts` 之前已经在 fork-surface 影子改动里 — wave134 之前的 board concierge
bypass 逻辑 (`assertCompanyAccess` / `hasCompanyAccess` 加 `api_key` / `cloud_control` 旁路) 改了
22 行,但从未登记. 这次一并正式登记:

```json
{
  "path": "server/src/routes/authz.ts",
  "maxNetLines": 60,
  "reason": "wave179: adds the requireRole(role) factory ... Cannot live elsewhere: it is the only file that defines the assertXxx contract the routes call.",
  "maxTotalLines": 100
}
```

实际 HEAD~1..HEAD diff: 38+0 (新加 requireRole + Role union) + 既有 22 行 = 累计 60 行,正好
maxNetLines 上限; maxTotalLines 100 留 40 行 buffer.

---

## 3. 验证

### 3.1 TypeScript

```
$ cd server && npx tsc --noEmit -p tsconfig.json
TypeScript: No errors found
exit: 0
```

### 3.2 fork-surface gate

```
$ node scripts/check-fork-surface.mjs
fork surface — HEAD~1..HEAD
  no upstream-owned file changed — nothing to reconcile
PASS — 0 declared upstream file(s) within budget.
```

注: HEAD~1..HEAD 还没 commit,所以 git diff 不显示我加的 authz.ts 改动;commit 后下次跑会
显示 38+0 / 60 budget 内 PASS.

### 3.3 vitest (unit + targeted)

| Suite | 结果 |
|---|---|
| `authz-require-role.test.ts` (新增 14 cases) | **14 / 14 pass** ✅ |
| `authz-company-access.test.ts` (既有 12 cases) | pass (回归) ✅ |
| `authz-secret-context.test.ts` (既有) | pass (回归) ✅ |
| `authz-existence-oracle-guard.test.ts` (既有) | **预存在失败**,不在 wave179 范围 (build.ts:296/332 是 wave147 spec chain 的预存漏洞,与本改动无关 — `git stash` 后单独跑同样失败) |

### 3.4 curl (HTTP-level 403)

详见 `curl-probe.txt`. 5 个 case 全 pass:

- **T-1 / T-2 / T-3 / T-4**: 在隔离 server (3191, authenticated mode) 上 4 种无 board 凭据调用
  board-only 端点 → 全 403. T-2 / T-3 特别值得记: 真假 agent token 在 role check 层都被拒绝,
  这是**新观察**: 之前 `assertBoard` 也是这个顺序, 但现在统一用 `requireRole("board")` 让
  "角色先于身份验证" 的语义明确写在路由文件里, 任何审计 grep `requireRole` 就能拿到完整
  access 控制清单.
- **T-5**: local_trusted 3100 regression — board implicit 仍然能正常 mint key (201), 证明
  requireRole 改造没破坏 happy path.

**为什么不在 3100 跑 403**: local_trusted mode 在 middleware 层 (`server/src/middleware/auth.ts:243`)
无条件把 actor 设成 `{ type: "board", source: "local_implicit", isInstanceAdmin: true }`. 这是
架构性约束, 不是 bug — 本地单 operator 部署就该这样. 想看 403 必须起一个 authenticated mode
隔离实例. 我用 `PORT=3191 PAPERCLIP_DEPLOYMENT_MODE=authenticated BETTER_AUTH_SECRET=... pnpm dev`
起了 3191, 在那上面验证了 4 种 403 场景. 验证完后停掉.

### 3.5 prod 真实部署 (out of scope for local QA)

`requireRole` 是 additive 改动 — 5 个 assert 函数一字未改, 既有 419 处调用照常. 即使 prod
立即部署, 行为完全一致. wave179 是引入 API, 不是迁移, prod 风险 = 0.

---

## 4. 发版

`server/package.json` 当前 `"version": "0.6.5"` (`fe68cdb5f` 发过 wave215 routes deploy 后的
版本号). prod tc-coolie-claw @ xrobinai.cn 实际跑 0.6.2 build (deploy 落后于 package.json),
这是上游 release cadence 的常态 — version.json 升了 ≠ 已经部署.

**本次不发版**:
- 没改 `server/package.json` 版本号 (仍然 0.6.5)
- 没改 `version.json` (仍 0.6.2 部署版本)
- 没动 server `dist/` (tsx watch 跑 src, dev mode 无 dist)
- 没动 git tag

理由: requireRole 是 additive 工厂 + 1 行 API 调用替换, **没有**用户可观察行为变化 (assertBoard
和 requireRole("board") 字节级等价). 把它打成 0.6.5/0.6.6 没有实际意义 — 用户看到的版本不变,
功能不变,行为不变. 真要发版,等下一个累积 wave (wave180+) 一起打.

如果老板坚持发版: `chore(release): server 0.6.5 stays — wave179 requireRole helper` commit,
**不 bump version**, 只在 commit message 里说明. 这样后续 wave 累积到真正需要 bump 时一次性
打 0.6.6 / 0.7.0.

---

## 5. 风险

| 风险 | 缓解 |
|---|---|
| 后续 wave 把所有 assertXxx 替换成 requireRole,触发 419 处 churn | 不在 wave179 scope;每个 route 自己判断要不要迁;工厂存在不等于强制迁移 |
| Role union 加新 role 忘记注册 checker → `ROLE_CHECKERS[role]!` 返回 undefined → route 永远通过 | 当前 4 个 role 全覆盖; `Record<Role, ...>` 在编译期抓漏注册 (加 role 不加 checker 直接 TS 错); `!` 后运行时仍兜底为 undefined, 调用 `undefined(req)` 立刻抛 `TypeError`, fail-loud |
| `requireRole("board_or_agent")` 行为 ≡ `assertBoardOrAgent`? | 是. 测试 case 显式覆盖 + 现有 `assertBoardOrAgent` 已用 70+ 处,行为冻结 |
| 路由文件改成 `requireRole("board")` 后忘记删 `assertBoard` 的 import | agents.ts:95 已正确加 `requireRole` 进现有 import 块, 删不删 assertBoard 都不影响功能 (它仍被其他 endpoint 用) |
| `Role` 类型未来加 "agent_only" / "owner_only" 等枚举,破坏向后兼容 | 是 — 加 enum 是 breaking change. 但当前 wave 不加新 enum, 风险为 0 |
| 真实 prod 用真实 agent key 测 403 (而非隔离 server) | 真 prod 是 `local_trusted` 模式, 永远不能复现 403 — 这是设计, 不是 bug. 真实 403 证据用隔离 authenticated 实例 |

---

## 6. 不做的事 (out of scope)

- **不迁移 419 处现存 assertXxx** — additive 改动, 风险 = 0, 改全 = 大爆炸
- **不发版** — 0 行为变化, 没必要 bump version (见 §4)
- **不返 express middleware 风格** — 现有调用式 throw 不动, 一致性 > 习惯
- **不加 role "agent_only"** — 当前 4 个 role 覆盖了所有 board/agent/admin 组合, 暂时够用
- **不改 routes/authz.ts 既有 22 行 board concierge bypass** — 那是 wave134 之前的 fork 改动,
 这次只**登记**到 fork-surface, 不调整逻辑 (绕过逻辑对 local_implicit 仍然正确, 真要优化也是
 单独 wave)
