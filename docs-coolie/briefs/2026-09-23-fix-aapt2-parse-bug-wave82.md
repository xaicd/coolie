# Brief: wave 82 — 修 scripts/runtime-version.mjs aapt2 解析 bug (boss 27:03 '派')

PM: Jason
Worker: claude

## 0. Boss 09-23 27:03 OOB 「派」

老板让 PM 派 wave82. 之前 wave81 claude 发现 scripts/runtime-version.mjs 解析 APK EXPO_RUNTIME_VERSION 有 bug.

## 1. PM 老实盘点 (真因)

```
当前 scripts/runtime-version.mjs 真值:
- 用 aapt2 dump xmltree 解析 APK AndroidManifest.xml
- 期望: 找到 EXPO_RUNTIME_VERSION 字面字符串
- 实际: APK 资源引用 @0x7f120082 (不是字面)
- regex /android:value\(0x[0-9a-f]+\)="([^"]*)"/ 只吃字面字符串
- 静默回落 app.json intent → publish-ota.sh 用错值

真因:
- expo-updates 把 EXPO_RUNTIME_VERSION 编译成 Android string resource
- xmltree 看不到资源引用解析的值
- 应改用 aapt2 dump resources 读 string/expo_runtime_version
```

## 2. 目标

**Coolie工坊 0.5.57** 修 runtime-version.mjs aapt2 解析 bug:

A. 改 scripts/runtime-version.mjs: 用 aapt2 dump resources --values 读 APK resources.arsc
B. 解析 `string/expo_runtime_version` 资源值
C. fallback 路径保留 (intent / app.json)
D. typecheck + 单元测试 + 真跑 (跟 wave81 一样生成 0.5.57 OTA manifest)

## 3. 任务 (4 步)

### 3.1 改 runtime-version.mjs

1. cd ~/workspace/xaicd/coolie
2. cat scripts/runtime-version.mjs (看真值)
3. grep -n "aapt2\|VALUE_RE\|parseApk" scripts/runtime-version.mjs (找解析路径)
4. 重写 parseApkXmltree → 用 aapt2 dump resources --values resources.arsc
5. 解析 string/expo_runtime_version (regex /TYPE_STRING_RESOURCE_VALUE="([^"]*)"/)

### 3.2 单元测试

1. add tests/runtime-version.test.ts (vitest)
2. mock aapt2 dump resources 输出
3. 验: aapt2 解析返回 EXPO_RUNTIME_VERSION 真实值 (不回落到 intent)
4. 跑 pnpm test

### 3.3 修 OTA 链路真值

1. bump app.json (强制 runtimeVersion 0.5.56 → 0.5.57 假值, 看脚本能否读到 APK 真值)
2. 用 0.5.56 APK (EXPO_RUNTIME_VERSION 真的 '0.5.56') 跑 scripts/runtime-version.mjs
3. 验脚本返回 "0.5.56" (不回落 intent, 不返回 null)

### 3.4 bump + 真发版 + commit + push

1. bump 0.5.56 → 0.5.57 (clients/expo/app.json + package.json + CHANGELOG, versionCode 556 → 557)
2. 跑 bash scripts/publish-ota.sh android 'wave82 修 runtime-version.mjs aapt2 解析 bug'
3. 验 curl -fsS https://xrobinai.cn/ota/manifest | grep runtimeVersion → "0.5.57"
4. APK 不发 (只 OTA)
5. git -c user.email=hermes@nous.local -c user.name='Hermes PM' add scripts/runtime-version.mjs tests/runtime-version.test.ts clients/expo/{app.json,package.json,CHANGELOG.md}
6. git -c user.email=hermes@nous.local -c user.name='Hermes PM' commit -m 'fix(ota): wave82 修 runtime-version.mjs aapt2 解析 bug (boss 27:03 派)'
7. GIT_SSH_COMMAND='ssh -o ProxyCommand=none' git push origin main

## 4. Constraints

- ❌ DON'T 用 agy (本地员工)
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.57 之外 (这次只 OTA + script fix)
- ❌ DON'T 改 boss Claude 4 commit
- ✅ DO 修 runtime-version.mjs
- ✅ DO 用 zsh-safe single quotes

## 5. semver + PM-CHECKLIST

- 当前 0.5.56
- script fix + OTA = patch bump → 0.5.57
- PM-CHECKLIST 32 项: J1-J3 + I1

## 6. Done definition

4 步全完 + runtime-version.mjs 修 + unit test 加 + 模拟器真验脚本读到 APK 真值 + bump 0.5.57 + publish-ota.sh 真跑 + commit + push + 发版:

```
Coolie工坊 0.5.57 (OTA bundle): manifest runtimeVersion 0.5.57 (脚本读到 APK 真值, 不回落 intent)
触发: 老板装 0.5.55/0.5.56 APK → 检测 OTA 0.5.57 → 弹更新
```