# PROD-FIX-REPORT — wave284 关系图谱 400 修复实施与投产报告

**Wave**: wave284 · **Employee**: 兑底渊 (duidiyuan-pre-sre) · **Date**: 2026-10-03
**工具**: claude-mm (copilot 额度尽, 08:19:45 copilot 派单 exit 非零 → 08:19:46 fallback claude-mm, 本轮)
**上游输入**: `PROD-LOG-REPORT.md` §6 修法 + §7 验证方案 (同 wave 上一轮只读排查)
**Commit**: `8a2d045b0` (main, 3 files / +49 −1)

---

## 1. 结论 (TL;DR)

按 PROD-LOG-REPORT §6 双修落地并已投产: **服务端 schema 放过 query 里的 `companyId` (生产 16:32:11 CST 重启生效, 存量 APK 立即自愈), 客户端 `getOntologyGraph` 去掉多余 query 参数 (随下次 OTA 生效)**。生产端契约验证: 旧 App 请求形状 (query 带 `companyId`) 由 400 → **200**, 返回 165 节点 / 147 边 (与老板截图头部「147 关系」一致)。老板现在打开「业务本体 > 关系图谱」即可看到图, 无需等 OTA。

## 2. 代码修复 (commit 8a2d045b0)

| 文件 | 改动 | 作用 |
|---|---|---|
| `packages/shared/src/validators/entity-relation.ts` | `ontologyGraphQuerySchema` 显式容忍 `companyId: z.string().uuid().optional()` | 服务端自愈存量装机; 公司边界仍由 path 参数 + `assertCompanyAccess` 把守, 该字段只收不用 |
| `clients/api-client/src/client.ts` | `getOntologyGraph` 不再把 `companyId` 塞进 query | 客户端治本 (wave239 引入的 wart); JS-only, 随下次 OTA 生效 |
| `server/src/__tests__/ontology-graph-routes.test.ts` | +2 契约用例 | 防退化 (见 §3) |

**对上一轮报告 §6 的一处修正**: 上轮建议「顺手清理 :956 `listOntologyDomains` 同 wart」**不可执行** —
`packages/plugins/plugin-ontology/src/manifest.ts` 所有路由声明 `companyResolution: { from: "query", key: "companyId" }`,
插件 worker 正是靠 query 里的 `companyId` 解析公司, 删了会弄坏域列表。`:1044 getOntologyLevels` (query 参数服务端路由完全不读) 无害,
本轮不动 (最小 diff)。客户端只改 `getOntologyGraph` 一处。

## 3. 本地验证 (红 → 绿)

- `server/src/__tests__/ontology-graph-routes.test.ts` **10/10 passed** (含 2 个新 wave284 用例):
  - `wave284: tolerates an extra companyId query param (legacy App shape)` — 手拼旧形状 (query 带 companyId) 断言 200;
    用 sed 临时关掉 schema 修复复跑 → **该用例红** (证明测试真能抓住此 bug), 恢复后绿。
  - `wave284: the real @coolie/api-client getOntologyGraph round-trips 200` — 真实 `CoolieClient` 走真 HTTP
    (`app.listen(0)`) 打真路由。契约语义: **服务端永远容忍旧形状** (第一条用例钉死) + **客户端只发 schema 认识的参数**
    (本条用例钉死 — 以后有人给 client 加 schema 外参数会当场红)。
- `pnpm --filter @paperclipai/shared typecheck` ✅ / `pnpm --filter @coolie/api-client typecheck` ✅
- `OntologyGraphQuery` 类型全仓库无外部消费方 (仅 shared 内导出), 类型面无破坏。

## 4. 生产部署时间线 (tc-coolie-claw / xrobinai.cn)

| 时刻 (CST) | 动作 |
|---|---|
| 部署前 | `md5sum` 核对: prod `entity-relation.ts` = 本地 HEAD~1 (修复前) **逐字节一致** → 单文件部署即纯 +7 行增量, 无漂移 |
| 16:3x | 备份回滚件 → `/tmp/wave284-rollback-entity-relation.ts` (md5 `522bfb75…`, = 修复前) |
| 16:3x | `scp` 单文件 `packages/shared/src/validators/entity-relation.ts` → `/opt/coolie/...` (md5 `c5a7966e…` = 修复后); 核对 `server/node_modules/@paperclipai/shared` symlink → `/opt/coolie/packages/shared` ✅ |
| **16:32:11** | `sudo systemctl restart coolie`; 健康轮询 ~3s 后 `/api/health` **200**; journal `-p err` **无条目** |
| 16:32:46 | 契约验证 (prod 本机, key 自 `/etc/coolie/secrets.env` root sourcing, 全程不回显): |

```
legacy-shape(query 带 companyId, 旧 App 真实形状): 200   ← 修复前 400 (content-length 恒 144)
clean-shape(query 不带 companyId):                200
legacy body: nodes=165 edges=147 truncated=false view=project_tree   ← 147 边 = 老板截图「147 关系」
journal res: statusCode 200, content-length 87587, responseTime 15-22ms
```

重启后 okhttp (老板 App) 尚未再打该端点 (16:30 后计数 0) — 老板下次打开图谱页即为 200, 无需任何客户端操作。

## 5. 回滚预案 (未触发)

`ssh tc-coolie-claw 'sudo cp /tmp/wave284-rollback-entity-relation.ts /opt/coolie/packages/shared/src/validators/entity-relation.ts && sudo systemctl restart coolie'`
纯 schema 放宽, 向后兼容, 无数据迁移; 新 client (去参) 对旧 schema 同样 200, 客户端先发 OTA 也安全。

## 6. 版本与 OTA 说明

- **不发版、不 bump 版本号** (AGENTS.md §12 规范第 3 条): 本修复服务端侧即刻生效, 无需 APK/OTA 即恢复老板使用。
- 客户端去参属清理性质, **随下次正常发版的 OTA 自然带上**, 不单独触发发版流程。

## 7. 治理留痕

- 派单 receipt: `20261003T081946Z-wave284-duidiyuan-pre-sre.json` → `done` (commit/verification/evidence 已回写)
- context-bus: `.coolie-local/context-bus/wave284.json` 追加 step 3 (兑底渊, 修复实施+投产)
- 证据账本: `.coolie-local/evidence-ledger/wave284b.json` (hotfix 模板 G3-G5; 注: `wave284.json` 已被 10-02「复原业务本体图谱并正名底栏」任务占用, 故用 wave284b 区分)

## 8. 给老板的 3 行汇报 (≤200 字, 由 Hermes 转发)

> 修好了: 服务端已放过那个多余参数, 您现在直接打开「业务本体 > 关系图谱」就能看到图, 不用更新 App。
> 生产验证过: 之前一直报错的请求现在返回 200, 147 条关系和您截图里的数字对得上。
> 客户端侧的治本改动已进代码库, 随下次发版自然带上; 出问题可秒级回滚, 已留好回滚件。
