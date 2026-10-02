# agy-in-docker — Antigravity CLI 容器化跑法细节

> **本档**: `agy-gemini-cli` skill 的 reference 文件. 主档见 [../SKILL.md](../SKILL.md).
> **Why**: 把"容器 + wrapper script + 3 个坑"集中到一处, skill 主档引这份.

## 容器基本信息 (老板本机, 不入 git)

```
Container: agy-ubuntu-container
Image:     ubuntu:22.04 + agy binary (/root/.local/bin/agy 1.2.14 + Gemini 3.8)
Workdir:   /workspace (必须 cd 才能读 repo 文件)
Locale:    POSIX default (所以才需要 LANG=C.UTF-8 wrapper)
```

## Wrapper 完整脚本 (拿 wave245 验过的)

### host 端 (macOS)

```bash
#!/usr/bin/env bash
# scripts/run-agy.sh — 跑 agy 真任务的封装 (wave280 模板)
# 用法:
#   bash scripts/run-agy.sh <wave-id> <prompt-file> [output-name]
# 例:
#   bash scripts/run-agy.sh wave280 \
#     docs-coolie/evidence/wave280/PROMPT-AGY.md \
#     wave280-palantir-audit

set -euo pipefail
WAVE="${1:?用法: run-agy.sh <wave-id> <prompt-file> [output-name]}"
PROMPT_FILE="${2:?缺 prompt 文件}"
OUTPUT_NAME="${3:-${WAVE}-agy-report}"
LOG="/tmp/${WAVE}-agy.log"

# 0. prep dirs
EVIDENCE_DIR="$HOME/workspace/xaicd/coolie/docs-coolie/evidence/$WAVE"
mkdir -p "$EVIDENCE_DIR"

# 1. base64 复制 prompt
TMP_B64="$(mktemp -t agy-prompt.XXXXXX).b64"
trap 'rm -f "$TMP_B64"' EXIT
base64 -i "$PROMPT_FILE" -o "$TMP_B64"
docker cp "$TMP_B64" agy-ubuntu-container:/tmp/agy-prompt.b64

# 2. 写容器内 wrapper
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

# 3. 启动 (setsid + /dev/null + 写 log)
docker exec agy-ubuntu-container bash -c "rm -f /tmp/${WAVE}-agy.log; setsid /tmp/agy-runner.sh </dev/null >/tmp/${WAVE}-agy.log 2>&1 &"

# 4. 状态报告
echo "═══ agy 真跑启动 ═══"
echo "  Wave:       $WAVE"
echo "  Prompt:     $PROMPT_FILE"
echo "  Output:     /workspace/<待 agy 写>"
echo "  Container:  agy-ubuntu-container (PID detached)"
echo "  Log:        $LOG (docker exec agy-ubuntu-container tail -f /tmp/${WAVE}-agy.log)"
echo ""
echo " 验证中文不乱码: docker exec agy-ubuntu-container head -5 <报告路径>"
echo " 取报告:        docker cp agy-ubuntu-container:<报告路径> docs-coolie/..."
```

### 容器端 (写在 /tmp/agy-runner.sh 后 chmod +x)

```bash
#!/usr/bin/env bash
set -euo pipefail
export LANG=C.UTF-8   # 防 bash argv 替换中文为 ?
export LC_ALL=C.UTF-8
cd /workspace          # 容器默认 cwd 是 /, 必须 cd 才能读 repo
PROMPT="$(base64 -d /tmp/agy-prompt.b64)"
exec agy --dangerously-skip-permissions --output-format text --print-timeout 1800s -p "$PROMPT"
```

## 3 个坑详解

### 坑 1: bash argv UTF-8 mangling (最致命)

**现象**: 直接 `docker exec agy-ubuntu-container agy -p "$(cat file.md)"` 中文变 `?`.

**真因** (双层):
1. docker exec 默认 POSIX locale (`LC_CTYPE="POSIX"`), bash 把 UTF-8 当 8-bit 处理
2. 即使 `LANG=C.UTF-8` 显式设, bash argv 替换阶段 (`$(cat)`) 仍 mangling

**修法**: base64 路径绕开整个 argv 替换链路.
- host 把 prompt 文件 base64 编码 → 容器
- 容器内 wrapper 用 `base64 -d /tmp/file.b64` 还原 → bash 变量
- 这个变量是 byte-clean 的 (base64 是 ASCII 子集), bash 不会再 mangling

**验证**: agy 写出来的报告 `head -5` 应该看到中文不乱码.

**反向验证** (看 mangling 是否发生): `ps aux` 在容器里看到 argv 是 `?` 就 100% 失败了.

### 坑 2: --print-timeout 单位

```bash
# 错
agy --print-timeout 1800  # 报 "missing unit"

# 对
agy --print-timeout 1800s # 30 分钟
agy --print-timeout 30m   # 30 分钟
agy --print-timeout 1h    # 1 小时
```

### 坑 3: 并行 agy 抢 stdout

```bash
# 错: 同时跑 2 个 agy
docker exec ... agy -p "任务 A" &
docker exec ... agy -p "任务 B" &
# 输出互窜, 报告混在一起

# 对: 一次一个
docker exec ... agy -p "任务 A"  # 跑完再跑任务 B

# 清空遗留
docker exec agy-ubuntu-container bash -c 'pkill -9 -f "agy --print"'
```

## 验证清单 (老板铁律: 报告说做了 ≠ 真做了)

每跑完一份 agy 报告, 必验:

```bash
# 1. 报告文件存在
docker exec agy-ubuntu-container ls -la /workspace/<报告路径>

# 2. 中文不乱码 (坑 1 没翻车)
docker exec agy-ubuntu-container head -10 /workspace/<报告路径>

# 3. 报告行数 / 字数合理 (太短 = agy 没真跑, 撞超时或卡)
docker exec agy-ubuntu-container wc -l /workspace/<报告路径>

# 4. log 看 agy 真完成 (exit code 0)
docker exec agy-ubuntu-container tail -3 /tmp/<wave>-agy.log
```

4 项全过 = 真跑成功. 任一项不过 → 重跑 + 看 agy 容错路径.

## 已知 edge case

- `--bg-updater` 吞 stdout (被 agy 自己的 auto-update 进程吃掉), 真跑用 `nohup ... > /tmp/log 2>&1 &` 替代
- agy 容器工作目录是 `/`, `cd /workspace` 后才能 `cat /workspace/docs-coolie/...`
- `--print` vs `--non-print`: `--print` = 一次性输出; `--non-print` = 持续交互 (但会卡死, 别用)
- 多轮对话用 `agy -c` (continue) 而不是开新进程, 避免 context 丢失

## 出处

- wave245 PALANTIR-ONTOLOGY-PRIMITIVES.md (498 行报告成功落盘) — 首次 base64 wrapper 验证
- `~/.claude/projects/-Users-mac-workspace-xaicd-coolie/memory/agy-utf8-argv-prompt.md` — UTF-8 坑总结
- `docs-coolie/evidence/wave245/PROMPT-AGY.md` + `agy-runner.sh` — 完整 wrapper 实例
- 老板原话 (wave280, 2026-10-02): "agy工具使用你找找skills吧" → 本 skill 新建
