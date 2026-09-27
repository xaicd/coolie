# Brief: wave 100 — 修 OTA 跑未提交代码 + 排查 WebView 残余 + 0.5.70 真修 + boss 真机测 (boss 23:50 派 '咱们得派员工干活')

PM: Jason
Worker: claude

## 0. Boss 09-26 23:50 OOB 「咱们得派员工干活」

老板让 PM 派员工 (claude / cmd) 真干活. 当前状态:
- wave98 proc 53714 仍跑 38+ 分钟, 没真输出
- wave99 已完, E2E 真验全过, 但揭露 2 真因:
  1. 生产 OTA 跑未提交代码 (541bf371 09-26 23:40 构建自 wave98 未 commit 工作区)
  2. 模拟器 TUN 代理污染伪阴性

## 1. 目标

**0.5.70 真修 + 真发版** = 让老板真机能从 OTA 拉到 committed 代码, 不是未提交工作区代码:

A. **看 wave98 跑中改动** (如有) → commit + push
B. **修 OTA 跑未提交代码真因** (从 HEAD 重发 OTA)
C. **真修 WebView cookie 持久化** (如必要)
D. **打包 0.5.70 真修版** + 真发版 + coscli + version.json + publish-ota
E. **真验真机/模拟器** + 报告

## 2. 任务 (5 步)

### 2.1 看 wave98 跑中改动真值

1. cd ~/workspace/xaicd/coolie
2. git status --short (看 wave98 claude 改了啥)
3. git log --oneline -3 (看 wave98 真提了啥 commit)
4. 排查 wave98 claude 跑的输出 (上次 poll 看 wave98 running)

### 2.2 排查生产 OTA 跑未提交代码真因

1. 查 server /opt/coolie/ui/ota/android/ 实际内容
2. 查 publish-ota.sh 跑的 source code (是 wave98 未 commit 工作区?)
3. 排查 wave98 claude 真改了啥 (commit + uncommitted)

### 2.3 修 OTA 真因

按真因修:
- 若 publish-ota.sh 跑未提交工作区: 加 pre-check 确保 working tree clean
- 若 OTA bundle 跟 HEAD 不一致: 重发 OTA from HEAD
- 若 server 端 /opt/coolie/ui/ota 跑错 bundle: rsync 从 HEAD 重新生成

### 2.4 修 + 打包 (如需) 0.5.70

1. bump 0.5.69 → 0.5.70 (clients/expo/{app.json, package.json, CHANGELOG.md}, versionCode 569 → 570)
2. cd clients/expo && npx expo prebuild --platform android --clean
3. 恢复 local.properties + gradle.properties (kotlinVersion=1.9.24)
4. cd clients/expo && ./android/gradlew -p android clean assembleRelease -x lint --no-daemon
5. coscli cp → cos://gzbucket/coolie/app/0.5.70/coolie-release.apk
6. version.json: 0.5.70 / 570 / commitSha 当前 HEAD
7. scp → tc-coolie-claw:/opt/coolie/ui/dist/version.json
8. publish-ota.sh 真跑 (runtimeVersion 0.5.70, from HEAD committed code)

### 2.5 真验 + commit + push

1. adb install 0.5.70 → 装机自检全绿
2. 模拟器登录 → 点进入 CMMI 门禁 → 应自动登录 web
3. 真截图真验
4. git add + commit + push (SSH proxy bypass)

## 3. Constraints

- ❌ DON'T 用 agy
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.70 之外
- ❌ DON'T 改 boss Claude 后 commit / wave84-99 release
- ✅ DO 修 OTA 跑未提交代码真因
- ✅ DO 真修 WebView cookie 持久化 (如必要)
- ✅ DO 用 zsh-safe single quotes

## 4. semver + PM-CHECKLIST

- 当前 0.5.69
- 真修 OTA + WebView = patch bump → 0.5.70
- PM-CHECKLIST 32 项: J1-J3 + I1 + I2

## 5. Done definition

5 步全完 + 修 OTA 跑未提交代码真因 + 真修 WebView cookie 持久化 + 0.5.70 APK 真发版 + coscli + version.json + publish-ota from HEAD + adb 真验 + commit + push:

```
Coolie工坊 0.5.70: https://dls.xrobinai.cn/coolie/app/0.5.70/coolie-release.apk    ← NEW (修 OTA 跑未提交 + WebView cookie 持久化)
OTA manifest: runtimeVersion 0.5.70
```