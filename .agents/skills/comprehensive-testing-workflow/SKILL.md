---
name: comprehensive-testing-workflow
description: 用于系统测试、单元测试、本地脱机沙箱测试、E2E 浏览器旅程、移动端真机快照测试与物理遮挡审查。沉淀了 PGlite WASM 嵌入式测试、A11y 交互点嗅探、DOM 物理遮挡几何计算、多模态屏幕快照视觉验证与反造数断言的全套实战经验。适用于“执行测试”“编写单测/集成测试”“本地脱机测试”“E2E回归”“排查UI遮挡与白屏”等场景。
---

# 综合测试与质量保障通用工作流 (Comprehensive Testing Workflow)

本 Skill 汇总并提炼了企业级全栈系统（PC 管理端、商户/业务端、移动 H5/C 端）在测试架构、脱机沙箱、多模态真机审查与防错工程化方面的**全套通用实战经验与设计范式**。
**本规范为纯通用工程方法论，不绑定任何特定业务，适用于所有基于 Node.js/TypeScript/PostgreSQL 的全栈工程。**

---

## 0. 四大测试防线（实战战损沉淀 · 本项目可直接执行）

第 1 节是通用的分层模型；**本节是把实战踩坑固化成断言的四条防线**，每条都写明：
真实命令、它唯一能抓住的失败类型、它抓不住什么（也就是下面那条防线为什么不可替代）、
以及本仓历史上它实际抓到过的事故。

### 防线一：编译期与静态契约门禁

**四道防线已聚合成一个可执行入口**（`scripts/check-testing-defenses.mjs`）：

```bash
pnpm test:defenses                       # 防线 1+2（脱机、默认）
pnpm test:defenses --scope=plugin-ontology   # 收窄到单个包
pnpm test:defenses:full                  # 四道全跑（需实例 + 浏览器）
pnpm test:check-testing-defenses         # 门禁自身的诚实性测试
```

它的关键性质：**跑了一部分绝不打印「通过」**。未开启的行报 `NOT VERIFIED`，
因上游失败而没跑的行报 `NOT RUN`，失败的行**不会**同时出现在「已验证」里，
只有四行全跑才输出 `all 4 lines verified`。

```bash
pnpm -r typecheck                        # 全工作区 0 报错，未声明变量在提交前就被拦下
pnpm check:module-boundaries             # 依赖方向：核心层不得依赖宿主，工具层不得依赖界面层
pnpm check:token-gates                   # UI 令牌红线（禁止硬编码色值/间距）
pnpm --filter @paperclipai/plugin-ontology test   # 守卫用例连同业务用例一起跑
```

本仓已入库的结构守卫（每个都对应一类真实发生过的 bug）：

| 守卫 | 断言 | 守住的是什么 |
|---|---|---|
| `tests/layering.spec.ts` | 核心包不得 import 宿主/界面层；本体只归属租户，不得挂在工单/岗位类概念上 | 架构分层与租户红线 |
| `tests/action-parity.spec.ts` | 契约 ↔ manifest ↔ worker 分发三方一致 | 声明了却不可达、实现了却未声明 |
| `tests/schema-columns.spec.ts` | 所有 SQL 里引用的列名、所有 `*_COLS` 投影，必须在真实迁移里存在 | 「写进去读不出来」 |
| `tests/migration-comments.spec.ts` | 迁移注释里不得有撇号 | 宿主分类器先剥字符串字面量再判语句类型，注释里的撇号会打开一个字面量并吞掉后面无关语句的分类 |

**实证**：为身份管理新增 9 条契约路由后，`action-parity` 立刻报出
`declares nothing the manifest does not expose` —— 若没有它，这 9 条会以「声明了但打不通」
的形态进入交付。**另一个方向的实证同样重要**：把枚举从联合类型降级成 `string` 之后，
`layer: "concept"` 这类运行时不可能存在的取值就一路活到了界面。

**抓不住什么**：类型对、列名对、契约对，但**语义错、业务错、环境错**。防线一全绿不代表任何业务可用。

### 防线二：纯函数单测 + 真 PostgreSQL 集成测试

```bash
pnpm test                                # 全量（Vitest）
npx vitest run --config ./vitest.config.ts tests/members.spec.ts   # 定向
```

分工原则（这条是踩坑换来的）：

- **规则用纯函数测** —— 零依赖、毫秒级、可穷举。例：身份解析规则（角色归成员、
  停用打掉 scope、跨租户拒绝、指名成员缺失不回退）全部是纯函数，8 条用例覆盖所有分支。
- **存储用真 PostgreSQL 测** —— 例：`packages/ontology-mcp/tests/standalone.spec.ts`
  的模式（嵌入式 PG + 真迁移 + 真 `pg` 驱动）。

> **教训：假库比它的价值更贵。**
> 本仓曾用假 DB 桩来测存储层，结果：真 PG 上 `jsonb` 的 `?|` 配 `text[]` 参数直接失败
> （宿主按标量绑定）、`RETURNING` 被吞掉、插入的行读不回来 —— 而**假库全部通过**。
> 假库不解析 SQL，于是它证明不了任何关于 SQL 的事。后来把这类验证整体迁到真库上。

**实证**：密钥表新增 `member_id` 列后，INSERT 写了、但 SELECT 的列投影没读回来 ——
「写进去读不出来」。单元测试和类型检查都是绿的（类型定义里有这个字段），
只有真实 PostgreSQL 上那条 `expect(record.member_id).toBe(member.id)` 会红。

**抓不住什么**：真实装配。单测通过 ≠ 插件在宿主里能跑，≠ 路由鉴权正确，≠ 界面能点。

### 防线三：真实例活体验证

做法（本仓已验证的一次性实例流程）：

```bash
# 起一次性实例（独立 HOME + 独立端口，绝不复用开发实例）
PAPERCLIP_HOME=/tmp/verify PAPERCLIP_INSTANCE_ID=verify PORT=3211 \
  pnpm paperclipai onboard --yes --run

# 装插件 → 打真实路由 → 观察日志
curl -X POST .../api/plugins/install -d '{"packageName":"...","isLocalPath":true}'
curl -H "Authorization: Bearer <board token>" .../api/plugins/<id>/api/<route>

# 验证完必须拆掉并确认端口释放
lsof -nP -iTCP:3211 -sTCP:LISTEN     # 应无输出
```

**实证（三条都是单测抓不到、只有活实例能发现的）**：

1. 审计日志写进了**宿主的活动流**而不是插件自己的表 —— 单测跑在宿主记录上全绿，
   真实例里读出来 0 条。
2. 签发密钥时把 **tenantId 当 companyId** 传给插件配置读取接口，被宿主正确地拒绝。
3. 打作用域 HTTP 路由时**没带 board 凭证**，返回的是 500 而不是 401 ——
   看起来像产品缺陷，实际是探针姿势不对。**探针错误会被误判成产品错误**，
   所以每次「发现 bug」都要先确认探针本身正确。

**抓不住什么**：用户视角。真实例能证明「接口通了、数据对了」，证明不了
「用户点这个按钮会发生他认为会发生的事」。

### 防线四：真浏览器 E2E 业务旅程探路

```bash
pnpm test:e2e                            # Playwright（tests/e2e/）
```

这一层是 DS（部署战略专家）视角的主场，检查项见第 3、4 节。它唯一能抓的是：

- **死交互与假按钮** —— 排版像按钮、点了没有任何反应。所有技术测试都会放过它
  （DOM 存在、无异常、无 4xx），只有「真点一次并检查世界是否改变」能抓到。
- **业务语义隔离违规** —— 技术上跑通、语义上荒谬（类目混装、单位串了、无权角色能审批）。
- **物理遮挡** —— 元素存在但被浮动层挡住，`getBoundingClientRect` + `elementFromPoint`
  几何判定（见 3.2）。
- **零未捕获异常** —— 全程监听 `pageerror` 与 5xx 响应。

**抓不住什么**：深层业务规则的正确性（那要靠读数据与对账），以及非浏览器端的契约。

### 四条防线不可互相替代

| 防线 | 唯一能抓 | 对下一层无能为力之处 |
|---|---|---|
| 一 · 编译/静态 | 未声明变量、枚举漂移、依赖倒挂、契约漂移 | 语义与业务全错也照样全绿 |
| 二 · 单测/真库 | 规则分支、SQL 与列引用、并发与事务细节 | 装配、宿主、鉴权、界面 |
| 三 · 活实例 | 真实装配、路由鉴权、宿主约束、插件生命周期 | 用户视角与交互体验 |
| 四 · 真浏览器 | 死按钮、遮挡、业务旅程、未捕获异常 | 深层业务规则与非浏览器契约 |

**用法**：出问题先问「这类失败属于哪条防线」——如果是防线四的类型，
就不要试图用防线二的更多单测去解决，那只会得到更多绿灯和同一个故障。

### 怎么证明一条防线不是装饰

守卫最容易的死法是：**它永远绿**，于是没人再相信它，最后被删掉。
判定方法只有一个：**故意破坏它守的东西，看它是否立刻变红。**

本仓实证：新增 9 条契约路由时 `action-parity` 立刻报错（说明它没变成装饰）；
反之，声明了却不可达的路由若无人报错，那条守卫就只是摆设。

**新守卫入库时附上这次「故意破坏 → 变红」的记录**，否则不要假装它有效。

### 另一条同等重要的判定：退出码 0 不等于做过事

守卫和门禁最常见的第二种死法更隐蔽：**它跑了，但什么也没检查，然后报告通过。**

本仓实证（构建四道门禁聚合入口时踩到）：`pnpm --filter <不存在的包> typecheck`
打印一句 `No projects matched the filters` 然后**以 0 退出**。于是 `--scope` 打错一个字母时，
聚合门禁把**全部四行都报成「已验证」**，而实际上一条命令都没跑。

因此聚合门禁不能只看退出码，必须校验**输出哨兵**：

```js
const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
const matchedNothing = /No projects matched the filters/.test(output);
if (matchedNothing) fail("matched no project — check --scope");
if (result.status !== 0) fail(`exit ${result.status}`);
```

同类哨兵按工具补齐（空测试集、跳过全部用例、`0 tests`、`no files found`）。
**判定方法**：给出一个必定无匹配的输入（错的包名、不存在的路径），
门禁必须**变红**；如果它变绿，那么它在正常输入下的绿也没有意义。

### 防线 ↔ 角色的归属

| 防线 | 主责角色 | 说明 |
|---|---|---|
| 一 · 编译/静态 | Core SWE | 让错误在编译期提交不进来（见 `palantir-role-engineering`） |
| 二 · 单测/真库 | FDSE | 交付第一责任人自己写测试，规则用纯函数、存储用真库 |
| 三 · 活实例 | FDSE + PRE | FDSE 出功能证据；PRE 负责确认「测的就是要上的那一版」 |
| 四 · 真浏览器 | DS（FDSE 提供用例） | 业务主审官走真实旅程，抓死按钮与语义违规 |

---

## 1. 核心理念与分层测试矩阵

为了彻底解决“依赖外部 Docker 数据库易崩溃、端口冲突、启动慢、数据污染、无法脱机离线测试”的痛点，系统确立了**四层递进式自动化测试金字塔**：

```
[Layer 1: 静态守卫与架构门禁] ────> 模块边界扫描 / 路由契约覆盖 / 图标与字典枚举检查
              │
              ▼
[Layer 2: 毫秒级内存单测/集成] ───> PGlite WASM (毫秒级内存推库，零 Docker 依赖，完全脱机)
              │
              ▼
[Layer 3: 浏览器端到端脱机闭环] ──> PGlite + Web框架 + Playwright (A11y交互嗅探 + 几何防遮挡 + 多模态快照)
              │
              ▼
[Layer 4: 原生 App 真机/模拟器] ──> 设备自动化 CLI / MCP (原生容器、手势交互与真机取证)
```

---

## 2. PGlite 嵌入式脱机沙箱测试通用方案

### 2.1 架构原理
- **引擎**: 基于 `@electric-sql/pglite` (WebAssembly 编译的 PostgreSQL 内核)；
- **网络协议代理**: 通过 `pg-gateway` 暴露标准 PostgreSQL Wire Protocol，动态分配随机未占用端口，生成标准的 `postgresql://postgres@127.0.0.1:<port>/<db_name>?sslmode=disable`；
- **极速同步**: 毫秒级内推送全库 Schema 表结构并初始化基础测试种子数据；
- **全生命周期自闭环**: 执行器（如 `scripts/testing/run-with-pglite.ts`）自动拉起内存库 $\rightarrow$ 注入环境变量 `DATABASE_URL` $\rightarrow$ 执行目标测试/构建命令 $\rightarrow$ 捕获退出信号（SIGINT/SIGTERM） $\rightarrow$ 退出时 100% 自动回收端口与资源，彻底避免脏进程驻留。

### 2.2 通用测试命令设计模式

```bash
# 1. 跑全量单测/集成测试（脱机秒级运行）
npm run test:pglite

# 2. 定向单测：针对特定 Service、Controller 或工具函数
npm run test:pglite <path/to/test-file.test.ts>

# 3. 本地脱机全自闭环 E2E 测试 (无需预先启动任何外部数据库服务)
npm run test:e2e:pglite
# 或执行指定旅程
npm run test:e2e:pglite <path/to/journey.spec.ts>

# 4. 离线/脱机构建预检 (静态页面生成需要真实数据库时)
npm run build:pglite

# 5. 交互式调试沙箱 (开发调试临时需要纯净数据库时，Ctrl+C 退出)
npm run db:pglite
```

### 2.3 测试数据与账号播种规范（Seed & Isolation Standards）
- **密码与凭据统一约定**: 测试沙箱环境统一使用固定的测试弱密码（如 `TestAdmin@2026` 或经环境变量配置），生产环境强制校验拦截；
- **分层角色覆盖**: 播种脚本至少覆盖：
  1. 系统超级管理员（全权限）；
  2. 业务审核/经办角色（受限数据范围）；
  3. 终端用户/客户（普通租户）；
- **自包含原则**: 测试运行后数据全部存于内存，测试结束自动销毁，保证测试用例幂等、无序、可并行。

---

## 3. 全端交互与视觉审查规范 (Interaction & Visual QA)

### 3.1 自动化交互点嗅探 (A11y 树深度遍历)
禁止在 E2E 测试中仅依赖硬编码的单一 CSS 类名选择器进行点击。推荐通过可访问性树（Accessibility Tree）嗅探页面当前视口内的全部可交互元素：
- 按钮 (`role="button"`, `<button>`)
- 链接与路由跳转 (`role="link"`, `<a>`)
- 表单输入框、开关与下拉 (`<input>`, `<select>`, `role="switch"`)
- 快捷入口与卡片动作 (`[data-action]`, `[data-entry]`)

### 3.2 物理遮挡几何计算 (Hit-Testing 遮挡判定算法)
**通用痛点**: 移动端底部 Tab、吸底按钮（Sticky Footer）或悬浮按钮（Floating Action Button）极易发生 z-index 层级过高，将页面主要表单、提交按钮物理遮挡，导致用户“看得见但点不到”。

**自动化判定标准算法**:
```ts
// Playwright 中针对关键交互元素进行几何遮挡探测
const isObstructed = await page.evaluate((selector) => {
  const el = document.querySelector(selector)
  if (!el) return true
  const rect = el.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const hitElement = document.elementFromPoint(cx, cy)
  // 如果中心点命中元素既不是自身，也不是其子节点，则说明被遮挡
  return !(el === hitElement || el.contains(hitElement))
}, targetSelector)
```
- **修复指引**:
  - 悬浮元素若仅展示图标或徽章，外层容器必须增加 `pointer-events-none`，仅具体按钮增加 `pointer-events-auto`；
  - 页面主容器底部必须预留充分的安全内边距（如 `pb-24` 或 `pb-32`），防止被底部浮动栏遮挡。

### 3.3 多模态屏幕快照视觉审校规范
- **通用断点控制**:
  - 桌面端视口：`1280 × 800`
  - 移动端视口：`375 × 667`（典型移动端基准视口）
- **真机快照沉淀**:
  - 截图统一保存至测试制品目录（如 `.playwright/screenshots/`）；
  - 对长页面采用分段滚动截图（顶部首屏 `top`、中间内容 `mid`、底栏 `bottom`），供模型多模态能力审校；
  - 审校要点：文字是否截断、行高是否挤压塌陷（禁超大行高，推荐 1.35 基准）、颜色与主题令牌一致性。

### 3.4 五层 Smart Oracle 真实性与健壮性断言
1. **反虚假造数拦截 (Anti-Fake Oracle)**:
   - 严禁在视图中出现假 Mock ID 或硬编码评分/虚假数字；
   - 统计天数、次数必须有合理的物理上限与真实数据库计算支撑。
2. **浮点数精度截断断言**:
   - 金额计算与关键数值必须做精度舍入（如 `Math.round(x * 10) / 10` 或 Decimal 处理），严禁在 UI 暴露 `517.5999999999999`。
3. **零未捕获异常断言 (Zero Uncaught Error)**:
   - 测试过程中全程监听 `page.on('pageerror')` 与 `page.on('response')`；
   - 严禁产生 `ReferenceError`、`TypeError` 或服务端 500 页面崩溃。
4. **弹窗排版几何约束**:
   - 模态弹窗外层必须具备 `max-h-[90vh]` + `flex flex-col`，内容主体必须 `overflow-y-auto`，严禁超出屏幕视口导致“确定”按钮不可见。

---

## 4. 通用 E2E 业务旅程建模方法论（6大测试范式）

在任意业务项目中，推荐按照以下 **6 大通用旅程范式** 规划端到端自动化用例，形成完备的业务闭环：

| 旅程范式 | 建模目标与覆盖要点 | 通用断言重点 |
|---|---|---|
| **1. 鉴权与权限隔离旅程** | 阶梯多角色登录、JWT/Cookie 凭据流转、越权访问拒绝（403/401） | 菜单按权限动态渲染，禁止跨角色越权访问 API |
| **2. 核心正向交易/业务流** | 资源上架 $\rightarrow$ 列表筛选 $\rightarrow$ 表单提交 $\rightarrow$ 状态机流转 $\rightarrow$ 完成 | 真实数据库记录流转，事务一致性，状态机无跳步 |
| **3. 统一审批与流转闭环** | 经办人发起申请 $\rightarrow$ 待办池聚合 $\rightarrow$ 审核人通过/驳回 $\rightarrow$ 业务状态回调 | 审批历史留痕，审核回调不得抛出未处理异常 |
| **4. 逆向业务与资金/库存冲销** | 用户主动取消 $\rightarrow$ 申请退款/回滚 $\rightarrow$ 超时定时关闭 $\rightarrow$ 账本核销 | 资金与库存守恒，双向流水一致，防重复冲销 |
| **5. 高并发与防击穿验证** | 多并发抢占限流、防重复点击（Idempotency）、原子库存/资源扣减 | Redis Lua/分布式锁防超卖，排队友好降级提示 |
| **6. 多端交互与适老化/响应式** | 桌面端 vs 移动端断点适配、字体 rem 缩放切换、吸底浮动栏遮挡探测 | 界面无溢出截断，关键操作区域 100% 可点击 |

---

## 5. 常见测试故障排查手册 (Troubleshooting)

### Q1: 运行测试提示 `端口占用` 或 `EADDRINUSE`？
- **排因**: 先前测试被强行终止，后台仍有遗留的 PGlite 进程；
- **排查与解决**:
  ```bash
  # 检查 38847 或类似端口占用
  lsof -i :38847
  # 使用内置清理脚本强制回收测试实例
  npm run rules:check
  ```
  `run-with-pglite.ts` 内部已绑定 `process.on('exit')` 与清理逻辑，优先使用 `npm run test:pglite` 可自动避免该问题。

### Q2: Next.js SSR 页面报错 `ReferenceError: document is not defined`？
- **排因**: 在服务端组件（Server Component）或没有标记 `'use client'` 的组件中，直接访问了浏览器全局对象（如 `window`, `document`, `localStorage`）；
- **解决**: 将相关逻辑移至 `useEffect` 生命周期内部，或为组件添加 `'use client'` 指令并配合动态加载 `dynamic(() => import(...), { ssr: false })`。

### Q3: 悬浮元素在 Playwright 中报错 `Element is not clickable at point ... other element would receive the click`？
- **排因**: 浮动组件（如底部固定栏、悬浮购物车按钮）层级重叠挡住了下层按钮；
- **解决**:
  - 为下层内容容器添加底部内边距 `pb-28`；
  - 为悬浮容器非按钮区域添加 Tailwind 类 `pointer-events-none`，仅按钮本身设置 `pointer-events-auto`。

### Q4: 离线构建或脱机测试时无法连接外部网络？
- **排因**: 平台设计保证脱机可运行。如果第三方外部 SDK（高德地图、微信支付）在初始化时强求外网网络，会导致测试挂起；
- **解决**: 系统内置了沙箱 Mock 模式。在环境变量中指定 `LOGISTICS_MODE=mock`，第三方地图通过动态 mock 处理，避免网络不可达阻断测试流。

---

## 6. 跨 IDE 与 CI 协同操作指引

无论是在 **Claude Code**、**Cursor**、**VS Code** 还是 **WebStorm** 中开发：
- 随时运行 `npm run test:pglite` 验证当前单测；
- 修改完页面交互后运行 `npm run test:e2e:pglite` 进行脱机真机快照回归；
- 提交前运行 `npm run rules:check` 与 `npm test`，确保规则未退化且架构边界完好。

---

## 7. 跨项目移植与复用指南 (Portability & Adoption Guide)

如何将本 Skill 及其测试基础设施快速复用到新项目？请根据协作场景选择以下三种途径之一：

### 方式一：全局共享模式（最省心，本机所有项目立刻生效）
若希望本机的任何项目都能直接让 Antigravity 识别该 Skill，可将其软链接或复制到用户的全局配置目录：
```bash
# 创建 Antigravity 全局 skills 目录
mkdir -p ~/.gemini/config/skills/comprehensive-testing-workflow/

# 将本 Skill 链接或拷贝至全局
cp .agents/skills/comprehensive-testing-workflow/SKILL.md ~/.gemini/config/skills/comprehensive-testing-workflow/
```
*生效机制*: Antigravity 会自动递归扫描 `~/.gemini/config/skills/`，在任何新工作区打开时，模型均可按需调用该 Skill。

---

### 方式二：项目独立集成（推荐，团队通过 Git 共享）
在新项目中只需完成极简的三步即可获得同等能力的脱机沙箱测试体验：

1. **复制核心文件**:
   - 复制 `.agents/skills/comprehensive-testing-workflow/` 目录至新项目的 `.agents/skills/`；
   - 复制测试执行器目录 `scripts/testing/`（包含 `pglite-server.ts`, `run-with-pglite.ts` 等）至新项目的 `scripts/testing/`。

2. **安装极轻依赖（纯本地/脱机开发依赖）**:
   ```bash
   npm install -D @electric-sql/pglite pg-gateway
   ```

3. **配置 `package.json` 测试脚本**:
   ```json
   {
     "scripts": {
       "test:pglite": "tsx scripts/testing/run-with-pglite.ts vitest run",
       "test:e2e:pglite": "tsx scripts/testing/run-e2e-pglite.ts",
       "db:pglite": "tsx scripts/testing/pglite-server.ts --standalone"
     }
   }
   ```
*适配说明*:
- 若新项目使用 **Prisma**：`pglite-server.ts` 会自动调用 `prisma db push`；
- 若新项目使用 **Drizzle** 或 **TypeORM**：只需将 `pglite-server.ts` 中的 schema 推送命令替换为 `drizzle-kit push` 或目标迁移命令即可。

---

### 方式三：Antigravity Plugin 插件分发包（标准化企业套件）
可将测试规范、守卫规则与 Skill 打包为独立的 Plugin，存放在单独的公共 Git 仓库或 Git Submodule 中：
```text
plugins/comprehensive-testing-suite/
├── plugin.json       # 声明 {"name": "comprehensive-testing-suite"}
├── skills/
│   └── comprehensive-testing-workflow/
│       └── SKILL.md
└── rules/
    └── AGENTS.md     # 测试通用红线（防造数、防遮挡、API契约等）
```
在新项目中只需在根目录声明 `.agents/plugins/` 引入，团队所有成员拉取代码后开箱即用。

