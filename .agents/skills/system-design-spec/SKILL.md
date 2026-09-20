---
name: system-design-spec
description: 把结构化需求(spec)→技术方案(architecture/data-flow/api/risks)。Use when requirements-capture 完成后, 匠人需要知道「在哪个文件加什么接口、改哪个 schema、风险在哪」时调用。也用于代码评审前自查架构一致性。
---

# System Design Spec

把 `docs-coolie/specs/<spec>.md`（需求侧）拆解为「技术方案」，匠人按这个开发。

## When to use

- requirements-capture 写完 spec 后, **下一步必走**
- 匠人拿到 spec 但有架构疑问时（PM 应该已经写好了）
- 重大改动的代码评审前（架构自检）
- 加新接口 / 新表 / 新跨模块依赖前

## Inputs

- `docs-coolie/specs/<spec>.md`（已有需求规格）
- `docs-coolie/PM-ROADMAP.md`（项目当前架构）
- `docs-coolie/security-audit-2026-09-20.md`（已知安全隐患）
- 相关 commit（`git log --oneline | grep <feature>`）

## Outputs

写到 `docs-coolie/specs/<spec>.md` 末尾,新加「## 7. 技术方案」一节（不要新文件）。包含：

```markdown
## 7. 技术方案

### 7.1 架构
- <数据流图 (ASCII 可)>
- <模块边界 + 依赖方向>
- <新模块 vs 复用现有>

### 7.2 数据模型
- <新表 / 新列 / 新索引 / 新外键>
- <已有表的影响 (要不要改 schema)>

### 7.3 API / 接口
- <新路由 / 新 action / 新 component prop>
- <请求 / 响应 schema>
- <错误码>

### 7.4 安全 / 权限
- <认证方式 (cookie / bearer / 公开)>
- <授权 (公司隔离 / agent 隔离 / 操作人审计)>
- <敏感数据 (密钥 / PII / 内部状态)>

### 7.5 性能 / 缓存
- <估算 QPS / 数据量 / 响应时延>
- <缓存策略 (Redis / 内存 / no)>

### 7.6 风险 / 回滚
- <已知风险>
- <回滚方式 (git revert / OTA 旧版)>

### 7.7 引用
- <相关 commit / 文件 / skill>
```

## Process

### Step 1: 读 spec 1-6 节

把需求翻译成「输入/输出/约束」三件套：
- **输入**：触发条件 / 用户动作 / 数据来源
- **输出**：UI 显示 / API 响应 / 数据库变更
- **约束**：性能 / 安全 / 不动项 / 验收标准

### Step 2: 架构决策

3 个问题决定架构：
1. **新模块 vs 复用现有？** —— 列出现有 candidate 模块（grep `index.ts` / `manifest.ts`）
2. **数据流：哪条路径？** —— client → server → plugin → hermes / postgres，画出来
3. **新模块的边界在哪？** —— 文件白名单 = 边界

### Step 3: 数据模型

- 新表：在 `packages/db/src/schema/` 加文件，migration 由 `pnpm db:generate` 生成
- 改已有表：列影响（哪个外键 / 哪个 index / 哪个 RLS）
- 已有 ontology 域可复用时，**优先用 ontology 域**（如「反馈」可以挂在 Feedback ontology 域下）

### Step 4: API 设计

- 路径：`/api/<resource>[/<id>]`
- 方法：GET (read) / POST (create) / PATCH (partial update) / DELETE
- 鉴权：复用 `assertAuthenticated` / `assertBoard` / `assertCompanyAccess`
- 错误：400/401/403/404/409/422/500（按现有约定）
- SSE 端点：参考 `board/chat/stream` 模式

### Step 5: 安全 / 权限

- 公司隔离：每个 entity 必须 `company_id`
- agent 隔离：agent key 不能跨公司
- audit log：mutate action 必写 activity log
- 敏感字段：密钥不进 DB / 不进前端 / 用引用名 + host secrets

### Step 6: 性能 / 缓存

- 大列表：用 FlashList + estimatedItemSize + React.memo
- N+1：用 Promise.all + 结果缓存
- 实时：用 SSE 或 polling，看场景
- 缓存失效：用户操作后 invalidate（不要缓存老数据）

### Step 7: 风险 / 回滚

- **回滚必填**：每个改动列如何回滚（git revert <hash> / 发 OTA 旧版）
- **breaking change**：列影响范围（如「改 schema 后所有 API 版本号要 +1」）

## Anti-patterns

- ❌ 复制粘贴既有架构不思考（"反正之前是这样"）
- ❌ 不画数据流就说"很简单"
- ❌ 不列风险就让匠人开干（匠人会乐观）
- ❌ 用「复用现有」不说复用哪个文件（匠人找不到）
- ❌ API 路径和现有命名不一致（混 kebab-case / camelCase）
- ❌ 错误码不按现有约定（有的 API 返回 400 有的返回 422）

## 与 requirements-capture 协同

| 顺序 | skill | 输出 |
|---|---|---|
| Step 1 | requirements-capture | docs-coolie/specs/X.md 第 1-6 节（需求）|
| Step 2 | system-design-spec | docs-coolie/specs/X.md 第 7 节（技术）|
| Step 3 | (PM 派单) | docs-coolie/briefs/Y.md 引用 spec |
| Step 4 | 匠人按 spec 干活 | commit + tsc |
| Step 5 | (PM 验收) | PM-RELEASE-CHECKLIST 24 项 |

## Reference

- requirements-capture — 上游 skill
- PM-RELEASE-CHECKLIST.md — 24 项 gate
- PM-FAILURE-CASES.md — 15 失败 + 修法
- ds-learn/2026-09-20-ontology-and-spec-driven.md — DS 设计哲学