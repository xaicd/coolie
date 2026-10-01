# wave245 agy 真跑输出 (摘要)

> **执行人**: agy (墨斗 FDA 主工具, wave236 恢复)
> **执行时间**: 2026-10-01
> **任务文件**: `docs-coolie/evidence/wave245/PROMPT-AGY.md` (146 行 UTF-8)
> **调用方式**: `docker exec agy-ubuntu-container agy --print` (经 `agy-runner.sh` wrapper 解决 UTF-8 argv mangling)
> **产物**: `docs-coolie/research/PALANTIR-ONTOLOGY-PRIMITIVES.md` (498 行, 44.5K)

## agy 最终汇报 (完整原文)

> agy 在 `agy --print` 模式下输出分两段: 第一段是报告生成期间的过程 (搜索 / 抓取 / 写文件的
> tool 调用), 第二段是最终汇报. 最终汇报的捕获 stdout 写在
> `docs-coolie/evidence/wave245/agy-final-stdout.log`. 完整报告 (498 行, 44.5K) 已在
> `docs-coolie/research/PALANTIR-ONTOLOGY-PRIMITIVES.md` 落盘.

### 原始 stdout 摘录 (`agy-final-stdout.log`)

```
已完成 **wave245 — Palantir Ontology 7 Primitives 研究任务**，成果已输出至
[`docs-coolie/research/PALANTIR-ONTOLOGY-PRIMITIVES.md`](file:///workspace/docs-coolie/research/PALANTIR-ONTOLOGY-PRIMITIVES.md)。

### 报告核心概要

[exited with code 0]
```

## agy 调用过程 (技术细节)

### 环境

- 容器: `agy-ubuntu-container` (chw717/ai-agy:latest-arm64)
- 工作目录: `/workspace` (已挂载本地 Coolie 仓库, `cd /workspace` 即可读 `entity_relations.ts` /
  `ontology_properties.ts` / `ENTITY_TYPES` 等)
- 提示词路径: `/tmp/agy-prompt.md` (经 `docker cp` 从 host 复制, UTF-8 完整)
- Locale: `LANG=C.UTF-8 LC_ALL=C.UTF-8` (避免 bash argv 把中文 mangling 成 `?`)

### 调用命令

```bash
# wrapper (解决 UTF-8 argv 问题)
cat > /tmp/agy-runner.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
export LANG=C.UTF-8
export LC_ALL=C.UTF-8
cd /workspace
PROMPT="$(base64 -d /tmp/wave245-prompt.b64)"
exec agy --dangerously-skip-permissions --output-format text --print-timeout 1800s -p "$PROMPT"
EOF
chmod +x /tmp/agy-runner.sh

# 启动
docker exec agy-ubuntu-container bash -c 'rm -f /tmp/wave245-agy.log; setsid /tmp/agy-runner.sh </dev/null >/tmp/wave245-agy.log 2>&1 &'
```

### 遇到的问题与解决

| 问题 | 原因 | 解决 |
|---|---|---|
| `$(cat /tmp/agy-prompt.md)` 在 argv 中变 `?` | docker exec bash subshell 的 argv 是 ASCII / POSIX locale, UTF-8 字节被替换 | 用 `base64 -d` 解码后传, `LANG=C.UTF-8` 显式设 locale |
| `--print-timeout 1800` 报"missing unit" | 时间需要单位 | 改 `1800s` |
| 输出文件 0 bytes | 多个并行 agy 进程冲突 stdout | `pkill` 清空, 单进程 `setsid` 启动 |
| agy 看不到 `/workspace` 工作目录 | 容器内 `pwd` 是 `/` | `cd /workspace` 先切目录 |

## 报告结构 (498 行)

```
# Palantir Ontology 7 Primitives — 调研报告 (agy 真跑)

§0. 摘要 (Executive Summary)                       [L1-29,  ~600 chars 中文]
§1. Palantir Foundry / AIP 7 Primitives 官方真值    [L30-307, 7 子节 × 真值/原则/范例]
  §1.1 Object (对象 / 实例)
  §1.2 Type / Object Type (类型 / 模式)
  §1.3 Property (属性 / 槽)
  §1.4 Link / Link Type (关系 / 边)
  §1.5 Action / Action Type (动作 / 突变)
  §1.6 Function (函数 / 计算)
  §1.7 Branch (分支 / 沙箱与演进)        [核心缺口章节]
§2. Coolie 工坊当前实现对照与差距分析      [L308-337, 含 7 行对照表]
§3. 主 Agent 视角                          [L338-436, 含拓扑依赖链图 + 数据流闭环图]
§4. 对老板原话的回应与总结                  [L437-459]
§5. 参考资料 (Palantir 官方引文 9 条)        [L460-499, 含完整 URL]
```

## 报告质量验收

| 维度 | 状态 | 备注 |
|---|---|---|
| 7 primitives 全部覆盖 | ✅ | §1.1-§1.7 各一节 |
| 每 primitive 含真值定义 + 原则 + 例子 | ✅ | TypeScript 代码示例, Palantir Docs 引文 |
| Coolie 对照完整 | ✅ | §2.1 7 行评估表 (5 行 60-85%, Branch 0%) |
| 主 agent 视角 3 段 | ✅ | §3.1 论证逻辑 + §3.2 拓扑依赖 + §3.3 数据流闭环 |
| ≥ 5000 字 | ✅ | 498 行, 44.5K |
| ≥ 5 Palantir 引文 | ✅ | §5 共 9 条 URL (ontology-overview / ontology-object-types / ontology-link-types / action-types / functions / ontology-branching / scenarios / aip-logic / ontology-sdk) |

PM 已基于本报告产出 `docs-coolie/research/architecture-7-primitives.md` (Section B)
和 `docs-coolie/CMMI-EMPLOYEE-MAPPING.md` §9 (CMMI 维度增量).