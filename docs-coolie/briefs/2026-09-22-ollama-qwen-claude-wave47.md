# Brief: wave 47 — Ollama + Qwen 本地运行 + claude 配 (boss 24:14 OOB 'claude的默认配置, ollama 本地运行的 qwen 可以用上吗')

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 24:14 OOB

老板问: claude 2.1.278 + 本机 ANTHROPIC_BASE_URL=api.minimaxi.com/anthropic 配置, 能否接 Ollama 本地跑的 Qwen 模型?

PM 真查 (24:14):

```
❌ ollama: command not found (没装)
❌ localhost:11434 连不上 (没跑)
✅ claude settings.json 支持 ANTHROPIC_BASE_URL 自定义 (实测可换 endpoint)
✅ Ollama 提供 Anthropic-compatible API (官方文档)
```

**结论**: 技术上可行, 但**本机没装 Ollama + 没拉 Qwen + 没改 claude config**.

## 1. 目标

**Coolie 0.5.26 (claude + Ollama 本地 Qwen)**:

A. 装 Ollama (brew install ollama)
B. 拉 Qwen 模型 (qwen2.5-coder:32b 推荐, 32GB 内存; 或 qwen2.5:7b 8GB)
C. Ollama 服务跑 (ollama serve 后台, port 11434)
D. 改 claude settings.json: ANTHROPIC_BASE_URL=http://localhost:11434 + ANTHROPIC_MODEL=qwen2.5-coder:32b
E. claude 跑测试 (ping + FizzBuzz) 真用 Qwen 验证
F. 出 docs-coolie/OLLAMA-CLAUDE-CONFIG.md (安装 + 配置 + 优缺点)
G. production 是否用 Qwen: 取决于老板拍板

## 2. 任务 (5 步)

### 3.1 装 Ollama

```bash
brew install ollama
ollama --version
```

期望: ollama 0.3.x+ 装好.

### 3.2 拉 Qwen 模型 + 启动服务

```bash
# 拉 32b coder 模型 (强)
ollama pull qwen2.5-coder:32b

# 或 7b 轻量 (快)
# ollama pull qwen2.5:7b

# 后台启动服务
nohup ollama serve > /tmp/ollama.log 2>&1 &

# 验证
curl -sS http://localhost:11434/api/tags | jq '.models[].name'
# 期望: ["qwen2.5-coder:32b"]
```

### 3.3 改 claude settings.json (本地 Qwen)

备份:
```bash
cp ~/.claude/settings.json ~/.claude/settings.json.bak.minimaxi
```

写新 config (Qwen 本地):
```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "ollama",
    "ANTHROPIC_BASE_URL": "http://localhost:11434",
    "ANTHROPIC_MODEL": "qwen2.5-coder:32b",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "qwen2.5-coder:32b",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "qwen2.5-coder:32b",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "qwen2.5:7b"
  }
}
```

(ANTHROPIC_AUTH_TOKEN="ollama" 是 Ollama 期望的 dummy token)

### 3.4 claude 跑测试真用 Qwen

```bash
# 简单 ping
claude -p "回个 ok" --dangerously-skip-permissions 2>&1 | tail -10

# FizzBuzz 任务
claude -p "写 Python 函数 fizzbuzz(n) 输出 1..n, 跑 15" --dangerously-skip-permissions 2>&1 | tail -15
```

期望: 返 "ok" + FizzBuzz 答案 (用 Qwen 真跑).

### 3.5 出 docs-coolie/OLLAMA-CLAUDE-CONFIG.md

```markdown
# Ollama + Claude + Qwen 本地运行配置 (PM 2026-09-23)

## 1. 优势
- 离线可用 (没网也跑)
- 数据不出本机 (隐私)
- 无 token 费用 (本地推理)
- 快速迭代 (没 rate limit)

## 2. 劣势
- 模型小 (32b 比 Claude 100B+ 弱)
- 推理慢 (本机 GPU vs API 集群)
- 占用内存 (32b ≈ 32GB RAM, 7b ≈ 8GB)
- catalog 不认 Qwen (claude 2.1.278 显示 unrecognized model warning)

## 3. 安装

brew install ollama
ollama pull qwen2.5-coder:32b
nohup ollama serve > /tmp/ollama.log 2>&1 &

## 4. 配置

~/.claude/settings.json:
- ANTHROPIC_BASE_URL: http://localhost:11434
- ANTHROPIC_MODEL: qwen2.5-coder:32b
- ANTHROPIC_AUTH_TOKEN: ollama (dummy)

## 5. 切换回 minimaxi

cp ~/.claude/settings.json.bak.minimaxi ~/.claude/settings.json

## 6. 生产是否用
- 生产 tc-coolie-claw 不装 Ollama (本地推理 vs API 集群, 生产优先 API)
- 本机开发可装 (测试 offline 行为)
```

## 4. Constraints

- ❌ DON'T 删现有 ~/.claude/settings.json (先备份)
- ❌ DON'T 在生产 tc-coolie-claw 装 Ollama (本地推理, 生产不用)
- ✅ DO 本机装 + 测试
- ✅ DO 出文档

## 5. Done definition

5 步全完 + Ollama 装 + Qwen 拉 + claude 配置改 + 测试通过 + OLLAMA-CLAUDE-CONFIG.md 入档 + commit + push:

```
~/.claude/settings.json:    ANTHROPIC_BASE_URL=http://localhost:11434 + model=qwen2.5-coder:32b
docs-coolie/OLLAMA-CLAUDE-CONFIG.md: 完整配置指南
ollama list:                qwen2.5-coder:32b ready
claude -p ping:             ok (用 Qwen)
```