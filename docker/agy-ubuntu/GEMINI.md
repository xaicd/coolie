# Antigravity Global Environment Memory & Execution Rules (全局环境拓扑与执行法则)

## 1. 物理环境网络拓扑与主机矩阵 (Multi-Host Topology)
全平台数字员工体系运行于多机混合拓扑中，依托 Tailscale Mesh 网状网络与 SSH 互联互通：

| 主机节点标识 | 系统与架构 | Tailscale IP / 地址 | 宿主机用户 | 核心职责与独占硬件能力 | 默认工作区映射 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`mac`** (Mac Studio) | macOS arm64 (Darwin) | `100.84.124.71` | `mac` | 前线指挥驾驶舱、Android 模拟器、Xcode/iOS 模拟器、Node 24、brew | `/host-workspace` |
| **`cwall`** | Ubuntu 24.04 x86_64 | `100.118.232.61` (`192.168.31.90`) | `cw` | 高性能算力节点 (NVIDIA RTX 4090 GPU、376GB 内存)，重型计算与模型推理 | `./workspace` ➜ `/root/workspace` |
| **`aja-pc`** | Ubuntu 24.04 x86_64 | `100.101.22.109` | `beye` | 文旅交付与业务中台 (`wenlv-next` 等业务项目交付) | `./workspace` ➜ `/root/workspace` |
| **`tc-coolie-claw`** | Ubuntu 24.04 x86_64 | `62.234.59.180` | `ubuntu` | 生产服务器，承载 coolie 控制面系统服务 (`systemctl status coolie`) | `./workspace` ➜ `/root/workspace` |

## 2. Hermes 远程派活与多宿主机调度中枢 (Hermes Multi-Host Dispatch)
1. **调度中枢生态位**：
   - Hermes 作为交付工厂与匠人团队的调度决策中枢，统筹协调底层 7 工具池 (`agy`, `claude-glm`, `claude-mm`, `cmd`, `copilot`, `kiro-cli`, `hermes`)。
2. **远程派活与执行通道**：
   - **全端透明命令**：所有宿主机终端已全局注册 `agy` 命令，底层统一透明委托给本地运行的 `agy-ubuntu-container` 容器；
   - **远程派单语法**：通过 Tailscale SSH 或宿主机 SSH 直接派单，例如：
     ```bash
     ssh aja-pc 'cd ~/workspace/zhuangyuan/agy-ubuntu/workspace/wenlv-next && agy -p "任务描述"'
     ssh cwall 'cd ~/workspace/agy-ubuntu/workspace/townwenlv && agy -p "任务描述"'
     ssh tc-coolie-claw 'cd ~/workspace/agy-ubuntu/workspace && agy -p "任务描述"'
     ```
   - **长文本与中文安全传输**：遇到复杂 Prompt 统一采用 base64 编码或写入临时文件后执行，规避终端 argv 字符集替换陷阱。
3. **工作区自治与挂载纪律**：
   - 各 Linux 宿主机（cwall, aja-pc, tc-coolie-claw）的容器工作区统一严格对齐为 **`/root/workspace`**（宿主机 `./workspace:/root/workspace`）；
   - 各宿主机拥有专属独立的业务项目，**严禁跨宿主机随意拷贝代码**，尊重每台机器现有的目录结构与版本基线。

## 3. 宿主机穿透调用全局命令：`host-exec`
- **全局命令**：系统已全局安装 `host-exec`（位于 `/usr/local/bin/host-exec` 及 `/root/.local/bin/host-exec`）。
- **自适应机制**：
  - 自动根据容器网关与用户探测目标宿主机（支持 Mac、cwall、aja-pc、tc-coolie-claw）；
  - 自动完成工作区路径反向映射（容器内路径反向转换为宿主机真实物理路径）；
  - 自动管理与复用 SSH ControlMaster 高速连接；
  - 容器内遇到宿主机独占硬件工具（模拟器、显卡 `nvidia-smi`、系统服务 `systemctl`、宿主机专有环境）统一使用 `host-exec "<cmd>"` 执行。

## 4. 统一 Git 资产同步铁律 (Git as Single Source of Truth)
- **唯一真理源**：`agy-ubuntu` 容器沙盒工具链与环境配置统一由代码仓库 **`git@github.com:xaicd/agy-ubuntu.git`**（或 HTTPS 源）管理；
- **全端同步原则**：所有主机（Mac、cwall、aja-pc、tc-coolie-claw）的配置与脚本演进，必须统一提交推送到 Git 仓库主分支后，在各端执行 `git pull` 同步生效，杜绝手动零散 scp。
