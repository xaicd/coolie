# 运营台插件（ops console）：第一版

日期：2026-09-18。前置：[`2026-09-18-platform-readiness-for-business.md`](./2026-09-18-platform-readiness-for-business.md) §8。

形态：**一套公网实例 + 多个客户公司**（交付公司）。运营台要回答的第一个问题是
"我这套实例里的每个客户现在是什么状况"——现在的产品里没有任何页面能回答它。

## 1. 为什么要做成插件，而不是加 host 页面

`ui/src/pages/**` 是上游文件，加页面就是抬 fork surface；插件有 `page` + `sidebar`
槽位，`plugin-ontology` 已经这么干过。**偏离技能默认**（技能 §1 要求插件建在仓库外、
用本地路径安装）：我的文件工具被限制在 workspace 内，且仓库已有 `packages/plugins/plugin-ontology`
这个"我们自己的插件"先例，架构偏好也把它列在我们的树里。所以建在
`packages/plugins/plugin-ops-console/`。

## 2. 承重决定：范围继承自宿主，绝不做一条跨公司大查询

这是本插件唯一真正重要的设计，其余都是排版。

**摸清的事实**（都读过代码，不是推测）：

- 插件可以声明 `database.coreReadTables`，然后对白名单表跑 `SELECT`，
  而**宿主不会注入 company 条件**（`server/src/services/plugin-database.ts:560` 起校验只认表名）。
  ⇒ 一条不带 `WHERE company_id` 的查询能读到**所有客户**的数据。这正是 readiness §7 里
  被标为泄露风险的那条能力。
- 插件 API 路由的 `auth: "board"` 只保证"有个人"，**客户被邀请成成员也是 board**
  （`server/src/routes/plugins.ts:1866-1879`：`assertScopedApiAuth` → `assertBoard`）。
- 插件路由**没有解析出 companyId 就直接 400**（`plugins.ts:1873-1877`），
  所以"实例级、无公司的路由"这条路不存在。
- worker 拿不到 `isInstanceAdmin`：`getActorInfo` 只给 `actorType/actorId/actorSource`
  （`server/src/routes/authz.ts:197-235`），而 `assertInstanceAdmin` 是**宿主侧**的守卫。
  ⇒ **worker 无法自己判断"来的人是不是实例管理员"。**

**所以本插件用数据面，而且不带 companyId**：

`POST /api/plugins/:id/data/:key` 走 `assertPluginBridgeScope(req, body.companyId)`：
**不带 companyId 时调 `assertInstanceAdmin`**，带的时候才按成员身份校验
（`server/src/routes/plugins.ts:1585-1624,728-732`）。于是：

1. 页面**不带 companyId** 请求 `cockpit` ⇒ 宿主强制"必须是实例管理员"，
   非管理员在到达 worker 之前就被拒绝；
2. 数据面确认调用者是管理员之后，那条**跨公司聚合**才是被授权的行为——
   范围由宿主决定，不由插件自觉；
3. 单写路径 `set-client-note` **必须带 companyId**（备注属于某一个客户），
   走成员身份校验。

**worker 还会 fail-closed**：如果 `cockpit` 请求里**出现了 companyId**，说明宿主是按
"某一家公司"授权的，此时返回全部公司就是把泄露伪装成过滤——所以直接抛错。
活实例上已验证：带合法 companyId 请求 → `502 WORKER_ERROR` + 拒绝信息。

**没有采用的两种做法**（写下来，免得以后有人"优化"回去）：

- **一条不带公司条件的聚合，靠"所有 board 账号都是我们自己人"这条部署纪律兜底。**
  纪律不是机制。
- **UI 逐个公司取（N+1），把范围继承自宿主的成员过滤。** 我原本的设计是这条；
  实做时发现数据面已经提供了更强的门（无 companyId ⇒ 实例管理员），
  于是一把查询 + 宿主强制就够了，不需要 N 次请求。（插件 API 路由那条路不行：
  没有解析出 companyId 会直接 400，`plugins.ts:1873-1877`。）

## 3. 数据来源与拿不到的

宿主服务（`ctx.*`）覆盖：`companies`、`agents`、`issues`、`approvals`。
`ctx.metrics` 只写不读。所以成本与运行必须走 `coreReadTables`：
`companies, agents, issues, heartbeat_runs, cost_events, approvals, budget_incidents`。

**拿不到的、要在 UI 里如实说明**：

- `activity_log` 不在白名单 ⇒ "最后活动"用 `heartbeat_runs` / `issues` / `cost_events`
  的最近时间**推导**，并标注它是推导值，不是活动日志。
- `budget_policies` 不在白名单 ⇒ 无法显示"预算额度/剩余"。只有 `budget_incidents`
  （硬停事件）可读。所以列名是"预算事故"，不是"预算"。

## 4. 第一版范围

- **一页**：全部客户 × {本月成本、agent 数、在跑 run、未结 issue、待批审批、预算事故、
  最后活动}，每行可进入该公司。
- **一条写路径**：每个客户一条运维备注（`ops_client_flags.note`），
  这样插件命名空间里的第一张表是被真正用到的，而不是为了满足 `migrationsDir` 而存在。
- 只读之外不做：不做"以客户身份查看"、不做暂停/归档（那些要动公司生命周期，
  而删公司会连带删掉该公司的 activity log，属于要单独设计的操作）。

## 5. 验证（已跑，含结果）

- `pnpm typecheck` / `pnpm test`（15 例）/ `pnpm build` 全绿。
  单测里有两条是承重的：**每条读查询都必须按公司分组**（一把查询，不是 N+1），
  以及**没有任何写语句**；worker 的 fail-closed 也被单测钉住。
- **活实例**（重建 → disable/enable 重载 → Playwright）：

| 检查 | 结果 |
| --- | --- |
| 数据面（不带 companyId） | 200，返回真实核心数据：coolie / active / agents 1 / 未结 2 / 最后活动 6d ago |
| 数据面（带**合法** companyId） | 502 `WORKER_ERROR` + "Refusing the instance-wide cockpit read…" —— fail-closed 真的会触发 |
| 数据面（带**别人家** companyId） | 403 "User does not have access to this company" —— 宿主先拦 |
| 页面 `/COO/ops` | 标题 + 范围说明 + 10 列表头；`CLIENTS 2`，两个客户名都在行里；无控制台错误 |
| 侧边栏 | "Ops" 出现在 WORK 分组下 |
| 临时公司 | 建 201、用完删 200，实例回到 1 个公司 |

截图：`screenshots/ontplay/50-ops-console.png`（两行）。**该目录只在本机, 已 gitignore** ——
截图是观察记录, 不入库; 上面的表格是这份验证的可持久部分。

**反例是这里的重点**：一个"只有管理员能用"的限制，如果从没被观察到拒绝过谁，
就只是名义上的限制。上面第二、三行是它的两个方向。

## 6. 实现过程中撞到的坑（都验证过，不是猜测）

1. **`usePluginData` 会注入当前公司 id**，所以**不能**用它来调这条实例级读：
   实测页面通过该 hook 拿到的是 `502`，里面正是我们自己的拒绝信息。
   页面改为直接 `POST` 数据面且不带 companyId。（这反而证明了 fail-closed 是活的。）
2. **SDK 的 `DataTable` 渲染的是 div，不是 `<table>`** —— 用 `tbody tr` 去数行会得到 0，
   看着像"没数据"。验证脚本改读文本。这条值得留着：下次别再被同一个假象骗一次。
3. **`DataTable` 的泛型被抹掉了**（`createSdkUiComponent<DataTableProps>` 把类型实现在默认参数上），
   所以带类型的行必须在边界断言回来（`sdk/src/ui/components.ts:482`）。
4. **环境里有 `NODE_ENV=production` 时，`pnpm install` 会跳过并清理 devDependencies**：
   新增 workspace 包那次安装就把根目录的 vitest/typescript/esbuild/@playwright/test 删掉了，
   之后必须以 development 重装（并允许 pnpm 重建模块目录）才恢复。
   这正是"生产模式安装跳过 devDependencies"那条已知坑，代价记在这里。

## 7. 边界（必须写进 README 与插件文档）

- 本插件的范围正确性**依赖宿主数据面的那道门**：无 companyId ⇒ 必须是实例管理员
  （`assertPluginBridgeScope`）。如果哪天这条读被改成"带一个公司过去"，
  或者 worker 里的 fail-closed 检查被删掉，这个保证就没了——
  `tests/plugin.spec.ts` 把后者钉住了，前者只能靠文档和 review。
- 插件 worker 与 UI 都是**可信代码**（插件模型如此），所以本插件只应安装我们自己写的。
