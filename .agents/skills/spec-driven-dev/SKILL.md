---
name: spec-driven-dev
description: 员工每次代码改动的 3 步 spec 流程（requirement/bugfix → design → task）。Use when 领到一条开发任务、写新功能前、修 bug 前、要把一句话变成可派单的改动点。产物落在 issue 的 spec 字段，可查询/可派单。
---

# spec-driven 开发（数字员工落地层）

CMMI（G1–G5）是**项目治理层**——boss/PM 用，重，管阶段门与交付物。
**每次实际代码改动**走这套 3 步 spec 链——轻，管「做什么 / 怎么改 / 改哪几行」。
两者并存：CMMI 定项目怎么走，spec 定这一次改动怎么做。

## 三步

1. **requirement 或 bugfix** —— 描述要做什么 / 哪里不对。
   - requirement：1~3 句话 + 验收条件（EARS：`WHEN … THEN … SHALL …`）。
   - bugfix：复现步骤 + 预期 + 实际。
2. **design** —— 怎么改：方案 + 权衡 + API surface。**别跳**（除非一行改完）。
3. **task** —— 具体改动点（1~N 条），每条一个可独立提交的白名单。

模板：`templates/spec-driven/{requirement,bugfix,design,task,workflow}.md`。

## 怎么落

- 写入一条 spec：`POST /api/issues/:id/spec`（body 就是 spec 对象）。
  草稿可以 `?draft=1`，字段可缺。
- 一键起：`POST /api/companies/:companyId/specs/from-template`，`{kind, parentIssueId?, title?}`。
- 读回：`GET /api/issues/:id/spec`；整棵树：`GET /api/companies/:companyId/specs/tree`。
- 网页端：issue 的 **Spec** 页；MCP：`spec_create` / `spec_tree` / `spec_template_apply`。

链靠 `parentSpecId`（父 spec 所在 **issue 的 id**）：task → design → requirement/bugfix。

## 三条纪律

1. 一条 task = 一次提交。改完即 commit（不 push，除非老板放行）。
2. 文件列表是白名单：超出即另开一条 task，别顺手改别的。
3. spec 要能被读回。写完 `GET` 一次确认落库，别只信写响应。

## ⚠️ 交付路径提醒（重要）

`.agents/skills/**` 被本仓库归类为 **maintainer-only**，**不进入运行时投递**——
放这里的指引不会自动到达员工 agent。要让员工真正读到，需落在投递路径上：

- 看板对话每次请求读 `skills/paperclip-board/SKILL.md`（改这里**即时**生效）。
- 仓库 `skills/` 目录由服务端解析进 adapter config，写到 `~/.hermes/skills`。
- 面向 PM/操作者的玩法说明放在 `docs-coolie/playbooks/spec-driven-dev.md`。

本 skill 是**给人看的权威定义**；要让它对 agent 生效，把要点同步进上面前两条路径。
