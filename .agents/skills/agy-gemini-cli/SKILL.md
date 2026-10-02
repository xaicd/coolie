---
name: agy-gemini-cli
description: Use when 用 agy-gemini3.8 (Antigravity CLI 1.2.14 + Gemini 3.8) 跑原型/调研/审计/中文报告. 本机无 agy binary — Antigravity 跑在 docker 容器 `agy-ubuntu-container`, 必须 docker exec + LANG=C.UTF-8 + base64 包装绕过 bash argv UTF-8 替换坑. 7 工具池里的"墨斗 (FDA)"默认工具 (per docs-coolie/TOOLS.md wave272 + wave280).
---

# agy-gemini-cli — Antigravity CLI (Gemini 3.8) 在 docker 容器里跑

## 何时用

老板原话 (wave272): "agy-gemini3.8 与 claude-mm, claude-glm, cmd, copilot, Hermes, kiro-cli 一样都是工具", "谁负责原型 → a = 墨斗 (FDA 匠人) 用 agy-gemini3.8".

墨斗 (FDA) 默认工具 = **agy-gemini3.8**. 跑:
- 业务访谈总结 / 选型研判 (CMMI Phase 1)
- 画原型 / 写调研 / 写 audit 报告 (FDA 主战场)
- 任何要"长文中文输出"的任务 (Gemini 3.8 长上下文 + 中文强)
- 老板原话 (wave273): "墨斗 agy 真审近两天改动综合评估" (agy 替老板审计 FDA 视角)

**不要**用 agy 跑:
- 代码开发 (→ claude-glm / claude-mm, 铁匠主线)
- 部署 / 运维 / 监控 (→ copilot, 兑底渊)
- 命令行批处理 / 派活 (→ cmd, 门神)

## 怎么启动 (3 步)

### Step 1 — base64 包装中文 prompt (绕过 bash argv UTF-8 mangling)

```bash
# host → container (base64 路径, 不要直接 docker exec 传中文)
WAVE="wave280"
PROMPT_FILE="$HOME/workspace/xaicd/coolie/docs-coolie/evidence/${WAVE}/PROMPT-AGY.md"
[ -f "$PROMPT_FILE" ] || { echo "❌ 缺 $PROMPT_FILE" >&2; exit 1; }

# 1a. 写到 host tmp
TMP_B64="$(mktemp -t agy-prompt.XXXXXX).b64"
base64 -i "$PROMPT_FILE" -o "$TMP_B64"

# 1b. 推到 container
docker cp "$TMP_B64" agy-ubuntu-container:/tmp/agy-prompt.b64

# 1c. 容器内 wrapper script (LANG=C.UTF-8 + base64 -d 还原)
cat > /tmp/agy-runner.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
export LANG=C.UTF-8
export LC_ALL=C.UTF-8
cd /workspace
PROMPT="$(base64 -d /tmp/agy-prompt.b64)"
exec agy --dangerously-skip-permissions --output-format text --print-timeout 1800s -p "$PROMPT"
EOF
chmod +x /tmp/agy-runner.sh

# 1d. 启动 (setsid + /dev/null + 写 log, 防容器收回 + 防 stdout 抢断)
docker exec agy-ubuntu-container bash -c 'rm -f /tmp/wave280-agy.log; setsid /tmp/agy-runner.sh </dev/null >/tmp/wave280-agy.log 2>&1 &'
```

### Step 2 — 看进度 (可选)

```bash
# log tail (容器里)
docker exec agy-ubuntu-container tail -f /tmp/wave280-agy.log

# 找 agy 进程
docker exec agy-ubuntu-container ps aux | grep -E "agy|prompt" | grep -v grep
```

### Step 3 — 取产物 + 验真

```bash
# agy 写出来的中文报告 (假设落到 /workspace/docs-coolie/...)
docker exec agy-ubuntu-container bash -c 'ls -la /workspace/docs-coolie/research/wave280-*' 2>&1

# 验证: head -5 应该能看到中文不乱码 (✅ 真跑成功 / ❌ 输出 ? 是 UTF-8 坑)
docker exec agy-ubuntu-container head -5 /workspace/docs-coolie/research/wave280-palantir-audit.md

# 把报告拷回 host
docker cp agy-ubuntu-container:/workspace/docs-coolie/research/wave280-palantir-audit.md \
  "$HOME/workspace/xaicd/coolie/docs-coolie/research/"
```

## 已知坑 (3 个, 都验过)

### 坑 1: bash argv UTF-8 mangling
直接 `docker exec agy-ubuntu-container agy -p "$(cat file.md)"` 会把所有中文替换成 `?`. 真因是 docker exec 默认 POSIX locale + bash argv 替换阶段 mangling UTF-8. **修法**: 走 base64 路径 (上面 step 1), 容器内 wrapper 脚本 `export LANG=C.UTF-8 LC_ALL=C.UTF-8` + `base64 -d` 解码. 不要相信 `docker exec -e LANG=...` (验过不可靠). 见 [memory: agy-utf8-argv-prompt.md](../../memory/agy-utf8-argv-prompt.md) + wave245 验证报告.

### 坑 2: --print-timeout 单位
`--print-timeout 1800` 报 "missing unit". **修法**: 必须带 s/m/h, 写 `--print-timeout 1800s` (30 分钟).

### 坑 3: 并行 agy 抢 stdout
多个并行 `agy --print` 进程会冲突 stdout, 输出互窜. **修法**: 一次只跑一个. 如有遗留: `pkill -9 -f "agy --print"` 清空. 标准启动用 `setsid ... >log 2>&1 &` 隔离.

## 输出位置

| 类型 | 路径 |
|---|---|
| 原型 / 选型表 | `docs-coolie/prototypes/<YYYY-MM-DD>-<slug>.md` |
| 调研报告 | `docs-coolie/research/<slug>.md` |
| Audit 报告 | `docs-coolie/audit/<YYYY-MM-DD>-<slug>/<files>.md` |
| Evidence | `docs-coolie/evidence/wave<NNN>/PROMPT-AGY.md` (原 prompt) + `agy-runner.sh` (wrapper) + 报告 cp 出来的成品 |

跑完一份 agy 报告必走:
1. `docs-coolie/prototypes/` / `docs-coolie/research/` 落到本地仓库
2. `docs-coolie/evidence/wave<NNN>/PROMPT-AGY.md` 留原 prompt (老板复审用)
3. 真跑验证: `head -5 <报告>` 应看到中文不乱码 (验 UTF-8 包装成功)

## 与其他文档的关系

- 7 工具池定义: `docs-coolie/TOOLS.md` (wave272 拍板, wave280 修正 Hermes 列)
- 墨斗员工档案: `docs-coolie/CMMI-EMPLOYEE-MAPPING.md` §10.2 + §11
- wave245 验证报告: `docs-coolie/evidence/wave245/agy-runner.sh` + `PROMPT-AGY.md` + PALANTIR-ONTOLOGY-PRIMITIVES.md (498 行报告成功落盘)
- UTF-8 坑总结: `~/.claude/projects/-Users-mac-workspace-xaicd-coolie/memory/agy-utf8-argv-prompt.md`

## 出处

老板原话 (wave272, 2026-10-02): "agy-gemini3.8 与 claude-mm, claude-glm, cmd, copilot, Hermes, kiro-cli 一样都是工具" + "谁负责原型 → a = 墨斗".

老板原话 (wave280, 2026-10-02): "agy工具使用你找找skills吧" → 本 skill 新建.

## 不动

- ❌ server / ui / clients/expo 业务代码
- ❌ 5 角色 / AGENT_ROLES enum / ROLE_MAPPING 算法层
- ❌ AGY 容器本身 (老板本机维护, 不入 git)
- ❌ 7 工具池其它 6 个工具的 skill (claude-mm / claude-glm / cmd / copilot / Hermes / kiro-cli)
