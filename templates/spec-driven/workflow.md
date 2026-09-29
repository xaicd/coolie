# spec-driven 开发流程（3 步）

> 项目治理走 CMMI（G1–G5，`cmmi-*` skills）——**那是 boss/PM 层**。
> 每次实际代码改动走这套轻量 spec 链——**这是开发落地层**。两条路并存，互不替代。

```
requirement / bugfix        design                  task
   「要做什么」      →      「怎么改」       →     「改哪几行」
   1~3 句 + 验收条件       方案 / 权衡 / 接口       文件列表 / 步骤
        │                       │                      │
        │  parentSpecId ────────┘  parentSpecId ────────┘
        ▼                       ▼                      ▼
   一条 issue 上挂一个 spec；链 = issue 的 parent 关系，落在 /issues/:id/spec
```

## 三步

1. **requirement / bugfix** —— 描述要做什么（或哪里不对）。
   - requirement：1~3 句子 + 验收条件（EARS：`WHEN … THEN … SHALL …`）。
   - bugfix：复现步骤 + 预期 + 实际。
   - 模板：`templates/spec-driven/requirement.md` / `bugfix.md`。
2. **design** —— 怎么改。方案 + 权衡 + API surface。模板：`design.md`。
3. **task** —— 列具体改动点（1~N 条），派给 core-swe。模板：`task.md`。

## 什么时候可以省略

- 一行改完的 typo / 文案：直接开 task，跳过 requirement 与 design。
- 纯 bug 且根因明确：requirement → task 两步即可。
- 其余情况**别跳 design**：设计缺失正是「技术不报错但业务走不通」的来源。

## 落库与查看

- 写入：`POST /api/issues/:id/spec`（body 即 spec；`?draft=1` 存草稿）。
- 读取：`GET /api/issues/:id/spec`。
- 整棵树：`GET /api/companies/:companyId/specs/tree`。
- 一键起：`POST /api/companies/:companyId/specs/from-template`。
- 网页端：issue 的 **Spec** 页（`/issues/:id/spec`）；App 端在新建任务里选 spec 类型。
- MCP：`spec_create` / `spec_tree` / `spec_template_apply`。

## 与 Kiro / 现有 skill 的关系

本仓库已有 `.agents/skills/requirements-capture`（Kiro 风格、产出
`docs-coolie/specs/YYYY-MM-DD-*.md`）与 `system-design-spec`。
本条 spec 链是它的**在线、可查询、可派单**形态：同样三步，落在 issue 上而非 markdown 文件。
需要长期留档的设计另写 `docs-coolie/specs/`；需要派单执行的走 issue spec。
