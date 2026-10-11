# agy-ubuntu

Ubuntu 24.04 沙盒开发容器:内嵌 **Mihomo (Clash Meta) TUN** 全流量隔离 + 预装 **Google Antigravity CLI (`agy`)**。

- 100% 内部流量经 `clash0` TUN 虚拟网卡走代理
- 完全隔离于宿主机网络(默认 bridge,非 `--network host`)
- DNS 劫持(`resolv.conf → 127.0.0.1 → mihomo`)
- 预装 **Node.js 22 LTS**(npm/npx)+ **pnpm**,可直接开发 Next.js

## 快速开始

```bash
# 方式 A: 全自动一键部署 (推荐 - 适用于任意 Linux / macOS 宿主机)
bash scripts/setup-host-agy.sh

# 脚本会自动:
# 1. 检查 Docker 与 TUN 环境
# 2. 自动配置宿主机回环 SSH 信任 (激活容器内 host-exec 穿透能力)
# 3. 安装宿主机全局 agy 命令行包装器 (~/.local/bin/agy)
# 4. 启动容器并执行健康拨测

# 方式 B: 手动标准启动
# 1. 配置订阅(必填)
cp .env.example .env
# 编辑 .env,填入你的 mihomo 订阅链接(CLASH_URL)

# 2. 启动(自动拉取 Docker Hub 镜像 chw717/ai-agy:latest,无需本地构建)
docker compose up -d
```

## 宿主机像原生一样使用 `agy` (透明容器化)

运行 `bash scripts/setup-host-agy.sh` 后，宿主机已全局注册 `agy` 命令：
- **任意工程目录交互**: 在宿主机任意项目目录下直接输入 `agy`，自动在容器对应工作目录打开会话。
- **命令行任务**: `agy -p "用中文总结该项目结构"`
- **数字员工免交互**: `agy --dangerously-skip-permissions -c`
- **容器反向调用宿主机**: 容器内执行 `host-exec "<cmd>"` 可无缝穿透回当前宿主机执行系统工具。


## 共享 git / SSH

宿主机 `~/.gitconfig`(身份)与 `~/.ssh`(SSH 密钥)会自动挂载进容器,容器内可直接 `git commit` / `git push`:

- 身份沿用宿主机配置(user.name / user.email)
- GitHub HTTPS 远程自动重写为 SSH(走 `ssh.github.com:443`,无需 PAT)
- 密钥在容器内已修正权限(chmod 600)

## 构建说明

镜像已发布到 **Docker Hub**(`chw717/ai-agy:latest`),`docker compose up -d` 会自动拉取,**无需本地构建**。

只有需要本地重新构建时(`docker compose up -d --build`)才需要 `downloads/` 目录——镜像采用**离线构建**:`downloads/` 存放预下载产物(mihomo 二进制、agy 二进制、apt 的 .deb 包),构建过程不联网。`downloads/` 未纳入 git,克隆后一键准备:

```bash
bash prepare-downloads.sh        # 默认走 127.0.0.1:7890 代理
PROXY= bash prepare-downloads.sh # 直连(不代理)
```

脚本会下载:

- `downloads/mihomo` — mihomo v1.19.30+ Linux amd64(需支持订阅中的 `anytls` 协议)
- `downloads/agy.tar.gz` — agy CLI(内含 `antigravity` 二进制,自动校验 sha512)
- `downloads/node.tar.gz` — Node.js 22 LTS Linux x64(自带 npm/npx)
- `downloads/pnpm.tar.gz` — pnpm standalone 单文件可执行
- `downloads/debs/*.deb` — 基础工具的完整依赖闭包(98 个,通过 WSL Ubuntu 解析)

### 订阅(base64)

订阅通常是 **base64 编码的 URI 列表**(非 YAML),entrypoint 用 mihomo 的 `proxy-providers` 自动拉取解码,无需手动处理。

### 节点与地域

Gemini / Google AI 对**香港、澳门、俄罗斯**等地区不提供支持。代理组为 **fallback 按序故障转移**(不用 url-test——延迟轮盘会随机选中不合规出口),`filter` 只放行 **日本 / 智利 / 台湾**,`exclude-filter` 硬排除 **香港 / 澳门 / 新加坡 / 美国档 / 1X 边缘加速**。健康检查用 `http://www.google.com` 且期望 200:被判香港的出口会 302,检查失败自动跳过。

> 注意一:不能只看第三方 IP 库。该订阅的 `新加坡01/02/03`(出口 `152.175.66.x`)在 ip-api / ipinfo 上都显示 `SG`,但 **Google 判为香港**——`curl http://www.google.com` 会 302 到 `google.com.hk?pref=hkredirect`,Gemini 会报地区不支持。HTTP 状态码(200/204)看不出来,判定地区请看重定向:
> ```bash
> curl -s -o /dev/null -w '%{redirect_url}\n' http://www.google.com   # 出现 google.com.hk 即不合格
> ```
>
> 注意二(2026-09-26 实测):该订阅**全部"美国"档**(1X/3X/10X,出口 OVH `40.160.x.x` 等)被 Google 判为不支持地区——ip-api 显示 US Oregon、google.com 也不重定向,但 `daily-cloudcode-pa.googleapis.com` 的 generateContent 一律报 `FAILED_PRECONDITION: User location is not supported`。同日逐节点实测 **日/台/智全通**,故美国档整体排除。终极判定探针就是 agy 本身:`agy --print "只回复:ok"`。

### 启动自检与降级兜底

entrypoint 启动后额外做两件事,专治「容器明明起来了、`curl` 却只回 `Empty reply from server`」这类隐性断网:

- **入口域名存活自检**:抽取订阅内所有节点的 `server` 域名,经 mihomo `/dns/query` 做**真实**解析(系统 `getent` 在 fake-ip 模式下对任何域名都返回 `198.18.x` 假 IP,看不出问题)。若全部 NXDOMAIN(机场域名被注册商 `clientHold`/停权,或已轮换入口域名),会打印 ❌ 致命告警并给出处置建议,而不是静默失败。可随时手动体检:
  ```bash
  bash scripts/check-proxy-health.sh            # 宿主机:自动 docker exec 转发
  ```
  退出码:`0` 正常 / `2` 入口域名全挂 / `3` 节点文件缺失。
- **合规降级兜底**:代理组为 `PROXY → [PROXY-GEO → PROXY-RESCUE]`。正常走 GEO(日/智/台/美,以 entrypoint 的 `filter` 为准);仅当 GEO 内节点全部不可用(入口域名失效或健康检查全挂)时,外层 fallback 才自动降级到 RESCUE —— RESCUE 收进订阅全部节点,靠 `google.com` 期望 200 的健康检查自动淘汰被 Google 锁区的出口,尽量保住「有网可用」(可能落到被 Google 判为不支持地区的出口,属降级可用)。

### 订阅入口域名失效时的本地兜底

机场会轮换入口域名。**2026-10-10 实测**:该订阅的入口域名 `qianmo.org` 被注册商置于 `clientHold`(`.org` 注册局 RDAP 可查,全局 NXDOMAIN),而面板仍对所有客户端下发该域名 —— 于是**订阅里全部节点都拨不通**,容器侧只表现为 `curl: Empty reply from server`。同一订阅在宿主机还能用,只是因为宿主机客户端缓存的是旧快照(入口域名不同,如 `node.yukoupaper.com`、`*.qianmoip.win` 仍可解析)。

兜底办法:用 `scripts/export-nodes-linux.sh` 从宿主机 clash 配置里挑出**当前仍可解析**的节点,导出为 `mihomo-conf/proxies-static.yaml`(该目录已被 `.gitignore` 忽略,不会泄露凭据):

```bash
bash scripts/export-nodes-linux.sh                                     # 自动探测源配置
bash scripts/export-nodes-linux.sh ~/clashctl/resources/runtime.yaml   # 显式指定源
```

脚本要点:

- **只保留入口能解析出真实 A 记录的节点** —— 判定用的是容器内 mihomo 的同款 nameserver(`223.5.5.5`/`114.114.114.114`),而非系统解析器;否则悬空 CNAME(如 `node.yukoupaper.com` 只 CNAME 到 CloudFront 却无 A)会被误判为可用,导进去照样拨不通。
- 规范化节点名:去掉 `【1x】`/`[边缘加速]` 等会被 `exclude-filter` 挡在 GEO 外的标记,并追加 `[<入口标签>]` 防重名。
- 导出后对运行中的容器热刷新 `local` provider(`PUT /providers/proxies/local`),无需重启、不碰 TUN。

entrypoint 启动时若检测到该文件(`-f`),会把它作为额外的 `local` provider **排在订阅之前**并入 `PROXY-GEO` 与 `PROXY-RESCUE` —— 订阅入口域名失效时 mihomo 启动即选中可用节点,不必等健康检查逐个淘汰死节点(否则启动后一段时间连接会卡 `i/o timeout`)。机场恢复入口域名后删除该文件即可回到纯订阅模式。

> ⚠️ 坑(2026-10-10 实测):`docker-compose.yml` 以**文件**方式 bind-mount 该路径,若宿主机上该文件**不存在**,Docker 会在挂载点自动建一个**空目录**。此时 entrypoint 的 `-f` 判断落空 → `local` provider 静默不接 → 兜底形同虚设,容器侧仍只报 `curl: Empty reply from server`,极难排查。现 entrypoint 会在该路径存在但**不是普通文件**时打印显式告警。修复:先在宿主机 `scripts/export-nodes-linux.sh` 生成文件(会覆盖那个空目录前先 `rmdir`),再 `docker compose up -d --force-recreate` 让挂载重新解析为文件。

## 版本标签与回滚

`latest` 标签每次构建都会被覆盖,无法回滚。为此提供 `build.sh`:本地构建时自动额外打一个**日期标签** `chw717/ai-agy:<YYYYMMDD>`,历史版本得以保留:

```bash
bash build.sh                       # 构建 + 打当天日期标签 + 启动
DATE_TAG=20260826 bash build.sh     # 指定日期(默认今天)
```

回滚到某天的镜像:

```bash
docker tag chw717/ai-agy:20260826 chw717/ai-agy:latest
docker compose up -d
```

查看所有历史版本:`docker images chw717/ai-agy`。旧镜像在未 `docker image prune` 前,也可按 image ID 找回。

## 环境依赖

- Docker Desktop(需 `/dev/net/tun` + `NET_ADMIN` capacity)
- 若容器出网大文件传输异常,需将 daemon `mtu` 调低(本机为 1400,见 `daemon.json`)

## E2E / 自动化测试镜像(`agy-e2e`)

基础 `agy-box` 镜像**完全不变**,E2E 能力由独立镜像 `chw717/ai-agy:e2e` 提供,构建自 `Dockerfile.e2e`,由 `docker-compose.e2e.yml` 编排。两个 image 不互相影响:

| 镜像 | 文件 | 适用场景 |
|------|------|---------|
| `chw717/ai-agy:latest` | `Dockerfile` | 只跑 `agy` / Node / pnpm(默认) |
| `chw717/ai-agy:e2e` | `Dockerfile.e2e` | 跑 Playwright / agent-device / Android emulator(12.3GB,raw 镜像) |
| `chw717/ai-agy:e2e-slim` | `Dockerfile.e2e` | 同上,**9.8GB 瘦身版**(system/vendor.img 压缩 qcow2 + dpkg 层优化;emulator boot 实测兼容) |

> slim 与 e2e 功能完全一致;system.img / vendor.img 从 raw ext4 转为压缩 qcow2(3.3G→1.5G),Android 模拟器原生支持 qcow2,boot 验证通过(软件模式 ~530s,有 KVM 更快)。本地构建默认产出 slim 版:`docker build -f Dockerfile.e2e -t chw717/ai-agy:e2e-slim --provenance=false .`

### 准备离线产物(只在首次/升级时需要)

```bash
# 默认下载全部(包括 E2E 产物,首跑 ~15-30 分钟)
bash prepare-downloads.sh

# 只下载基础镜像产物(更快)
SKIP_E2E=1 bash prepare-downloads.sh

# 调参
JDK_VERSION=17.0.13 bash prepare-downloads.sh
ANDROID_API=30 bash prepare-downloads.sh
PLAYWRIGHT_VERSION=1.49.0 bash prepare-downloads.sh
AGENT_DEVICE_VERSION=latest bash prepare-downloads.sh
```

### 构建并启动

```bash
# 基础镜像(零变化)
docker compose up -d --build

# E2E 镜像
docker compose -f docker-compose.e2e.yml up -d --build
docker exec -it agy-ubuntu-e2e bash

# 或本地构建 + 日期标签(可选,bash build.sh 默认只构建基础镜像)
E2E_BUILD=1 bash build.sh    # 同时构建 e2e 镜像,打 :e2e-<日期> 标签
```

### KVM / Android emulator

预装组件(离线直下,非 sdkmanager):platform-tools 37.0.1、emulator 37.2.8(build 16259959)、system-image API 30 google_apis x86_64 r10、Temurin JDK 17。SDK 组件目录带手工生成的 `package.xml`,`avdmanager create avd` 已实测可用。

```bash
# 在容器里检查 KVM
ls -la /dev/kvm
# 有设备文件 → emulator 硬件加速(冷启动 1-3 分钟)
# 无设备文件 → emulator 软件模式(冷启动 5-10 分钟,部分功能不稳)

# 手动启停
start-emulator.sh                  # 创建 AVD + 启动 + 等 sys.boot_completed
adb-status.sh                      # 一键状态报告

# 自动启动(在 .env 设 E2E_AUTOSTART_EMULATOR=1)
```

**Windows + WSL2 注意事项:**WSL2 默认不暴露 `/dev/kvm` 给嵌套容器;若 `ls -la /dev/kvm` 没东西,在 BIOS 开 nested virtualization 并重启 Docker Desktop。仍不可用时,emulator 会自动降级到 `-accel off -gpu swiftshader_indirect`。

### Playwright 三引擎

```bash
pw-init.sh                          # 首跑自动 npm install(@playwright/test),之后直接跑
# 产物:/root/workspace/e2e/{reports,videos,traces,artifacts}
```

浏览器二进制(chromium 1148 / firefox 1466 / webkit 2104,对应 playwright 1.49.0)已预装在镜像 `/root/.cache/ms-playwright/`,无需 `playwright install`。

> **webkit 说明**:WPE 后端在无显示环境会断言崩溃(WPEBackend-fdo 是 wayland-only),镜像已把 `pw_run.sh` 的 headless 分支改走 GTK 后端,并由 entrypoint 常驻 `Xvfb :99`(浏览器自动使用,无需手动配置)。

### agent-device(CLI + Node API 桥接 + 包装命令)

```bash
agy-e2e devices                     # 列出 adb 设备
agy-e2e info                        # 当前设备信息
agy-e2e tap 540 1200                # 模拟点击
agy-e2e swipe 100 200 500 600 300   # 模拟滑动
agy-e2e type "hello world"          # 模拟文本输入
agy-e2e screenshot home             # 截图 → /root/workspace/e2e/screenshots/
agy-e2e record start demo           # 开始录制
agy-e2e record stop                 # 停止录制(产物落 ./workspace/e2e/recordings/)
agy-e2e replay <path>          # 回放录制
agy-e2e wait-boot                   # 等 sys.boot_completed=1

# Node API
node -e 'import("agy-e2e-bridge").then(async ({AgentDevice}) => {
  const ad = new AgentDevice({ deviceId: "emulator-5554" });
  await ad.shell("input keyevent KEYCODE_HOME");
  console.log(await ad.info());
})'
```

### 产物布局

`/root/workspace/e2e/`(自动 bind 到宿主 `./workspace/e2e/`):

```
reports/
  playwright-html/        # playwright HTML report(浏览器打开 index.html)
  junit/results.xml       # junit xml
videos/                   # *.webm
traces/                   # trace.zip(用 https://trace.playwright.dev 看)
recordings/               # agent-device 录制 + device-info.json
screenshots/              # 通用截图
artifacts/                # playwright test-results,其他附件
smoke/                    # 冒烟脚本(源码)
```

### 镜像体积

| 镜像 | 大小(估) |
|------|----------|
| `agy-box`(:latest) | ~800 MB |
| `agy-e2e`(:e2e) | +1.5~2.5 GB(Playwright 0.5GB + Android SDK 1.5GB + agent-device 0.1GB + JDK 0.2GB) |

### downloads/ 杂项

早期实验遗留(`crane.exe` / `crane.tar.gz` / `cmdline-tools.zip` / `pw-cli/`)已清理;`downloads/` 只保留 Dockerfile 实际 COPY 的产物(见 `.dockerignore`)。
