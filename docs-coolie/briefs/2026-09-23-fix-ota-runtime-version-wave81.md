# Brief: wave 81 — 修 OTA runtimeVersion 0.5.53 → 0.5.56 (boss 27:01 '派')

PM: Jason
Worker: claude

## 0. Boss 09-23 27:01 OOB 「app 有更新吗 / 触发更新了吗」

老板装 0.5.55 APK, OTA 没触发 (manifest runtimeVersion 仍是 0.5.53, 不是 0.5.56).

## 1. PM 老实盘点 (真因)

```
当前:
- clients/expo/app.json: version 0.5.56, 但 updates.runtimeVersion = "0.5.53" (boss Claude 没改)
- expo prebuild 重新生成 android/, 但 runtimeVersion 字段读 app.json → 不动
- OTA manifest 真值 runtimeVersion = "0.5.53"
- 老板装 0.5.55/0.5.56 APK → runtimeVersion 0.5.53 → OTA 不触发

修法 = 改 app.json 的 updates.runtimeVersion:
  0.5.53 → 0.5.56
```

## 2. 目标

**Coolie工坊 0.5.56 (patch OTA)** OTA runtimeVersion 同步:

A. clients/expo/app.json: updates.runtimeVersion "0.5.53" → "0.5.56"
B. cd clients/expo && npx expo prebuild --platform android --clean
C. 跑 publish-ota.sh 0.5.56 (写新 bundle 到 /opt/coolie/ui/ota/, publish manifest)
D. 验 manifest runtimeVersion = "0.5.56"
E. 不 bump APK (只 OTA bundle, APK 已是 0.5.56)

## 3. 任务 (4 步)

### 3.1 改 app.json updates.runtimeVersion

1. cd ~/workspace/xaicd/coolie
2. cat clients/expo/app.json | python3 -m json.tool | grep -A 5 'updates\|runtimeVersion' (看真值)
3. 改 clients/expo/app.json: updates.runtimeVersion "0.5.53" → "0.5.56"
4. 改 clients/expo/app.json: expo.android.versionCode 556 (保持)

### 3.2 跑 publish-ota.sh 0.5.56

1. cd ~/workspace/xaicd/coolie
2. bash scripts/publish-ota.sh 0.5.56 'wave81 OTA runtimeVersion 0.5.53 → 0.5.56 (boss 27:01 派)' (写新 bundle + manifest)
3. 验 curl -fsS https://xrobinai.cn/ota/manifest | grep runtimeVersion (应该 "0.5.56")

### 3.3 验 OTA 触发条件

1. 老板装 0.5.56 APK, 启运行时检查 OTA manifest
2. 期望: app runtimeVersion 0.5.56 vs manifest runtimeVersion 0.5.56 → 匹配 → 不触发 (但新装就是新装, 直接跑 0.5.56 bundle)
3. 老板装 0.5.55 APK, 启运行时检查 OTA manifest
4. 期望: app runtimeVersion 0.5.53 vs manifest 0.5.56 → 触发 → 弹「更新就绪」→ 下载 → 重启

### 3.4 bump + commit + push

1. bump clients/expo/{app.json, package.json, CHANGELOG.md} (若必要, runtimeVersion 改也算)
2. 跑 build.gradle versionCode 556 → 557 (若 APK bump, 这次不 bump, 因为只 OTA)
3. git -c user.email=hermes@nous.local -c user.name='Hermes PM' commit -m 'fix(expo): wave81 OTA runtimeVersion 0.5.53 → 0.5.56 (boss 27:01 派)'
4. GIT_SSH_COMMAND='ssh -o ProxyCommand=none' git push origin main

## 4. Constraints

- ❌ DON'T 用 agy (本地员工)
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.56 之外 (这次只 OTA, 不 bump APK)
- ❌ DON'T 改 boss Claude 4 commit
- ✅ DO 修 OTA runtimeVersion
- ✅ DO 用 zsh-safe single quotes

## 5. semver + PM-CHECKLIST

- 当前 0.5.56
- OTA runtimeVersion 同步 = patch bump → 0.5.57 (或不 bump, 只 OTA)
- PM-CHECKLIST 32 项: J1-J3 + I1

## 6. Done definition

4 步全完 + app.json runtimeVersion 0.5.56 + publish-ota.sh 真跑 + manifest 验 0.5.56 + commit + push + 发版:

```
Coolie工坊 0.5.56 (OTA bundle): manifest runtimeVersion 0.5.56
触发: 老板装 0.5.55/0.5.53 APK 启动 → 检测 OTA 0.5.56 → 弹更新 → 下载新 bundle → 重启
```