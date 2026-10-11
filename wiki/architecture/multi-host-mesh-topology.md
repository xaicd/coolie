# 多宿主机物理网络拓扑与 Hermes 远程派活架构 (Multi-Host Mesh Topology)

## 1. 四节点物理环境网络拓扑 (Node Topology)

| 主机节点标识 | 操作系统与架构 | Tailscale IP / 地址 | 宿主机用户 | 核心职责与硬件能力 | 默认工作区挂载 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`mac`** (Mac Studio) | macOS arm64 (Darwin) | `100.84.124.71` | `mac` | 前线指挥驾驶舱、Android 模拟器、Xcode/iOS 模拟器、Node 24、brew | `/host-workspace` |
| **`cwall`** | Ubuntu 24.04 x86_64 | `100.118.232.61` (`192.168.31.90`) | `cw` | 高性能算力节点 (NVIDIA RTX 4090 GPU、376GB 内存)，重型计算与模型推理 | `./workspace` ➜ `/root/workspace` |
| **`aja-pc`** | Ubuntu 24.04 x86_64 | `100.101.22.109` | `beye` | 文旅交付与业务中台 (`wenlv-next` 等业务项目交付) | `./workspace` ➜ `/root/workspace` |
| **`tc-coolie-claw`** | Ubuntu 24.04 x86_64 | `62.234.59.180` | `ubuntu` | 生产服务器，承载 coolie 控制面系统服务 (`systemctl status coolie`) | `./workspace` ➜ `/root/workspace` |

## 2. Hermes 远程派活与多宿主机调度中枢 (Hermes Multi-Host Dispatch)

1. **调度中枢生态位**：
   - Hermes 作为交付工厂与匠人团队的调度决策中枢，统筹协调底层 7 工具池 (`agy`, `claude-glm`, `claude-mm`, `cmd`, `copilot`, `kiro-cli`, `hermes`)。
2. **全端透明执行通道**：
   - 所有宿主机终端均已全局注册 `agy` 命令，底层统一透明委托给本地运行的 `agy-ubuntu-container` 容器；
   - 远程派单语法示例：
     ```bash
     ssh aja-pc 'cd ~/workspace/zhuangyuan/agy-ubuntu/workspace/wenlv-next && agy -p "任务描述"'
     ssh cwall 'cd ~/workspace/agy-ubuntu/workspace/townwenlv && agy -p "任务描述"'
     ssh tc-coolie-claw 'cd ~/workspace/agy-ubuntu/workspace && agy -p "任务描述"'
     ```
   - 复杂或中文 Prompt 建议通过 base64 或临时文件传递，避免 argv 编码问题。
3. **工作区挂载纪律**：
   - 各 Linux 宿主机（cwall, aja-pc, tc-coolie-claw）的容器工作区统一对齐为 **`/root/workspace`**（宿主机 `./workspace:/root/workspace`）；
   - 尊重各宿主机业务自治，严禁跨宿主机随意拷贝代码。

## 3. 双向穿透与统一同步

- **容器反向调用宿主机**：使用 `host-exec "<cmd>"`，自适应探测宿主机网关并反向映射工作路径；
- **环境演进单一真理源**：统一依托 `git@github.com:xaicd/agy-ubuntu.git`，所有脚本与全局规则演进统一走 Git push/pull 同步。
