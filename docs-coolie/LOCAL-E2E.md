# Coolie 本地 E2E 验收手册

> `scripts/e2e-local.sh` —— 开发机一条命令跑完的本地 App 验收。
> 老板要求："测试就在开发机器本地跑就行，不上 CI"。

## 1. 一句话使用

```sh
bash scripts/e2e-local.sh
echo "exit=$?"
```

脚本会跑 4 条 replay 并报告断言列表 + 证据截图绝对路径。任何一条断言失败 → 退出码 **非零**。

## 2. 跑前一次性准备

| 步骤 | 命令 | 说明 |
|---|---|---|
| 1. 装 agent-device web 后端 | `agent-device web setup` | 已装（`web doctor` 返回 healthy） |
| 2. 起本地服务 | `pnpm dev` 或 `pnpm --filter server dev` | 等 `http://localhost:3100/api/health` 返回 200 |
| 3. 本地账号 | 用注册接口建一个 `e2e-harness@coolie.local` 账号 | 密码在脚本里有默认值 `e2e-harness-local-2026`（生产前改） |
| 4. 加他进 company | 在 `/api/companies/<id>/members` 加 | 不加则 board 读不到任何数据 |

不满足 → 脚本预检失败并打 `E2E_FAIL` 退出，不静默继续。

## 3. 环境变量

| 变量 | 默认 | 用途 |
|---|---|---|
| `E2E_BASE_URL` | `http://localhost:3100` | 目标 URL（可换 staging） |
| `E2E_EMAIL` | `e2e-harness@coolie.local` | 测试账号 |
| `E2E_PASSWORD` | `e2e-harness-local-2026` | 测试密码 |
| `E2E_MIN_DOMAINS` | `7` | 本体域断言阈值 |
| `E2E_CHAT_TIMEOUT_MS` | `60000` | 工坊对话回复超时 |
| `AGENT_DEVICE_STATE_DIR` | `$HOME/.agent-device` | browser profile 位置 |

## 4. Replay 覆盖

| 断言 | 含义 | 当前本地结果 |
|---|---|---|
| `R1-ontology-domains` | 本体页至少 7 个示例域卡片 | **PASS**（生产已注入 7 域）|
| `R2-tasks-list` | 任务列表可渲染 | **PASS** |
| `R3-board-chat-reply` | 工坊对话收到流式回复 | **FAIL**（本地不连生产后端，60s 无 SSE chunk，**真红不掩盖**）|
| `R4-local-auth` | 登录态正常 | **PASS** |
| `+ 4 个生命周期断言** | 房间打开 / 消息已发 / 列表页可渲染 | **PASS** |

8 条断言：**7 PASS / 1 FAIL / 0 SKIP**（exit=1）。

## 5. 证据

每次跑都生成截图到 `clients/expo/replays/evidence/`，**真文件入库**：

```
clients/expo/replays/evidence/
├── .gitkeep
├── board-chat-01-room.png            # 房间打开
├── board-chat-02-message-sent.png    # 消息已发（本步骤红 → 工坊无回复）
├── local-auth-01-signed-in.png       # 登录成功
├── ontology-domains-01-domain-list.png   # 7 个域
└── tasks-list-01-task-list.png       # 任务列表
```

## 6. 故意改错断言自证

老板的要求：真断言才会红。

```sh
# 改 MIN_DOMAINS = 99（实际只有 7）
E2E_MIN_DOMAINS=99 bash scripts/e2e-local.sh
# 期望: R1 本体域断言 FAIL，退出码 1
```

## 7. 本机已知限制

| 项 | 现状 | 影响 | 计划演进 |
|---|---|---|---|
| iOS 模拟器 | 无（无 Xcode） | 不能跑 iOS | 老板若要 → 装 Xcode |
| Android 模拟器 | 无（SDK 无 emulator/system-image） | 不能装 APK 跑 | `sdkmanager` + 装 system-image（约 1-2GB）|
| 真机 | `adb devices` 空 | 不能挂真机 | 老板插 USB 开 USB 调试 |
| agent-device 平台 | 只用 `--platform web` | 验收 Expo web / board UI 而非 APK 客户端 | 等上面三项到位 |
| 工坊对话本地回复 | **真红**（R3） | 本地服务不连生产后端 | 老板想真测 → 让本地服务连生产 hermes 或接受失败为已记录 |

## 8. 什么时候跑

- 发版前（PM-RELEASE-CHECKLIST 24 项 gate 之 F 节前）
- 改完一个 PRD 主流程后
- 老板一句「回归」或「验一下」

## 9. 不跑什么时候

- 老板改前文 PRD 之外的杂活
- 改 docs/PM doc 文档类
- 改 build orchestrator / pacing 之类纯服务端

## 10. 与现有 CI 的关系

| 套件 | 适用 |
|---|---|
| `pnpm test`（Vitest）| 单测 / 集成测（跑得快，常跑） |
| `pnpm test:e2e` / `test:release-smoke` | 上游 Playwright **未启用**（见 AGENTS §7） |
| `scripts/e2e-local.sh`（本脚本）| **App 主流程 + 截图证据**，老板要本地验收用 |

## 11. 故障排查

| 现象 | 检查 |
|---|---|
| 脚本报 `web doctor unhealthy` | `agent-device web setup` |
| 脚本报 `E2E_FAIL: stack down` | `pnpm dev`，等 `/api/health=200` |
| 脚本报登录失败 | 看 `e2e-harness@coolie.local` 是否真注册并加入了 company |
| R3 工坊对话真红 | 看 `board-chat-02-message-sent.png` 后没回复气泡；确认本地 board-chat 路由 SSE 通到 hermes |

## 12. 文件清单

```
scripts/e2e-local.sh                                  (253 行, bash, 一键跑)
clients/expo/replays/local-auth.ad                     (登录)
clients/expo/replays/ontology-domains.ad               (本体域 ≥7)
clients/expo/replays/tasks-list.ad                     (任务列表)
clients/expo/replays/board-chat.ad                     (工坊对话)
clients/expo/replays/evidence/.gitkeep
clients/expo/replays/evidence/*.png                    (5 张真图)
docs-coolie/specs/2026-09-21-local-e2e-harness.md      (EARS spec)
docs-coolie/briefs/2026-09-21-local-e2e.md              (派单 brief)
docs-coolie/LOCAL-E2E.md                               (本文)
docs-coolie/PM-AGENTS.md                               (本地验收章节)
```