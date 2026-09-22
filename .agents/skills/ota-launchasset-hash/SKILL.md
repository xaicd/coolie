---
name: ota-launchasset-hash
description: 自建 OTA manifest 必须带 launchAsset.hash/assets[].hash，且 launchAsset.key 必须随 bundle 内容变化，否则老设备永远拿不到新 bundle。Use when 老板装新版后仍看到老界面 / publish-ota.sh 生成的 manifest 缺 hash / 排查 expo-updates 复用旧 bundle。
---

# OTA manifest: hash 与 launchAsset.key

> 老板 2026-09-21 的真 bug：装机设备 OTA 了 0.5.10/0.5.11/0.5.12，界面**永远停在第一次 OTA 的那份 bundle**。
> Fresh install 的 APK 内嵌 bundle 反而是新的 —— 只有「OTA 过至少一次」的设备坏。

## 0. 一句话

`publish-ota.sh` 生成 manifest 时既没写 asset hash，launchAsset.key 又是一个**常量**
（`android-bundle`）。第二件事才是致命的：expo-updates 把 key 当作**磁盘文件名**，
文件已存在就直接复用、**连 hash 都不看**。于是每次 OTA 都命中同一份老文件。

## 1. 根因（两端同构，已读源码确认）

三处叠加，缺一不可：

| # | 机制 | 位置 |
|---|---|---|
| 1 | 磁盘文件名 = `key + "." + type` | `UpdatesUtils.createFilenameForAsset`（Android）/ `UpdateAsset.filename`（iOS）|
| 2 | 该文件已存在 → **直接复用，不下载** | `Loader.downloadAllAssets`（Android 约 236 行）/ `AppLoader.downloadAsset`（iOS）|
| 3 | `assets.key` 全局唯一（跨 update） | Android `AssetEntity` 的 `Index(value=["key"], unique=true)` |

叠加结果：`key` 是常量 → 文件名恒定 → 第 2 条永远命中 → **一次安装最多只能拉到一份远端 bundle**。
`hash` 写不写都不改变这条路径 —— expo-updates 自己的 e2e 也是**逐个 update 换 key**
（`test-update-1-key` / `test-update-2-key` / `test-update-3-key`）。

### 1.1 hash 的格式：base64url(无 padding)，不是 hex

Android `UpdatesUtils.verifySHA256AndWriteToFile` 拿 `Base64.URL_SAFE | NO_PADDING | NO_WRAP`
比对；iOS `UpdatesUtils.base64UrlEncodedSHA256WithData` 同理。写成 64 位 hex 会被判
**hash 不符** → `AssetDownloadException`，比不写 hash **更糟**（下载能过、校验必炸）。
Node 里等价写法就是 `crypto.createHash('sha256').update(buf).digest('base64url')`。

- 正确：`3o5mBuZOpOeESyNn2q_4YSejywZRm7vXoihBSHP6qdI`（43 字符，含 `-` `_`，无 `=`）
- 错误：`de8e6606e64ea4e7844b2367daaff861...`（64 字符 hex）

### 1.2 key 用「扁平 + 内容寻址」

用 `android-bundle-<sha256-base64url>`：内容变 → key 变。**不要**用带斜杠的 key
（如 `assets/…`）：iOS 的 `Data.write(to:)` 不会建中间目录，写不进去。

## 2. 三项检查（改完必跑）

### 2.1 manifest 的 hash 不空、且格式是 base64url

```bash
curl -fsS https://xrobinai.cn/ota/manifest | python3 -c '
import json,sys
m=json.load(sys.stdin)
h=m["launchAsset"]["hash"]
print("launchAsset.hash =", h, "len", len(h), "size", m["launchAsset"]["fileSize"])
assert h and len(h)==43 and all(c.isalnum() or c in "-_" for c in h), "hash 不是 base64url(43)"
print("assets:", len(m["assets"]), "missing hash:", sum(1 for a in m["assets"] if not a["hash"]))
'
```

期望：`launchAsset.hash` 43 字符 base64url + `fileSize` 是数字；所有 `assets[].hash` 非空。

### 2.2 远端 hash 必须等于远端 bundle 的真实 hash

```bash
python3 - <<'PY'
import json, hashlib, base64, urllib.request
m = json.load(urllib.request.urlopen("https://xrobinai.cn/ota/manifest"))
b = urllib.request.urlopen(m["launchAsset"]["url"]).read()
print("expected:", base64.urlsafe_b64encode(hashlib.sha256(b).digest()).decode().rstrip("="))
print("manifest:", m["launchAsset"]["hash"])
PY
```

**只信 hash 不空是不够的** —— 必须让「服务器上的字节」算出来的值等于 manifest 里写的值，
否则设备侧会在下载后炸校验。

### 2.3 publish-ota.sh 真算 SHA256，且 key 随内容走

```bash
grep -n "digest('base64url')\|launchAsset\|bundle-\${bundle.hash}" clients/expo/scripts/publish-ota.sh
```

两条断言：

1. hash 走 `digest('base64url')`（不是 `sha256sum` 那种 hex）；
2. `launchAsset.key` 里含内容 hash（`${platform}-bundle-${bundle.hash}`），不是常量 `android-bundle`。

跨版本再确认 key 真变了：连续两次 `publish-ota.sh`，若 bundle 内容变了 key 必须变；

```bash
curl -fsS https://xrobinai.cn/ota/manifest | python3 -c 'import json,sys;print(json.load(sys.stdin)["launchAsset"]["key"])'
```

## 3. 设备侧验证（清 cache 才算数）

```bash
adb shell pm clear cloud.coolie.app
adb shell am start -n cloud.coolie.app/.MainActivity
adb logcat -d | grep -iE "\[OTA\]|updateId|Failed to (construct manifest|download)"
```

- 必须看到 `updateId` 出现**新的**值（老安装上曾经卡死在同一个 updateId 就是本 bug 的症状）。
- 只看「WhatsNew 显示 OTA 已启用」不算通过：那只证明 manifest 够得着，
  证明不了「跑的是新 bundle」—— 用 bundle 内的指纹（如 `OTA_PATCH_MARKER`）或
  界面变化确认。

## 4. 与其他 OTA skill 的分工

先按顺序排查，别跳步：

1. `ota-caddy-fallback-trap` —— 更新源**够得着**吗（路由 / Content-Type / `expo-protocol-version`）
2. `ota-runtime-version-consistency` —— **能加载**吗（三处 runtimeVersion 一致）
3. **本 skill** —— 加载的**是不是这一份新 bundle**（key 随内容变 + hash 校验）
4. `ota-cache-busting` —— 够得着、能加载、也是新的，但**内容本身没变**

## 5. 边界

- 本 skill 只管「bundle 是否会被重新下载」。`launchAsset.hash` **不能**兜底
  key 恒定 —— 复用判断发生在校验之前（见 §1 第 2 条）。
- 服务端 rsync 用 `--delete`：换 key 后旧的 `android-bundle` 文件会被清掉，
  这是预期的（新 key 已经指向新文件名）。
