# spec-driven 开发 — 操作手册（Coolie 工坊）

> 项目治理走 **CMMI**（G1–G5，`cmmi-*` skills，`docs/cmmi/`）——重，管阶段门与交付物。
> 每次代码改动走 **spec 链**——轻，管「做什么 / 怎么改 / 改哪几行」。两条路并存。

## 三步

| 步 | 类型 | 回答 | 字段 |
|---|---|---|---|
| 1 | `requirement` / `bugfix` | 要做什么 / 哪里不对 | body+验收条件 / 复现+预期+实际 |
| 2 | `design` | 怎么改 | 方案 + 权衡 + API surface |
| 3 | `task` | 改哪几行 | 文件列表 + 步骤 |

链靠 `parentSpecId`（父 spec 所在 **task 的 id**）：task → design → requirement/bugfix。

## 界面入口

- 网页端：任务页 `/issues/:id/spec`（编辑器）；公司级 `/specs`（规格树）。
- 新建任务对话框：右下「Spec」胶囊选类型，建单即带该类型骨架。
- App 端：新建任务弹窗「Spec 类型」一栏，同上。

## API

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/issues/:id/spec` | 读一条 spec |
| POST | `/api/issues/:id/spec` | 写 spec（严格；`?draft=1` 存草稿） |
| GET | `/api/companies/:cid/specs/tree` | 整棵 spec 树（可 `?projectId=`） |
| POST | `/api/companies/:cid/specs/from-template` | 从模板一键起一条 spec |

MCP 工具：`spec_create` / `spec_tree` / `spec_template_apply`。

## 模板

`templates/spec-driven/{requirement,bugfix,design,task,workflow}.md`。
机器骨架（写进 issue 的）在 `packages/shared/src/spec-templates.ts`，两者字段一一对应。

## 与 Kiro 的关系

`.agents/skills/requirements-capture`（Kiro 风格）产出 `docs-coolie/specs/*.md` 用于**长期留档**；
本 spec 链是它的**在线、可查询、可派单**形态，落在 issue 上。二者可并用：需要留档的另写 spec 文件。

## 派单话术（PM）

> 「按 spec 链派活：先落一条 requirement（要做什么 + 验收条件 + 边界），
> 员工补 design（方案 / 权衡 / API），你再拆 task 派 core-swe。完成定义写清跑哪个 gate。」

## 纪律

- 一条 task = 一次提交；文件列表是白名单。
- spec 写完 `GET` 读回确认落库。
- spec 是开发层，**不要**拿它替代 CMMI 阶段门。
