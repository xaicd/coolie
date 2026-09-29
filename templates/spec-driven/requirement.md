# 需求模板（requirement）

> spec 链第一步。一条 requirement 就是「要做什么」——1~3 句话，加可判定的验收条件。
> 机器骨架见 `packages/shared/src/spec-templates.ts::specTemplateSkeleton("requirement")`；
> 本文件是给人读的版本，字段一一对应。

## 字段

| 字段 | 机器键 | 说明 |
|---|---|---|
| 标题 | (issue.title) | 一句话概括，进 issue 标题 |
| 背景 | — | 为什么做：老板原话 / 触发来源 / 关联 issue |
| 要做什么 | `requirement.body` | 1~3 句，明确到「文件范围」能列出来 |
| 验收条件 | `requirement.acceptanceCriteria[]` | 每条可判定；EARS 风格优先 |
| 边界（不做） | — | 明确排除，防止范围蔓延 |

## 示例

```markdown
标题: 看板助手显示发送回执

背景: 老板 09-29 反馈「发完消息看不到有没有发出去」。

要做什么: 工坊对话气泡在服务端确认收到后，显示一个「已发送」回执；失败显示「重试」。

验收条件:
- WHEN 用户发送消息且服务端返回 200, THEN 气泡 SHALL 显示「已发送」。
- WHEN 服务端返回 5xx, THEN 气泡 SHALL 显示「重试」并保留输入。
- WHILE 等待响应期间, 发送按钮 SHALL 置灰。

边界（不做）: 已读回执、多端同步、消息撤回。
```

## 下一步

写完后派生一条 **design**（`parentSpecId` = 本 requirement 的 issue id），再派生 **task**。
流程见 `workflow.md`，skill 见 `.agents/skills/spec-driven-dev/SKILL.md`。
