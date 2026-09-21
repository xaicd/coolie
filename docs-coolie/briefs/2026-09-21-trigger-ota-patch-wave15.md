# Brief: wave 15 — 触发 OTA 增量更新 (从 0.5.7 真更新到 0.5.7-patch1)

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-21 "触发增量更新"

Boss 想验证 OTA 真链路: 装 0.5.7 → server 发 patch → App 自动拉到新 bundle.

## 1. 已知现状 (PM 09-21 真查)

```
✅ production version.json: 0.5.7 / versionCode 507
✅ /ota/manifest 真在: runtimeVersion 0.5.7 + bundle 3.3 MB (index-80deb5f12915f2d879faf17fdefb4611.hbc)
✅ Caddy /ota/* 走 file_server (wave13 修)
✅ WhatsNewScreen 自检严判 (wave13 加)
✅ server bundle 物理存在: /opt/coolie/ui/ota/_expo/static/js/android/index-80deb5f12915f2d879faf17fdefb4611.hbc
```

## 2. 目标

**触发 1 次真 OTA 增量更新**: 在不动 version (0.5.7) 前提下, 让 bundle hash 改变 (新内容) → server 发 patch → App 端 fetch manifest 看到新 bundleId → 自动下载 → 通知显示「有新更新」.

## 3. 任务

### 3.1 微改一个客户端组件 (让 bundle 内容变 → hash 变)

任选:
- `clients/expo/src/screens/WhatsNewScreen.tsx`: 加一行 console.log + 改 releaseNote 字符串 (e.g. "0.5.7" → "0.5.7 (OTA ready)")
- 或 `clients/expo/src/OTA.ts`: 改 default runtime version 显示
- 目的: 让 bundle 字节改变 → hash 变

### 3.2 本地 build bundle

```bash
cd clients/expo
pnpm export --platform android
# 产 dist/_expo/static/js/android/index-NEWHASH.hbc
```

### 3.3 rsync 新 bundle 到生产 server (覆盖)

```bash
ssh tc-coolie-claw 'mkdir -p /opt/coolie/ui/ota/_expo/static/js/android'
rsync -avz --delete \
  $REPO_ROOT/clients/expo/dist/_expo/static/js/android/index-NEWHASH.hbc \
  tc-coolie-claw:/opt/coolie/ui/ota/_expo/static/js/android/
```

### 3.4 重写 OTA manifest

```bash
ssh tc-coolie-claw "cat > /opt/coolie/ui/ota/manifest" <<EOF
{
  "id": "$(uuidgen)",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
  "runtimeVersion": "0.5.7",
  "launchAsset": {
    "key": "android-bundle",
    "contentType": "application/javascript",
    "url": "https://xrobinai.cn/ota/_expo/static/js/android/index-NEWHASH.hbc"
  },
  "assets": [],
  "metadata": {},
  "extra": {
    "expoClient": <full app.json config>
  }
}
EOF
```

### 3.5 模拟器真验证

```bash
# 1. 装 0.5.7 APK (已装)
# 2. 启动
adb shell am start -n cloud.coolie.app/.MainActivity
sleep 8
# 3. 看 OTA fetch logcat
adb logcat -d -t 500 | grep -iE "expo.updates|Updates state" | tail -15
# 期望看到 'CheckCompleteAvailable' + 'DownloadComplete' + 'NEW_UPDATE_LOADED'
# 期望 NEW bundleId != 旧 (NEWHASH)
# 4. WhatsNewScreen 应显示「有新更新, 立即重启加载」
```

### 3.6 写 docs-coolie/OTA-TRIGGERED.md

PM 写简报:
- 旧 bundle hash → 新 bundle hash
- 模拟器 logcat 真实结果
- 「触发增量更新」验证通过

### 3.7 commit + push

## 4. Constraints

- ❌ DON'T bump version 0.5.7 (OTA 不需要)
- ❌ DON'T 重 build APK (只是 JS bundle 变化)
- ❌ DON'T touch server 任何代码
- ✅ 只动 bundle + manifest + 客户端 1 行

## 5. Done definition

真值报告 docs-coolie/OTA-TRIGGERED.md + 模拟器 logcat 截屏 + commit + push + 给老板装机直链 (不变).