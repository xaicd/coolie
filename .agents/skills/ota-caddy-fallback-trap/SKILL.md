---
name: ota-caddy-fallback-trap
description: Expo OTA 的 manifest/bundle 走生产 Caddy 时，会被 SPA 兜底路由成 HTML，expo-updates 静默失效。Use when 装了 APK 但 logcat 报 `Failed to construct manifest from response` / OTA 看起来「已启用」却不生效 / 生产 /ota/manifest 返回 HTML。
---

# OTA × Caddy SPA 兜底陷阱

## 0. 一句话

自建 OTA 源的 manifest 是**静态文件**，但生产 Caddy 把「未知路径」全部兜底给
SPA（`reverse_proxy` → Express → `index.html`）。于是 `/ota/manifest` 返回
**200 + HTML**，expo-updates 拿 HTML 去 `JSON.parse` 直接炸，OTA 静默失效 ——
而任何「只看 HTTP 200」的自检都会显示绿字「OTA 已启用」。

## 1. 老板 2026-09-21 撞的坑（真值）

模拟器装 0.5.5，WhatsNewScreen 显示「OTA 已启用」，但 logcat：

```
Failed to construct manifest from response (org.json.JSON.typeMismatch)
```

根因链：

1. `curl -i https://xrobinai.cn/ota/manifest` → `content-type: text/html`，body 是 SPA 外壳。
2. Caddyfile 里只有 `reverse_proxy 127.0.0.1:3100`，没有 `/ota/*` 特例。
3. 更深一层：`/opt/coolie/ui/ota/` 目录**根本不存在** —— 就算 Caddy 兜底修了，
   manifest 也会指向不存在的 bundle。**两处都要修。**
4. 客户端自检只看 `Updates.isEnabled`（打包开关），没碰网络，所以误报。

## 2. Caddy 修法（关键：handle_path 不是 handle）

```caddyfile
xrobinai.cn, www.xrobinai.cn {
	encode gzip zstd

	@legacy path /digstaff /digstaff/*
	handle @legacy {
		respond 410
	}

	# OTA 静态直出：绝不能落进下面的 reverse_proxy
	handle_path /ota/* {
		root * /opt/coolie/ui/ota
		@manifest path /manifest /manifest.json
		header @manifest Content-Type application/json
		header @manifest Cache-Control "no-cache"
		header @manifest expo-protocol-version "0"   # ← 少了这行整件事仍然失败
		file_server
	}

	handle {
		reverse_proxy 127.0.0.1:3100
	}
}
```

五个必须记住的点：

| 点 | 为什么 |
|---|---|
| **`handle_path` 不是 `handle`** | `handle /ota/*` **不会**剥前缀：`root * /opt/coolie/ui/ota` + `/ota/manifest` → `/opt/coolie/ui/ota/ota/manifest`，404。`handle_path` 才剥掉 `/ota`。 |
| **`root` 指向剥前缀后的目录** | 剥完是 `/manifest`，落在 `root` 下。目录要和发布脚本的 `REMOTE_OTA_DIR` 一致。 |
| **显式 `Content-Type: application/json`** | 文件名 `manifest` 没扩展名，Caddy 猜不出 MIME，会嗅探成 `text/plain`。 |
| **必须发 `expo-protocol-version` 响应头** | 见下 §2.1。**这是最难查的一环。** |
| **兜底必须包进 `handle {}`** | 用了 `handle` 块做分流，其余裸指令（`reverse_proxy`）也要收进默认 `handle`，别混着写。 |

### 2.1 真正的真凶：`expo-protocol-version` 响应头

修完路由、目录、Content-Type 后，logcat **仍然**报
`Failed to construct manifest from response`。根因在 expo-updates 0.27 (SDK 52)
的 `UpdateFactory.getUpdate`：

```kotlin
when (val expoProtocolVersion = responseHeaderData.protocolVersion) {
  null -> throw Exception("Legacy manifests are no longer supported")
  0, 1 -> ExpoUpdatesUpdate.fromExpoUpdatesManifest(...)
  else -> throw Exception("Unsupported expo-protocol-version: ...")
}
```

`protocolVersion` 读的是**响应头** `expo-protocol-version`（整数）。
自建静态源不会自动带这个头 → `null` → 一律抛「旧协议不支持」，
body 再正确也没用。修法：在 manifest 响应上补 `expo-protocol-version: 0`
（我们发单份 JSON manifest、非 multipart，用 0 最诚实；0 和 1 在非 multipart
时走同一段解析代码）。

**只看 HTTP 200 / Content-Type / JSON 解析都发现不了这个坑** —— 所以客户端自检
也必须查这个头（见 §4）。

### 2.2 `extra.expoClient` 必须带全 app 配置

发布的 manifest 里 `extra.expoClient` 就是 OTA bundle 运行时的 `Constants.expoConfig`。
只塞 `name/slug/version` 的话，**OTA 之后 app 读不到 `updates.url`、`extra.deepLinks`
等任何 app.json 配置**（而 APK 内嵌版能读到 —— 于是同一个屏「装 APK 时对、OTA 后错」）。
`publish-ota.sh` 现在整份 `appJson.expo` 原样带上，别再退回三元组。

```js
const expoClientConfig = appJson.expo || { name: 'Coolie', slug: 'coolie', version };
```

## 3. 发布目录必须真存在

`publish-ota.sh` 的 `REMOTE_OTA_DIR` 与 Caddy 的 `root` **必须同一目录**。
2026-09-21 之前两者不一致（脚本发到 `ui/dist/ota`，Caddy 期望 `ui/ota`），
且目录从未真正建立 —— 这是「脚本跑过但没用」的根因。

```bash
ssh tc-coolie-claw 'ls -la /opt/coolie/ui/ota/ && head -5 /opt/coolie/ui/ota/manifest'
```

## 4. 客户端自检必须严（不要自欺）

`Updates.isEnabled` 只是**打包时开关**，不代表更新源可用。真正的自检要按
expo-updates 会做的事验一遍（见 `clients/expo/src/OTA.ts` 的 `checkOTAManifest`）：

1. GET manifest URL（带 `expo-channel-name`）
2. HTTP 2xx
3. `Content-Type` 必须含 `application/json` —— HTML 兜底靠这步露馅
4. 必须带 `expo-protocol-version` 响应头 —— 缺它 expo-updates 判为旧协议（见 §2.1）
5. body 能 `JSON.parse` 且含 `launchAsset.url`

失败就显示「OTA 未启用, 当前用 APK 内嵌版本」，并把人话原因摆出来。
另外 `Updates.updateId` 非空才说明当前跑的 bundle 真由 OTA 下发（否则是 APK 内嵌）。

## 5. 验证清单（改完必跑）

```bash
# 1. manifest 必须是 JSON（不是 HTML），且带 expo-protocol-version 头
curl -fsS -i https://xrobinai.cn/ota/manifest | head -12
#   content-type: application/json
#   expo-protocol-version: 0
curl -fsS https://xrobinai.cn/ota/manifest | python3 -c 'import json,sys; m=json.load(sys.stdin); print(m["runtimeVersion"], m["launchAsset"]["url"])'

# 2. bundle 必须 200，且 URL 就是 manifest 里指的那个
BUNDLE=$(curl -fsS https://xrobinai.cn/ota/manifest | python3 -c 'import json,sys; print(json.load(sys.stdin)["launchAsset"]["url"])')
curl -fsS -o /dev/null -w '%{http_code} %{size_download}\n' "$BUNDLE"

# 3. 设备侧：logcat 里不能再有 manifest 报错
adb logcat -d | grep -iE "Failed to construct manifest|Updates state change|\[OTA\] manifest check"
```

改 Caddy 后：`caddy validate --config /etc/caddy/Caddyfile` → `systemctl restart caddy`。

## 6. 与 ota-cache-busting 的分工

- **本 skill**：更新源**够得着**吗（网络/路由/目录/内容类型）。
- `ota-cache-busting`：更新源够得着，但**内容不新**（bundle hash / runtimeVersion 没变）。

先查够不够得着，再查新不新。
