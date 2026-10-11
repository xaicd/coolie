# wave369 测试工单 — 铃铛 (通知中心) 修复验证报告

> **任务**: wave369 · 测试工单 (FDSE 金标验证)
> **执行员工**: 门神 (Guardian) · `menshen-fdse` · Palantir Delta 前线全栈交付与金标验证
> **调度中枢**: Hermes·Echo · `echo|Echo|业务战略|Hermes·Echo|local` · 宿主 local · 项目 Coolie 本地施工总社
> **底层引擎**: cmd · **工作仓库**: `xaicd/coolie` · **分支**: main · **日期**: 2026-10-11
> **被测交付**: v0.6.52 wave369 铃铛 3 件修复 (`bell-clear` / `bell-subscribe` / `precision`)
> **定位**: 真机 / 服务端真行为验证 + 回归测试补齐. 非发布波.

---

## 0. TL;DR

1. **精准数据 (点开一个少一个)** 与 **重复点开不算 (幂等)** 两条:`bell-subscribe` + `precision` 单条已读路径**真行为通过**, 已用新回归测试锁死。
2. **揪出 1 个真 BUG**: `wave369-precision` 同 commit 新增的「长按清空所有未读」持久化口径**写错 key** —— `handleReadAll` 存复合 id `approval:<uuid>`, 而 GET 查 raw `<uuid>` → **服务端进程重启后已清空的铃铛会全部复活**。老板诉求「铃铛 19 没得清」在重启场景下并未真正闭环。
3. **已修**: 抽出单一 `rawNotificationId()` 口径, GET / 单条 PATCH / 清空 read-all 三处统一存 raw UUID。回归测试由 **1 红 2 绿** 转为 **3 绿**。
4. **另发现 1 项 pre-existing 门禁红** (非本波引入): `openapi-routes.test.ts` 因多波未同步 OpenAPI 契约而失败 (含 wave369 的 2 条 read-all 端点), 已在基线复现, 交 PM 派契约同步波。

---

## 1. 被测范围与边界

| 项 | 内容 |
|---|---|
| 被测 commit | `73762a330` (bell-clear) · `2a2eaead8` (bell-subscribe) · `72a6f98dc` (precision) |
| 涉及真值文件 | `clients/expo/src/components/AppBar.tsx` · `clients/expo/src/stores/notifications.ts` · `server/src/routes/notifications.ts` |
| 未动边界 | 未发版 / 未动 tag / 未动其他员工脏文件 (`projects/sys-chanrong-agent/...erd.md` 保持原样) |

## 2. 变更文件 (本工单)

| 文件 | 类型 | 说明 |
|---|---|---|
| `server/src/routes/notifications.ts` | 修改 | 抽出 `rawNotificationId()`; 三处读状态读写口径统一为 raw UUID (修 BUG) |
| `server/src/__tests__/notifications-routes.test.ts` | 新增 | 铃铛 3 条真行为回归测试 (此前 notifications 路由 0 覆盖) |

## 3. 根因与修法 (真 BUG)

`buildFeed()` 生成的 feed id 是**复合前缀** (`approval:<uuid>` / `failure:<uuid>` / `mention:<uuid>` / `activity:<uuid>`), 而 `inbox_dismissals` 表以 **raw row UUID** 为 key。

`wave369-precision` 单条已读路径已正确拆分 (`rawId = id.split(":").pop()`), 但**同 commit 新增的 `handleReadAll` 漏拆**:

```ts
// 修复前 — 存复合 id, GET 查 rawId 永不命中 (仅靠内存 Set 掩盖, 重启即复活)
await dismissalSvc.dismiss(companyId, userId, item.id);
```

修法 (单一口径, 防再次漂移):

```ts
function rawNotificationId(feedId: string): string {
  return feedId.includes(":") ? feedId.split(":").pop()! : feedId;
}
```

GET 查询 / 单条 PATCH 落库 / 清空 read-all 落库三处统一调用 `rawNotificationId()`。

> 副作用红利: 修复前 `approval:<uuid>` 复合 key 还会**串味到 inbox dismissal 同名 key** (清铃铛=误清收件箱审批); 统一存 raw UUID 后消除该跨功能泄漏。

## 4. 验证矩阵

| # | 验证项 | 命令 | 结果 |
|---|---|---|---|
| 1 | 铃铛回归测试 (3 例) | `pnpm --filter @paperclipai/server exec vitest run src/__tests__/notifications-routes.test.ts` | ✅ 3/3 绿 |
| 2 | 收件箱 dismissal 回归 (防串味) | `... vitest run src/__tests__/inbox-dismissals.test.ts` | ✅ 3/3 绿 |
| 3 | server 类型检查 | `pnpm --filter @paperclipai/server run typecheck` | ✅ EXIT=0 |
| 4 | expo 客户端类型检查 (AppBar/store) | `pnpm -C clients/expo run typecheck` | ✅ EXIT=0 |
| 5 | 全面管局硬门禁 | `pnpm check:governance` | ✅ 全绿通过 |

**回归测试覆盖的铃铛四态真行为**:
- **成功态**: GET 有 1 条未读 → 单条 PATCH 后 `read:true` 且 `unreadCount` 由 1 → 0 (**点开一个少一个**)。
- **幂等态**: 同一条重复 PATCH → dismissal 仅 1 行、`unreadCount` 不重复扣 (**重复点开不算**)。
- **清空态**: read-all 后全 `read:true` 且持久化 key 为 raw UUID (**长按清空且重启不复活**)。
- **持久化基底**: 断言 `inbox_dismissals.item_key`, 与 GET 查询口径对齐 (独立于进程内存 readSet)。

## 5. Pre-existing 发现 (非本波引入, 已基线复现)

`server/src/__tests__/openapi-routes.test.ts` 在**本次改动前后一致失败**, `missingInSpec` + `unknownRouteFiles`:

```
missingInSpec: [
  "GET /api/issues/{id}/documents/{key}/raw",              # 非 wave369
  "POST /api/companies/{companyId}/projects/{projectId}/stage/advance",  # 非 wave369
  "POST /api/notifications/read-all",                      # wave369-precision
  "PATCH /api/notifications/read-all",                     # wave369-precision
]
unknownRouteFiles: ["governance.ts"]                        # 5ef039ac3 ontology, 非 wave369
```

**证据**: `git stash` 移除本工单 `notifications.ts` 改动后重跑, 失败集完全一致 → 证明与本次改动无关, 系多波累积的 OpenAPI 契约漂移 (AGENTS.md §5.2)。门禁整体仍红, 局部补 wave369 两行不会转绿, 故**不在本测试工单内修**, 建议 PM 派「OpenAPI 契约同步」专项波。

## 6. 未执行项 (如实报告)

- **真机模拟器 (agent-device) 端到端撞机**: 未执行。本工单 scope 为服务端真行为 + 回归测试补齐, 按「validate narrowly」窄验证; 铃铛为原生 UI, 需 Mac 宿主机穿透 `emulator-5554` 才能覆盖视觉/长按手势层, 建议由设备波补 4 态截图。
- **全量 `pnpm test:run`**: 未执行 (串行全量成本高且非相关范围); 已就相关 3 个 suite 定向验证。

## 7. 遵守约束

- 单写者 ✅ · 无密文输出 ✅ · 无 mock 业务数据 (测试用真 PGlite 真实 SQL 断言) ✅ · 未越界 dirty 文件 ✅
- 交互按钮 2 汉字铁律 ✓ (长按弹窗: `取消` / `清空`) · 未新增任何功能入口 (复用既有 store `markAllRead`)。

## 8. 签字栏

| 角色 | 姓名 | 结论 / 日期 |
|---|---|---|
| FDSE (验证) | 门神 (Guardian) | `[2026-10-11 · 3 绿 + 1 真 BUG 修复 + 1 pre-existing 门禁红]` |
| PM (派单) | Hermes·Echo | `[wave369 测试工单]` |
