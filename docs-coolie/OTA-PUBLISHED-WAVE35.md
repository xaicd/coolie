# OTA 发布报告 — wave35 (Coolie Web, 2026-09-22)

- Brief: `docs-coolie/briefs/2026-09-22-trigger-web-ota-publish-wave35.md`
- Worker: cmd / PM: Hermes
- Boss 09-22 23:53 OOB: 「触发更新了吗」

## TL;DR

| # | 事项 | 结果 |
|---|---|---|
| 1 | 写 `scripts/publish-ota-paperclip-web.sh` (代理 expo-paperclip-web) | ✅ |
| 2 | 真发一次 → manifest 写入 `/opt/coolie/ui/ota/paperclip-web/` | ✅ runtimeVersion `0.6.4` + `launchAsset.hash` (43 字符 base64url) |
| 3 | `version.json` 加 `paperclipWeb` 字段 | ✅ 已上线 (顶层驾驶舱字段原样保留) |
| 4 | 模拟器真拉新 | ✅ 用**修好的**本地 APK 完成 `Check → Download → NEW_UPDATE_LOADED` |
| 5 | 触发 OTA 的服务器侧 | ✅ 全通 |
| ⚠ | **老板那台装机的 0.6.2 / 已发的 0.6.4 APK 本身 OTA 是关掉的** | ❌ 见 §3，**需要重建 APK 才能修** |

**一句话**: 触发 OTA 的服务器侧已经全部修好并真验通了,但**已发布的 0.6.2 / 0.6.4 APK
是用错的 manifest 键编出来的,expo-updates 被整个关掉** —— 装机设备根本不会去拉
manifest。光发 bundle 救不了这两个包,必须重建 APK (brief §4 明确「不重建」, 故**停在这里待批**)。

---

## 1. 服务器侧: 补齐 4 个缺口 (全部真做真验)

brief §1 的盘点只找到「没有 publish 脚本 / manifest 404」两处, 实际有 **4** 处:

### 1.1 没有 Coolie Web 的 publish 脚本 → 新建

`clients/expo-paperclip-web/scripts/publish-ota.sh` 存在,但**两个错**:

- `REMOTE_OTA_DIR=/opt/coolie/ui/dist/ota/paperclip-web` —— Caddy 的 root 是
  `/opt/coolie/ui/ota`(见 `/etc/caddy/Caddyfile` 的 `handle_path /ota/*`),
  写进 `dist/ota/` 客户端会 404。已改成 `/opt/coolie/ui/ota/paperclip-web`。
- 只写 `name/slug/version` 三项, **没有 `launchAsset.hash`** —— 沿用 wave23 给驾驶舱
  修过的版本: 加 base64url SHA-256 的 `hash` + `fileSize`,并让 `launchAsset.key`
  随内容变化 (`android-bundle-<hash>`),否则老用户永远拿不到新包。
  同时 runtimeVersion 收敛到 `scripts/runtime-version.mjs`(与驾驶舱同口径)。

新建根转发脚本 `scripts/publish-ota-paperclip-web.sh`(与 `scripts/publish-ota.sh` 同模式)。

### 1.2 manifest 真发 + 字节级校验

```
$ bash scripts/publish-ota-paperclip-web.sh android
   runtimeVersion = 0.6.4
✓ dist/manifest (ID: 0e84aeb9-d615-43a0-bf85-99ff32ccd41b, bundle hash: Uork6ljLqXz_…)
✓ 远端 manifest 已更新就绪 (runtimeVersion 0.6.4)
```

| 项 | 值 |
|---|---|
| manifest id | `0e84aeb9-d615-43a0-bf85-99ff32ccd41b` |
| runtimeVersion | **0.6.4** |
| launchAsset.key | `android-bundle-Uork6ljLqXz_ZefL7f9cobVtFvrToEpNqxel93HnmEU` |
| launchAsset.hash | `Uork6ljLqXz_ZefL7f9cobVtFvrToEpNqxel93HnmEU` (43 字符 base64url) |
| launchAsset.fileSize | 1591176 |

不只看字段非空 —— 把 `launchAsset.url` 的**实际字节**拉下来重算
`sha256 → base64url`, 与 manifest 写的 hash **逐字符一致**, 文件大小也一致。

### 1.3 Caddy 没给子路径 manifest 加协议头 → 已修

`/etc/caddy/Caddyfile` 的 `@manifest path /manifest /manifest.json` 只匹配**顶层**路径。
`handle_path /ota/*` 剥掉前缀后, Coolie Web 的是 `/paperclip-web/manifest` —— **不匹配**,
于是丢了 `content-type` / `cache-control` / 关键的 **`expo-protocol-version: 0`**:

```
$ curl -sD- https://xrobinai.cn/ota/paperclip-web/manifest     # 修前
HTTP/2 200      (无 content-type / 无 expo-protocol-version)

$ curl -sD- https://xrobinai.cn/ota/manifest                   # 驾驶舱 (一直正常)
HTTP/2 200      content-type: application/json  expo-protocol-version: 0
```

expo-updates 0.27 (SDK 52) 缺这个头会直接
`throw Exception("Legacy manifests are no longer supported")`
(源码 `expo-updates/.../manifest/UpdateFactory.kt:19`)。已把 matcher 扩成
`/manifest /manifest.json /paperclip-web/manifest /paperclip-web/manifest.json`。
**先备份**(`/etc/caddy/Caddyfile.bak.20260922204900`)→ `caddy validate`(**Valid**)→
`systemctl reload caddy`(**active**)。修后两个 manifest 的头都齐了, 驾驶舱无回归。

### 1.4 `version.json` 没有 `paperclipWeb` → 新建脚本合并

新建 `clients/expo-paperclip-web/scripts/update-version-json.sh` —— **只增不改**: 读回远端 JSON, 只覆盖
`paperclipWeb` 键, 顶层驾驶舱字段原样保留 (那是 `release-app.sh` 的职责)。

```json
{
  "version": "0.5.18", ...  ← 驾驶舱字段未动
  "paperclipWeb": {
    "version": "0.6.4",
    "versionCode": 4,
    "downloadUrl": "https://dls.xrobinai.cn/coolie/app/0.6.4-paperclip-web/coolie-release.apk",
    "releaseNotes": "底部 5 tab 中文 + i18n 字典扩展 118 条 + 修底栏重叠"
  }
}
```

---

## 2. 模拟器真验 (修好的 APK: 全链路通)

用**本地重建**的 0.6.4 APK (manifest 已修正), `coolie-test` AVD, `pm clear` 后启动:

```
20:51:29  Updates state change: Check
20:51:29  Updates state change: CheckCompleteAvailable
            latestManifest.id=0e84aeb9-…  runtimeVersion=0.6.4
            launchAsset.hash=Uork6ljLqXz_ZefL7f9cobVtFvrToEpNqxel93HnmEU
20:51:29  Updates state change: Download
20:51:31  AppController appLoaderTask didLoadAsset: {name=app.bundle,
            assetId=Uork6ljLqXz_ZefL7f9cobVtFvrToEpNqxel93HnmEU, failedAssetCount=0}
20:51:31  Updates state change: DownloadComplete  isUpdatePending=true
20:51:31  ErrorRecovery: remote load status changed: NEW_UPDATE_LOADED
```

下载到的 assetId **等于 manifest 的 hash**(字节校验通过), 全程无
`Failed to construct manifest` / `AssetDownloadException`。

> 这个 APK **只在模拟器上验证, 没有上传 COS**, 已发布的 0.6.4 产物一字未动。

---

## 3. 真正的拦路虎: 已发布的 APK 把 expo-updates 整个关掉了

`aapt2 dump xmltree` 看**已上 COS 的 0.6.4 APK**(sha256 `e37b7311…`)和
老板装的 0.6.2(sha `…`, 见 `/tmp/c062.apk`):

| meta-data 键 | 驾驶舱 APK (能 OTA) | Coolie Web 0.6.2 / 0.6.4 |
|---|---|---|
| `expo.modules.updates.EXPO_UPDATE_URL` | ✅ | ❌ 写成了 **`expo.modules.updates.UPDATE_URL`**(少 `EXPO_`) |
| `expo.modules.updates.EXPO_RUNTIME_VERSION` | ✅ | ❌ **完全没有** |

expo-updates 读的是 `EXPO_UPDATE_URL`(`UpdatesConfiguration.kt:186`)和
`EXPO_RUNTIME_VERSION`(`:212`);两个都不对 → 校验返回
`INVALID_MISSING_URL` → `UpdatesController` **禁用整个 OTA**
(`UpdatesController.kt:70`)。

装机实测(装 0.6.2 真机同款 APK 到模拟器):

```
20:49:53  dev.expo.updates W  "The expo-updates system is disabled due to an
          invalid configuration. Ensure a valid URL is supplied."
          code=InitializationError
# 之后既没有 Check,也没有 CheckComplete / Download —— 设备从未联系服务器
```

**驾驶舱 0.5.5 时踩过一模一样的坑**,并留了
`clients/expo/scripts/fix-android-manifest.sh`(注释里写明
「旧版 prebuild 生成的是 `UPDATE_URL`, 少了 `EXPO_`」)。但 Coolie Web 是**独立客户端目录**,
从没跑过这个修正, 于是带着同样的缺陷发了 0.6.2 / 0.6.4。

这一点 brief §1 的盘点没看到 —— 它把根因归到「JS bundle 没 publish」。
**但即使 manifest 现在 100% 正确,这两个包也永远拉不到它。**

### 修复 (源码侧已就绪, 但需重建才生效)

- 新建 `clients/expo-paperclip-web/scripts/fix-android-manifest.sh`(镜像驾驶舱那个,
  URL 指向 `/ota/paperclip-web/manifest`),已跑过 → 本地 android manifest 现在是
  `EXPO_UPDATE_URL` + `EXPO_RUNTIME_VERSION="0.6.4"`,且断言与 app.json 一致。
- 新建 `clients/expo-paperclip-web/scripts/runtime-version.mjs`(与驾驶舱同口径)。

**但 `android/` 是 gitignored 的本地预构建目录 —— 这些改动只在「下一次构建」生效。
已发布的 0.6.2 / 0.6.4 二进制改不了 (改 APK = 重签 = 等于重建, brief 明确禁止)。**

---

## 4. 需要老板/PM 拍板的一件事

要让老板那台**真拿到 OTA**,只有一条路(都需要重建 APK, brief §4 禁止, 故未做):

1. **重建 0.6.4**(manifest 已修好) → 传回**同一个** COS 直链
   `dls.xrobinai.cn/coolie/app/0.6.4-paperclip-web/coolie-release.apk`。
   装机直链不变; 老板**手动装一次**这个包后, 以后 OTA 就正常了。
2. 或 bump **0.6.5** 走一遍 `release-app.sh` 全流程。

**注意**: 老板那台现在装的 0.6.2 因为自身 OTA 是关的,**不会**自动升上来 ——
不管我们发的是不是修好的 0.6.4, 都得**先手动装一次修好的包**。之后才谈得上 OTA。

在此之前, 服务器侧(`publish-ota-paperclip-web.sh` / Caddy / version.json)已全部就绪,
一旦修好的包上线, OTA 立刻可用(§2 已在模拟器证明)。

---

## 5. 装机直链 (未变)

```
Coolie Web 0.6.4: https://dls.xrobinai.cn/coolie/app/0.6.4-paperclip-web/coolie-release.apk
OTA manifest:     https://xrobinai.cn/ota/paperclip-web/manifest  (runtimeVersion 0.6.4)
version.json:     https://xrobinai.cn/version.json  (含 paperclipWeb)
```

## 6. 证据文件

- 本报告: `docs-coolie/OTA-PUBLISHED-WAVE35.md`
- 上轮同类: `docs-coolie/OTA-RUNTIME-VERSION-FIXED.md`(驾驶舱的同一坑)、
  `docs-coolie/briefs/2026-09-21-ota-fix-caddy.md`(Caddy 首修)
- Caddy 备份: `tc-coolie-claw:/etc/caddy/Caddyfile.bak.20260922204900`
- logcat 原文见 §2 / §3 (由 `adb logcat -d` 采集)
