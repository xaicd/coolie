# CLAUDE.md — sys-chanrong-agent 指南

> **进场第一秒必看**: 请先读 [MEMORY.md](MEMORY.md) (8KB 项目记忆中枢) 与 [HARNESS.md](HARNESS.md) (五位一体工程安全带)。
> 平台工程法典见 [AGENTS.md](AGENTS.md)。

---

## 1. 核心五位一体 Harness 验证

```bash
bash scripts/harness.sh full-audit      # 提交前全量门禁体检 (必跑)
bash scripts/harness.sh build           # 契约与编译检查 (0 报错)
bash scripts/harness.sh test            # 验收测试
node scripts/speckit.cjs tasks          # 查看任务列表
```

---

## 2. 核心红线与工程铁律

1. **1 Task = 1 Commit**: 每个原子任务对应独立物理 Git 提交，严禁 git stash 掩埋半成品；
2. **No Artifact, No Done**: 标记完成必须挂载真实工程工件至 `docs/artifacts/`；
3. **活体本体不可乱动**: 新增业务逻辑必须在 `ontology/` 建立实体与动词血缘，杜绝野生死代码；
4. **两字 UI 交互原则**: 界面按钮收敛为两字，移动端适配 320px 视口，零死穴按钮。
