---
name: agy-orchestration
description: Antigravity (AGY) 智能体跨环境调度与协同工作流。供宿主机上的 Claude Code CLI、Hermes、Codex 等原生智能体了解并直接通过 `docker exec` 调度容器内的 AGY 协同工作（支持无头自动批准、自递归子智能体、反向穿透宿主机运维、全字段守卫拦截），提供端到端派活 SOP。
license: project-internal
---

# Antigravity (AGY) 宿主机跨端调度与协同工作流 (Host-to-Container)

> **拓扑总览**:
> * **宿主机环境 (`aja-pc`, Ubuntu 24.04)**: 运行 **Claude Code CLI** 与 **Hermes Agent**；宿主机部署有真实 Docker 中间件（Postgres 16, Redis 7, MinIO, SRS 直播服务, Traefik）。
> * **容器沙箱 (`agy-ubuntu-e2e`)**: 运行 **Antigravity (AGY)** 智能体。容器挂载宿主机代码工作区，并具备反向穿透宿主机（`ssh host`）的免密互信能力。

---

## 一、 宿主机（Claude / Hermes）向容器（AGY）派活的标准 SOP

在宿主机终端或 Agent 会话中，调度容器内 AGY 工作的**黄金命令模板**如下：

### 1. 标准派活命令（单行无头模式，自动批准权限）

```bash
docker exec -i agy-ubuntu-e2e bash -lc "cd /root/workspace/wenlv-next && agy -p '<具体任务Prompt>' --dangerously-skip-permissions --output-format json < /dev/null"
```

#### 关键防坑参数说明：
1. **必须 `-i`，切忌 `-it`**：非交互式或自动化 Agent 调用时，千万不要加 `-t`（会触发 `the input device is not a TTY` 报错）。
2. **必须加上 `< /dev/null`**：关闭标准输入等待，防止 AGY 挂起等待 TTY。
3. **必须带 `--dangerously-skip-permissions`**：确保 AGY 在容器内执行文件读写、运行测试或静态检查时全自动批准，无需人工在终端按回车。
4. **输出格式推荐 `--output-format json` 或 `text`**：调用方 Agent 可直接捕获标准输出并解析 JSON 结果。

---

### 2. 处理复杂中文长任务的模板（文件隔离防乱码）

如果任务包含大段 Markdown、复杂的业务规则或换行，直接在命令行拼字符串容易导致转义乱码。推荐使用**文件派活模板**：

```bash
# Step 1: 宿主机生成任务清单
cat > /tmp/agy-task.txt << 'EOF'
你是 AGY 高阶架构师。任务目标：
1. 检查电商商品上架链路，禁止直连 DB，全部走真实 API。
2. 确保商品必须带真实图片，拦截敏感词与广告法绝对化禁用词。
3. 运行 npm run check:no-direct-db && npm run check:business-validator 进行验证。
4. 输出 Git Commit 并生成总结报告。
EOF

# Step 2: 拷贝至容器内
docker cp /tmp/agy-task.txt agy-ubuntu-e2e:/root/agy-task.txt

# Step 3: 一键触发 AGY 执行
docker exec -i agy-ubuntu-e2e bash -lc "cd /root/workspace/wenlv-next && agy -p \"\$(cat /root/agy-task.txt)\" --dangerously-skip-permissions < /dev/null"

# Step 4: 宿主机查看 AGY 提交的代码
cd /home/beye/workspace/zhuangyuan/agy-ubuntu/workspace/wenlv-next
git log -n 1 --stat
```

---

## 二、 AGY 的六大独特超能力（外部 Agent 应何时调度 AGY？）

| 场景需求 | 为什么必须派给容器内 AGY？ | AGY 调用的工具 |
| :--- | :--- | :--- |
| **并发多领域调研 / 深度重构** | 单一上下文容易超载，AGY 可原生并发启动多名 Subagent 协同工作。 | `invoke_subagent` / `define_subagent` |
| **多模态真实素材与设计图生成** | 告别低质色块图，AGY 内置原生文生图与视觉设计引擎。 | `generate_image` |
| **全字段合规与防直写数据库守卫** | 拦截敏感词、违禁词、广告法极限词，拦截脚本直连 DB 偷渡行为。 | `check:no-direct-db`<br>`check:business-validator` |
| **长时异步构建与定时唤醒** | 任务无需同步阻塞死等，内置反应式唤醒与毫秒级定时器。 | `schedule` / `manage_task` |
| **穿透回宿主机运维基础设施** | 容器内打通了 `ssh host`，可反向重启宿主机 Postgres、SRS、Traefik。 | `ssh host "<cmd>"` |

---

## 三、 宿主机与容器的目录与代码同步机制

* **代码实时互通**：
  宿主机路径 `/home/beye/workspace/zhuangyuan/agy-ubuntu/workspace/wenlv-next`  
  与容器内路径 `/root/workspace/wenlv-next`  
  **是同一个 Docker Volume 挂载映射**！容器内 AGY 修改或 Commit 的代码，在宿主机上**立即可见、秒级同步**，无需反复 git pull！
* **Git 凭证与推送**：
  宿主机的 SSH 凭证已挂载到容器中，容器内也可直接通过 `ssh host` 委托宿主机执行 push 或远程部署。

---

## 四、 跨智能体协作规范与角色分工

1. **Claude Code / Hermes（宿主机总指挥）**：
   - 负责顶层产品需求拆解、与用户对齐业务范围、把控整体工程方向；
   - 编写任务概要，通过 `docker exec -i agy-ubuntu-e2e ...` 派发具体实现任务给 AGY。
2. **AGY（容器内全能执行官与技术专家）**：
   - 负责复杂逻辑编码、架构设计工件生成（Artifacts）、守卫编写与高阶重构；
   - 自动运行测试沙箱与守卫验证，确保代码 0 脏数据、0 敏感词、100% 遵守业务契约；
   - 执行完成后将清晰的 Commit 和结构化结果回传给宿主机的 Claude / Hermes。
