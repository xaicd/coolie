# VERSION-CONSISTENCY-CHECK 第 6 项 fingerprint 政策适配 (COOA-39)

> 2026-10-04 · 铁匠 · wave292 工具链收尾遗留
>
> 症状: v0.6.26 发版后 `bash scripts/VERSION-CONSISTENCY-CHECK.sh` exit 1, 唯一红点
> `✗ OTA manifest runtimeVersion=59398d8c… (want 0.6.26)` — 第 6 项仍按 appVersion
> 时代口径期望「runtimeVersion == 版本号」, 而 wave292 起
> `expo.runtimeVersion.policy=fingerprint`, runtimeVersion 本就该是 40 位原生状态哈希。
> 不修则 v0.6.27+ 每个版本都假红, G5 门禁不可用。

## 修法 (scripts/VERSION-CONSISTENCY-CHECK.sh, 单文件)

「期望版本」段新增 policy 分支解析, 第 6 项按分支取期望值:

| app.json `expo.runtimeVersion` | 期望值 (WANT_RT) | 探针 |
|---|---|---|
| 缺省 / `"appVersion"` / `{"policy":"appVersion"}` | 版本号 (现行为, 回滚兼容) | 裸取 (不变) |
| 字符串字面量 | 该字面量 | 裸取 |
| `{"policy":"fingerprint"}` | `node clients/expo/scripts/runtime-version.mjs --app-json` (内部 `expo-updates fingerprint:generate`, 口径统一在 `fingerprint.config.js` — 单一口径, 不另造第二份) | 真客户端头 `-H expo-platform:android -H expo-runtime-version:<哈希> -H expo-channel-name:production`, 与装机 App 的检查请求同一条 wave86 动态分发路径 |
| 其它 policy | 报红 (与 runtime-version.mjs 的拒绝一致) | — |

本地算不出哈希 (无 node / expo-updates) → 第 6 项降级警告不比对, 与远端两项
「网络不可达仅警告」的既有哲学一致; 期望值未知 / 404 / 非 JSON 同样走警告路径。

## 为什么探针要带真客户端头 (实测 2026-10-04)

生产 `/ota/manifest` 有两层改写 (server/src/routes/ota-manifest.ts):

- 裸取 (无头): wave164 canonical 同步 → 回写为生产 version.json 的 version
  (实测返回 `0.6.26`) — 与 fingerprint 哈希**必然不等**, 拿裸取比对会继续假红;
- 带真客户端头 `expo-runtime-version: <哈希>`: wave86 动态分发, 实测返回该哈希
  (express 健康时 canonical/echo 路径; express 502 窗口时 Caddy 静态 fallback
  直出磁盘哈希版 manifest — 两条服务路径下都应等于本地同口径哈希)。

另注: wave86 的 IP 短时记忆 (120s TTL) 会让同 IP 随后的裸取回显最近一次申报的
runtime — 所以本检查在 fingerprint 政策下**只用头探针**, 不做裸取断言, 避免读数
受同 IP 前序请求污染。

## 测试矩阵 (全部通过, 2026-10-04)

| # | 场景 | 期望 | 实测 |
|---|---|---|---|
| T0 | 生产 HEAD 全量 | exit 0, 7/7 绿 | ✓ 第 6 项 `✓ runtimeVersion=59398d8c… (真客户端头探针, policy=fingerprint)` |
| T1 | stub 远端回错哈希 `deadbeef…` | 第 6 项红, exit 1 | ✓ `✗ … (want 59398d8c…)` |
| T2 | policy 临时改 appVersion + stub 回 0.6.26 | 现行为保留, exit 0 | ✓ 裸取 `✓ runtimeVersion=0.6.26` |
| T3 | stub 404 | 仅警告, exit 0 | ✓ `⚠ OTA manifest HTTP 404 — 仅警告` |
| T4 | stub 200 但非 JSON | 仅警告, exit 0 | ✓ |
| T5 | `SKIP_REMOTE=1` | 跳过 5/6, exit 0 | ✓ |
| T6 | 故障注入 node 失败 (哈希算不出) | 仅警告, exit 0 | ✓ `⚠ 无法本地计算 fingerprint 哈希 (simulated node failure)` |
| T7 | policy 临时改 `nativeVersion` (不支持) | 报红, exit 1 | ✓ `✗ expo.runtimeVersion.policy=nativeVersion 不支持` |

(T2/T7 临时改 app.json 均已 `git checkout` 还原, 工作树仅余本修复。)

## v0.6.27 G5 可直接用

发版时 app.json bump 0.6.27 + policy 保持 fingerprint → WANT_RT = 新本地哈希 →
头探针比对, 无需再改本脚本; 若 publish-ota 漏推且 express 恰在 502 窗口
(Caddy 静态直出磁盘旧 manifest), 头探针会正确报红 —— 这正是历史事故形态。

## 最终全量复跑 (生产, 2026-10-04)

```
=== 期望版本 ===
   期望: 0.6.26 (versionCode 626)
   runtimeVersion 期望: 59398d8c10ad4c5e23044387b1c9912920e63692 (policy=fingerprint 本地同口径哈希)

=== 1. clients/expo/app.json ===
   ✓ expo.version=0.6.26, expo.android.versionCode=626

=== 2. clients/expo/package.json ===
   ✓ version=0.6.26

=== 3. clients/expo/android/app/build.gradle ===
   ✓ versionName="0.6.26", versionCode=626

=== 4. clients/expo/CHANGELOG.md (顶部首个 ## v 节) ===
   ✓ 顶部节 = v0.6.26

=== 5. 远端 version.json (https://xrobinai.cn/version.json) ===
   ✓ version=0.6.26, versionCode=626

=== 6. 远端 OTA manifest (https://xrobinai.cn/ota/manifest) ===
   ✓ runtimeVersion=59398d8c10ad4c5e23044387b1c9912920e63692 (真客户端头探针, policy=fingerprint)

=== 7. git tag v0.6.26 ===
   ✓ 本地 tag v0.6.26 → 23bf7fb0f

=== 总结 ===
   ✅ 7 处版本号源全一致 = 0.6.26
```
