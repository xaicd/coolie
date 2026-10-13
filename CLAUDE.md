# Claude Code 指南 — Coolie 交付工厂

> **进场第一秒必看**: 数字员工进场请先读 [MEMORY.md](MEMORY.md) (8KB 项目记忆中枢、当前 Sprint 状态与客户口语意图路由表)。

---

## 0. 进场必知 (5 秒掌握)

- **项目全景与口语路由**: [MEMORY.md](MEMORY.md)
- **当前 Sprint 决策账本**: [docs/CURRENT-SPRINT.md](docs/CURRENT-SPRINT.md)
- **全量96技能口语索引**: [docs/skills-spoken-index.md](docs/skills-spoken-index.md)
- **平台公理与工程宪法**: [AGENTS.md](AGENTS.md)
- **客户口语意图路由器**: [docs/intent-router.md](docs/intent-router.md)

## 1. 核心开发与验证命令

```bash
# 1. 增量类型检查 (必须 0 报错通过)
pnpm -r typecheck

# 2. 运行单测与集成测试
pnpm test

# 3. 本地启动服务 (默认端口 3100)
pnpm dev

# 4. 生产部署 (一键执行 7 步部署铁律)
bash scripts/deploy-tc-coolie-claw-server.sh

# 5. 版本一致性核验 (发布前必跑)
bash scripts/VERSION-CONSISTENCY-CHECK.sh
```

## 2. 核心红线

1. **拒绝重复造轮子**：工坊自身建设 100% 依托 Paperclip 原生项目管理 (Projects / Issues / Plan 文档)；
2. **Commit 前必写原话**：代码提交前必须先登记 `docs/sprint-prod/MM/DD.md`；
3. **无工件未完工**：Issue 标记 Done 必须挂载真实工程工件。
