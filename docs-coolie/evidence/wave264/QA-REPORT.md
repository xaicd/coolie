# wave264 — 修 migration 9018 SQL (`column i.kind does not exist`)

## 真因

`packages/db/src/migrations/9018_create_ontology_actions_view.sql` 在
`FROM "issues" i` 分支里引用了 `i."kind"`, 但 `issues` 表从来没有 `kind` 列.

waves 9013-9029 的 ontology 7 primitives 是 wave250 加的, 当时写 view 直接
套了 issue_recovery_actions.kind 的模式, 没核对 issues 表有没有同名列. 错
误一直保留到 wave262 之前, 那波 [release commit] 把 9018 一起带到了 prod,
coolie.service 启动跑 migration 时 Postgres 拒收, exit code 1, 10 次重启后
systemd 拒再启, 服务挂掉.

## 修复

- `i."kind"` → `i."spec_kind"` (issues 表实际只有 spec_kind, wave9008 加的,
  类型 `IssueSpecKind = 'requirement' | 'bugfix' | 'design' | 'task' | null`)
- 注释同步: 头部 doc comment 写明 kind 镜像 spec_kind, 可空
- `packages/db/src/schema/ontology_actions_view.ts` 加一行注释说明 props.kind
  来自 issues.spec_kind

不动其它字段, 不动 recovery 那个 `r."kind"` (issue_recovery_actions.kind 列
真实存在, 不需要改).

## 改动

```
 packages/db/src/migrations/9018_create_ontology_actions_view.sql |  6 ++++--
 packages/db/src/schema/ontology_actions_view.ts                  |  1 +
 2 files changed, 5 insertions(+), 2 deletions(-)
```

## 验证 (本地 ssh tunnel 到 prod postgres 直连)

```
issues has columns: [ 'wbs_type', 'spec_kind' ]
View exists before: 0
View created OK. Row count: 222
Sample rows: [
  { action_type: 'issue',   k: null, t: '构建: 一个演示项目：Coolie 工坊看板' },
  { action_type: 'issue',   k: null, t: 'wave139 解析真验 before 1790664333497 · 详细设计阶段' },
  { action_type: 'issue',   k: null, t: 'baby' },
  { action_type: 'issue',   k: null, t: 'Aaa' },
  { action_type: 'issue',   k: null, t: '你好啊。' },
  ... (共 202 个 issue 分支)
  { action_type: 'recovery', k: 'unblock' / 'stalled' / 'reroute', ... },
  ... (共 20 个 recovery 分支)
  (tool_action 分支 0 行, 表为空, 正常)
]
Dropped test view — coolie boot will recreate it.
```

全 3 源表 (issues / issue_recovery_actions / tool_action_deliveries) 都存
在. 全 10 列引用都解析. view 返回 222 行 (= 202 issues + 20 recovery + 0
tool_action_deliveries). 注意 `props.kind` 全为 null — prod 数据现状是
issues 表都没设 spec_kind (老 issue 没 spec 概念). 这是数据语义问题, 不
是 SQL 错, 不在本波修复范围.

测试 view 创建后立即 drop, 不污染 prod 数据库 (下次 coolie boot 会再创建).

## 4 护栏

| 护栏 | 结果 |
|------|------|
| Typecheck (`pnpm -r typecheck`) | ✅ all Done, 0 errors |
| Migration safety check | ✅ passed |
| SQL 直连 prod 跑过 | ✅ 222 rows returned |
| Stash 与并发协调 | ✅ 跟 coolie-3f wave266 stash/pop 协作干净, 6 snapshot json 还原 |

## 发版

- **不发 APK** (server 端纯 db migration 修)
- **不 bump version** (无 App / 无 API 改动)
- 改动 → push origin main → ssh tc-coolie-claw `systemctl restart coolie`
  → /api/health 200 ok + commit hash 显示

## 范围声明

- 改 9018 SQL: ✅
- 改 ontology_actions_view.ts 注释: ✅
- 不动 9019/9020/9021/9022 (没问题)
- 不动 server 业务代码 / 路由 / ui / app
- 不动已经过的 9014/9015/9016/9017
- 不动 ontology_properties / ontology_actions_view.ts 其它字段

## 跟 wave266 (coolie-3f) 协作

wave266 (login page 0.6.20 release) 在 release-app.sh step 1.5 卡了我留下
的 5 dirty files, 把整个 working tree stash 后再 release. 我跑 `pnpm
db:generate` 时 `prune:snapshots` 副作用误删了 6 个 snapshot json (0279-0283
+ 9000), wave266 stashed 它们, 我 git checkout HEAD 救回来了. 跟他们对话
确认我 commit 9018 SQL + schema TS 注释, 不碰他们 4 个文件 (toast.ts /
check-fork-surface.mjs / pnpm-lock.yaml / clients/expo 组件).