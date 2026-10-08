# OTA 运行时版本漂移修复报告 — wave16

- 日期: 2026-09-21
- Boss 指令: 「修」
- Worker: cmd / PM: Hermes
- Repo: `~/workspace/xaicd/coolie` (main)
- 不动版本 (仍 0.5.7 / 507)、不重 build APK、不动 server / Coolie Web / paperclip 上游。

## TL;DR

OTA「只下载不加载」的真根因找到了：**同一个 `runtimeVersion` 在三处漂移**。
0.5.7 的 APK 里钉着的原生运行时是 **0.5.5**，而 `publish-ota.sh` 按 `app.json`
声称 **0.5.7**，expo-updates 判运行时不符 → bundle 下了不加载。

根因是 `fix-android-manifest.sh` 只在「键不存在」时写一次 `EXPO_RUNTIME_VERSION`，
一次写成 0.5.5 之后再也没更新过。修法：把运行时版本收敛成**一个口径**
（`clients/expo/scripts/runtime-version.mjs`），原生 manifest 每次重写它，
`publish-ota.sh` 按**装机 APK 真值**写 manifest，`release-app.sh` 不一致直接拒绝发版。
修后 `publish-ota.sh` 实跑一次，manifest 写 `runtimeVersion=0.5.5`（= APK 真值），
模拟器上 App **下载 + 加载**新 bundle 成功，全程无需手改 manifest 字段。

---

## 1. 根因（aapt2 实证）

装机直链与本地/模拟器用的是同一份 APK（77,644,062 B）：

```
$ aapt2 dump badging app-release.apk | grep ^package
package: name='cloud.coolie.app' versionCode='507' versionName='0.5.7'

$ aapt2 dump xmltree app-release.apk --file AndroidManifest.xml | grep -A2 EXPO_RUNTIME_VERSION
  A: android:name="expo.modules.updates.EXPO_RUNTIME_VERSION"
  A: android:value="0.5.5"          ← 与 versionName(0.5.7) 脱钩
```

`app.json` 声明 `runtimeVersion.policy = "appVersion"`，意图是「运行时 = 版本号 = 0.5.7」；
但原生工程里的 meta-data 停在 0.5.5。

**为什么停住**：`clients/expo/scripts/fix-android-manifest.sh` 的老逻辑是

```python
if "expo.modules.updates.EXPO_RUNTIME_VERSION" not in text:   # 只在缺键时注入
    text = ... 写入当时版本
```

第一次（0.5.5 那次发版）写进去之后，之后每次发版这个键都在，于是**永远不再更新**。
`publish-ota.sh` 又自己按 `app.json` 推一份 0.5.7，两处口径不同 → 漂移。

wave15 的临时处置是把生产 manifest 手改成 `0.5.5` 迁就 APK，但 `publish-ota.sh`
一跑就写回 `0.5.7`，把 OTA 打回「下了不装」。本次把它改成机制，不再靠人记。

## 2. 修法：一个口径，三处对齐

新增 `clients/expo/scripts/runtime-version.mjs` —— **运行时版本的唯一实现**：

| 模式 | 含义 |
|---|---|
| `--app-json` | `app.json` 的意图（`policy=appVersion` → `expo.version`；字面量原样）|
| `--apk [PATH]` | 装机 APK 内嵌的原生值（`aapt2 dump xmltree`）|
| `--native-manifest PATH` | 源码 `AndroidManifest.xml` 的值 |
| （默认） | 发布 manifest 应采用的值：**APK 真值优先**，无 APK 时回落 `app.json` |

四处调用方全部改到它上面：

1. **`clients/expo/scripts/fix-android-manifest.sh`（根因）**：`EXPO_RUNTIME_VERSION`
   改为**每次都重写**（存在则改值，不存在才注入），写完再断言等于 `--app-json`。
2. **`scripts/release-app.sh`**：第 [5/9] 步在跑完 fix-android-manifest 后断言
   原生值 == `app.json` 意图，**不一致直接拒绝发版**（fail-loud，不带病出包）。
3. **`clients/expo/scripts/publish-ota.sh`**：manifest 的 `runtimeVersion` 改由
   `runtime-version.mjs` 提供（读 APK 真值），删掉原来自己按 app.json 推导的那份。
4. **`clients/expo/scripts/verify-ota-runtime-consistency.mjs`（新增门禁）**：
   三处一致性可执行检查。

### 为什么没有用 brief 里的 `expo prebuild --platform android --clean`

本仓库的 `android/` 是 **gitignored 的本地预构建目录**，一直走 gradle 直构建
（`release-app.sh` 的注释和 wave4 的 gradle bump 修正都建立在这个前提上）。跑
`prebuild --clean` 会整目录重生成，抹掉本地对 `build.gradle` / `AndroidManifest.xml`
的 OTA 修正与 `local.properties`，属于「重建边界”而不是修 bug。因此改用仓库既有的
`fix-android-manifest.sh` 作为原生运行时版本的唯一写入点 —— 与现状同构、行为可预期。

> 顺带纠正 brief 里的定位：真正的 manifest 生成逻辑在
> `clients/expo/scripts/publish-ota.sh`，根目录 `scripts/publish-ota.sh`
> 只是转发（且被 `scripts/fork-surface.json` 记账），故未改动它。

## 3. 验证（真跑）

### 3.1 门禁抓到的真状态

```
$ node clients/expo/scripts/verify-ota-runtime-consistency.mjs
  [VERIFIED    ] app-json: intent=0.5.7 (policy=appVersion → 跟随 version 0.5.7)
  [FAIL        ] apk: 原生 0.5.5 ≠ app.json 0.5.7 —— 这就是 OTA「下了不装」的根因；重建 APK 才能对齐
  [VERIFIED    ] remote: 远端 0.5.5 == APK 原生 0.5.5
FAIL — 1 条不一致，0 条未验证。          (exit 1)
```

第 2 条 FAIL 是**如实报告**：本次不重建 APK，所以装机那份包的 native 仍是 0.5.5。
门禁不会替它说通过。另用 `OTA_MANIFEST_URL=https://xrobinai.cn/version.json` 喂错输入，
第 3 条如实 FAIL（exit 1）—— 证明门禁真的会响，不是摆设。

### 3.2 根因脚本已修（跑给看）

```
$ bash clients/expo/scripts/fix-android-manifest.sh
  <meta-data ... EXPO_RUNTIME_VERSION" android:value="0.5.7"/>   ← 0.5.5 → 0.5.7
  manifest OTA config ok (runtimeVersion=0.5.7)
# 再跑一次仍 0.5.7（幂等）
```

### 3.3 `publish-ota.sh` 实跑（核心验收）

```
$ bash scripts/publish-ota.sh android
  ⚠ APK 原生运行时 0.5.5 ≠ app.json 意图 0.5.7；manifest 采用 APK 真值 0.5.5（重建 APK 才能对齐）
  === [2/4] 生成自建更新源 Manifest ===
     runtimeVersion = 0.5.5
  ...
  远端 manifest: { "id": "cb86d4ac-…", "runtimeVersion": "0.5.5", ... }
  支持渠道: production, runtimeVersion: 0.5.5
```

修前它会写 `0.5.7`（= 把 OTA 打回「下了不装」）；修后写 `0.5.5`，与装机 APK 一致。

### 3.4 模拟器端到端（下载 + 加载）

`coolie-test` AVD，装 0.5.7 APK，`pm clear` 后启动：

**基线**（生产 manifest 修前 `3eae1866`，runtimeVersion 0.5.5）：

```
CheckCompleteAvailable  latestManifest.id=3eae1866-…  runtimeVersion=0.5.5
Download → DownloadComplete (isUpdatePending=true)
# 重启后
[OTA] manifest check … runtimeVersion=0.5.5 updateId=3eae1866-… OTA_PATCH_MARKER=ota-patch-wave15-2026-09-21
CheckCompleteUnavailable
```

**修后 `publish-ota.sh`（新 manifest `cb86d4ac`，runtimeVersion 0.5.5）**：

```
CheckCompleteAvailable  latestManifest.id=cb86d4ac-…  runtimeVersion=0.5.5
Download → DownloadComplete (isUpdatePending=true)
# 重启后 —— 真加载了新 bundle
[OTA] manifest check … runtimeVersion=0.5.5 updateId=cb86d4ac-c72c-461b-8115-c2ee59a977dd
     OTA_PATCH_MARKER=ota-patch-wave15-2026-09-21
CheckCompleteUnavailable
```

`updateId` 从 `3eae1866` 变为 `cb86d4ac`（= 修后 publish 的 manifest），且只存在于
bundle 里的 `OTA_PATCH_MARKER` 打了出来 —— 证明**跑的是 OTA bundle 且真的被加载**，
整个过程**没有任何人改 manifest 字段**。

> 说明：本次没动客户端 JS，bundle hash 不变（`index-10ccd232…hbc`）；触发加载靠的是
> manifest id 变化。这已足以验证「加载」这一步在修后的 runtimeVersion 下成立。

## 4. 遗留 / 跟进

1. **重建 APK 才能让第 2 条转绿**：下次 `bash scripts/release-app.sh <新版本> "..."`
   会把原生 `EXPO_RUNTIME_VERSION` 同步成新版本号，并断言一致；届时门禁三条全绿。
   *本次明确不 bump 版本、不重建 APK。*
2. **重建 APK 后的 OTA 受众变化**：原生 runtime 一旦随版本推进，`policy=appVersion`
   下一次只能服务与 manifest 同 runtime 的装机包 —— 0.5.7(原生 0.5.5) 的老包需先装
   新版 APK 才能继续收 OTA。这是该策略的固有语义，非本次引入。
3. **预存在的 fork-surface 门禁红**：`node scripts/check-fork-surface.mjs --cumulative`
   报 `server/src/auth/better-auth.ts` 126/70 超预算 —— 来自更早的 wave8/auth 提交
   （`6975459fd` / `a607f068e`），与本次改动无关，未在本次动它（只修要修的）。

## 5. 给老板

装机直链**不变**：

```
https://dls.xrobinai.cn/coolie/app/0.5.7/coolie-release.apk
```

装好后 OTA 正常（下载 → 弹「更新就绪」→ 重启生效）。本次修的是发版脚本，让 OTA
以后不再因 `runtimeVersion` 漂移而「下了不装」。

## 6. 证据文件

- 本报告: `docs-coolie/OTA-RUNTIME-VERSION-FIXED.md`
- 上轮事件: `docs-coolie/OTA-TRIGGERED.md`（wave15 首次暴露该 bug）
- 门禁 skill: `.agents/skills/ota-runtime-version-consistency/SKILL.md`
- 口径模块: `clients/expo/scripts/runtime-version.mjs`
- logcat 原文见 §3.4（由 `adb logcat -v time` 采集）
