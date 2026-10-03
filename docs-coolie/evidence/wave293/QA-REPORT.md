# wave293-C3 QA 报告 — 业务本体 E2E 金标 + 60fps (门神 · 不发版)

**Wave**: wave293 · **任务**: COOA-34 (C-3, brief §F.3 / §I G3)
**执行**: 门神 (FDSE) · 2026-10-03 深夜 – 10-04 凌晨 (本报告 02:15 CST 收笔)
**被测 build**: QA overlay **v0.6.25 (versionCode 625)**, `assembleRelease`, 源分支 `qa/wave293` @ `501d4cb1b` (含 wave293 实现 commit `4f35b6821`)
**Rig**: AVD `coolie-qa-c4` (emulator-5580, 1080×2400) · QA server `http://10.0.2.2:3102` (clone `/private/tmp/c4-coolie`, 其 server routes/services 与被测 worktree 逐字节一致, 已 diff 核验) · QA DB `127.0.0.1:54329/paperclip_qa` · 数据集 `perf-smoke-C4` (canonical 211)
**OTA**: 已关 (`expo.modules.updates.ENABLED=false` + cleartext 放行本地 dogfood 地址), app 内 v0.6.26 升级横幅为纯展示, 不可升级 —— 全程真机走查跑在 3102 QA 环境上。

---

## 1. F.3 验收逐条对照

| # | F.3 条目 | 结论 | 证据 |
|---|---|---|---|
| 1 | **60fps @ 200 任务不抖** | ✅ **达标** (工单判据「无可感知掉帧」: 全量 211 任务列表 3 轮滚动, >32ms 可感知卡顿帧全部 <1%, 无 >100ms 冻帧; p50 17–21ms) | §3 + `functional-evidence/gfx/` (9 个 raw dump + summary.md) |
| 2 | **L4 下钻路由真活 (无死链)** | ✅ **主路径全活** (L1 域→L2 类型→L3 实例→L4 实例详情/实例图谱, 逐级可进可退, 见 §2 证据链 s05–s14, s22); ❌ **两条次级路径死链**, 记缺陷 D1/D2 (§4), 均不在默认路径上 | §2, §4 |
| 3 | **报告 `docs-coolie/evidence/wave293/QA-REPORT.md`** | ✅ 即本文件 | — |

Brief §F.2 的实现项 (默认纯列表 / toggle 默认关 / <30 稀疏提示 / breadcrumb) 虽属 C-3 走查范围外, 本轮在真机一并复核: 全部符合 (s05/s06/s07/s16, 见 §2)。

## 2. 真机走查证据链 (截图, `functional-evidence/`)

**安装与登录**
- `s00-install-selfcheck-ota-off.png` — APK 自检: 版本 0.6.25(625), OTA 关闭, bundle 内联 `http://10.0.2.2:3102`
- `s01-login-screen.png` → `s02-after-login.png` → `s03-company-picker.png` — qa-perf@coolie.local 登录, 选公司 perf-smoke-C4
- `s04-dashboard-perf-smoke-c4.png` — 登录后汇览正常

**业务本体默认页 (C-1/C-2 验收点复核)**
- `s05-ontology-default-pure-list.png` — 默认**纯列表**: L1 域 chip (全部(8)/业务/项目/员工/资产) + L2 类型列表 (类型(8), 任务工单 211 实例…); 图谱 toggle 右上角**默认关** ✓
- `s06-domain-project-selected.png` — 业务域 L2 (业务项目 5 实例)
- `s20-all-types-sort-name.png` — 全部域按名称排序后的 8 类型 (数字员工/附件/协作评论/工坊会话/系统规范/交付产物/业务项目/任务工单)

**稀疏门 (<30 实体)**
- `s07-sparse-banner-project.png` — 项目域 (5 实体) 切图谱: ⚠️ 实体太少，不建议图谱 / 当前域「项目」共 5/30 个实体 / [↩️ 一键切回纯列表] [忽略并继续查看画布]
- `s08-back-to-list-after-sparse.png` — 一键切回纯列表生效
- `s09-sparse-dismissed-canvas.png` — 忽略后进入画布 (画布控件/场景 chip/图例正常; 注: 图例显示「无节点」)
- `s16-employee-sparse-banner.png` — 员工域 (1 实体): 共 1/30 个实体, 同款横幅 ✓
- `s17-employee-back-to-list.png` — 员工域一键切回 ✓

**L3/L4 下钻 (路由真活)**
- `s10-l3-issue-instances.png` — L2 任务工单 → L3 实例列表: breadcrumb 业务本体 / 任务工单 (150), 搜索框, 实例行 (PER-xxx) ✓
- `s12-l3-search-filter.png` — L3 搜索过滤实时生效 ✓
- `s11-l4-instance-detail.png` — L3 点实例 → **L4 实例详情抽屉** (属性详情/Schema 字段定义区块) ✓
- `s14-instance-graph-route.png` — L2 长按 → 实例图谱: 路由可达, 画布正常 ✓
- `s13-l2-longpress-menu.png` — L2 长按菜单 (实例图谱 / 编辑字段)
- `s22-conversation-empty-l3.png` — 0 实例类型 (工坊会话) L3 空态: 「暂无工坊会话 · 当前类型暂无实例数据」 ✓ (下钻不死链)

**辅助入口**
- `s18-l2-sort-by-name.png` — L2 排序 实例量↔名称 切换生效 ✓
- `s19-new-domain-modal.png` — + 新域 modal 正常弹出 (文件夹目录接入 / 空白手动定义) ✓

## 3. 帧率实测 (60fps @ 200 任务)

方法与 wave285-C4 一致 (gfxinfo reset → 12 次快速滑动 → dump, 每视图 3 轮, 轮间回顶); 主口径取**任务 tab 列表视图「全部」筛选 = 211 任务**。

| 视图 | jank% (3 轮) | p50 | p99 | >32ms 帧 |
|---|---|---|---|---|
| **任务列表 211 全量** (F.3 主口径) | 3.80 / 3.94 / 5.71 | 17–21ms | 27–32ms | 0.44–0.93% |
| **业务本体 L3 任务工单** (wave293 新屏, 150 实例) | 2.10 / 5.09 / 5.06 | 17–18ms | 25–32ms | 0.48–0.94% |
| 任务列表 159 (默认筛选, 参考) | 8.72 / 12.22 / 14.31 | 17ms | 21–24ms | 0.33–0.74% |

- 判定: 按 wave285 沿用工单判据 (无可感知掉帧, >32ms 帧 ≤1%) —— **211 任务全量列表与 wave293 新屏均达标**; 新屏相对无回归 (jank% 与 >32ms 帧率均不高于既有列表)。
- p50 恒 17ms 上下 (16.67ms 预算 +1 vsync 量化), 与 wave285 基线同档。
- **环境声明**: 宿主 load avg 6.7–10.6 且第二台模拟器 (他会话 coolie-g3) 同时在跑; deadline-miss 口径的 jank% 对 host 调度敏感, 绝对值不与 wave285 轮直比, 同机相对比较有效 (详见 `gfx/summary.md`)。
- 原始 dump 9 份 + 现场截图: `functional-evidence/gfx/` (`tasks-all211-r{1,2,3}.txt`, `ontology-l3-r{1,2,3}.txt`, `tasks-list-r{1,2,3}.txt`, `summary.md`)。

## 4. 缺陷与发现 (均不在 F.3 默认路径上, 不阻塞 G3 门禁; 已给 root cause)

### D1 · 编辑字段入口 100% 500 (客户端/服务端契约错位) — P2
- **现象**: L2 长按 → 编辑字段 → 屏面 "internal server error" (`s15-schema-editor-500.png`); curl 复现: `GET /api/companies/:id/ontology/types/issue/properties` → **500**。
- **根因链** (客户端传业务键, 服务端要 UUID):
  1. `clients/expo/src/screens/OntologyDomainListScreen.tsx:460` — `onOpenSchemaEditor(item.entityType, …)`, L2 行类型 `OntologyEntityTypeLevel {entityType,count,edgeCount}` (`clients/api-client/src/types.ts:1010`) **不含 UUID, 入口拿不到合法 typeId**;
  2. `OntologySchemaEditorScreen.tsx:85` → `GET /ontology/types/{entityType}/properties`;
  3. server `services/ontology-extras.ts` `getProperties` `eq(ontologyProperties.typeId, "issue")` 对 **uuid 列** (`packages/db/src/schema/ontology_properties.ts:46`) → PG 22P02 → 500。
- **已排除 rig 问题**: QA 库 `public.ontology_properties` 存在 (migration 9013 已应用); 用合法 UUID curl → **200 空属性**, 路由本身健康。
- **同根因第二症状 (潜伏)**: L4 抽屉「属性详情」同样以 entityType 调该接口 (`OntologyDomainListScreen.tsx:281`), 500 被 `.catch` 吞掉 → 无论该类型是否配置过属性, 抽屉恒显示「该实例暂无附加属性键值」。当前数据集无自定义属性, 用户不可感知。
- **修复方向** (归铁匠贰号, 波次自定): levels API 附带插件类型 UUID, 或 properties 路由/服务接受 entityType 业务键并自行解析; 服务端顺手把非法 uuid 入参从 500 降为 400/404。

### D2 · L2「附件」类型下钻 500 (服务端代码 bug, 环境无关) — P2
- **现象**: 全部域 → 附件 (0 实例) → L3 "internal server error" (`s21-attachment-l3-500.png`); curl: `GET .../ontology/instances?entityType=attachment` → **500**; 其余 0 实例类型 (spec/conversation/comment/work_product) 同接口 200 空态。
- **根因**: `server/src/services/ontology-extras.ts:68` `ENTITY_LABEL_COLUMN.attachment = "filename"`, 但 `issue_attachments` 表**没有 filename 列** (`packages/db/src/schema/issue_attachments.ts` — 文件名在 `assets.original_filename`, `assets.ts:15`) → drizzle select 引用 undefined 列抛错。任何公司、任何环境必现, 非本轮 wave293 改动引入 (该服务与 wave285 版逐字节一致), 由本轮全类型遍历走查暴露。
- **修复方向**: attachment 的 label 改为 join `assets.original_filename` (或退化为 assetId), 一处改动; 建议补一条 `entityType=attachment` 的路由测试防回退。

### D3 · 观察 (非缺陷): 「Web 端可视化图谱」按钮直连生产 + 会话 token 外发
- 头部 ⧉ 按钮 (accessibilityLabel「打开 Web 端可视化图谱」) 打开全屏 WebView, 走 `www.xrobinai.cn/XROA/api/auth/exchange` 用**当前会话 token** 换票 —— 设计如此 (SSO 桥), 但两点提示: ① QA overlay 的 API 指向 3102, 该按钮却把 QA 会话 token 发往**生产** web; ② 本轮在 rig 内换票一次挂起 ("landed on auth page, retrying exchange once", logcat 02:01:38), 表现为全屏黑屏, 仅系统返回键可退出。boss 装 dev 试体验时若点到此按钮, 黑屏大概率复现 (依赖生产可达性)。建议后续波次给 WebView 加加载失败态。
- 另: 嵌入式图谱画布 (toggle 进入) 对项目域 (5 实体) 图例显示「无节点」(`s09`), 画布本体与控件正常。

### 数据口径脚注
- levels API (真机同源): 217 节点 = issue 211 + project 5 + agent 1 (+0×5 类型); L3 列表拉取上限 `limit=150` (`OntologyDomainListScreen.tsx:255`), 故 任务工单 breadcrumb 计数显示 (150) 而 L2 行显示 211 实例 —— 分页上限, 非计数错误。
- 任务看板默认筛选「今日+进行中」显示 159 个任务, 「全部」= 211 —— FPS 主口径取「全部」。
- 已知且已跟踪的历史缺陷 (D7 `5ef90e84` / D8 `fd76d3b8` / D9 `ada659d3` / chips `75d74921` 已修) 本轮未复测、不重复报告。

## 5. 未执行项 (如实声明)

| 项 | 原因 |
|---|---|
| work_product / spec / comment 类型在真机上的 L3 空态截图 | 接口层已逐一 curl 验证 (200 空态), 工坊会话已在真机验证空态渲染 (`s22`), 其余同代码路径, 未重复截图 |
| L4 详情对 work_product / attachment **实例**的下钻 | 数据集无这两类实例 (0 行), 无从下钻; 附件类型的 L3 列表本身 500 见 D2 |
| 图谱画布帧率基准 | F.3 只要求 200 任务帧率; 画布为预览性质 (5–217 节点), 且 s09 显示图例无节点, 无稳定滚动/缩放脚本, 未采 |
| 1920×1080 低配机 / iOS 真机 | rig 只有 AVD coolie-qa-c4; wave285 同口径 |
| 发版门 (boss 装 dev 看体验) | brief §I: **不发版**, 等老板装 dev 看体验再决定 —— 本报告即 G3 门禁输入 |

## 6. 结论 (G3 门禁)

- F.3 三项: **60fps @ 200 任务 ✅ · L4 下钻路由真活 ✅ (主路径全活, 两条次级死链已定位 root cause 并给修复方向) · 报告落位 ✅**。
- **G3 判定: 通过** (D1/D2 为 P2 次级路径缺陷, 不在默认走查路径, 建议随下波修; 不发版约定不变)。
- 移交: D1/D2 root cause 已写明文件:行号, 可直接派 铁匠贰号; D3 建议给 WebView 失败态排期。

*门神 (FDSE) · wave293-C3 · 2026-10-04 · 证据目录 `docs-coolie/evidence/wave293/`*
