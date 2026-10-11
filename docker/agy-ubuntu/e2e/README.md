# e2e/ — agy-ubuntu:e2e 镜像的测试与产物目录

挂在容器内 `/root/workspace/e2e/`,宿主对应 `./workspace/e2e/`。

## 子目录

| 目录 | 内容 |
|------|------|
| `smoke/` | 冒烟测试源码(本目录) |
| `reports/` | playwright HTML 报告 + junit xml |
| `videos/`  | playwright `.webm` 视频 |
| `traces/`  | playwright `trace.zip`(用 https://trace.playwright.dev 打开) |
| `recordings/` | agent-device record/replay 产物 + `device-info.json` |
| `screenshots/` | `agy-e2e screenshot` + adb screencap 输出 |
| `artifacts/` | playwright test-results,其他附件 |

## 冒烟流程

```bash
# 进入 agy-ubuntu-e2e 容器
docker exec -it agy-ubuntu-e2e bash

# 一次性跑全部冒烟(Playwright + Android + agent-device)
cd /root/workspace/e2e
npm run smoke:all

# 或分步
pw-init.sh                                   # Playwright 三引擎
start-emulator.sh && adb-status.sh           # 启动 emulator
node smoke/agent-device-smoke.mjs           # agent-device
```

## 加新测试

- Playwright:`smoke/*.spec.ts`,`@playwright/test` 直接支持
- agent-device:`import { AgentDevice } from 'agy-e2e-bridge'`
- adb:`adb shell ...` / `agy-e2e shell ...`

所有产物落 `/root/workspace/e2e/` 下的对应子目录,自动 bind 到宿主。