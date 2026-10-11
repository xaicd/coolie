# CONTAINER-HOST-ENVIRONMENT.md: 容器环境与 Mac 宿主机协同公理

## 1. 物理环境拓扑与执行感知
- **当前执行环境**：Agent 运行于 Docker 容器中（Ubuntu），物理挂载点为 `/host-workspace/...`。
- **Mac 宿主机映射**：`/host-workspace/*` 对应宿主机 `/Users/mac/workspace/*`。
- **环境能力边界**：
  - **容器内能力**：文件读写、静态代码审查、TypeScript/Node 编译、Git 管理；
  - **宿主机独占能力**：Android 模拟器（`emulator-5554`）、`adb` 交互与真机屏幕截屏、macOS 工具链、SSH 直连生产服务器（`tc-coolie-claw` / `ubuntu@xrobinai.cn`）。

## 2. 宿主机穿透调用全局命令：`host-exec`
- 脚本已全局软链/安装至 `/usr/local/bin/host-exec` 及 `/root/.local/bin/host-exec`（源码位于 `scripts/host-exec.sh`）。
- **执行方式**：
  ```bash
  host-exec "<command>"
  ```
- **支持场景**：
  - `host-exec "adb devices"`
  - `host-exec "adb exec-out screencap -p" > /path/to/screenshot.png`
  - `host-exec "ssh tc-coolie-claw 'systemctl status coolie'"`
  - `host-exec "cd /Users/mac/workspace/xaicd/coolie/clients/expo && bash scripts/publish-ota.sh android"`
- **铁律**：严禁在容器内尝试启动需要 GUI 的模拟器或连接受限的生产 SSH，遇到此类操作统一穿透宿主机执行。
