# Spec: Local E2E Harness for Coolie App (agent-device)

- 日期：2026-09-21
- 提出人：老板（weixin）
- PM：Hermes（掌柜）
- 状态：READY FOR DISPATCH

## 1. 背景

老板要求：**测试就在开发机本地跑，不依赖 CI**。用 agent-device 在本地验收 Coolie App。

现状（PM 2026-09-21 实测）：

| 项 | 状态 |
|---|---|
| `agent-device` CLI | ✅ 已装 `/opt/homebrew/bin/agent-device`（69 commands） |
| `agent-device devices` | ⚠️ 空（无任何可用设备） |
| iOS 模拟器 | ❌ 无（`xcrun simctl` 不可用，本机只有 CommandLineTools，无 Xcode） |
| Android SDK | ⚠️ `/Users/mac/android-sdk` 有 build-tools/platform-tools/ndk/platforms，但**无 emulator、无 system-images** |
| `adb devices` | ⚠️ 空（无真机连接） |
| agent-device web 后端 | ❌ `agent-device web doctor` → `TOOL_MISSING: Managed web browser backend is not installed` |
| `clients/expo/replays/coolie-flow.ad` | ⚠️ 存在但在 `agent-device/e2e-ios` 分支，且 `open cloud.coolie.app`（**域名错**，生产是 xrobinai.cn） |
| `clients/expo` web 支持 | ⚠️ 有 `"web": "expo start --web"` 脚本，但 package.json 无 `react-native-web` / `react-dom` |

结论：**当前本机无法验收 App**。缺的是「本地可跑的验收底盘」，不是 CI。

## 2. User Stories

1. **作为 PM**，我想在开发机一条命令跑完 App 核心流程验收，这样发版前 24 项 gate 里有真信号（而不是只有 commit message）。
2. **作为匠人**，我想改完代码本地立刻验，这样不用等 CI、不用等老板手装 APK。
3. **作为老板**，我想看到**可复现的证据**（截图 + 断言输出），这样验收结论可信。

## 3. Acceptance Criteria (EARS)

### 3.1 底盘可用性

- WHEN PM 在仓库根目录执行 `scripts/e2e-local.sh`，THEN 脚本 SHALL 自动拉起所需本地服务（若未运行）、执行 replay、输出断言结果与证据路径，并 SHALL 以非零退出码表示失败。
- WHEN 执行 `agent-device web doctor`，THEN 输出 SHALL 为已安装/健康（非 `TOOL_MISSING`）。
- IF 本地服务未就绪（如 `http://localhost:3100/api/health` 不通），THEN 脚本 SHALL 明确报错并给出启动命令，且 SHALL NOT 静默继续。

### 3.2 验收覆盖面（至少 3 条主链路，均需断言）

- WHEN 打开本体页，THEN 断言 SHALL 校验示例域卡片数量 ≥ 7（当前生产已注入 7 域）。
- WHEN 打开任务页，THEN 断言 SHALL 校验任务列表可渲染且非空（或明确空态文案）。
- WHEN 打开工坊对话并发送一条文本，THEN 断言 SHALL 校验**收到流式回复**（回复气泡文本长度 > 0 / SSE chunk 到达），不是只截图。
- WHERE 本机无 emulator/真机，THEN 验收 SHALL via agent-device `--platform web`（Expo web 构建或看板 UI `localhost:3100`），且此限制 SHALL 在报告里明写。

### 3.3 证据与可追溯

- WHEN 任一断言失败，THEN replay SHALL 截图保存到 `clients/expo/replays/evidence/` 并 SHALL 在 stdout 打印失败断言原文。
- WHEN 一次验收跑完，THEN 产物 SHALL 包含：断言清单 + 通过/失败计数 + 证据文件绝对路径。

### 3.4 不回归

- WHILE 运行 E2E，THEN 现有 `pnpm test` / `pnpm -r typecheck` SHALL 保持通过。
- IF 需要新增依赖（`react-native-web`、`react-dom` 等），THEN SHALL 只加在 `clients/expo/package.json`（或 ui/），且 SHALL NOT 影响生产 APK 体积与 runtimeVersion。

## 4. 边界 / Out of Scope

- ❌ iOS 模拟器（本机无 Xcode，装 Xcode 不在本任务内）
- ❌ 云端设备 farm / BrowserStack
- ❌ CI 化（GitHub Actions）——老板明确"本地跑就行"
- ❌ 替换现有 `pnpm test:e2e` / `test:release-smoke`（只加"本地 App 验收"这一层）
- ❓ Android emulator + 真 APK 验收（列为可选 Track 2：需 `sdkmanager` 装 emulator + system-image，约 1-2 GB 下载；由 PM 决定是否演进）

## 5. 文件范围（白名单）

- `scripts/e2e-local.sh`（新建）
- `clients/expo/replays/*.ad`（新建/重写）
- `clients/expo/replays/evidence/.gitkeep`（新建）
- `clients/expo/package.json`（仅加 web 运行依赖；不改 version）
- `docs-coolie/LOCAL-E2E.md`（新建，使用说明）
- `docs-coolie/PM-AGENTS.md`（补一节"本地验收"）
- `.agents/skills/`（如需新增 e2e skill，必须 `git add -f`）

## 6. 不动项

- `AGENTS.md`（上游 paperclip 的，245 行）
- `clients/expo/android/**`（gitignored，prebuild 输出）
- 版本号（app.json / package.json version / android versionCode）
- 生产服务端配置、COS、OTA manifest
- `ui/src/**` 的 token 规则（若动 ui，必须跑 `pnpm check:token-gates`）

## 7. 验收 gate（本任务子集）

- [ ] `scripts/e2e-local.sh` 本地实跑一次，贴出真实 stdout（断言计数 + 证据路径）
- [ ] 至少 3 条主链路有断言，且**故意把一条断言改错能复现失败**（证明断言真的在验）
- [ ] `pnpm -r typecheck` 0 错误
- [ ] `agent-device web doctor` 健康
- [ ] 证据截图文件真实存在（`ls -la` 输出贴回）
- [ ] commit message 引本 spec 路径
- [ ] 报告里明写"web 平台代替真机"的限制与后续演进路径
