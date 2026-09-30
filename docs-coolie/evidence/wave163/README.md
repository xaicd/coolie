# wave163: OntologyGraphView 节点全真名 — 证据

日期: 2026-09-30
范围: brief "OntologyGraphView 节点显示 UUID 而非真名"
目标版本: 0.6.4

## 1. 范围

只改 2 文件:
- `server/src/services/ontology-graph.ts` — hydrate 路径不再 `id.slice(0, 8)`
- `ui/src/components/OntologyGraphView.tsx` — 标签渲染不再 truncate(16)

注: brief 写 `clients/expo/src/components/OntologyGraphView.tsx`, 实际组件在
`ui/src/components/OntologyGraphView.tsx`(无 expo 副本), 按真实路径修改。

## 2. 修改前后

### 2.1 server `hydrate` (5 类 + comment + 兜底)

| 类型   | 改前                                                   | 改后                                  |
|--------|--------------------------------------------------------|---------------------------------------|
| agent  | `row.name` (wave155 已加)                              | 不变                                   |
| issue  | `row.identifier ? \`${id} ${title}\` : row.title`      | 不变                                   |
| project| `row.name`                                             | 不变                                   |
| conversation | `row.title`                                       | 不变                                   |
| attachment | `row.filename ?? \`Attachment ${id.slice(0, 8)}\`` | `row.filename ?? "未命名附件"`         |
| comment | `snippet || "Comment"`                                | `snippet || "评论"`                    |
| 兜底   | `${ref.type} ${ref.id.slice(0, 8)}`                    | `PLACEHOLDER_LABEL[ref.type]`(每类中文) |

5 类目标 (agent/issue/project/conversation/attachment) 已全用真名。
attachment 旧 fallback 会把 `id.slice(0,8)`(UUID 前缀) 渲染为 label, 改后
用中文占位 "未命名附件"。

### 2.2 UI 渲染

旧: `{truncate(node.label, 16)}` —— 16 字符截断中文名时容易丢字。
新: `{displayLabel(node.label)}` —— `truncate(value, 28)`, 给 "ONB-15 架
构/设计收口里程碑" 这类典型真名完整呈现空间。

## 3. 实证 (live 127.0.0.1:3100)

### 3.1 项目图谱 (project / issue / agent 真名)
`project-tree-sample.json` (project=a10daa9d-…f485):

```
project   wave129-repro-norepo
issue     ONB-31 wave139 smoke probe
agent     core-swe-agent
```

### 3.2 大项目全图 (25 节点)
`full-project.json` (project=509405bc-…97df):

```
project   产融智能体应用系统集成服务项目 1790652625
issue     ONB-15 架构/设计收口里程碑
issue     ONB-3 产融智能体应用系统集成服务项目 1790652625 · 需求确认阶段
issue     ONB-4 智能体应用平台标准功能
issue     ONB-5 系统配置
... (21 issues)
```

没有 UUID 切片。

### 3.3 已删除对象兜底 (placeholder)
`placeholder-deleted-project.json` (root_id=99…999, 不存在的 uuid):

```
project   已删除的项目
```

旧实现会显示 `project 99999999`, 现在显示类型化中文标签。

## 4. 验证

### 4.1 单测
```
pnpm --filter @paperclipai/server exec vitest run src/__tests__/ontology-graph-routes.test.ts src/__tests__/ontology-spec.test.ts src/__tests__/ontology-backfill.test.ts
→ Test Files  2 passed (2)
  Tests  17 passed (17)
```

注: 包含 wave156 的 backfill 加 logActivity 的回归 (5/5 wave154/155 测试全通)。

### 4.2 typecheck
- server: `pnpm exec tsc --noEmit` → 0 errors
- ui: `pnpm exec tsc --noEmit` → 0 errors

## 5. 不在本波

- expo 端本体域快照画布 (`clients/expo/src/screens/OntologyDomainListScreen.tsx`):
  使用 paperclipai.plugin-ontology 端点, 不在 entity_relations graph 路径上。
- OntologyGraphPage / ProjectDetail / IssueLinkedEntities: 不需改, 已用
  `OntologyGraphView` 间接获得新标签。