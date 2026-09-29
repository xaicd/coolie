# 设计模板（design）

> spec 链第二步。从一条 requirement/bugfix 派生，回答「怎么改」。
> 机器骨架见 `specTemplateSkeleton("design")`。

## 字段

| 字段 | 机器键 | 说明 |
|---|---|---|
| 设计方案 | `design.approach` | 怎么做：接口 / 数据 / 边界 |
| 权衡 | `design.tradeoffs[]` | 每条一行，写下「为什么没选另一条路」 |
| API surface | `design.apiSurface` | 接口签名 / 数据结构 / 迁移（可留空） |

## 示例

```markdown
（父需求: 看板助手显示发送回执）

设计方案: 复用现有 POST /api/board/chat/stream 的响应；前端按 HTTP 状态渲染回执文案，
不动服务端协议。

权衡:
- 不新增「已发送」事件 —— 会让服务端与前端各存一份状态，易漂移。
- 不做乐观 UI —— 与「信号可见」的诉求冲突（要的是真实回执，不是假绿）。

API surface: 无（复用现有端点）。
```

## 下一步

派生 1~N 条 **task**（`parentSpecId` = 本 design 的 issue id），每条一个可独立提交的改动点。
