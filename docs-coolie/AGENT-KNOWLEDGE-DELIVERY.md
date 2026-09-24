# Agent 知识投递 (AGENT-KNOWLEDGE-DELIVERY)

日期:2026-09-22。起因:一个问题 ——「更新的内容、记忆,如何同步给 Hermes?」

**一句话结论:没有自动同步这回事。** 仓库文档不会"流"到 agent;能被真正送到的只有三样东西,
其余全靠 CLI 自己在工作目录里读(约定,不保证)。

## 1. 三条真实通道

**① 运行时技能(唯一成体系的同步)** —— 仓库 `skills/` 目录

```
server 解析 desired skills → 写 adapterConfig.paperclipRuntimeSkills → adapter 落到 agent 的 skills home
```

Hermes 的落点是 `~/.hermes/skills`(`packages/adapters/hermes/src/server/skills.ts:134` 定义
`hermesSkillsHome`,:143 扫描它)。运维技能 `skills/paperclip/SKILL.md` 也走这条路。

**② board chat 的 system prompt** —— `server/src/routes/board-chat.ts:109-122`

```js
function loadBoardSkill(): string {
  const skillPath = path.resolve(here, "../../../skills/paperclip-board/SKILL.md");
  // 读文件 → 剥掉 YAML frontmatter → 缓存 → 作为 system prompt
}
```

**这是全仓唯一一处"运行时读仓库文件、注入模型 prompt"的地方。** 想改 Hermes 在板级对话里的
行为,改 `skills/paperclip-board/SKILL.md`(21 KB)即时生效;读不到会回退到一句通用 prompt。

**③ instructions bundle(不是仓库根 AGENTS.md)** —— `server/src/services/agent-instructions.ts`

入口文件名默认就叫 `AGENTS.md`(`:6` `ENTRY_FILE_DEFAULT`),但读的是
`companies/<companyId>/agents/<agentId>/instructions` 下的 bundle,路径写进
`adapterConfig.instructionsFilePath`(`:10` `FILE_KEY`)。Hermes adapter 读到它并**前置**到 prompt。
这是**每 agent 一份**的可控注入点。

## 2. 没有的东西(别指望)

- **没有 memory 服务。** `doc/plans/2026-03-17-memory-service-surface-api.md` 只是计划;
  `packages/db/src/schema/` 里**没有任何 memory 表**。`memory.citation.referenced` 和
  `paperclip.memory.citation.v1` 只是 runner 协议的事件名/schema id(`server/src/redaction.ts:85,239`),
  不是存储。
- **没有任何代码读 `docs-coolie/**` 或 `doc/plans/**` 喂给 agent。** 全仓检索只命中 markdown 本身。
- **没有知识导出/发布步骤。** `scripts/deploy-coolie.sh` 是 rsync 部署代码,不是知识投递。

## 3. 反直觉的一条:`.agents/skills/` 到不了 agent

`packages/adapter-utils/src/server-utils.ts:361-363`:

```js
function isMaintainerOnlySkillTarget(candidate: string): boolean {
  return normalizePathSlashes(candidate).includes("/.agents/skills/");
}
```

含 `/.agents/skills/` 的路径被判为 **maintainer-only**,不进运行时投递集。

也就是说:我们的 skill 库放在 `.agents/skills/`(仓库里 44+ 个 `SKILL.md`),
**运行时是拿不到的** —— 它只作为 company-skills 的项目导入根
(`server/src/services/company-skills.ts`、`ui/src/pages/skills/ImportSkillsFromProjectDialog.tsx`)。
要真送到,得放仓库 `skills/`。

## 4. 仓库文档为什么"看起来能到"

因为 agent 的 CLI 在**工作目录**里自己读。Hermes adapter 把子进程 cwd 设为
`config.cwd || ctx.config?.workspaceDir || "."`(`packages/adapters/hermes/src/server/execute.ts:520-521`),
而工作目录是项目 checkout。这件事 Paperclip 从不干预,codex-local 里那句话说得最清楚
(`packages/adapters/codex-local/src/server/execute.ts:1110-1111`):

> Codex exec automatically applies repo-scoped AGENTS.md instructions from the current workspace;
> Paperclip does not currently suppress that discovery.

**这是约定,不是机制。** 依赖它就意味着"能不能读到"取决于该 agent 的 CLI 行为,不取决于我们。

## 5. 要把一份新知识送到 agent,按可靠性排

1. 改 `skills/paperclip-board/SKILL.md` —— 板级 system prompt,**立即生效**
2. 放进仓库 `skills/` —— 会挂到 `~/.hermes/skills`;**不是** `.agents/skills/`
3. 写进该 agent 的 instructions bundle —— 最可控,可做到 per-agent
4. 留在 `docs-coolie/` 或 `doc/plans/` 等它自己读 —— 约定,不保证

> 反面提醒:把新 spec 写进 `docs-coolie/specs/` **不会**自动到 Hermes。要它读到,走 1-3 之一。
