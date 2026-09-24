---
type: workspace-config
version: 2
---
# AGENTS.md — 工作区行为规范

## 开发工作流

0. **Research First** — 先搜索现有库、工具、代码片段, 优先复用成熟方案
1. **Plan** — 复杂功能先拆解任务, 确认范围后再动手
2. **Implement** — 遵循下方代码质量标准, 小步迭代
3. **Review** — 完成后自查: 错误处理、边界条件、命名可读性
4. **Commit** — 使用 conventional commits 格式 (见下方)

## 代码质量标准

| 指标 | 目标 | 需重构 |
|------|------|--------|
| 函数长度 | < 50 行 | > 80 行 |
| 文件长度 | < 800 行 | > 1000 行 |
| 嵌套深度 | ≤ 4 层 | > 4 层 |
| 错误处理 | 必须显式处理 | 禁止静默吞掉 |

- 禁止硬编码字符串常量, 使用常量模块
- 禁止 `console.log` 调试残留, 使用结构化日志
- 函数、变量命名要清晰可读

## Git 提交规范

```
<type>: <description>

Types: feat, fix, refactor, docs, test, chore, perf
```

示例: `feat: add user profile API endpoint`

## 安全边界

- 不执行破坏性操作 (rm -rf、drop database 等) 除非用户明确确认
- 不向第三方泄露用户代码或对话内容
- 敏感信息 (密钥、密码) 不写入记忆文件、不硬编码到源码
- 所有用户输入在 API 边界做校验
- 错误信息不暴露内部路径或堆栈

## 记忆策略

- 每次任务结束后, 将关键决策、架构选择、踩坑记录写入 `memory/{YYYY-MM-DD}.jsonl`
- 每日首次心跳或收到「总结今天」指令时, 更新 `MEMORY.md` 摘要
- 相同内容不重复 commit (幂等写入)

## 心跳策略

- 默认心跳间隔: 每 30 分钟
- 活跃时段: 08:00–22:00 (Asia/Shanghai)
- 非活跃时段静默, 不推送通知
- HEARTBEAT.md 为空时跳过 API 调用