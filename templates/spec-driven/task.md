# 任务模板（task）

> spec 链第三步。从一条 design 派生，落到「具体改哪几行」。派给 core-swe 执行。
> 机器骨架见 `specTemplateSkeleton("task")`。

## 字段

| 字段 | 机器键 | 说明 |
|---|---|---|
| 标题 | (issue.title) | 一个可独立提交的改动点 |
| 文件列表 | `task.files[]` | 白名单：要改哪些文件 |
| 步骤 | `task.steps[]` | 1、2、3…，按顺序可执行 |
| 完成定义 | — | 怎么算做完（跑哪个 gate / 看哪个结果） |

## 示例

```markdown
（父设计: 复用 chat/stream 状态渲染回执）

标题: 气泡按响应状态渲染回执

文件列表:
- ui/src/pages/BoardChat.tsx
- ui/src/components/SendReceipt.tsx (新增)

步骤:
1. 抽出发送状态机 idle|sending|sent|failed
2. 新增 SendReceipt 组件（sent/failed 两态）
3. 发送按钮在 sending 期间置灰

完成定义: pnpm --filter @paperclipai/ui typecheck 0 error；Playwright 截图两态。
```

## 纪律

- 一条 task = 一次提交。改完即 commit（不 push，除非老板放行）。
- 文件列表就是白名单：超出白名单的改动另开一条 task。
