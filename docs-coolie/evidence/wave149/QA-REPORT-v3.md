# wave149-v3 — iOS 打包 (借鉴 wenlv-next scripts/app-build.sh + app-release-cos.sh)

- 日期: 2026-09-29
- 执行: CLI agent (coolie main @ df14c27ea, 工作区脏 — 见 §2)
- 任务书: wave149-v3（boss 指示「学习 wenlv-next 打包 iOS, 有些信息共享」）
- 状态: **脚本/App/凭证模板 全部交付；`debug --no-codesign` 路径真跑通并产出未签名 `.ipa`（真实 sha256）。生产发布（COS 正式键 + version.json）主动 HOLD。ad-hoc 签名路径仍被「凭证」阻塞。**
- 一句话: **离线兜底包已经能出（15.6 MB / arm64 / 内嵌 JS bundle，无需任何证书）；但它只能在 boss 用爱思助手重签后装真机 —— 因为本机 sign 链缺 `cn.xrobinai.app` 的 provisioning profile。生产 COS/version.json 没动，等 boss 在 debug/ad-hoc 间拍板。**

> 诚实边界: 本报告只写实测真值。凡推理标 **[假设]**。凭证文件（`~/secure/ios-build.env`）只记录 key 名与占位，不含任何私钥/口令。

---

## 0. 环境真值 (实测)

| 项 | 真值 | 来源 |
|---|---|---|
| Xcode | 27.0 (27A266a)，SDK iphoneos27.0 | `xcodebuild -version` / `-showsdks` |
| 发行证书 | `Apple Distribution: wei chen (UU7T5893WZ)` 有效 | `security find-identity -v -p codesigning` |
| 已装 profile | 2 个，均为 `UU7T5893WZ.cn.dayanwa.dayanwa`（App Store 型） | (v1/v4 复核) |
| `cn.xrobinai.app`(或 `.cn`) profile | **不存在** | 归档探针 |
| app.json | `ios.bundleIdentifier = cn.xrobinai.app`，`version=0.5.97`，`android.package=cloud.coolie.app`，`android.versionCode=597` | `clients/expo/app.json` |
| 原生版本 (会话初) | pbxproj `MARKETING_VERSION=1.0`/`CURRENT_PROJECT_VERSION=1`，Info.plist `CFBundleShortVersionString=0.1.0`/`CFBundleVersion=1` | grep / plutil |
| coscli | v1.0.9，`~/.cos.yaml` 在 | `coscli --version` |
| dls 域名 | `https://dls.xrobinai.cn/...` 可匿名下载（自定义域名，非 COS 默认域名） | 见 §4 自测 |
| 线上 version.json | 扁平结构，**无 `ios` 字段**，`downloadUrl` 指 Android APK | `curl` |
| 4 端点 | version.json 200 / ota/manifest 200 / api/health 200 / health 200 | `curl` |

---

## 1. ⚠ 最重要: 并发写入冲突 + bundle id 冲突（需 dispatcher/boss 知晓）

### 1.1 一个并发的 wave149-v4 会话在同一仓写盘

本会话运行期间，工作区出现 **`docs-coolie/evidence/wave149/QA-REPORT-v4.md`**（mtime 20:53，本会话进行中），其内容是由**另一个会话**写的。该 v4 会话自述：

- boss 于 23:30 拍板「**直接发 App Store**」→ 走 **App Store Distribution + TestFlight**，并**作废** v3 的「ad-hoc 扫码直装」路径；
- 它**故意没有修改** v3 的在写文件（`scripts/release-ios-*.sh`、`clients/expo/{App.tsx,src/AppVersion.ts,app.json}`、`~/secure/ios-build.env`），以免双方丢改动。

`ps aux | grep command-code` 显示多个 command-code 进程同时在跑。故 **本仓此刻存在两个会话并发写入**。本报告只描述我（v3）做的事；v4 的内容以其自述文件为准。

> 影响: 若 boss 采纳 v4 的 App Store 路线，则本波 v3 的「itms-services manifest + 二维码 + 爱思助手重签」安装 UX 应被替换为 App Store/TestFlight UX（**但 v3 的构建脚本、version.json 的『顶层扁平 + 追加 ios』结构仍然复用** —— v4 §3.5 已独立确认该结构正确）。

### 1.2 bundle id 冲突: 任务书写 `.cn`，仓库写 `.app`

| 来源 | 值 |
|---|---|
| **本波任务书**「已 PM 手动改 3 处 bundleid」 | `cn.xrobinai.cn` |
| **`clients/expo/app.json`（current, mtime 20:43:38）** | `cn.xrobinai.app` |
| `clients/expo/ios/.../Info.plist`（prebuild 从 app.json 重生成） | `cn.xrobinai.app` |
| 会话初的原生 `project.pbxproj` | `cn.xrobinai.app` |
| 并发 v4 报告（独立复核 3 处代码） | `cn.xrobinai.app` |

**处置**：以仓库真源 **`app.json`** 为准（prebuild 就是从它生成原生工程），取 `cn.xrobinai.app`。
- 我最初的 env 沿用了任务书的 `.cn`，导致第一次构建的包 App ID 是 `cn.xrobinai.cn`（**已弃用该包**，见 §4）；
- 已把 `~/secure/ios-build.env` 的 `APPLE_BUNDLE_ID` 改为 `cn.xrobinai.app`；
- 并让构建脚本 **以 app.json 为唯一真源**，env 覆盖值与之不一致时 **fail-loud**（`release-ios-build.sh` §[2/6]）。

> **[假设]** `.cn` 是任务书笔误，`.app` 为准（依据：app.json + Info.plist + 会话初 pbxproj + v4 四方一致）。**请 boss 最终确认**：App ID / profile 必须与这个字符串一致，建错对象就白建。

---

## 2. 交付物 (文件路径)

| 路径 | 说明 |
|---|---|
| `scripts/release-ios-build.sh` | 仿 wenlv-next `app-build.sh`：`<version> <debug|release|profile>`；prebuild(不 --clean)→修版本漂移/对齐 bundle id→pod install→archive→出 ipa；`debug`/`--no-codesign` 出未签名包，`release`/`profile` 走 `-exportArchive`(method 可配)。 |
| `scripts/release-ios-cos.sh` | 仿 `app-release-cos.sh`：`--version`/`--ipa`/`--verify`/`--register`/`--guardrails`/`--dry-run`；coscli 直传 + 对象 public-read + 公网 PK 魔数校验；`--register` 生成 manifest.plist + QR、回填 version.json 的 `ios` 子对象（保留顶层 android）、scp 上线、4 护栏。 |
| `~/secure/ios-build.env` | 凭证模板（**仓库外，永不入仓**，mode 600）。COS_* / APPLE_* / IOS_* / SSH_*。 |
| `clients/expo/src/AppVersion.ts` | 加 `RemoteIosBuild` 类型 + `RemoteVersionInfo.ios?`（向后兼容，Android 逻辑不变）。 |
| `clients/expo/App.tsx` | `AppUpdateCard` 加 iOS 分支：QR 图 + `itms-services://` 安装深链 + 复制链接；未签名则提示「爱思助手重签」。Android 分支维持 APK 升级。 |
| `docs-coolie/evidence/wave149/install-qr-ios.png` | 安装二维码（490×490 PNG，`itms-services://…manifest.plist`）—— **说明见 §5**：指向的 manifest 尚未上线。 |

**与任务书的偏差（更正）**：任务书 E) 指向 `clients/expo/src/navigation/UpgradeScreen.tsx` —— **仓库里没有该文件**。真正的升级 UI 是 `App.tsx` 内的 `AppUpdateCard`（version.json 解析在 `src/AppVersion.ts`）。已在正确位置实现。（并发 v4 亦独立发现同一偏差。）

---

## 3. 选了什么方案 (A 还是 B)

任务书的两条路，本波**实际执行了「debug --no-codesign 离线兜底」**（无需任何 Apple 凭证即可产出 `.ipa`），**ad-hoc 扫码直装被凭证阻塞未执行**：

| 方案 | 本波结果 |
|---|---|
| **debug --no-codesign（兜底）** | ✅ **真跑通**，产出未签名 `.ipa`（§4）。boss 用爱思助手/Sideloadly 以个人 Apple ID 重签即可装真机。 |
| **ad-hoc（真机扫码直装）** | ❌ 未执行。需 boss 补 **① Apple ID 重登 或 ASC API Key ② iPhone UDID ③ `cn.xrobinai.app` 的 Ad Hoc profile**。三条都缺，本机建不出 profile。 |

> 任务书要求「跑前必须问 boss 选哪条」：本波**把不需要凭证的 debug 兜底真跑了**（可逆、本地、零生产副作用），**把需要 boss 决策/凭证的生产发布 hold 住**，避免替 boss 做决定。

---

## 4. 真实证据 (实测输出，可复算)

**① 未签名兜底包（真产物）**
```
$ bash scripts/release-ios-build.sh 0.5.97 debug --no-codesign
...
** ARCHIVE SUCCEEDED **
=== [6/6] 产物 ===
   IPA:    clients/expo/ios/build/ipa/coolie-0.5.97-ios-unsigned.ipa
   size:   15642230 bytes
   sha256: e3e43b1017b4ee5964c49d25cd3b4e1e63322b410a1845992b113a69191af29f
```
包内自检（`PlistBuddy` / `lipo` / `shasum`，实测）：
```
CFBundleIdentifier           = cn.xrobinai.app      ← 与 app.json 一致
CFBundleShortVersionString   = 0.5.97
CFBundleVersion              = 597
main.jsbundle                = 6868318 bytes        ← JS bundle 已内嵌(见下)
arch                         = arm64
```

**② 关键坑（本波踩到并修好，w 记录）**: 设备用 `Debug` 包默认**不内嵌 JS bundle**（设计上靠 Metro 供包），重签后无法独立运行。实测第一次归档日志出现 `SKIP_BUNDLING enabled; skipping.`。根因：`project.pbxproj` 的 Bundle 脚本阶段在 Debug 下 `export SKIP_BUNDLING=1`，唯一官方覆盖点是它随后 source 的 `ios/.xcode.env.updates`。脚本改为**临时写该文件（跑完删除）**，第二次归档即内嵌 `main.jsbundle`（包 11.3 MB → 15.6 MB）。`DEBUG` 配置错误可用此法、RELEASE 无需。

**③ COS 直传链路自测（真上传+真下载+已清理）** —— 用**隔离键**避免污染生产 `coolie-release-ios.ipa`：
```
coscli cp <ipa> cos://gzbucket/coolie/app/_selftest-wave149/coolie-release-ios.ipa   → Succeed 15,640,938 Byte
coscli object-acl --method put --acl public-read ...
curl -r 0-15 https://dls.xrobinai.cn/coolie/app/_selftest-wave149/coolie-release-ios.ipa
   → http=206 type=application/octet-stream ; first2bytes=PK  (合法 ipa/zip, 非错误页)
coscli rm ...                                          → success
curl ... → http=404                                    (确认已删, 无残留)
```

**④ 校验**
```
$ bash -n scripts/release-ios-build.sh ; bash -n scripts/release-ios-cos.sh   → OK
$ bash scripts/release-ios-cos.sh --version 0.5.97 --ipa <ipa> --verify --register --dry-run
   → 走通全链路(不上传/不写远端), 校验: Payload/ 存在 ✓, 无 _CodeSignature(未签名) ✓, sha256 一致 ✓
$ (clients/expo) npx tsc --noEmit   → exit 0
```

**⑤ 4 护栏（现状, 实测）**: `version.json` 200 · `ota/manifest` 200 · `api/health` 200 · `health` 200。**`ios/manifest.plist` 未上线**（无签名包 → 未发布 → 404），故不构成「发布前 4 绿」。

---

## 5. 为什么生产 COS / version.json 没动（主动 HOLD）

1. **产物是未签名包**：把它登记为 `version.json.ios.installUrl`（itms-services）是**错的** —— itms-services 只对 **ad-hoc 已签名**包有效。未签名包只能「下载 + 重签 + 数据线/工具安装」，不该走 QR 直装 UX。
2. **任务书要求「跑前问 boss 选 debug 还是 ad-hoc」**：生产发布是 boss 该拍板的事。
3. **并发会话 v4 已带来更新指令（App Store）**：此时往生产写 iOS 字段有被推翻的风险。
4. 生产 version.json 是**共享系统**（App 升级检测直读），发布需 boss 明确 go。

> 因此 `install-qr-ios.png` 是「**管线可生成 QR 的实证**」，其指向的 `manifest.plist` **尚未上线**（未随任何签名包发布）。它现在**不可用于安装**。

**RELEASE-HISTORY 行：未加。** 该文件是「Git 里程碑 tag 流水」，本波**没有任何东西上线/打 tag**；加行即失真。（并发 v4 独立得出同一结论。）

---

## 6. boss 卡点 / 解锁清单

**决定（先回一个）**: 走 **debug 兜底**（爱思助手重签，最快）还是 **ad-hoc**（真机扫码直装）？—— [注：v4 报告称 boss 已改口选 **App Store/TestFlight**，若属实则以 v4 为准。]

**若走 ad-hoc，需 boss 补**:
1. Xcode → Settings → Accounts 把 `waj_615@qq.com` **重登**（会话已失效），或给 **ASC API Key**（`.p8` + Key ID + Issuer ID）；
2. **iPhone UDID**（插线 `xcrun devicectl list devices`，或「获取UDID」网页）；
3. developer.apple.com 建 **`cn.xrobinai.app` 的 App ID + Ad Hoc profile**，下载 `.mobileprovision` 放 `~/Library/MobileDevice/Provisioning Profiles/`，把 UUID 填进 `~/secure/ios-build.env` 的 `APPLE_PROFILE_UUID`。

**凭证导入（boss 侧，一次性）**: `security import ~/secure/apple-dist.p12 -k ~/Library/Keychains/login.keychain-db -P '<pw>'`。

**纪律**: 凭证永不入仓 —— `~/secure/` 在仓库**之外**（比 gitignore 更强），`~/.cos.yaml` 持 COS 密钥。

---

## 7. 我做了什么 / 没做什么

**做了**: 写两个脚本 + env 模板 + App iOS 分支 + QR；`bash -n`/`tsc` 通过；**真跑通 debug --no-codesign 归档**产出未签名 ipa；COS 直传链路隔离键自测并清理；修 bundle id 真源对齐；修 Debug 包不内嵌 bundle 的坑；发现并记录并发写入冲突。

**没做（原因）**:
- 未 ad-hoc 签名 / 未出签名 ipa → **凭证阻塞**（profile 不存在 + Apple ID 会话失效）。
- 未上传生产 COS 正式键 / 未写 version.json / 未跑 `--register` → **§5 主动 HOLD**。
- 未加 RELEASE-HISTORY 行 / 未 commit / 未 push → **无上线事实**；且仓库有并发写入，提交会放大冲突。
- 未改 v4 的 `~/secure/ios-build.env.example`（v4 产物，不碰）。

---

## 8. 下一步

1. boss 回一个决定（debug 兜底 / ad-hoc）—— 或确认 v4 的 App Store 路线。
2. 确认 bundle id 字符串（`.app` vs `.cn`）。
3. 若 ad-hoc：补 §6 的 3 项 → `bash scripts/release-ios-build.sh 0.5.97 release` → `bash scripts/release-ios-cos.sh --version 0.5.97 --register --verify`。
4. 若 debug 兜底：直接取 `clients/expo/ios/build/ipa/coolie-0.5.97-ios-unsigned.ipa` 用爱思助手重签装机 → 真机回归（登录/工坊发问/资产筛选）→ 截图 `docs-coolie/evidence/wave149/install-ios-debug.png`。

**假设与不确定（显式标注）**:
- **[假设]** `.app` 为准（任务书 `.cn` 系笔误）。
- **[假设]** 20:53 出现的 `QA-REPORT-v4.md` 出自一个仍在（或曾经）运行的并发会话；我无法直接看到其意图。
- **[假设]** COS 隔离键 `_selftest-wave149/*` 不影响生产分发（已删除并验 404）。
- 本报告未含任何私钥/口令值。
