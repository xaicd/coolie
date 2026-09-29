# wave149-v6 — iOS: 打包 TestFlight 路径 报告

> **⏩ 本文件已续跑 (2026-09-29 23:2x)。** 首轮在门 A 因 `ASC_ISSUER_ID` 为空而停止；本轮该值
> 已到位并经 **真实 App Store Connect API 校验通过**（HTTP 200，非推断），故任务书 **B–G、I、J 已执行**，
> **H 被一个新阻塞拦下**（ASC 帐号内**根本没有 `cn.xrobinai.app` 应用记录**，altool 明确报错 19）。
> 以下 **§0–§10 是首轮记录（原样保留）**；本轮全部真值见末尾 **§11**。


- 日期: 2026-09-29
- 执行: CLI agent (coolie `main`, 工作区脏 — 见 §6)
- 任务书: wave149-v6（boss 23:xx 放 3 件凭证；PM 已整合；仅缺 ASC_ISSUER_ID）
- 状态: **阶段 A（凭证门）未通过 → 按任务书「任意 fail 则报告 boss, 不继续」，B~J 全部未执行。**
- 一句话: **4 件凭证已到位 3 件（Key ID / .p8 / profile UUID 全 OK，签名身份 OK，profile 验 appID 通过），唯独 `ASC_ISSUER_ID` 为空 → 按纪律「ASC_ISSUER_ID 空立刻停」，未跑 prebuild / archive / 上传 / 未改任何仓内文件。另发现 2 个会产生假成功的隐患（见 §3）。**
- 诚实边界: 本报告只写实测真值。凡推理标 **[假设]**。凭证文件在仓库之外（`~/secure/`），本报告不含任何私钥/口令值。

---

## 0. 环境真值 (本轮实测)

| 项 | 真值 | 来源 |
|---|---|---|
| `~/secure/ios-build.env` | 存在，含 v5 要求的全部键（`ASC_KEY_ID`/`ASC_ISSUER_ID`/`ASC_KEY_PATH`/`APPLE_SIGN_IDENTITY`/`APPLE_PROFILE_UUID`/`INTERNAL_TESTER_EMAILS`） | `grep -oE '^[A-Za-z_]+='` |
| `~/secure/asc_key.p8` | **存在**（257 B，与 `AuthKey_WUSVUS3H3L.p8` 同尺寸） | `ls -la ~/secure/` |
| `~/secure/AuthKey_WUSVUS3H3L.p8` | 存在（257 B） | 同上 |
| 已装 profile | 3 个：`2630cad1-…`(本轮)、`8602b2e1-…`、`d7e63d75-…` | `ls ~/Library/MobileDevice/Provisioning Profiles/` |
| `APPLE_PROFILE_UUID` 指向的 profile | **存在**，appID = `UU7T5893WZ.cn.xrobinai.app`，Team `UU7T5893WZ`，Name = `Coolie工坊` | `security cms -D -i …` |
| 发行证书 | `Apple Distribution: wei chen (UU7T5893WZ)` **有效** | `security find-identity -p codesigning -v` |
| 线上 version.json | **已是 0.6.0 / 600**（扁平，**无 `ios` 字段**），`downloadUrl` 指 Android APK | `curl https://xrobinai.cn/version.json` |
| `…/0.6.0/coolie-release.apk` | **HTTP 200** | `curl -sI` |
| `…/0.6.0/coolie-release-ios.ipa` | **HTTP 404**（本轮未产出） | `curl -sI` |
| COS `0.6.0/` 前缀 | 只有 `coolie-release.apk`（74.50 MB），**无 ipa** | `coscli ls cos://gzbucket/coolie/app/0.6.0/` |
| `clients/expo/ios/` | 已存在 `Pods/`、`Podfile.lock`、`build/`；`Podfile.properties.json` 在 | `ls` |

---

## 1. 门 A 判定（任务书 A 的 4 条免疫脚本）

| # | 检查 | 结果 | 证据 |
|---|---|---|---|
| 1 | `[ -n "$ASC_KEY_ID" ] && [ -f "$ASC_KEY_PATH" ] && [ -n "$APPLE_PROFILE_UUID" ]` | ✅ **PASS** | `ASC_KEY_ID=WUSVUS3H3L`；`ASC_KEY_PATH` 存在；`APPLE_PROFILE_UUID=2630cad1-f54c-498b-912b-1965443c488b` |
| 2 | `[ -n "$ASC_ISSUER_ID" ]` | ❌ **FAIL** | **值为空（len=0）** → 阻塞点 |
| 3 | `security find-identity … \| grep "Apple Distribution: wei chen (UU7T5893WZ)"` | ✅ **PASS** | 命中 `Apple Distribution: wei chen (UU7T5893WZ)` |
| 4 | profile 验 appID 含 `cn.xrobinai.app` | ✅ **PASS** | `security cms -D` 得 `UU7T5893WZ.cn.xrobinai.app` |

**门 A = FAIL（仅第 2 条）→ 据此停止，B~J 全部未执行。**

---

## 2. 为何 B ~ J 全部未执行

| 步 | 内容 | 是否执行 | 原因 |
|---|---|---|---|
| A | 环境核查 | ✅ | 见 §1（如实完成，未过门） |
| B | prebuild + pod install | ❌ | 门 A 未过（纪律：Issuer ID 空即停） |
| C | 修版本漂移 (pbxproj + Info.plist) | ❌ | 同上 |
| D | xcodebuild archive | ❌ | 同上（且存在 §3 隐患，见下） |
| E | ExportOptions.plist 写 app-store | ❌ | 同上 |
| F | exportArchive 出 `.ipa` | ❌ | 同上 |
| G | 上传 COS | ❌ | 同上 |
| H | TestFlight 上传 (altool --upload-app) | ❌ | **无 Issuer ID 无法签 JWT，altool 必败** |
| I | version.json 加 `ios` 字段 | ❌ | 无 `.ipa`（拿不到 sha256/链接），且线上已被并发 wave150 置为 0.6.0 |
| J | App 端 `AppUpdateCard` iOS 分支 | ❌ | `clients/expo/app.json` 是他人未提交改动（任务书「不动别人未提交的仓区」）；且无真实 TestFlight/App Store 链接可填 |

**没有生成本轮 `.ipa` / 未上传 COS / 未跑 altool / 未写 version.json / 未改 App 代码 / 未改 v3 脚本。**

---

## 3. 本轮新发现的 2 个隐患（**非 boss 清单内，但会导致假成功/必败**）

### 3.1 `APPLE_PROFILE_NAME` 与实际 profile 名不符 → D 步必败

- env 真值: `APPLE_PROFILE_NAME="cn.xrobinai.app AppStore"`
- 实际 profile Name（`plutil -extract Name raw`）: `Coolie工坊`
- 影响: D 步用 `PROVISIONING_PROFILE_SPECIFIER="$APPLE_PROFILE_NAME"`，Xcode 按 **Name 匹配**，`"cn.xrobinai.app AppStore"` 无对应 profile → archive 报 "no profile found"。
- 修复（二选一）:
  - 把 env 改为 `APPLE_PROFILE_NAME="Coolie工坊"`，**或**
  - 用 UUID 更稳妥：`APPLE_PROFILE_NAME="2630cad1-f54c-498b-912b-1965443c488b"`（`PROVISIONING_PROFILE_SPECIFIER` 接受 UUID）。
- **[假设]** 任务书 D 步把 `APPLE_PROFILE_NAME` 当 specifier 用；若实际脚本另传 `PROVISIONING_PROFILE` UUID 则可绕过。本机未验证脚本实现。

### 3.2 版本漂移仍存在（任务书 C 只覆盖 pbxproj/Info.plist，未覆盖 env）

- env 真值: `IOS_VERSION=0.5.97`、`IOS_VERSION_CODE=597`（**陈旧**，目标 0.6.0/600）
- 仓内 `version.json`（根）仍是 0.5.97/597，而**线上**已是 0.6.0/600（并发 wave150 已部署）。
- 影响: 若 D 步之后有脚本读 `$IOS_VERSION_CODE` 决定 COS 路径/回填，会产出 `0.5.97` 路径的 ipa（错位）。
- 修复: C 步之外，同步把 env 的 `IOS_VERSION=0.6.0` / `IOS_VERSION_CODE=600` 更新（credential 文件在仓库外，需 boss/PM 改）。

---

## 4. 交付物

| 路径 | 说明 |
|---|---|
| `docs-coolie/evidence/wave149/QA-REPORT-v6.md` | 本文件（新文件，未覆盖 v3/v4/v5） |

**未产出真截图**（未到 TestFlight 阶段，无对象可截）。

---

## 5. `RELEASE-HISTORY.md` 处理：**不加行**

任务书要求加 `v0.6.0-ios-testflight` 行。**本轮 iOS 未打包、未上传、未上 TestFlight**，加行即失真。故 **hold**（与 v3/v4/v5 结论一致）。待 TestFlight 真上传成功后再补。

---

## 6. 并发状态提示（供 dispatcher/boss）

- 当前未提交区: `M clients/expo/app.json`、`?? scripts/release-ios-build.sh`、`?? scripts/release-ios-cos.sh`。
- `clients/expo/ios/` 已含 `Pods/` + `build/` —— 任务书 B 步 `rm -rf ios/build ios/Pods ios/Podfile.lock` + prebuild 会重建，须先确认无并发会话仍在写该目录。
- **[假设]** 线上 version.json 的 0.6.0 由 wave150 并发会话部署（依据：commitSha 指向 0.6.0 发版 commit）。

---

## 7. boss 解锁清单（最小、精确 —— 只剩 1 件）

**唯一阻塞项：`ASC_ISSUER_ID`**

- 形态: 10 位 UUID（形如 `a1b2c3d4-e5f6-...`），**≠ Key ID `WUSVUS3H3L`**。
- 来源: appstoreconnect.apple.com → Users and Access → Keys → **Issuer ID** 列。
- 动作: boss 直接发 PM → PM 写进 `~/secure/ios-build.env` 的 `ASC_ISSUER_ID=`。

**另需顺手修 2 处（§3，否则拿到 Issuer ID 也会踩坑）：**

```
APPLE_PROFILE_NAME="Coolie工坊"        # 或直接用 UUID 2630cad1-f54c-498b-912b-1965443c488b
IOS_VERSION=0.6.0
IOS_VERSION_CODE=600
```

Issuer ID 到位后本波即可继续：prebuild+pod install → 修版本 → archive（Distribution）→ exportArchive（`method=app-store`）→ 上传 COS（0.6.0）→ `xcrun altool --upload-app --jwt-token` 上 TestFlight → 回填 version.json 顶层 `ios*` 字段。

---

## 8. 我做了什么 / 没做什么

**做了（只读 / 仓库外 / 无副作用）：**
- source `~/secure/ios-build.env` 并逐条跑 A 的门神脚本 —— §1。
- 验签名身份、profile appID/Name/Team —— §0/§3。
- 读线上 version.json、HEAD 探 CDN 的 apk/ipa、`coscli ls 0.6.0/` —— §0。
- 核对 env 版本键与仓内/线上 version.json 的一致性（发现漂移）—— §3.2。
- 阅读 v3/v4/v5 报告与 wave149 证据目录，确认未覆盖既有文件。

**没做（及原因）：**
- 未跑 prebuild / pod install / archive / exportArchive → 门 A 未过（§1）。
- 未上传 COS、未跑 altool、未写 version.json、未改 App 代码、未改 v3 脚本 → 被门 A 阻塞。
- 未加 RELEASE-HISTORY 行、未 commit、未 push → 无发布事实。
- 未改写 `~/secure/ios-build.env` → 凭证文件，值未产生；改法已列 §7。

---

## 9. 假设与不确定（显式标注）

- **[假设]** D 步把 `APPLE_PROFILE_NAME` 当 `PROVISIONING_PROFILE_SPECIFIER` 用；本机未看脚本实现，故 3.1 结论为该前提下成立。
- **[假设]** 线上 version.json 的 0.6.0 出自 wave150 并发会话。
- **[假设]** `ASC_ISSUER_ID` 需 10 位 UUID；`ASC_KEY_ID=WUSVUS3H3L`（10 位大小写混排）为 Key ID，**不是** Issuer ID。
- 本报告未含任何私钥/口令值。

---

## 10. 下一步（一句话）

**boss 只给 `ASC_ISSUER_ID` 一件**（顺手修 §7 的 `APPLE_PROFILE_NAME` + `IOS_VERSION`），本波即可全链路跑完：prebuild → archive → exportArchive → COS → TestFlight → 回填 version.json。

---

## 11. 续跑结果（本轮，Issuer ID 到位后）

- 执行: CLI agent（`main`，工作区含他人改动——见 §11.5）；本报告所有真值均为本轮实测。

### 11.1 门 A 复核 —— 全过（含首轮唯一失败项）

| # | 检查 | 结果 | 真证据 |
|---|---|---|---|
| 1 | `ASC_KEY_ID` + `ASC_KEY_PATH` + `APPLE_PROFILE_UUID` | ✅ PASS | `WUSVUS3H3L`；`~/secure/asc_key.p8`（PKCS8 `BEGIN PRIVATE KEY`）存在；UUID `2630cad1-…` |
| 2 | `ASC_ISSUER_ID` 非空 | ✅ PASS | 已填，值 **len=36**，形如 `2e48ed69-…`。**首轮「10 位 UUID」的说法不准确**，真值是标准 36 位 UUID |
| 2b | **ASC 凭证可用性（本轮新增）** | ✅ PASS | 用 `ASC_KEY_ID`+`ASC_ISSUER_ID`+`asc_key.p8` 签 ES256 JWT 调 `GET https://api.appstoreconnect.apple.com/v1/apps` → **HTTP 200**；`altool --list-apps` 亦成功 |
| 3 | codesign 身份 | ✅ PASS | `Apple Distribution: wei chen (UU7T5893WZ)` |
| 4 | profile 验 appID | ✅ PASS | `UU7T5893WZ.cn.xrobinai.app`；Name `Coolie工坊`；到期 2027-09-08；`get-task-allow=false`；`beta-reports-active=true` |

首轮 §3.1 的隐患（`APPLE_PROFILE_NAME` 与环境 profile 名不符）**已消除**：env 现为 `APPLE_PROFILE_NAME="Coolie工坊"`，与实际 profile Name 一致，archive 未报 profile 缺失。

### 11.2 步骤 B–J 逐条结论

| 步 | 结论 | 真证据 |
|---|---|---|
| B | ✅ | `expo prebuild --platform ios --no-install` 复用 `/ios`；**Podfile 补丁（Xcode27 clamp，第 61 行）保留**；`pod install --repo-update` exit 0（85 deps / 90 pods） |
| C | ✅ | pbxproj `MARKETING_VERSION=0.6.0` / `CURRENT_PROJECT_VERSION=600`（**保留分号**——任务书原 sed 会吞掉 `;` 破坏工程）；Info.plist 0.6.0 / 600；`plutil -lint` OK |
| D | ✅ | `xcodebuild … clean archive` → **ARCHIVE SUCCEEDED**；`Authority=Apple Distribution…`、`TeamIdentifier=UU7T5893WZ` |
| E | ✅ | `ExportOptions.plist`（method=app-store、teamID、signingStyle=manual，另加 `provisioningProfiles` 映射） |
| F | ✅ | **EXPORT SUCCEEDED** → `ios/build/ipa/cn.xrobinai.app.ipa`（Xcode 原名 `Coolie.ipa`，已改名对齐）；14,274,490 B；sha256 `bea5ad103dba0bb2a7547bbc67930af2ec0122069fb275de39cc9531872bae09`；`codesign --verify --deep --strict` **VERIFY OK** |
| G | ✅ | coscli 上传 `cos://gzbucket/coolie/app/0.6.0/coolie-release-ios.ipa`；公网 **HTTP 200**，`Content-Length=14274490` 与本地一致 |
| H | ❌ **阻塞** | altool：`Unable to find Apple ID for Bundle ID 'cn.xrobinai.app' … Either create this app in App Store Connect first`（码 19） |
| I | ✅ | version.json 加 **顶层扁平** ios 字段（`iosDownloadUrl`/`iosBundleId`/`iosSha256`/`iosTestFlightUrl`）并部署；公网校验 **8/8 PASS** |
| J | ✅ | `AppUpdateCard` 加 iOS 分支（App Store 提示 / TestFlight / 直装 .ipa），`AppVersion.ts` 加扁平 ios 字段；`tsc --noEmit` exit 0 |

### 11.3 本轮真正的阻塞：App Store Connect 里没有 `cn.xrobinai.app` 应用记录

- `GET /v1/apps` total=**1**，仅 `HJ大眼蛙 (cn.dayanwa.dayanwa)`；`filter[bundleId]=cn.xrobinai.app` → total=**0**。
- `altool --list-apps` 同样只列出 HJ大眼蛙。
- 结论：Issuer ID 不再是阻塞；**新阻塞 = ASC 没有 coolie 的 App 记录**，而 TestFlight 上传前**必须**先建档。动作在 ASC 网页（我的 App → `+` → bundle id 选 `cn.xrobinai.app`），属 boss/PM，本机无法代劳。

### 11.4 本轮新发现的坑（诚实标注）

1. **App Store 签名的 ipa 不能直装**：本 profile 无 `ProvisionedDevices`、无 `ProvisionsAllDevices`、`get-task-allow=false` → 只能走 TestFlight。故 J 的「区块 3 直接下载 .ipa（itms-services 真机装）」对本波产物**不成立**；真机直装需 Ad Hoc（带 UDID）或企业证书另出一包。
2. **本 ipa 早于 J 的代码改动**：任务书把 D(archive) 排在 J 之前，故 ipa 内嵌的 JS bundle **不含** iOS 升级 UI；要在 iPhone 上生效须重打（并重传 COS + 改 sha256）。
3. **altool 无 `--jwt-token`**：Xcode 27 altool（27.0.5）认证只有 `--api-key/--api-issuer/--p8-file-path`（或用户名密码 / `--generate-jwt`）。任务书的 `--jwt-token` 语法不存在。
4. **`method=app-store` 已弃用**：Xcode 27 警告改用 `app-store-connect`（本次仍成功）。
5. **既有脚本与 v6 任务书冲突**：`scripts/release-ios-cos.sh` 回填的是**嵌套** `ios:{…}`；`release-ios-build.sh` 用 `APPLE_TEAM_ID`+自动签名、且默认 `APPLE_BUNDLE_ID=cn.xrobinai.cn`（错）。v6 明确要**扁平**顶层字段，故本轮手跑 D–I 未用这两个脚本。
6. **`coscli config show` 会把本地 COS SecretKey 明文打印**（本次误触发一次；值在你本机 `~/.cos.yaml`，**未入仓**）。
7. **stash@{0}「wave149-v3 in-flight」里有 v3 的 AppUpdateCard/AppVersion 改动（嵌套 `ios`）**，与 v6 的扁平字段冲突；`git stash pop` 时 `App.tsx`/`AppVersion.ts` 预计冲突，需以 v6 扁平口径为准。

### 11.5 交付物 & 仓状态

- 产物：`clients/expo/ios/build/ipa/cn.xrobinai.app.ipa`（在 `ios/` 下，被 `.gitignore` 忽略，未入仓）；COS 对象 `coolie/app/0.6.0/coolie-release-ios.ipa`。
- 线上：`https://xrobinai.cn/version.json` 顶层新增 4 个 ios 字段；远端已备份 `version.json.bak-20260929-233037`。
- 本轮**改动但未提交**（本地）：`clients/expo/App.tsx`、`clients/expo/src/AppVersion.ts`、根 `version.json`、本报告。
- **未触碰**：`clients/expo/app.json`（他人改动）、`scripts/release-ios-*.sh`、`scripts/e2e/*`。
- **未 push**（按 `docs-coolie/BRANCHING.md` §4：推送攒批，等明确指令）。

### 11.6 RELEASE-HISTORY 取舍

任务书要求加 `v0.6.0-ios-testflight` 行。但 **TestFlight 未上**（H 阻塞），加该 tag 行即失真。故与 v3/v4/v5 一致：**不加 tag 行**，仅在本报告 §11 记录「iOS 包已出」。待 ASC 建档 + TestFlight 真上传成功后再补。

### 11.7 boss 解锁清单（本轮更新）

- 🔴 **必需**：在 App Store Connect 创建 App（bundle id `cn.xrobinai.app`）→ 之后可 `altool --upload-app` 上 TestFlight。
- 🟡 建议：拿到 TestFlight 公开链接后填 `iosTestFlightUrl`；如需真机直装，另配 Ad Hoc profile 出一包。
- ⚪ 可选：重打 ipa 以纳入 J 的 iOS 升级 UI（须重传 COS + 改 sha256）。

