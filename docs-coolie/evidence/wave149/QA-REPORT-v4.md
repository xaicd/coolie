# wave149-v4 — iOS: App Store Distribution + TestFlight (阶段一) 报告

- 日期: 2026-09-29
- 执行: CLI agent (coolie main @ df14c27ea, 工作区脏)
- 任务书: wave149-v4（boss 2026-09-29 23:30 拍板「直接发 App Store」）
- 状态: **阶段一未通过，且发现一个必须上报的并发写入冲突。** 阻塞点是「凭证」(与 wave149-v1 同因)，另有一个**仍在运行的 wave149-v3 会话正在改同一批文件**——见 §2。本报告只写实测真值，凡推理标 **[假设]**。
- 一句话: **`cn.xrobinai.app` 的 Distribution profile 不存在 + Xcode 里 Apple ID `waj_615@qq.com` 会话被拒 → 本机打不出签名 .ipa（阶段一 C~H 全部未跑）；同时 v3 会话正在就地构建「ad-hoc 扫码直装」那条已被 v4 作废的路径，v4 与它撞车。**

> 诚实边界: 我没有产出任何 .ipa / 没有上传 COS / 没有写 version.json / 没有改 v3 的脚本或 App 代码（原因见 §2、§8）。两个 shell 脚本 (v3 产物) 在我阅读期间仍在被改写，故本报告按「行为」而非「行号」描述它们。

---

## 0. 环境真值 (实测)

| 项 | 真值 | 来源 |
|---|---|---|
| Xcode | 27.0 (27A266a)，iOS SDK 27.0 | `xcodebuild -version` / `-showsdks` |
| 发行证书 | `Apple Distribution: wei chen (UU7T5893WZ)` 有效 | `security find-identity -v -p codesigning` |
| 已装 profile | 2 个，均为 `UU7T5893WZ.cn.dayanwa.dayanwa`（App Store 型） | `security cms -D -i …` |
| `cn.xrobinai.app` 的 profile | **不存在** | 同上 + 归档探针报错 (§1) |
| app.json | `expo.ios.bundleIdentifier=cn.xrobinai.app` / `expo.android.package=cloud.coolie.app` / `version=0.5.97` / `android.versionCode=597` | `clients/expo/app.json` |
| 原生版本 | pbxproj `MARKETING_VERSION=1.0`、`CURRENT_PROJECT_VERSION=1`；Info.plist `CFBundleShortVersionString=0.1.0`、`CFBundleVersion=1` | `grep` / `plutil` |
| 旧构建产物版本 | 模拟器 Debug 包 → `0.1.0` / `1` / **`cloud.coolie.app`** | `plutil` on `ios/build/DerivedData/…/Coolie.app/Info.plist` |
| coscli | v1.0.9，`~/.cos.yaml` 在 | `coscli --version` |
| COS 0.5.97 前缀 | 只有 `coolie-release.apk`，**无 ipa** | `coscli ls cos://gzbucket/coolie/app/0.5.97/` |
| 线上 version.json | 扁平结构，**无 `platform` / `ios` 字段** | `curl https://xrobinai.cn/version.json` |
| `~/secure/` | 存在，但内容由 **v3 会话**于 20:46 建立（非 v4） | 见 §2 |

---

## 1. 硬阻塞：阶段一 C~H 无法进行（本轮实测，非沿用上波结论）

本轮重新跑了一次自动签名归档探针（`xcodebuild … archive CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM=UU7T5893WZ -allowProvisioningUpdates`），**exit=65，快速失败**，原始 stderr：

```
Coolie.xcodeproj: error: The operation couldn't be completed. Unable to log in with account
  'waj_615@qq.com'. The login details for account 'waj_615@qq.com' were rejected.
Coolie.xcodeproj: error: No profiles for 'cn.xrobinai.app' were found: Xcode couldn't find any
  iOS App Development provisioning profiles matching 'cn.xrobinai.app'.
** ARCHIVE FAILED **
```

两个独立原因叠加，与 wave149-v1 完全一致：

1. **Xcode 里 Apple ID `waj_615@qq.com` 会话被拒**（登录失效）；
2. **`cn.xrobinai.app` 本地无 profile**，且因 (1) 不能靠 `-allowProvisioningUpdates` 去后台现开。

→ **archive 起不来，就没有 .ipa；没有 .ipa，`-exportArchive` / COS / TestFlight / version.json / App 内 iOS 区块全部无从谈起。** 这是阶段一的第一道门，且**只有 boss 能开**（§6）。

> 附带真值（推翻任务书 C.4 的一条假设）: 上表「旧构建产物」显示，装机 App 实际读到的版本是 **Info.plist 的裸字符串 `0.1.0` / `1`**，而不是 pbxproj 的 `MARKETING_VERSION=1.0`。**即：任务书 C.4 只 sed pbxproj 两个变量是不够的**——还必须改 Info.plist 的 `CFBundleShortVersionString` / `CFBundleVersion`，否则包内版本号仍是 `0.1.0`，`runtimeVersion(policy=appVersion)` 会与 OTA 口径对不上。（v3 会话的 `release-ios-build.sh` 已同时改这两处，方向正确。）

---

## 2. ⚠️ 并发写入冲突：v4 任务书下达时，v3 会话仍在运行

这是本轮最重要、也最需要 dispatcher/boss 知晓的发现。

**实测：** 本会话开始 (~20:44) 时 `scripts/release-ios-cos.sh` **不存在**；到 20:52，工作区里已经出现了一整套 **wave149-v3 的 iOS 工具与 App 改动**，且在我阅读期间持续被改写（mtime 一直在动）:

| 路径 | mtime (实测) | 状态 | 内容 |
|---|---|---|---|
| `scripts/release-ios-build.sh` | 20:47 → 20:52:33 仍在变 | 未跟踪 | prebuild→修版本→pod install→archive→exportArchive |
| `scripts/release-ios-cos.sh` | 20:48 → 20:52 仍在变 | 未跟踪 | COS 直传 + manifest.plist/QR + `--register` + 4 护栏 |
| `clients/expo/src/AppVersion.ts` | 20:49:00 | 已改 | 加 `RemoteIosBuild` + `RemoteVersionInfo.ios?`（向后兼容） |
| `clients/expo/App.tsx` | 20:50:02 | 已改 | `AppUpdateCard` 加 iOS 分支（itms-services/QR/爱思助手兜底） |
| `clients/expo/app.json` | 20:43:38 | 已改 | bundleIdentifier → cn.xrobinai.app |
| `~/secure/ios-build.env` | 20:46:24 | 新建 | v3 建立（自述「由 wave149-v3 建立」） |

**进程侧：** 有多个 `command-code` 进程在跑（PID 57802 @20:43、59800 @20:45 等），与文件 mtime 吻合 → **[假设] 一个 wave149-v3 会话此刻仍在活跃写盘。**

**结论：v4 任务书「PM 已加 scripts/release-ios-cos.sh」成立，但它是 v3 会话『刚刚』加的（未提交、仍在改），不是既有的稳定资产。** 我**没有**动这些文件（理由见 §8）——在我编辑与它编辑之间，双方都会丢改动。

### 2.1 关键差异：v3 产物走的是 ad-hoc，不是 App Store

v3 这套是**「未签名/ad-hoc + itms-services 扫码直装」**那条路径，即 v4 任务书明确**作废**的路数：

- `~/secure/ios-build.env` 里 `IOS_EXPORT_METHOD=ad-hoc`，`APPLE_PROFILE_NAME='cn.xrobinai.cn Ad Hoc'`；
- `release-ios-build.sh` 默认出 `--no-codesign` 未签名包 + 导出 method 默认 `ad-hoc`；
- `release-ios-cos.sh` 生成 **`itms-services` manifest.plist + 安装二维码**（这套只对 **ad-hoc** 有效）；
- `App.tsx` 的 iOS 分支提示「iPhone 用 Safari 扫码安装 / 下载 .ipa 后用爱思助手重签」。

**技术事实：v4 要的 App Store Distribution 签名 .ipa 无法用 itms-services 安装，也无法被爱思助手重签安装——它只能走 TestFlight / App Store。** 所以 v3 的安装 UX（manifest+QR+重签）与 v4 的目标互斥，必须替换。

---

## 3. v3 产物中发现的问题（供 v3 会话/后续 v4 收敛）

1. **bundle id 拼错（高危）**：`~/secure/ios-build.env` 里 `APPLE_BUNDLE_ID=cn.xrobinai.cn`，`APPLE_PROFILE_NAME='cn.xrobinai.cn Ad Hoc'`。**正确值是 `cn.xrobinai.app`**（任务书 + app.json/Info.plist/pbxproj 三处一致）。用 `.cn` 去建 App ID / profile 会直接建错对象。**[假设]** 这是笔误；`.app` 为准。
2. **`--register` 会写工作区内的 tracked 文件**：`release-ios-cos.sh` 在 register 分支把合并后的 version.json `cp` 回**仓库内的 `version.json`**。该文件是 tracked 的，会被改脏，需要按 taste 惯例单独一个 `chore(release): version.json …` commit——脚本里没有提示这一步。
3. **护栏顺序**：任务书要求「上传 COS **前** 4 项护栏」，v3 脚本是在**上传后**做 4 项 HTTP 200 断言（version.json/ota/manifest/ios manifest/health）。语义上「上传后回归」也可，但与任务书措辞不符，需确认。
4. **`--help` 尾部多打印两行**（`====` 和 `set -euo pipefail`）：`sed -n '3,26p'` 的范围比头部注释长，属外观小瑕疵。
5. **version.json 形状**：v3 的 `--register` 是**在顶层加 `ios` 键**（保留顶层 android 字段）——这是**对的**，因为线上 App 的 `AppVersion.ts` 读的是**扁平** `downloadUrl`/`version`/`versionCode`。若按任务书 G.3 改成嵌套 `platform:{android,ios}`，**会把现网 App 的升级检测打断**（`info.downloadUrl` 变 undefined → 判定「无更新」）。**故 v4 必须沿用「顶层扁平 + 追加 `ios` 子对象」的加法式结构。**
6. `APPLE_PROFILE_UUID` / `ADMIN_API_TOKEN` 仍为空；且 `ADMIN_API_TOKEN` 注为占位（Coolie 无 admin API）——合理。

---

## 4. v4 相对 v3 的净增量（app-store + TestFlight）

> 这些**尚未落地**（既因 §1 阻塞，也因 §2 冲突，我没有改 v3 的在写文件）。列出来，供 v3 收敛后一次性改。

1. **导出方式**：`IOS_EXPORT_METHOD` 由 `ad-hoc` → **`app-store`**；`ExportOptions.plist` 用 `method=app-store`、`signingStyle=manual`、`teamID=UU7T5893WZ`，并指定 App Store profile（不能是 automatic + ad-hoc profile）。
2. **去掉 ad-hoc 安装 UX**：`App.tsx` 的 iOS 分支改为三段（**上架前先隐藏前两段**）：
   - 段1 App Store 链接 `itms-apps://itunes.apple.com/app/<id>`（未上架 → 显示「即将上架」）；
   - 段2 TestFlight 链接（内部测试，boss 可见）；
   - 段3 直下 .ipa（开发期兜底）。
   删掉 manifest.plist / itms-services / 二维码 / 爱思助手重签那套。
3. **新增 TestFlight 上传**（v3 没有）。**更正任务书 F.2 的事实错误：`xcrun notarytool submit` 是 macOS/Developer ID 的公证工具，与 TestFlight/App Store 无关。** 正确通路二选一：
   - `xcrun altool --upload-app -f <ipa> -t ios --apiKey <KeyID> --apiIssuer <IssuerID>`（ASC API Key，推荐）；或
   - `xcrun altool --upload-app -f <ipa> -t ios -u <APPLE_ID> -p <app-specific-password>`；或
   - 用 **Transporter.app** 图形上传（最省事）。
   （`altool` 已被 Apple 标记 deprecated，但仍是当前可用的命令行通路。）
4. **`release-ios-cos.sh` 的 `--register` 收窄**：iOS 场景不再需要 manifest/QR；`ios` 子对象改为 `{version, downloadUrl, bundleIdentifier, teamId, sha256, sizeBytes, testflightUrl}`（去掉 installUrl/manifestUrl/qrUrl 或保留但置空）。**顶层 android 字段保持不变。**

---

## 5. boss 解锁清单（阶段一，最小）

> 与任务书 A/B 基本一致，但要开两把「门」：一个**后台通路**（让本机能签名）+ 一个 **TestFlight 上传凭证**。

**门 1 — 让 `cn.xrobinai.app` 能被签名（必须，二选一）**

- **1A（最省事，推荐）**：Xcode → Settings → Accounts → `waj_615@qq.com` 重新输入密码登录（现在会话被拒）。登好后我可用 `-allowProvisioningUpdates` 让 Xcode 自动建 App ID + profile，只需再确认 App Store Connect 里已建 App。
- **1B（命令行，一劳永逸）**：App Store Connect → Users and Access → Keys → 生成 **.p8 + Key ID + Issuer ID**，放 `~/secure/asc_key.p8`。（**注意：**[假设] `.p8` 可作为 `-authenticationKeyPath` 驱动 `-allowProvisioningUpdates` 自动建 profile；请以 Xcode 版本实际支持为准。）

**门 2 — `cn.xrobinai.app` 的标识与描述文件（无论走 1A/1B 都要有对象）**

1. developer.apple.com → Identifiers → **+** → App IDs → Bundle ID `cn.xrobinai.app`（Name 随意，如 `Coolie 工坊`）。
2. Profiles → **+** → **App Store** → 选 `cn.xrobinai.app` → 选发行证书 `wei chen (UU7T5893WZ)` → Create → Download `.mobileprovision` → 放 `~/Library/MobileDevice/Provisioning Profiles/`。
   （App Store 型不需要选设备。）
3. App Store Connect → My Apps → **+** → New App：iOS / Name `coolie工坊` / Primary Language 简中 / Bundle ID `cn.xrobinai.app` / SKU `coolie-ios-001` / Full Access。

**门 3 — TestFlight 上传凭证（二选一）**

- **3A**：appleid.apple.com → App-Specific Passwords → 生成，存 `~/secure/apple-app-specific-password.txt`（配 `APPLE_ID`）。
- **3B**：复用门 1B 的 ASC API Key。

**收拢**：把以上值填进 `~/secure/ios-build.env`（模板见 `~/secure/ios-build.env.example`；**若沿用 v3 的 env，只需改 3 处：** `APPLE_BUNDLE_ID`→`cn.xrobinai.app`、`IOS_EXPORT_METHOD`→`app-store`、补 profile/凭证）。

---

## 6. 任务书与实盘的偏差（更正）

| 任务书 | 实盘真值 |
|---|---|
| 「PM 已加 scripts/release-ios-cos.sh」 | 该文件**存在但是 v3 会话刚建、未提交、仍在改**（§2） |
| 「H) UpgradeScreen.tsx 加 ios 分支 (沿用 wave149-v3)」 | **仓库里没有 `UpgradeScreen.tsx`**；真正的升级 UI 是 `clients/expo/App.tsx` 内的 `AppUpdateCard`，version.json 解析在 `src/AppVersion.ts` |
| 「F.2 … 或 xcrun notarytool submit …（推荐）」 | **错**：notarytool 是 macOS 公证，不用于 TestFlight/App Store（§4.3） |
| 「C.4 sed 修版本漂移」 | 只 sed pbxproj **不够**，Info.plist 的裸 `0.1.0`/`1` 才是装机读到的值（§1 附注） |
| 「G.3 version.json 用嵌套 `platform:{android,ios}`」 | **会打断现网 App 升级检测**，必须用「顶层扁平 + 追加 `ios`」加法式（§3.5） |
| 「凭证收拢 ~/secure/… 已 gitignored」 | `~/secure/` 在**仓库之外**，本就永不入仓（比 gitignore 更强）；无需 root .gitignore 条目 |
| 「上传 COS 前必须 4 项护栏」 | v3 实现为**上传后**的 4×HTTP200 断言（§3.3），需对齐口径 |
| 「RELEASE-HISTORY 加 v0.5.97-ios 行」 | **未加**——本轮没有任何东西上线，加行即失真（§8） |

---

## 7. 我做了什么 / 没做什么

**做了（只读或仓库外）：**
- 复核签名资产 / profile / 版本漂移 / COS 前缀 / 线上 version.json —— §0。
- 重跑自动签名归档探针，取得本轮**新鲜**失败证据 —— §1（探针未生成 xcarchive，无需清理）。
- **检出并发写入冲突**并保留 v3 在写文件不动 —— §2（这是本波最有价值的产出）。
- 建立 `~/secure/ios-build.env.example`（v4/App Store 版模板，**仓库外**，非 v3 那支）。
- 对 v3 两个脚本做只读语法/参数校验：`bash -n` 通过；`--version` 缺失时正确 `exit=1` 并给明确报错。

**没做（及原因）：**
- 未跑 `expo prebuild` / `pod install` / `archive` / `-exportArchive` → **§1 硬阻塞，无 .ipa**。
- 未上传 COS / 未写 version.json / 未跑 `--register` → 无 ipa；且 `--register` 会改生产 version.json（共享系统，需 boss 明确 go）。
- **未修改** `scripts/release-ios-*.sh`、`clients/expo/{App.tsx,src/AppVersion.ts,app.json}`、`~/secure/ios-build.env` → **§2 并发写入，改动会丢**。
- 未加 `RELEASE-HISTORY.md` 行、未 commit、未 push → 无发布事实。
- 未加入/未重建 `AH` 任何 UI —— 等 §1 解锁 + §2 收敛。

---

## 8. 下一步（一句话）

**boss 开「门 1 + 门 2 + 门 3」三把锁**（§5），并**等 v3 会话落定（提交或停写）**；随后把 v3 的 ad-hoc 工具按 §4 一次性转成 app-store + TestFlight，即可打通阶段一：出签名 .ipa → 上传 COS → `altool` 传 TestFlight → 加内部测试员 → `--register` 回填 version.json 的 `ios` 字段。

**假设与不确定（显式标注）：**
- **[假设]** 20:46 之后出现的 v3 文件出自一个仍在运行的并发会话（依据：mtime 持续变动 + 多个 `command-code` 进程）；我无法直接看到该会话的意图。
- **[假设]** `.cn` 是笔误，`.app` 为准（依据：任务书 + 三处代码）。
- **[假设]** 门 1B 的 `.p8` 能驱动 `-allowProvisioningUpdates` 自动建 profile（未在本机验证）。
- 本报告未含任何私钥/口令值；`~/secure/ios-build.env` 的 `APPLE_DIST_P12_PASSWORD` 为空。
