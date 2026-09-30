# wave149-v5 — iOS: App Store Distribution + TestFlight 报告

- 日期: 2026-09-29
- 执行: CLI agent (coolie `main`, 工作区脏 — 见 §6)
- 任务书: wave149-v5（boss 2026-09-29 23:30 选 B：App Store Distribution + 内部测试）
- 状态: **阶段 A（凭证门）未通过 → 按任务书「任意 fail 则报告 boss, 不继续」，B~J 全部未执行。**
- 一句话: **4 件 boss 凭证一件都没到位（Apple ID 会话仍被拒 + `~/secure/asc_key.p8` 不存在 + `cn.xrobinai.app` 的 Distribution profile 不存在），本机连 archive 都起不来，因此没有签名 `.ipa`、没有 COS 上传、没有 TestFlight、没有 version.json 改动。**
- 诚实边界: 本报告只写实测真值。凡推理标 **[假设]**。凭证文件在仓库之外（`~/secure/`），本报告不含任何私钥/口令值。

---

## 0. 环境真值 (本轮实测)

| 项 | 真值 | 来源 |
|---|---|---|
| Xcode | 27.0 (27A266a) | `xcodebuild -version` |
| 发行证书 | `Apple Distribution: wei chen (UU7T5893WZ)` **有效**（notAfter 2027-09-08） | `security find-identity -p codesigning -v` + `openssl x509` |
| 已装 profile | 2 个，**均为** `UU7T5893WZ.cn.dayanwa.dayanwa` | `security cms -D -i …` |
| `cn.xrobinai.app` 的 profile | **不存在** | 同上 + 归档探针（§2 原始 stderr） |
| `~/secure/asc_key.p8` | **不存在** | `[ -f … ]` |
| `~/secure/apple-dist.p12` | **不存在**（但证书身份已在 keychain，故本项非阻塞） | `[ -f … ]` |
| keychain Apple ID 会话 `waj_615@qq.com` | **查无条目** | `security find-generic-password -l …` |
| `~/secure/ios-build.env` | 存在，但是 **v3 (ad-hoc) 形状**：`IOS_EXPORT_METHOD=ad-hoc`、`APPLE_PROFILE_NAME="cn.xrobinai.app Ad Hoc"`，**缺** `ASC_*` / `APPLE_SIGN_IDENTITY` / `INTERNAL_TESTER_EMAILS` | `cat` |
| 原生工程 | `clients/expo/ios/` 存在（concurrent 会话已于 21:08 跑过 prebuild+pod install；`Pods/` 已装；Podfile `IPHONEOS_DEPLOYMENT_TARGET=15.1` 补丁在） | `ls` |
| 旧构建产物 | `ios/build/Coolie-0.5.97-debug.xcarchive`（**上波 v3 的 debug 未签名包**） | `ls` |
| coscli | v1.0.9 | `coscli --version` |
| COS `0.5.97/` 前缀 | 只有 `coolie-release.apk`（74.49 MB），**无 ipa** | `coscli ls cos://gzbucket/coolie/app/0.5.97/` |
| 线上 version.json | **扁平**，**无 `ios` 字段**；`downloadUrl` 指 Android APK | `curl https://xrobinai.cn/version.json` |
| `…/0.5.97/coolie-release-ios.ipa` | **HTTP 404** | `curl -sI` |
| altool | 存在（`/Applications/Xcode.app/…/usr/bin/altool`） | `xcrun --find altool` |

---

## 1. 门 A 判定：4 件 boss 凭证，**0 件到位**

任务书要求「A) 凭证核查 + 修复 → 任意 fail 则报告 boss, 不继续」。

### boss 必给 4 件事

| # | 事项 | 判定 | 证据 |
|---|---|---|---|
| 1 | Apple ID `waj_615@qq.com` 重登 —— **或** ASC Key (.p8+Key ID+Issuer ID 放 `~/secure/asc_key.p8`) | ❌ **未完成** | keychain 无 `waj_615@qq.com` 会话；`~/secure/asc_key.p8` 不存在；§2 探针报「login details … were rejected」 |
| 2 | `cn.xrobinai.app` App ID (developer.apple.com) | ⚠️ **无法验证 / 大概率未建** | 无 Apple ID 会话 → 不能查 portal；本地亦无任何引用 `cn.xrobinai.app` 的 profile（**[假设]**：若 App ID 已建但没建 profile，也拿不到证据） |
| 3 | `cn.xrobinai.app` 的 App Store Distribution Profile (下载放 `~/Library/MobileDevice/Provisioning Profiles/`) | ❌ **不存在** | 该目录只有 2 个 `.dayanwa.dayanwa` profile；`grep -rl cn.xrobinai.app` 无命中 |
| 4 | App Store Connect 创建 App (`coolie工坊` / SKU `coolie-ios-001`) | ⚠️ **无法验证** | 无 ASC 凭证，无法登录检查 |

### 任务书 A 的 4 条门神脚本结果

1. `source ~/secure/ios-build.env` → 成功，但其中 `ASC_KEY_PATH` 等 v5 变量**根本不存在**（文件是 v3 形状）。
2. `[ -n "$ASC_KEY_PATH" ] && [ -f "$ASC_KEY_PATH" ]` → **FAIL**（变量空 / 文件不存在）。
3. `security find-identity -p codesigning -v | grep "Apple Distribution"` → **PASS**（`Apple Distribution: wei chen (UU7T5893WZ)`）。
4. profile 循环 → 两个 profile 的 `application-identifier` **都是** `UU7T5893WZ.cn.dayanwa.dayanwa`，**没有任何** `UU7T5893WZ.cn.xrobinai.app` → **FAIL**。

→ 门 A **FAIL**（第 2、4 条），据此停止。

---

## 2. 新鲜失败证据（本轮重跑，非沿用 v4）

本轮重跑自动签名归档探针（`CODE_SIGN_STYLE=Automatic … -allowProvisioningUpdates`），**exit=65，快速失败**，原始 stderr：

```
Coolie.xcodeproj: error: The operation couldn't be completed. Unable to log in with account
  'waj_615@qq.com'. The login details for account 'waj_615@qq.com' were rejected.
Coolie.xcodeproj: error: No profiles for 'cn.xrobinai.app' were found: Xcode couldn't find any
  iOS App Development provisioning profiles matching 'cn.xrobinai.app'.
** ARCHIVE FAILED **
```

与 v1/v4 同因、同果。探针 **未生成** `.xcarchive`（写在 scratchpad，无仓库副作用）。Manual 签名走 D 步同样必败 —— 因为 `PROVISIONING_PROFILE_SPECIFIER` 要指向的 profile 不存在，`APPLE_PROFILE_NAME` 也为空。

---

## 3. 为何 B ~ J 全部未执行

| 步 | 内容 | 是否执行 | 原因 |
|---|---|---|---|
| B | prebuild + pod install | ❌ | 门 A 未过；且 `clients/expo/ios/` 已被并发会话于 21:08 重建过，重跑会与之冲突（§6） |
| C | 修版本漂移 (pbxproj + Info.plist) | ❌ | 同上（且 v3 报告已指出 Info.plist 是装机真源，方向已记档） |
| D | xcodebuild archive (Distribution 签名) | ❌ | **无 profile → 必败**（§2） |
| E | ExportOptions.plist 写 app-store | ❌ | 无 archive 可导 |
| F | exportArchive 出 `.ipa` | ❌ | 无 archive |
| G | 上传 COS | ❌ | 无 `.ipa` |
| H | TestFlight 上传 (altool --upload-app) | ❌ | 无 `.ipa`，且**无任何 ASC/Apple ID 上传凭证** |
| I | version.json 加 `ios` 字段 | ❌ | 无 `.ipa`（拿不到 sha256/链接），且这是共享生产系统，需 boss 明确 go |
| J | App 端 `AppUpdateCard` iOS 分支重写 | ❌ | **`clients/expo/App.tsx` 是并发会话的未提交改动**（任务书明确「不动别人未提交的仓区」）；且无真实 TestFlight/App Store 链接可填 |

**没有生成本轮 `.ipa` / 未上传 COS / 未写 version.json / 未改 App 代码 / 未改 v3 脚本。**

---

## 4. 交付物

| 路径 | 说明 |
|---|---|
| `docs-coolie/evidence/wave149/QA-REPORT-v5.md` | 本文件（新文件，未覆盖 v1/v2/v3/v4） |

**未产出真截图**（App Store Connect 无法登录，`testflight-uploaded.png` / `testflight-internal-tester-added.png` 无对象可截）。

---

## 5. `RELEASE-HISTORY.md` 处理：**不加行**

任务书要求加 `v0.5.97-ios-testflight` 行。**本轮没有任何东西上线 / 打 tag / 传 TestFlight**，加行即失真。故 **hold**，与 v3/v4 结论一致。待 TestFlight 真上传成功后再补。

---

## 6. 并发状态提示（供 dispatcher/boss）

- 任务书要求「不动别人未提交的仓区（wave147/148/wave149v3/v4 改的文件）」。当前这些文件仍是**未提交**状态：
  `clients/expo/{App.tsx, app.json, src/AppVersion.ts, src/screens/PrototypeSandboxScreen.tsx}`（已改）+ `scripts/release-ios-{build,cos}.sh`（未跟踪）。
- 本机仍有多个 `command-code` 进程在跑；`clients/expo/ios/` 的 mtime（21:08）显示**另一个会话在 v5 期间做过 prebuild + pod install**。
- **[假设]** 因此本波即便凭证到位，也需先确认并发会话已停写，否则会与 v3/v4 的在写文件互相丢改动。

---

## 7. boss 解锁清单（最小、精确）

要让本波能往下走，只需 boss 在真机上做（每件 ~5–10 分钟）：

1. **门 1（二选一）**
   - **1A**：Xcode → Settings → Accounts → `waj_615@qq.com` 重新输入密码 → Done。
   - **1B**：App Store Connect → Users and Access → Keys → 生成 `.p8 + Key ID + Issuer ID` → 放 `~/secure/asc_key.p8`。
2. **门 2**：developer.apple.com → Identifiers → **+** → App IDs → Name `Coolie 工坊` / Bundle ID `cn.xrobinai.app`（Capabilities 默认）。
3. **门 3**：Profiles → **+** → **App Store** → 选 `cn.xrobinai.app` → 选发行证书 `wei chen (UU7T5893WZ)` → Create → Download `.mobileprovision` → 放 `~/Library/MobileDevice/Provisioning Profiles/`。
4. **门 4**：App Store Connect → My Apps → **+** → New App：iOS / `coolie工坊` / Simplifed Chinese / Bundle ID `cn.xrobinai.app` / SKU `coolie-ios-001` / Full Access。

**同时更新 `~/secure/ios-build.env`（当前仍是 v3/ad-hoc 形状）**，需要新增/修改的键：

```
IOS_EXPORT_METHOD=app-store        # 现在误为 ad-hoc
APPLE_SIGN_IDENTITY=Apple Distribution: wei chen (UU7T5893WZ)   # 缺失
APPLE_PROFILE_NAME=<profile 的 Name>      # 现在误为 "cn.xrobinai.app Ad Hoc"，且需按实建 profile 的 Name 填
APPLE_PROFILE_UUID=<下载的 .mobileprovision 文件名 UUID>
ASC_KEY_ID= / ASC_ISSUER_ID= / ASC_KEY_PATH=$HOME/secure/asc_key.p8   # 缺失
INTERNAL_TESTER_EMAILS=robinschen1989@gmail.com   # 缺失
# APPLE_BUNDLE_ID 已是 cn.xrobinai.app（v3 已修正），无需再改
```
（本报告**未**改写 boss 的 `~/secure/ios-build.env` —— 它是凭证文件，且值尚未产生。）

**上传 TestFlight 通行证**：门 1A 走通后 `xcrun altool --upload-app -f <ipa> -t ios -u <APPLE_ID> -p <app-specific-password>`；或门 1B 用 `--apiKey/--apiIssuer`。

---

## 8. 我做了什么 / 没做什么

**做了（只读 / 仓库外 / scratchpad）：**
- 复核签名身份、profile、ASC key、Apple ID 会话、env 形状 —— §0。
- 重跑自动签名归档探针取得**新鲜**失败证据（§2，无仓库副作用）。
- 读 COS 前缀 / 线上 version.json / ipa 直链 —— §0 真值。
- 阅读 v3/v4 报告与 wave149 证据目录，确认未覆盖既有文件。

**没做（及原因）：**
- 未跑 prebuild / pod install / archive / exportArchive → 门 A 未过（且 `clients/expo/ios` 有并发会话在动）。
- 未上传 COS、未跑 altool、未写 version.json、未改 App 代码、未改 v3 脚本 → **均被门 A 阻塞**，且部分属他人未提交区。
- 未加 RELEASE-HISTORY 行、未 commit、未 push → 无发布事实。
- 未改写 `~/secure/ios-build.env` → 凭证文件，值未产生。

---

## 9. 假设与不确定（显式标注）

- **[假设]** 本轮 `clients/expo/ios/` 的 prebuild/pod install 出自一个在 v5 期间仍活跃的并发会话（依据：mtime 21:08 + 多个 `command-code` 进程）。
- **[假设]** `cn.xrobinai.app` 的 App ID 大概率尚未创建（依据：无 profile 引用 + 无 Apple ID 会话）；但也可能「App ID 已建、profile 未建」——本机无法区分。
- **[假设]** 门 1B 的 `.p8` 可驱动 `-allowProvisioningUpdates` 自动建 profile（未在本机验证；若失败则仍需门 2/3 手工建）。
- **bundle id**：以仓库真源 `clients/expo/app.json` 的 `cn.xrobinai.app` 为准（v3/v4 四方一致）。
- 本报告未含任何私钥/口令值；`APPLE_DIST_P12_PASSWORD` 为空。

---

## 10. 下一步（一句话）

**boss 开「门 1+2+3+4」四把锁**（§7），本波即可继续：archive（Distribution 签名）→ exportArchive（`method=app-store`）→ 上传 COS → `xcrun altool --upload-app` 上 TestFlight → 加内部测试员 → 回填 version.json 的**顶层扁平 + 追加 `ios`** 字段。
