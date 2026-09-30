# wave149 — iOS 打包 (.ipa) 阻塞报告

- 日期: 2026-09-29
- 执行: CLI agent (coolie 仓库 main @ df14c27ea)
- 状态: **阶段一 (凭证) 未通过 → 阶段二/三/四 未开始。** 卡点是「凭证」，且与 wave149 任务书的前提不符 —— 见 §1。所有结论附原始证据 (命令输出真值)。凡推理处标 **[假设]**。
- 结论一句话: **磁盘上已有分布证书，缺的是 `cloud.coolie.app` 的 Provisioning Profile；而 Xcode 里用于自动签名的 Apple ID 会话已失效，所以本机无法自建该 profile。需 boss 补一次登录 + 一个决定 (app-store 还是 ad-hoc)。**

> 诚实边界：本报告只写查到的真值。阶段二起的 xcodebuild / COS 上传 / 真机回归 **未执行**，因为签名第一步就失败。

---

## 0. 环境真值 (实测)

| 项 | 真值 | 来源 |
|---|---|---|
| Xcode | 27.0 (27A266a) | `xcodebuild -version` |
| `ios/` 状态 | 存在且 **gitignored (CNG)**，`git ls-files clients/expo/ios` = 0 文件 | `git check-ignore` → `clients/expo/.gitignore:12:ios/` |
| bundle id (意图) | `cloud.coolie.app` | `clients/expo/app.json` + `ios/Coolie.xcodeproj` `PRODUCT_BUNDLE_IDENTIFIER` |
| app.json version | `0.5.97` | `app.json` |
| 原生 version | **`MARKETING_VERSION = 1.0`，`Info.plist CFBundleShortVersionString = 0.1.0`，`CFBundleVersion = 1`** | `grep project.pbxproj` / `Info.plist` |
| coscli | v1.0.9，`~/.cos.yaml` 存在 | `coscli --version` |
| COS 目标前缀 | `cos://gzbucket/coolie/app/0.5.97/` 已存在 (含旧 APK) | `coscli ls` |
| dls 域名 | `https://dls.xrobinai.cn/coolie/app/0.5.97/coolie-release.apk` → HTTP 200, 78 MB | `curl -sI` |

---

## 1. 任务书前提被证据推翻：「无证书」是错的

任务书写「无 Apple Developer 证书 / 无 Provisioning Profile」。实测**部分不成立**：

**(a) 证书存在 (本机 keychain 有有效身份)**
```
security find-identity -v -p codesigning:
  1) 5B2398C0…  "Apple Development: wei chen (M8BJTC24K4)"
  2) 13407F2F…  "Apple Distribution: wei chen (UU7T5893WZ)"
     2 valid identities found
```
→ **上有 `Apple Distribution` 身份，无需生成 CSR / 买证书。**

**(b) Xcode 已配好一个「已付费」团队**
```
defaults read com.apple.dt.Xcode IDEProvisioningTeamByIdentifier:
  isFreeProvisioningTeam = 0;   teamID = UU7T5893WZ; teamName = "wei chen"; teamType = Individual
```
→ 团队 `UU7T5893WZ` (Individual，非 free)，与分布证书一致。

**(c) 但有 2 个 profile，全是**别的 App**的**
```
~/Library/MobileDevice/Provisioning Profiles/:
  8602b2e1-…  Name=dayanwa            application-identifier=UU7T5893WZ.cn.dayanwa.dayanwa
  d7e63d75-…  Name=Dayanwa App Store  application-identifier=UU7T5893WZ.cn.dayanwa.dayanwa
```
→ 两个都是 `cn.dayanwa.dayanwa` 的 **App Store 型** profile (get-task-allow=false，无 ProvisionedDevices)。
→ **`cloud.coolie.app` 没有任何 profile。**

---

## 2. 阻塞点 (硬证据)：无法自建 profile

用 Xcode 自动签名 (`CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM=UU7T5893WZ -allowProvisioningUpdates`) 打了一次 archive 探测，**快速失败**：

```
/Users/mac/workspace/xaicd/coolie/clients/expo/ios/Coolie.xcodeproj: error:
  The operation couldn't be completed. Unable to log in with account 'waj_615@qq.com'.
  The login details for account 'waj_615@qq.com' were rejected.  (in target 'Coolie' from project 'Coolie')
…: error: No profiles for 'cloud.coolie.app' were found: Xcode couldn't find any
  iOS App Development provisioning profiles matching 'cloud.coolie.app'.
** ARCHIVE FAILED **
```

两个独立原因叠加：
1. **Xcode 里那个 Apple ID (`waj_615@qq.com`) 的会话已失效** —— 自动签名无法登录开发者后台。
2. **`cloud.coolie.app` 本地无 profile** —— 且因 (1)，Xcode 也不能去后台现开一个。

→ **因此阶段二 (archive → ipa) 无法进行。这是当前第一道门。**

### 2.1 任务书里没有、但会踩到的坑

- **版本漂移**：原生工程是 `MARKETING_VERSION=1.0` / `Info.plist=0.1.0`，而 app.json 是 `0.5.97`。归档前必须 `expo prebuild` 让原生版本变回 `0.5.97`，否则打进包里的 CFBundleShortVersionString 是 `0.1.0`，`runtimeVersion policy=appVersion` 会与 OTA 口径对不上。
- **`prebuild --clean` 会拆掉 Xcode 27 补丁**：`ios/Podfile` 的 `post_install` 里有一段手工补丁（把各 pod 的 `IPHONEOS_DEPLOYMENT_TARGET` 统一钳到 `15.1`，因 Xcode 27 拒绝 pod 声明的 9.0/12.0）。`--clean` 会删掉 `ios/` 连这补丁一起删。**任务书 C 步的 `--clean` 不能盲跑**，重跑 prebuild 后必须重新贴回该补丁 (wave129 已记录此坑)。
- **`--clean` 还会删 `ios/build/`**：任务书自己也提示了。

---

## 3. 需 boss 决策 / 提供 (最小清单)

### 3.1 一个决定：这份 .ipa 到底怎么装？

技术事实（非意见）：**App Store 型签名出来的 .ipa 无法在设备上直接安装**，只能走 App Store / TestFlight。BOSS 明确要「只装 .ipa 文件 / 不上 App Store / 不上 TestFlight」，且 J/K 步要 `itms-services` 扫码安装 —— 这条路只对 **ad-hoc 分发** 有效，而 **ad-hoc 必须把 boss 的 iPhone UDID 注册进 profile**。

- 现成路径里，两个旧 profile 都是 App Store 型，**注册设备数 = 0**，无法直接复用。
- 若团队里已有 boss 的 iPhone UDID（[假设] 可能随 dayanwa 一起注册过），是否已有设备，需要后台查一次才知道 —— 本地看不到团队设备列表。

**所以 boss 三选一：**

| 方案 | 产物 | 能否「扫码直接装」 | 需要 boss 做什么 |
|---|---|---|---|
| **A. 真机 dev 安装**（最快） | 无独立 .ipa，Xcode 直推 | 否（走数据线） | 把 iPhone 插到本 Mac，我跑 `npx expo run:ios --device` |
| **B. ad-hoc .ipa + 扫码**（最贴任务书） | `coolie-release-ios.ipa` | **能** (itms-services QR) | ① 赐予开发者后台登录/ASC Key；② 提供 iPhone UDID（或插线让 Xcode 自动登记） |
| **C. App Store / TestFlight** | app-store .ipa | 只能 TestFlight | 后台建 App + TestFlight —— **BOSS 已排除** |

- 任务书 D/E 步写的 `method=app-store`：**[假设] 与 BOSS「只装 .ipa」的目标冲突**，属任务书自身矛盾，需 boss 拍板用 ad-hoc 还是真改 app-store。

### 3.2 凭证补齐（走方案 B 需要）

本机已有 Distribution 证书，**不需要**生成 CSR / 买证书。只需其中一条通路让 profile 能被建出来：

1. **最省事**：在 Xcode → Settings → Accounts 里把 Apple ID `waj_615@qq.com` **重新登录一次**（现在会话被拒），然后我即可用 `-allowProvisioningUpdates` 让它自动建 `cloud.coolie.app` 的 profile；或
2. 给一个 **App Store Connect API Key**(`.p8` + Key ID + Issuer ID) 或 **App-specific password**，我用命令行建 profile；或
3. boss 直接去 `developer.apple.com` 手工建 App ID + Profile（ad-hoc 型）并下载 `.mobileprovision` 放到 `~/Library/MobileDevice/Provisioning Profiles/`。

> 凭证纪律：`.p12` / `.mobileprovision` / ASC Key **一律不入 git**，放 `~/secure/`。本报告只记录「有哪些/缺哪些」，不含任何私钥或密码。

### 3.3 走方案 B 还差 boss 的 iPhone UDID

ad-hoc profile 没有设备就会创建失败。UDID 获取：插线后 `xcrun devicectl list devices`，或用任意「获取UDID」网页让手机打开一次。

---

## 4. 已完成 / 已验证 (与「未做」区分)

**已做 (只读/无副作用)：**
- 全量清点本机签名资产 (证书 / profile / Xcode 账号 / 团队) — §1。
- 探测自动签名通路 → 得到确切失败原因 — §2。
- 校验 COS 目标桶与前缀真实存在 (`coscli ls`) — §0。
- 校验 dls 域名对 APK 返回 200 — §0。
- 清理探测残留 (`ios/build/probe.xcarchive` 已删)。

**未做 (被 §2 阻塞)：**
- `expo prebuild` / `pod install` / `xcodebuild archive` / `-exportArchive` → **无 .ipa**。
- COS 上传 iOS 包 / version.json 加 ios 字段 / QR / App 内 iOS 升级分支 / 真机回归 —— 全部未动。
- **未改任何产品代码**；未写 version.json；未 commit。

---

## 5. 下一步 (boss 回一个决定 + 一条通路即可开跑)

1. boss 选 A / B / C（§3.1）。
2. 若 B：补 §3.2 的一个后台通路 + §3.3 的 UDID。
3. 我随即执行：`prebuild`(保留 Podfile 补丁) → `pod install` → `archive` → `-exportArchive` → 校验 ipa → 上传 `cos://gzbucket/coolie/app/0.5.97/coolie-release-ios.ipa` → 记 sha256 → version.json 加 `ios` 字段 → 生成扫码 QR → 真机回归。
