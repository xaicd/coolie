# OTA 发布报告 — wave27 (2026-09-22)

- Brief: `docs-coolie/briefs/2026-09-22-trigger-ota-publish-wave27.md`
- Worker: cmd / PM: Hermes
- 约束遵守: ❌ 未 bump 版本 (仍 0.5.15 / 515) · ❌ 未重建 APK · ✅ publish-ota.sh 真发 bundle

## TL;DR

OTA bundle **已真发并验证通过**: 生产 `/ota/manifest` 指向新 bundle, 模拟器装 0.5.14 APK →
下载 → 重启 → **跑到新 bundle** (`updateId` 由内嵌 `a67b95ca…` 变为新发布的 `ff434fef…`)。

⚠️ **但 brief 的期望字段 runtimeVersion=0.5.15 达不到, 也不该达到** —— 见 §3。
本次 manifest 落到 **runtimeVersion=0.5.14** (装机 APK 真值), 这是唯一能真正被设备加载的值。

## 1. 做了什么

```
cd clients/expo
bash scripts/publish-ota.sh android
```

产物:

| 项 | 值 |
|---|---|
| bundle 文件 | `index-ff5b98d6750224dd70ffe9d4b3c8a2d4.hbc` (3,509,946 B) |
| 旧 bundle | `index-ee0ea7ab148e1df6c9c3d9e95513e8d9.hbc` (已 `--delete`) |
| manifest id | `ff434fef-c7bb-40bd-8c6d-4a2f1be89ff2` |
| runtimeVersion | **0.5.14** |
| launchAsset.key | `android-bundle-rUGA_FHa1edciP7SkMlZWDZYeVg33tAV5fcZTC9Bvtw` (内容寻址) |
| launchAsset.hash | `rUGA_FHa1edciP7SkMlZWDZYeVg33tAV5fcZTC9Bvtw` (43 字符 base64url) |

## 2. 验证 (manifest 字段)

`GET https://xrobinai.cn/ota/manifest`:

- HTTP 200, `content-type: application/json`, `expo-protocol-version: 0` (未落 Caddy SPA 兜底)
- `runtimeVersion = 0.5.14`
- `launchAsset.hash` 43 字符 base64url `rUGA_FHa1edciP7SkMlZWDZYeVg33tAV5fcZTC9Bvtw`
- `launchAsset.url = https://xrobinai.cn/ota/_expo/static/js/android/index-ff5b98d6….hbc`
- `launchAsset.fileSize = 3509946` (数字, == URL 实际字节数)
- `assets count = 19`, 19/19 都有 hash
- **服务器字节 sha256(base64url) == manifest 里写的 hash** (逐字节复核, 非只看字段非空)
- 旧 bundle URL → 404, 新 bundle URL → 200

门禁 `node clients/expo/scripts/verify-ota-runtime-consistency.mjs`:

```
[VERIFIED] app-json: intent=0.5.15
[FAIL    ] apk:    原生 0.5.14 ≠ app.json 0.5.15   (见 §3)
[VERIFIED] remote: 远端 0.5.14 == APK 原生 0.5.14
```

## 3. 关键发现: brief 的前提是错的

brief 说「0.5.14 / 0.5.15 APK 都发了」—— **0.5.15 APK 从来没发过**:

- `https://dls.xrobinai.cn/coolie/app/0.5.15/coolie-release.apk` → **404**
- `coscli.log` 最后一次 APK 上传是 **0.5.14 @ 14:26:37**; `version.json` 仍是 0.5.14
- `release: v0.5.15` 提交 (15:00) 只 bump 了 app.json/package.json/CHANGELOG; 随后的
  fix-android-manifest / gradle build / COS 上传 / OTA 都没跑 (本地 AndroidManifest 仍是
  0.5.14, mtime 14:26)

后果: **世上不存在原生 runtime 为 0.5.15 的装机包**。若按 brief 把 manifest 写成
`runtimeVersion=0.5.15`, **没有任何设备会收到更新** —— 正是 wave16/23 修过的「下了不装」。
故 manifest 必须用装机 APK 真值 **0.5.14**。

### 3.1 「已装 0.5.13 设备」为什么仍然拉不到

`policy=appVersion` 下一次只服务与 manifest 同 runtime 的一批包。0.5.13 的 APK 原生
runtime 是 0.5.13, 只能加载 `runtimeVersion=0.5.13` 的 manifest。当前 manifest 是 0.5.14,
所以 **0.5.13 老装机包收不到 OTA**(这是该策略的固有语义, 非本次引入)。

**要让老板那台设备拿到新代码, 只能先装最新 APK (0.5.14), 之后 OTA 才会生效。**

## 4. 模拟器真验 (coolie-test, sdk_gphone64_arm64)

装 0.5.14 APK (唯一与 manifest runtime 匹配的装机包) → `pm clear` → 启动:

```
16:20:55  [OTA] manifest check … runtimeVersion=0.5.14 updateId=a67b95ca-… (APK 内嵌)
16:20:55  Updates state: CheckCompleteAvailable (latestManifest.id=ff434fef-…)
16:20:55  Updates state: Download
16:21:03  Updates state: DownloadComplete (isUpdatePending=true)
16:21:03  ErrorRecovery: remote load status changed: NEW_UPDATE_LOADED
# 杀后台重开
16:21:45  [OTA] manifest check … runtimeVersion=0.5.14 updateId=ff434fef-c7bb-40bd-8c6d-4a2f1be89ff2
16:21:44  Updates state: CheckCompleteUnavailable   ← 已是最新, 不再重复下载
(全程无 "Failed to construct manifest" / AssetDownloadException)
```

`updateId` 由内嵌 `a67b95ca…` → **`ff434fef…`(= 本次发布的 manifest id)**, 且装机自检屏
显示「当前运行 bundle: **OTA 下发**」。新 bundle 内含 wave26 字段 (`Reviewer`/`Approver`/
`Watchdog`), bundle 本地 sha256 == manifest hash。

## 5. 给老板

- 装机直链最新的是 **0.5.14**(0.5.15 那份没发出去):
  `https://dls.xrobinai.cn/coolie/app/0.5.14/coolie-release.apk`
- 装 0.5.14 后 OTA 正常: 启动 → 下载 → 弹「更新就绪」→ 重启生效。
- 卡在旧版 (0.5.13 等) 的设备点不动 OTA —— 需先经 version.json 升级到最新 APK。

## 6. 建议 (需 PM 拍板)

1. **补发 0.5.15 APK**: 跑 `bash scripts/release-app.sh 0.5.15 "…"`, 让原生
   `EXPO_RUNTIME_VERSION` 与 app.json 对齐; 之后 manifest 才能名副其实地写 0.5.15。
2. **根治 runtime 漂移**: 把 `app.json` 的 `runtimeVersion` 从 `{policy:"appVersion"}`
   改成固定字面量 (如 `"1"`), 一次性重建 APK —— 此后 OTA 不再随版本号漂移, 老装机包也能一直收更新。
3. 本次未 commit (publish 无 tracked 改动; dist/ 已 gitignore)。如需入库本报告, 请示下。
