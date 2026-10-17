# ADR-004: Hermes 多宿主机网状拓扑调度与 host-exec 穿透调用机制

- **状态**: 已接受 (Accepted)
- **决策人**: Hermes (PM 掌柜), 墨斗 (前线架构师 FDA), 兑底渊 (PRE-SRE)
- **决策日期**: 2026-10-07
- **归属规范**: CMMI 03_design (TS) / .agents/skills/adr-architect / .agents/skills/local-team-toolchain

---

## 1. 背景与问题陈述 (Context and Problem Statement)
Coolie 交付工厂的算力与硬件资源高度异构分布在多台物理主机上：
- `mac` (Mac Studio): 承载前线指挥舱、Xcode 与 Android 原生模拟器；
- `cwall`: 承载 NVIDIA RTX 4090 显卡与 376GB 内存，专注模型推理；
- `tc-coolie-claw`: 承载线上生产环境与 systemd 控制面服务；
- `aja-pc`: 承载文旅等现场中台交付。
数字员工运行于隔离容器 (`agy-ubuntu-container`) 中，直接调用宿主机独占硬件（模拟器、GPU、系统服务）面临物理屏障。

---

## 2. 考虑的候选方案 (Considered Options)
- **方案 A (采纳)**: **Tailscale Mesh 网状网络 + Hermes 透明派单 + 全局自适应 `host-exec` 宿主机穿透调用**。
- **方案 B**: 在每台物理机上各自独立搭建完整重复环境。
- **方案 C**: 放弃容器隔离，直接在宿主机裸机运行 Agent。

---

## 3. 决策结果 (Decision Outcome)
**选用方案 A**。
- **网状互联**: 各节点基于 Tailscale IP 互联互通，使用 SSH ControlMaster 高速复用连接；
- **宿主机穿透**: 容器内全局安装 `host-exec`，自适应网关自动识别目标宿主机并反向映射工作区路径；遇到移动模拟器截屏、GPU 推理或系统服务重启统一使用 `host-exec "<cmd>"`；
- **长文本传输**: 复杂 Prompt 与代码统一采用 Base64 编码传输，规避 Bash argv 字符集乱码陷阱。
