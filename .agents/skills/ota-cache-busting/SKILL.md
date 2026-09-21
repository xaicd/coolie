---
name: ota-cache-busting
description: Expo OTA bundle hash 必须随每次发版改变，否则老用户拿不到新版本。Use when 老板装新版 APK 后仍看到老界面 / release-app.sh 自动 bump 后老用户没拉到新 bundle。
---

# OTA Cache Busting — bundle hash 必须变

## 1. 老板 2026-09-21 撞过的坑

老板装 0.5.1 APK（502）后看到 0.5.0 老界面。
- APK 字节级验过：bundle **真的**含 WorkspaceScreen / InlinePreviewPanel
- 但 App 没拉到新 bundle
- 真因：可能 expo-updates 缓存了 0.5.0 的 bundle，新 bundle hash 没换时它仍然认为"没新版本"

## 2. expo-updates 接受新 bundle 的条件

```
runtimeVersion 变化 (如 0.5.0 → 0.5.1) → 强制接受新 bundle
runtimeVersion 不变 + bundle URL hash 变化 → 也接受（patch）
runtimeVersion 不变 + bundle hash 不变 → 不接受（认为是同一版本）
```

## 3. release-app.sh 必做的事

```
1. bump app.json expo.version (0.5.1 → 0.5.2)
2. bump app.json expo.android.versionCode (501 → 502)
3. expo export --platform android (产出新 bundle)
4. md5sum 新 bundle — 应该跟上次不同
5. rsync bundle + manifest 到生产
```

如果第4 步发现 hash 没变 → bundle 没真改 → release 失败

## 4. 校验 hash 的 curl 命令

```bash
NEW_URL=$(curl -fsS https://xrobinai.cn/ota/manifest | python3 -c 'import json,sys; print(json.load(sys.stdin)["launchAsset"]["url"])')
curl -fsS "$NEW_URL" | md5sum

# 跟 git log 上一次 release 的 bundle hash 比
git show <prev-release>:path/to/bundle | md5sum
# 两个 hash 应该不同
```

## 5. 强制 cache bust 技巧

如果老板装新版看不到新功能，第一查这个：
```bash
curl -fsS https://xrobinai.cn/ota/manifest | python3 -c 'import json,sys; m=json.load(sys.stdin); print("runtimeVersion=", m["runtimeVersion"], "bundle=", m["launchAsset"]["url"].split("/")[-1])'
# 跟老板手机版本号比 → 应该 runtimeVersion > 老板手机
```

如果 runtimeVersion 没变 → release-app.sh 没真跑 → release 失败
如果 bundle hash 没变 → bundle 没真改 → 重新 expo export

## 6. 老板的"白搭还是一样"问题

老板装 0.5.1 后说「白搭还是一样」 = 大概率是上面 §5 之一。
永远先查 OTA manifest，再怀疑其他。