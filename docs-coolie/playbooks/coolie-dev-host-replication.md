# Coolie Dev 跨主机快速复制与零坑投产手册 (Host Replication Playbook)

> **目标**: 当需要把这套「Coolie 本地施工总社 + Hermes 微信秒级直通 + Runner Bridge 异步自动化调度」体系部署到一台全新的主机（Mac / Linux / 云主机）时，**一键跑通，零排障复刻**。

---

## 一、系统核心拓扑

```
[ 老板微信 / IM 终端 ]
        │  (0.5s 意图解析 + 1s 极速回执)
        ▼
[ Hermes 网关 / hermes-boss-intent-dispatcher.sh ]
        │  (POST /api/companies/.../issues)
        ▼
[ Coolie Dev Server (3100, 内嵌 PGlite, 零外部数据库) ]
        │  (todo 待办队列)
        ▼
[ Runner Bridge 宿主机守护进程 (coolie-task-runner-bridge.mjs) ]
        │  (独立 Node 子进程异步调度，写 .coolie-local/logs/)
        ▼
[ AI 数字员工工具池 ]
  ├── 铁匠 (Core SWE)   --> claude-glm (GLM-5.3) / claude-mm (MiniMax-M3)
  ├── 门神 (FDSE)       --> cmd (@commandcode/ai)
  ├── 墨斗 (FDA)        --> agy-gemini3.8 (Docker 容器沙箱)
  ├── 兑底渊 (PRE-SRE)  --> copilot
  └── 百晓生 (DS)       --> claude-mm
```

---

## 二、新机部署前踩平的 5 大历史卡点（设计要点）

| # | 历史卡点 | 根因 | 新体系规避方案 |
|---|---|---|---|
| 1 | **终端 180s 超时杀进程** | Hermes 微信内部终端工具为前台同步等待，3分钟超时直接 SIGKILL 铁匠 | **解耦异步**：Hermes 仅建工单；由后台常驻 Runner Bridge 独立执行，不受微信超时限制 |
| 2 | **幽灵虚报 (跑了10小时)** | 进程被杀后 Receipt 仍停在 running，监控脚本只认 JSON 文本 | **活体探活**：`cron-team-status.sh` 加入 `kill -0 $PID` 检测，死进程自动置为 failed 自愈 |
| 3 | **路径与用户名写死** | 脚本硬编码 `/Users/<username>/...`，换机器/换用户直接路径报错 | **动态寻径**：全部改用 `path.resolve(__dirname, "..")` 与 `REPO_ROOT` 动态定位 |
| 4 | **外部 DB 依赖过重** | 以为跑 Dev Server 必须配 Postgres / Docker DB | **零配置内嵌**：不设 `DATABASE_URL` 时自动启动内嵌式 PGlite，数据秒级拉起 |
| 5 | **守护进程漂移掉线** | Mac 休眠或重启后 Bridge 掉线，没人消费新工单 | **Crontab 看门狗**：每 5 分钟自动检测进程，挂掉秒级自动拉活 |

---

## 三、新主机一键复刻步骤 (One-Command SOP)

### 步骤 1：克隆仓库与拉取依赖
```bash
git clone git@github.com:xaicd/coolie.git
cd coolie
pnpm install
```

### 步骤 2：配置 AI 工具底座凭据 (仅需配置一次)
根据需要配置宿主机或开发环境的 API 密钥：
```bash
# 1. Claude Code 配置文件 (~/.claude/settings.json)
mkdir -p ~/.claude
cat > ~/.claude/settings.json <<'EOF'
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "<Your-GLM-or-MiniMax-Token>",
    "ANTHROPIC_BASE_URL": "https://open.bigmodel.cn/api/anthropic",
    "API_TIMEOUT_MS": "3000000",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": 1,
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "glm-5.3[1m]"
  }
}
EOF

# 2. 如果使用 Docker 跑 agy-gemini3.8 (墨斗)
# 确保本地有 agy 容器或直接安装 agy cli
```

### 步骤 3：一键启动与初始化整个生态
直接运行一键引导脚本：
```bash
bash scripts/bootstrap-coolie-dev-host.sh
```
该脚本全自动执行：
1. 检查 Node.js (>=22)、pnpm、git、curl 基础环境；
2. 创建 `.coolie-local/` 全套日志、锁、收据目录；
3. 将数字员工 sub-agent 模板安装至 `~/.claude/agents/`；
4. 启动端口 3100 的 Coolie Dev Server；
5. 调用 API 初始化「Coolie 本地施工总社」及 6 位数字员工；
6. 启动 `Runner Bridge` 并向 crontab 注册保活看门狗。

---

## 四、验证与冒烟测试 (验收清单)

| 检查项 | 验证命令 | 期望输出 |
|---|---|---|
| **控制台健康** | `curl http://localhost:3100/api/health` | `{"status":"ok",...}` |
| **企业与员工** | `node scripts/coolie-dev-task.mjs list` | 正常列出「Coolie 本地施工总社」大盘 |
| **Runner 守护** | `bash scripts/coolie-task-runner-bridge.sh --status` | 正常显示进程在运行 |
| **探活与自愈** | `bash scripts/cron-team-status.sh --print` | 显示当前真值状态，无虚假时长 |
| **模拟微信派单** | `bash scripts/hermes-boss-intent-dispatcher.sh "测试任务"` | 1秒建单并显示 `COOA-XX`，Bridge 自动认领 |
