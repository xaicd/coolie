# Brief: wave 44 — 生产 Hermes 对话验证测试 (boss 24:08 OOB '生产 Hermes 对话其实一直不行, 你要派测试验证')

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 24:08 OOB 「生产 Hermes 对话其实一直不行, 你要派测试验证」

老板质疑: 生产 (tc-coolie-claw) 上 Hermes 对话一直不行, 让 PM 派测试验证.

## 1. 已知现状 (PM 09-22 真查)

```
✅ server v0.21.0 + board-chat 路由 (/api/board/chat/stream)
✅ server 端 hermes v0.21.0, 不支持 --format stream-json (Caddy 矩阵已修)
✅ wave12 之前修过: GLM 429 + authorType:system + 旧进程 4 层病因
⚠️ 老板说 "一直不行" — 可能 hermes CLI 没装/没启动, 或 hermes-oneshot 调用挂
⚠️ server 上 hermes v0.21.0 安装路径 /home/ubuntu/.local/bin/hermes (systemd PATH 里没有)
```

## 2. 目标

**生产 Hermes 对话链路真测**:

A. ssh 生产 tc-coolie-claw 验证 hermes CLI 是否装
B. 手动跑一次 hermes chat 验证 (不用 server, 直接 hermes CLI)
C. 跑 server 的 board-chat SSE 流, 看 hermes-oneshot 真调起
D. 看 server log / system log 找失败点
E. 出报告 + 修法

## 3. 任务 (6 步)

### 3.1 ssh 生产验 hermes CLI

```bash
ssh tc-coolie-claw 'which hermes; hermes --version 2>&1 | head -3; ls -la /home/ubuntu/.local/bin/hermes 2>&1 | head'
```

期望: hermes v0.21.0+ 装好.

### 3.2 ssh 生产手动跑 hermes chat

```bash
ssh tc-coolie-claw 'cd /opt/coolie/server && BOARD_CHAT_MODEL=glm-5.3-flash timeout 30 hermes chat --oneshot --quiet --query-file - << EOF
ping
EOF' 2>&1 | tail -10
```

期望: 返 "pong" 或 "ok" 字.

### 3.3 看 systemd PATH + env

```bash
ssh tc-coolie-claw 'systemctl show coolie | grep -E "Environment|PATH" | head'
ssh tc-coolie-claw 'sudo cat /etc/systemd/system/coolie.service 2>/dev/null | head -30'
```

期望: systemd service 里 EnvironmentFile=/opt/coolie/.env 含 hermes-1 / GLM 等.

### 3.4 跑真 board-chat SSE (模拟客户端)

```bash
# 1. 拿 session cookie
curl -sS -X POST "https://xrobinai.cn/api/auth/sign-in/email" \
  -H "Content-Type: application/json" \
  -d '{"email":"robinschen1989@gmail.com","password":"Cx-TWzbcbpOSLCxb4"}' \
  -c /tmp/board-cookie.txt | head

# 2. POST board-chat SSE (form 流)
curl -sS -X POST "https://xrobinai.cn/api/board/chat/stream" \
  -H "Cookie: $(cat /tmp/board-cookie.txt | grep session | awk '{print $NF}')" \
  -H "Content-Type: application/json" \
  -d '{"companyId":"4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e","prompt":"ping","stream":true}' \
  --max-time 60 | head -20
```

期望: SSE 流 (event: chunk ...) 或 4xx 错误.

### 3.5 看 server log 找失败点

```bash
ssh tc-coolie-claw 'sudo journalctl -u coolie --since "5m ago" --no-pager | tail -30'
```

期望: 看 hermes-oneshot 调用 stack trace (如果失败).

### 3.6 出报告 docs-coolie/HERMES-DIALOG-VERIFY.md

报告结构:

```markdown
# 生产 Hermes 对话验证报告 (PM 2026-09-23)

## 1. 测试环境
- tc-coolie-claw (Ubuntu 22.04)
- hermes CLI 版本 / 路径
- server v0.21.0 + board-chat

## 2. 测试结果

### 2.1 hermes CLI 装否
[✅ 装好 / ❌ 没装 — 路径 / 版本]

### 2.2 hermes chat 直跑
[✅ pong / ❌ 失败 — 错误信息]

### 2.3 systemd PATH + env
[...]

### 2.4 board-chat SSE 真测
[✅ 流式返 / ❌ 4xx — 状态码 + 错误]

### 2.5 server log 诊断
[失败点 + stack trace]

## 3. 真因分析

[找不到 hermes-oneshot 调起 / PATH 缺 / 模型错 / ...]

## 4. 修法 (3 档)

### 激进: 修 server 端 hermes-oneshot + install hermes + 改 systemd env
### 中庸: 改 server 用直接调用 minimaxi API (绕过 hermes CLI)
### 保守: 改用 GLM-5.3-flash 直跑 (不用 hermes-oneshot)

## 5. PM 推荐
[...]

## 6. 等老板拍板
```

## 4. Constraints

- ❌ DON'T 改代码 (只验证 + 报告)
- ❌ DON'T restart server (除非必要)
- ❌ DON'T bump version
- ✅ DO 5 步验证 + 6 报告

## 5. Done definition

6 步全完 + 生产 Hermes 对话链路 5 处真测 + docs-coolie/HERMES-DIALOG-VERIFY.md 入档 + 报告给老板 3 档修法选:

```
docs-coolie/HERMES-DIALOG-VERIFY.md (新文件)
```