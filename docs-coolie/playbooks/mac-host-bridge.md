# Playbook: 容器沙箱与 Mac 宿主机 SSH 桥接操作指南

> **适用场景**: Docker 容器环境（`agy-gemini3.8` / Antigravity）反向调用 Mac 宿主机上的工具链（`claude-glm`, `claude-mm`, `cmd`, `copilot`, `kiro-cli`）与环境。

---

## 1. 物理拓扑与架构原理

```text
┌────────────────────────────────────────────────────────┐
│                   Mac 宿主机 (macOS)                    │
│  - 用户名: mac                                          │
│  - 物理局域网 IP: 192.168.3.85 (或宿主机网桥 172.19.0.1)  │
│  - 工具目录: /opt/homebrew/bin/                         │
│    (claude, cmd, copilot, kiro-cli)                    │
│  - 仓库真实路径: /Users/mac/workspace/xaicd/coolie      │
└───────────────────────────▲────────────────────────────┘
                            │ SSH (Port 22, ed25519)
                            │ 旁路 Clash TUN 路由
┌───────────────────────────▼────────────────────────────┐
│              Docker 容器沙箱 (Ubuntu/Debian)            │
│  - 用户名: root                                         │
│  - 挂载工作区: /host-workspace/xaicd/coolie            │
│  - 身份私钥: /root/.ssh/id_ed25519                      │
│  - 本地运行态: /host-workspace/xaicd/coolie/.coolie-local │
│  - 本地工具: agy (Antigravity CLI 1.2.15)              │
│  - 调度代理: scripts/host-exec.sh                       │
└────────────────────────────────────────────────────────┘
```

---

## 2. 宿主机登录凭证与网络连通

### 2.1 SSH 密钥挂载与权限
容器通过卷挂载获得宿主机的只读密钥，在首次启动时同步到 root 目录：
- 来源挂载路径: `/root/.ssh-host/id_ed25519`
- 容器工作私钥: `/root/.ssh/id_ed25519`
- 权限铁律:
  ```bash
  mkdir -p /root/.ssh
  cp /root/.ssh-host/id_ed25519 /root/.ssh/id_ed25519
  chmod 600 /root/.ssh/id_ed25519
  ```

### 2.2 IP 寻址优先级
`scripts/host-exec.sh` 自动按以下优先级寻址：
1. **显式环境变量**：`MAC_HOST_IP`（若设定则无条件优先）
2. **局域网固定候选**：`192.168.3.85`（老板当前 Mac 静态局域网 IP）
3. **Docker 网关 IP**：容器路由 `ip route show default | awk '{print $3}'`（默认 `172.19.0.1`）
4. **虚拟域名**：`host.docker.internal`

### 2.3 必须注意的 Clash TUN 旁路路由拦截
宿主机或容器如果开启了 TUN 模式代理，直接连接 `192.168.3.85` 的流量会被误路由进 TUN 虚拟网卡导致连接超时或重置。
**必须在容器中执行静态主机路由旁路**：
```bash
ip route replace 192.168.3.85 via 172.19.0.1 dev eth0
```
`scripts/host-exec.sh` 已经内置了这条自动化保障，无需人工反复执行。

---

## 3. 登录与执行标准方式

### 3.1 交互式登录宿主机终端
```bash
ssh -i /root/.ssh/id_ed25519 -o StrictHostKeyChecking=no mac@192.168.3.85
```

### 3.2 脚本透明执行命令 (`scripts/host-exec.sh`)
严禁直接手写拼装 SSH 字符串（防止引号转义和特殊字符注入）。统一使用仓库自带的执行代理：
```bash
# 1. 验证连通性
bash scripts/host-exec.sh "which claude cmd copilot"

# 2. 检查版本
bash scripts/host-exec.sh "claude --version; cmd --version; copilot --version"

# 3. 在宿主机仓库工作目录下执行构建与测试
bash scripts/host-exec.sh "pnpm -r typecheck"
```

### 3.3 Base64 管道免转义安全机制
`scripts/host-exec.sh` 将命令在本地先做 Base64 编码，再通过 SSH 管道解码执行：
```bash
# 原理等价于：
RAW_SCRIPT="export PATH=\"/opt/homebrew/bin:\$PATH\"; cd /Users/mac/workspace/xaicd/coolie; $COMMAND"
B64=$(printf '%s' "$RAW_SCRIPT" | base64 | tr -d '\r\n')
ssh mac@192.168.3.85 "echo $B64 | base64 -d | bash"
```
这彻底解决了长提示词、单双引号嵌套、换行符在 SSH 参数解析时的断流与逃逸问题。

---

## 4. 常见排错清单 (Troubleshooting)

| 症状 | 根因 | 处置 SOP |
|---|---|---|
| `Connection timed out` | Clash TUN 劫持了内网流量 | 在容器内运行 `ip route replace 192.168.3.85 via 172.19.0.1 dev eth0` |
| `Permission denied (publickey)` | 密钥文件缺失或权限不是 600 | 检查 `/root/.ssh/id_ed25519` 是否存在，运行 `chmod 600 /root/.ssh/id_ed25519` |
| `command not found: claude` | SSH 非登录 Shell 缺少 Homebrew PATH | `host-exec.sh` 已默认预挂 `PATH="/opt/homebrew/bin:...:$PATH"`，确保使用 `host-exec.sh` 启动 |
| 宿主机 IP 发生漂移 | Mac 重启后 DHCP 重新分配 IP | 在 Mac 终端运行 `ipconfig getifaddr en0`，然后在容器内声明 `export MAC_HOST_IP=<新IP>` |
