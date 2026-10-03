# PROD-LOG-REPORT — v0.6.22 生产端关系图谱 Validation Error 根因报告

**Wave**: wave284 · **Employee**: 兑底渊 (duidiyuan-pre-sre) · **Date**: 2026-10-03
**工具**: claude-mm (copilot 月度额度耗尽 fallback)
**性质**: 只读排查 — 未重启服务、未改服务器文件、未部署、未回滚
**Boss 输入**: 「你让运维看看服务器日志」(WeChat 2026-10-03 上午) + 截图 `img_b3e6483b27c5.jpg`(业务本体 440 实体 / 147 关系, 图谱黑屏 + Validation error + 重试)

---

## 1. 结论 (TL;DR)

**根因**: Expo 客户端 `@coolie/api-client` 的 `getOntologyGraph` 在 query string 里多带了一个 `companyId` 参数 (client.ts:1025, wave239 引入), 而服务端 `ontologyGraphQuerySchema` 是 `.strict()` 校验且不认识这个 key → Zod `unrecognized_keys` → 全局错误中间件返回 **HTTP 400 `{"error":"Validation error","details":[{"code":"unrecognized_keys","keys":["companyId"],...}]}`**。App 端把 `error.message` 显示在画布上 = 老板看到的「Validation error」+ 黑屏 + 重试。

**不是 v0.6.22 回归**: 生产 journald (保留期 9/18 起) 里该端点 **全历史 0 次 200**; 首条 400 出现在 **10月01 08:32:12** (v0.6.20/21 时期), 早于 v0.6.22 部署 (10月02 18:26)。v0.6.22 (wave282 本体Tab直连) 只是让图谱页第一次进入老板的常用路径, 把这个一直在的潜伏缺陷暴露出来了。

**为什么头部统计正常**: 截图里「440 实体 · 147 关系」来自 `/ontology/levels` (OntologyDomainListScreen.tsx:308 读 `levels.totalNodes/totalEdges`), 该路由**不解析 query schema**, 所以 200; 域列表走插件路由 (`/api/plugins/paperclipai.plugin-ontology/api/domains`), 也不经过这个 strict schema。只有 `/ontology/graph` 被 strict schema 卡死。

---

## 2. 生产环境现场 (只读采集)

| 项 | 值 |
|---|---|
| 主机 | `tc-coolie-claw` = `62.234.59.180` (VM-0-4-ubuntu), up 27 days, load 0.50 |
| 服务 | systemd `coolie.service`, `WorkingDirectory=/opt/coolie/server` |
| 进程 | `node node_modules/tsx/dist/cli.mjs src/index.ts` PID 2332345, **启动于 10月02 18:26:23** (v0.6.22 部署时刻; release commit `e06a144ea` 于 10月02 18:24:18 +0800 提交) |
| 监听 | `127.0.0.1:3100` (node), `:80/:443` (Caddy `/etc/caddy/Caddyfile`), `127.0.0.1:5432` (Postgres 16) |
| 附带进程 | plugin worker ×5 (workspace-diff / kubernetes / governance / multimodal / **ontology**) |
| 日志 | journald (`journalctl -u coolie`), 保留自 9月18 13:58 |

## 3. 日志证据 (关键行)

生产日志里 `/ontology/graph` 状态码全历史分布 (journalctl 9/18→今):

```
25  ontology/graph 400
14  ontology/graph 401   (未认证探测)
 6  ontology/graph 404   (路由存在前)
 0  ontology/graph 200   ← 从未成功过
```

今日 (10/03) 24 次 400, 集中在 11:23:06–11:24:31 (老板连点重试 ~20 次)、12:38、13:27。样例 (req id 359, 10月03 11:23:06):

```json
{"level":40,"req":{"id":359,"method":"GET",
  "url":"/api/companies/4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e/ontology/graph",
  "headers":{"host":"xrobinai.cn","user-agent":"okhttp/4.9.2",   ← Expo Android App
             "via":"2.0 Caddy","x-forwarded-for":"39.144.109.151"}},
 "routePath":"/companies/:companyId/ontology/graph",
 "res":{"statusCode":400,"headers":{"content-length":"144"}},    ← 见 §4 逐字节吻合
 "responseTime":7,"msg":"GET /api/companies/.../ontology/graph 400"}
```

所有 400 的 `content-length` 恒为 **144**, responseTime 4–28ms (纯校验失败, 未触达图谱服务层)。

## 4. 本地复现 (逐字节吻合)

在本机 v0.6.23 dev server (127.0.0.1:3100, 同一批代码, 该端点自 v0.6.22 起无改动) 上:

```bash
# 带 companyId (App 真实形状) → 400
curl "http://127.0.0.1:3100/api/companies/<cid>/ontology/graph?companyId=<cid>&depth=1&view=project_tree"
HTTP 400
{"error":"Validation error","details":[{"code":"unrecognized_keys","keys":["companyId"],"path":[],"message":"Unrecognized key: \"companyId\""}]}
#  ↑ 响应体 144 字节, 与生产日志 content-length=144 完全一致

# 去掉 companyId → 200
curl "http://127.0.0.1:3100/api/companies/<cid>/ontology/graph?depth=1&view=project_tree"
HTTP 200 {"root":null,"depth":1,"view":"project_tree","truncated":false,"nodes":[],"edges":[]}
```

## 5. 代码链路 (逐行定位)

1. `clients/api-client/src/client.ts:1025` — `getOntologyGraph()` 第一行
   `const q = new URLSearchParams({ companyId });` — **companyId 已在 path 里, 又塞进 query**。wave239 (commit `2a3038b53`, v0.6.10 时代) 引入, v0.6.22 上原样存在。
2. `packages/shared/src/validators/entity-relation.ts` — `ontologyGraphQuerySchema` 为
   `z.object({root_type?, root_id?, depth?, view?, relations?}).strict()` — **strict 拒绝未声明 key**。
3. `server/src/routes/ontology-graph.ts:40` — `ontologyGraphQuerySchema.parse(req.query)` 抛 ZodError。
4. `server/src/middleware/error-handler.ts` — ZodError → `400 {"error":"Validation error", details:[...]}`。
5. `clients/expo/src/screens/OntologyGraphWorkbenchScreen.tsx:114` — `setError(String(e.message))` → 画布上渲染「Validation error」+ `ErrorRetry` 重试按钮 → 老板截图。

同类隐患 (同一 wart, 当前未爆发):
- `client.ts:956` `listOntologyDomains`、`client.ts:1044` `getOntologyLevels` 同样 query 带 companyId — 因对应路由不解析 strict schema 才侥幸 200。
- `OntologyInstanceGraphScreen.tsx:127` (L3→L4 实例拓扑环) 也调 `getOntologyGraph`, 失败被 `catch { setGraph(null) }` 吞掉 — 表现为「装饰图永远空白」, 同根因。

## 6. 给铁匠 (Core SWE) 的修复输入

建议双修 (旧包自愈 + 客户端治本):

- **服务端 (自愈存量装机, 需发版)**: `ontologyGraphQuerySchema` 增加显式容忍字段
  `companyId: z.string().uuid().optional()` (或 route 侧 parse 前剥离), 旧 APK/OTA 未更的客户端立即恢复。
- **客户端 (治本, JS-only 可走 OTA, 不需新 APK)**: `client.ts:1025` 改为
  `const q = new URLSearchParams();` — companyId 已在 path。顺手清理 :956 / :1044 两处同 wart。
- **防退化**: 加一条契约测试 — 用真实 `CoolieClient.getOntologyGraph` 打到 supertest 起的 express app, 断言 200 (现有 route 测试都是手拼 query, 绕过了 api-client, 所以从来没测出这个)。

## 7. 补丁验证方案 (patch verification plan)

1. **单测/契约**: 上述契约测试红→绿; `ontology-extras-routes.test.ts` 补「带多余 companyId 仍 200」用例 (服务端修复)。
2. **本地真复现**: 按 §4 两条 curl 跑通 (带 companyId = 200, body 含 `nodes`/`edges`)。
3. **App 侧真机**: 安装含修复的 OTA/包 → 业务本体 → 关系图谱: 画布出图、无 Validation error、重试按钮消失; L3 实例页 1-hop 环出现。
4. **生产端验收 (发版后只读检查)**:
   `journalctl -u coolie --since "<发版时刻>" | grep ontology/graph | grep -c " 200"` > 0,
   且新增 400 = 0; Caddy 侧 4xx 比率回落。
5. **回滚预案**: 服务端修复为纯 schema 放宽 (向后兼容), 异常时 `systemctl restart coolie` 回前一版本即可, 无数据迁移。

## 8. 验证命令留痕 (全部只读)

```
ssh tc-coolie-claw 'hostname; uptime; date -u'
ssh tc-coolie-claw 'pgrep -af "node|tsx|coolie"; pm2 ls; netstat -tlnp'      # 用 netstat, 未用卡死的 ss
ssh tc-coolie-claw 'cat /opt/coolie/version.json; ps -o pid,lstart,cmd -p 2332345; ls /etc/systemd/system | grep coolie; pgrep -af caddy'
ssh tc-coolie-claw 'journalctl -u coolie --since "2026-10-03 00:00:00" | grep ontology/graph | tail -25'
ssh tc-coolie-claw 'journalctl -u coolie | grep -aoE "ontology/graph [0-9]{3}" | sort | uniq -c'
curl 本机 :3100 两连发 (§4)
```

未重跑 Hermes 卡死过的 `systemctl list-units` / `docker ps` / `ss`; 未触碰 v0.6.22 tag 与 `e06a144ea`。

## 9. 给老板的 3 行汇报 (≤200 字)

> 查完了: 关系图谱黑屏不是服务器挂了, 是 App 请求多带了个 companyId 参数, 被服务端严格校验拒了, 一直 400。
> 日志证明这毛病 10月1日 就有, 不是 v0.6.22 弄坏的, 只是这版把图谱入口做明显了才被看见。
> 修法一句话: 服务端放过这个参数 + 客户端别再传, 走 OTA 即可, 已写好验证方案交铁匠。
