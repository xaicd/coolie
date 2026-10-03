---
name: app-agent-device-combo-validation
description: 大眼蛙 App agent-device + Playwright 双层组合验证。当需要回归测试移动 App (Flutter+WebView) 或验证新功能在 App 壳+H5 业务全链路时加载。
---

# agent-device + Playwright 双层组合验证 (App 端)

> 适用范围：大眼蛙 Flutter App（`apps/mobile-c-end` / `apps/mobile-merchant`）移动端。
> 验证分层：agent-device 跑 App 壳 + WebView 内 H5（默认能读到 Chromium AccessibilityNodeProvider，无需任何补丁），Playwright 跑浏览器版 H5（速度快、可并发）。
> 权威使用规则见 `AGENTS.md` §28；`docs/guides/app-agent-device-testing.md` 是历史文档。

---

## 0. 何时用本 skill

| 任务 | 工具 |
|---|---|
| **App 壳冒烟**（启动/弹窗/Tab/PopScope/VersionGate/native bridge） | **agent-device** |
| **WebView 内 H5 业务**（金刚区跳转/搜索/列表/详情/登录/支付） | **agent-device**（默认能读 WebView 内容，无需额外配置） |
| **快速浏览器回归**（无 APK 启动开销，可并行） | **Playwright** `e2e/journey/06-cend-mobile-app.spec.ts` |
| **跨浏览器跨设备视觉** | **Playwright** 多个 project |

**不要**做：拿 agent-device 模拟"系统滑动退出"测试（PopScope 不拦普通 back，弹到 launcher 属正确行为）；Playwright 套件若 `journey-fixtures.ts` 用自定义 project，跑主 config 会报 `test.describe unexpected` —— 这是历史 spec 限制，用 agent-device 跑 App 内 H5 业务绕过。

## 1. 一键冒烟 (60s 全链路)

```bash
# 0. 安装（一次性）
npx agent-device doctor   # 应输出 "device: 1 booted"
export PATH="/home/beye/android-sdk/platform-tools:$PATH"

# 1. 重启 App + agent-device open
adb -s emulator-5554 shell am force-stop com.example.mobile_c_end
sleep 2 && adb -s emulator-5554 shell am start -n com.example.mobile_c_end/.MainActivity
sleep 15
npx agent-device open com.example.mobile_c_end --foreground --session cend-smoke

# 2. snapshot -i 拿 35+ 节点 (首页含 10 金刚区)
npx agent-device snapshot -i --session cend-smoke | grep -E "金刚|@e1[0-3]|@e9[0-9]"

# 3. 验证关键业务路径（agent-device click <ref> 触发真机交互；注意：截图严禁落在 $HOME，统一收敛至 test-results/screenshots/）
mkdir -p test-results/screenshots
npx agent-device click @e13 --settle --session cend-smoke    # 精品民宿 → /stays
npx agent-device screenshot test-results/screenshots/cend-stays.png --session cend-smoke

# 4. 切 Tab
npx agent-device click @e98 --settle --session cend-smoke    # 探索 → /explore
npx agent-device click @e100 --settle --session cend-smoke   # 直播 → /live

# 5. 收尾
npx agent-device close --session cend-smoke
```

## 2. 三阶段组合验证工作流

### Phase 1 — agent-device App 壳冒烟
- 启动 → VersionGate 调 `/api/app/version-check` 200 → 不弹窗（已是最新）
- 5 Tab 渲染 + 切换
- PopScope 拦截"系统滑动右滑退出"（注：普通 back 弹到 launcher 属正确）
- Native bridge 注册（`app.checkUpdate` / `app.openExternal` 等）

### Phase 2 — agent-device WebView 内 H5 业务
- agent-device 默认能 snapshot WebView 全部 DOM（inappwebview 自动暴露 AccessibilityNodeProvider）
- 关键路径：
  - 首页 10 金刚区跳转（`精品民宿/共享菜园/课程中心/乡村特产/...`）
  - 搜索（fill `@e11` text-field + click `@e12` button）
  - 列表 + 详情 + 加入购物车
  - 登录表单（手机号 + 密码 + 提交）
  - 个人中心 + 设置 + 关于 + 检查更新（触发 native bridge）
- 远端 log 同时验证（`docker logs qloapps-core-server | grep <endpoint>`）

### Phase 3 — Playwright 浏览器版（CI 并行）
- `e2e/journey/06-cend-mobile-app.spec.ts`（mobile surface 套件）
- 注意：`journey-fixtures.ts` 用了自定义 project，跟主 config 不兼容；如需 CI 集成，需拆 spec

## 3. 关键 ref 规则

- **Refs 跨次操作失效**：每次 mutation 后用 `snapshot -i` 重读 refs（hint 提示 `Ref @eXX needs a complete snapshot`）
- **回退**: `npx` 标签：`@e4~s466931`（带 `~sN` 表示 pinned 到某次 snapshot）
- **坐标兜底**: ref 无效时用 `press <x> <y>`（Pixel 9 AVD 底栏 y≈2332，五等分 x≈108/324/540/756/972）
- **fill 前清 placeholder**: agent-device fill 替换原内容；先 `snapshot -i` 确认 placeholder 字段真实 ref

## 4. 已知坑

- **APK 启动慢**：Flutter release APK 冷启动 8-12s（dev server 路由 + WebViewAssetLoader init），agent-device open 前等 `sleep 15`
- **会话独占**: emulator 一次只能被一个 session 占用；多设备用 `--platform android --device <avd>`
- **远端 log 校验**: 验证业务调通了，远端 access log 必须有对应 `GET /api/xxx 200`，否则 H5 渲染假数据
- **强制升级弹窗**: 装老 APK（如 0.1.70 用新 config build）才能弹，AppRelease 0.1.73 当前 forceUpgrade=true minSupported=0.1.31

## 5. 与 Playwright e2e 的边界

- **agent-device 优先**：能在 App 内验完整业务（含 native bridge 触发），不要再绕回浏览器
- **Playwright 仅在以下场景用**：
  - CI 并行（无 APK 启动开销）
  - 跨设备跨浏览器视觉回归
  - 历史 spec 套件回归（已写好的 `e2e/journey/`）

## 6. 复现脚本示例

完整 60s 冒烟脚本参考 `test-results/app-agent-device/` 历史会话目录（gitignored）。