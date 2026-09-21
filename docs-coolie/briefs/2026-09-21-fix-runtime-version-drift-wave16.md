# Brief: wave 16 — 修 runtimeVersion 漂移 (release-app.sh + publish-ota.sh)

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-21 "修"

Boss 撞了 OTA 「只下载不加载」的真 bug — 必须修, 让 OTA 跑通不靠 manifest 改字段掩盖.

## 1. 已知现状 (PM 09-21 + 门神 wave15 真查)

```
✅ OTA 链路本身通: Caddy file_server + manifest + bundle 物理存在
✅ App 端: fetch manifest → download → 弹「更新就绪」→ 重启生效
❌ 真 bug: 0.5.7 APK 内嵌 EXPO_RUNTIME_VERSION=0.5.5 (aapt2 实证), 跟 versionName 0.5.7 脱钩
   → expo-updates 看到 manifest.runtimeVersion=0.5.7 判运行时不符
   → 只下载不加载 (OTA 「下了不装」)
   → wave15 临时掩盖: manifest 写 0.5.5 迁就 APK, 但 publish-ota.sh 一跑又写回 0.5.7
```

**根因 = `release-app.sh` bump versionName 时不 bump EXPO_RUNTIME_VERSION, 导致 native runtimeVersion 字段落后于 app.json version.**

**修法 2 选 1:**
- A) `release-app.sh` 在 bump versionName 时, 同时 bump `app.json` 里 `runtimeVersion` 字段 (或 native Constants.expoRuntimeVersion)
- B) `publish-ota.sh` 在写 manifest 时, 强制读 `aapt2 dump badging` 拿 EXPO_RUNTIME_VERSION 真值, 不靠 app.json 推测

## 2. 目标

**让 OTA 链路在不靠人工改 manifest 字段的前提下永远跑通**:
- release-app.sh bump 0.5.7 → 0.5.8 时, APK 内嵌 EXPO_RUNTIME_VERSION 也变 0.5.8
- publish-ota.sh 写 manifest 时读 APK 真值 (or app.json 同源), 不漂移

## 3. 任务 (3 步)

### 3.1 修 release-app.sh

读 `scripts/release-app.sh`, 找 bump versionName 步骤 (release-app.sh 已修 gradle bump, wave4 commit `5102f0045`).

**关键: 让 expo prebuild / native build 重新生成 Constants.expoRuntimeVersion 跟随 app.json version.**

```bash
# 在 bump versionName 后 + expo prebuild 之前, 加:
NEW_VERSION=$(grep '"version"' app.json | head -1 | sed -E 's/.*"version": *"?([0-9.]+)"?.*/\1/')

# 确保 app.json expo.runtimeVersion = versionName (expo 自动 derive, 但显式 set 更稳)
python3 -c "
import json
with open('clients/expo/app.json') as f: c = json.load(f)
if 'expo' in c and 'runtimeVersion' not in c['expo']:
    c['expo']['runtimeVersion'] = c['expo']['version']
with open('clients/expo/app.json','w') as f: json.dump(c, f, indent=2)
"

# expo prebuild 重新生成 android/app/build.gradle + AndroidManifest.xml
cd clients/expo
npx expo prebuild --platform android --clean
```

### 3.2 修 publish-ota.sh

读 `scripts/publish-ota.sh`, 让 manifest.runtimeVersion 读 `app.json` (不靠 user 输入).

```bash
# 找当前版本 (app.json 是 source of truth)
RUNTIME_VERSION=$(python3 -c "
import json
with open('clients/expo/app.json') as f: c = json.load(f)
v = c['expo'].get('runtimeVersion') or c['expo']['version']
print(v)
")
```

把 manifest 模板里的 `RUNTIME_VERSION` 占位符填这个值.

### 3.3 加版本一致性 CI 检查

新建 `.agents/skills/ota-runtime-version-consistency/SKILL.md` (or 加到 release-flow skill):

```
检查项:
1. clients/expo/app.json expo.version == expo.runtimeVersion (or one derives from other)
2. APK 内嵌 EXPO_RUNTIME_VERSION == app.json expo.runtimeVersion
3. /opt/coolie/ui/ota/manifest.runtimeVersion == APK EXPO_RUNTIME_VERSION
```

用 `aapt2 dump badging` 拆 APK 看 EXPO_RUNTIME_VERSION.

## 4. 验证

```bash
# 1. 装 0.5.7 APK (已装)
# 2. 跑 wave15 的 manifest 重写 + bundle 重发 (验证 publish-ota.sh 修后能跑通)
# 3. 模拟器真验: OTA 拉新 + 立即重启 + 新 bundle 生效 (不用手动改 manifest.runtimeVersion)
# 4. 写 docs-coolie/OTA-RUNTIME-VERSION-FIXED.md 报告
# 5. commit + push
```

## 5. Constraints

- ❌ DON'T bump 0.5.7 → 0.5.8 (只修脚本, 不重建 APK)
- ❌ DON'T touch Coolie Web (0.6.2)
- ❌ DON'T 修改 paperclip 上游 (ui/)
- ✅ 修改 scripts/release-app.sh + scripts/publish-ota.sh
- ✅ 加 skill: ota-runtime-version-consistency

## 6. Done definition

3 步全完 + publish-ota.sh 跑一次真验证 OTA 拉新不漂移 + docs-coolie/OTA-RUNTIME-VERSION-FIXED.md + commit + push + 给老板装机直链不变.