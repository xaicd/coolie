# Brief: wave 85 — 打包今天 boss Claude 21 commit + 0.5.59 (boss 27:17 '派')

PM: Jason
Worker: claude

## 0. Boss 09-23 27:17 OOB 「派」

老板让 PM 派 wave85. 今天 (2026-09-25) boss Claude 在 Mac 提了 21 commit + PM 1 release (wave84) = 22 commit. 21 boss Claude commit 没打包进 0.5.58 APK.

## 1. PM 老实盘点 (21 commit)

```
今天 boss Claude commit (2026-09-25):
1. 30dc3d4ce feat(cmmi): absorb open source IEEE and ISO standards
2. adde24484 feat(cmmi): solidify cmmi documents → executable skills templates
3. 6c480bf14 feat(expo): QQ browser + external apps
4. 032dde072 feat(deliverables): disk/git/oss multi-storage backends
5. 29412d8b4 feat(cmmi): standard engineering documents + role governance baseline
6. 7dddab170 feat(ontology): multi-dimensional work tasks + workshop enterprise context
7. 378e4128c feat(ontology): auto-seed enterprise core ontology
8. 682860bb5 feat(ontology): approval authority matrix + management process stages
9. 50ba8014f feat(ontology): enterprise core context + CMDB ontology domain
10. 30c4b09a2 feat(ontology): domain schema version 锚定业务系统
11. 7d1c0d324 feat(ui): 同步业务系统按钮 (project list)
12. 059d3503a docs(terminology): 五层导航 + Hermes 派活卡片强制呈现
13. e91213eeb feat(template): ruoyi-all-next 企业级全栈初始化底座
14. 063fabdba feat(board): 任务派发通知铁律 + Hermes 聊天首发
15. 6387fe54f feat(board): 主 Agent 总调度大管家机制
16. 6124ff9fe docs(fork-surface): paperclip-board 派活调度预算
17. 6ac8dadea feat(board): Hermes 注入 Palantir 5 角色派活 + Skill 路由 + MCP 协同
18. 77d46ef52 feat(skills): 引入 Anthropic 官方顶级 skills 矩阵
(还有 3 个 commit PM 不太记得, 让 claude 查)
```

## 2. 目标

**Coolie工坊 0.5.59** 打包今天 21 commit:

A. bump 0.5.58 → 0.5.59 (clients/expo/app.json + package.json + CHANGELOG, versionCode 558 → 559)
B. 跑 expo prebuild + gradle build
C. coscli 上传 0.5.59 APK
D. version.json commitSha 当前 HEAD
E. publish-ota.sh 真跑 → manifest runtimeVersion 0.5.59
F. adb 真验 + commit + push

## 3. 任务 (5 步)

### 3.1 验证 worktree 真值

1. cd ~/workspace/xaicd/coolie
2. git status --short
3. git log --oneline -25 (确认今天 commit 数)

### 3.2 bump + gradle build

1. bump clients/expo/{app.json, package.json, CHANGELOG.md} 0.5.58 → 0.5.59, versionCode 558 → 559
2. cd clients/expo && npx expo prebuild --platform android --clean
3. cd clients/expo && ./android/gradlew -p android clean assembleRelease -x lint --no-daemon
4. aapt dump badging 看 versionCode 559, versionName 0.5.59
5. 验 APK EXPO_RUNTIME_VERSION "0.5.59"

### 3.3 coscli 上传 + version.json

1. coscli cp clients/expo/android/app/build/outputs/apk/release/app-release.apk cos://gzbucket/coolie/app/0.5.59/coolie-release.apk
2. 验 curl -sI https://dls.xrobinai.cn/coolie/app/0.5.59/coolie-release.apk | head -3
3. version.json: version 0.5.59 / versionCode 559 / commitSha 当前 HEAD
4. scp version.json → tc-coolie-claw:/opt/coolie/ui/dist/version.json

### 3.4 publish-ota.sh

1. bash scripts/publish-ota.sh android 'wave85 打包今天 boss Claude 21 commit'
2. 验 curl -fsS https://xrobinai.cn/ota/manifest | grep runtimeVersion → '0.5.59'

### 3.5 adb 真验 + commit + push

1. adb install emulator-5554 验 (versionCode=559, versionName=0.5.59)
2. WhatsNew 屏显示 v0.5.59
3. git add clients/expo/{app.json,package.json,CHANGELOG.md}
4. git -c user.email=hermes@nous.local -c user.name='Hermes PM' commit -m 'release: v0.5.59 — wave85 打包今天 boss Claude 21 commit (boss 27:17 派)'
5. GIT_SSH_COMMAND='ssh -o ProxyCommand=none' git push origin main

## 4. Constraints

- ❌ DON'T 用 agy (本地员工)
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.59 之外
- ❌ DON'T 改 boss Claude 21 commit (今天 Sep 25)
- ❌ DON'T 改 wave84 release (db2be7aec)
- ❌ DON'T 改 wave84 brief (3602c3932)
- ✅ DO 打包 21 commit
- ✅ DO 用 zsh-safe single quotes

## 5. semver + PM-CHECKLIST

- 当前 0.5.58
- 打包 21 commit = minor bump → 0.5.59
- PM-CHECKLIST 32 项: J1-J3 + I1 + I2

## 6. Done definition

5 步全完 + bump 0.5.59 + APK 真发版 + coscli + version.json + OTA 真出 + adb 验 + commit + push + 发版:

```
Coolie工坊 0.5.59: https://dls.xrobinai.cn/coolie/app/0.5.59/coolie-release.apk    ← NEW (今天 boss Claude 21 commit 打包)
OTA manifest: runtimeVersion 0.5.59
触发: 老板装 0.5.55/0.5.56/0.5.57/0.5.58 APK → 检测 OTA 0.5.59 → 拉 0.5.59 bundle
```