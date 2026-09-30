# wave158-iOS — iOS 0.6.2 .ipa 出包 → COS → version.json（不上 TestFlight）

- 日期: 2026-09-30 ~15:30–15:40 (+08:00)
- 一句话: **在 main HEAD `af653b20a` 上重出 iOS 0.6.2 (build 602) 的 App Store 分发 .ipa，直传 COS，`version.json` 顶层 `iosDownloadUrl`/`iosSha256` 指 0.6.2；4 护栏全 200/206；TestFlight 未动（build 600 仍 VALID + `waj_615@qq.com` INVITED，改动前后快照逐字节一致）。**
- 授权: 本地打包凭证 `~/secure/ios-build.env` + App Store Connect API Key `WUSVUS3H3L`（只读查询）。凭证不入仓。

## 0. 结论速览

| 任务 | 结果 | 真值 |
|---|---|---|
| A iOS 0.6.2 build | ✅ | `.ipa` 14,286,676 B，sha256 `2e7d63c0…b4c0`，版本 0.6.2 / build 602 |
| B 上传 COS + 公网校验 | ✅ | `https://dls.xrobinai.cn/coolie/app/0.6.2/coolie-release-ios.ipa` → HEAD 200，range 206，首字节 `PK` |
| B version.json 指 0.6.2 | ✅ | 顶层扁平字段已更新并部署；公网 `xrobinai.cn/version.json` 读回一致 |
| B 4 护栏 | ✅ 4/4 | version.json 200 · ota/manifest 200 · APK 206 · api/health 200（+ 新 ipa 206） |
| C 不上 TestFlight | ✅ | 未上传任何 build；build 600 `processingState=VALID` `expired=false`；组内 `waj_615@qq.com` `INVITED`（改动前后 diff 为空） |
| typecheck | ✅ | `clients/expo` `tsc --noEmit` exit 0 |

## 1. A) iOS 0.6.2 build（真机 App Store 分发包）

源: `main` HEAD `af653b20a`（含 wave153 登录修复 + wave157 开发基座）。步骤与结果:

1. `rm -rf clients/expo/ios/build ios/Pods ios/Podfile.lock` ✅
2. `npx expo prebuild --platform ios --no-install` ✅（Podfile md5 前后一致，Xcode27 deployment-target 补丁保住）
3. `pod install --repo-update` ✅ 85 deps / 90 pods
4. 版本漂移修正 ✅ pbxproj `MARKETING_VERSION = 0.6.2;` `CURRENT_PROJECT_VERSION = 602;`；`Info.plist` `CFBundleShortVersionString=0.6.2` `CFBundleVersion=602`
5. `clean archive`（Manual + `Apple Distribution: wei chen (UU7T5893WZ)` + profile `Coolie工坊` + team `UU7T5893WZ`）✅ **ARCHIVE SUCCEEDED**
6. `ios/ExportOptions.plist` = app-store / manual ✅
7. `-exportArchive` ✅ **EXPORT SUCCEEDED**
8. 产物: `ios/build/ipa/cn.xrobinai.app.ipa`（Xcode 导出名 `Coolie.ipa`，本地改名，内容不变）

包内真值（`ipa-verify.txt` / `distribution-summary.txt`）:

- `file`: **iOS App Zip archive**
- 内层 `Payload/Coolie.app` 签名: `Identifier=cn.xrobinai.app`，`Authority=Apple Distribution: wei chen (UU7T5893WZ)`，`TeamIdentifier=UU7T5893WZ`；`codesign --verify --deep --strict` → **OK**
- `Info.plist`: 0.6.2 / 602 / cn.xrobinai.app
- 内嵌 `main.jsbundle` 3,734,713 B（Release 已内嵌 JS，非 Metro 供包）
- 内嵌 profile: `Coolie工坊`（App Store 分发，`beta-reports-active=true`，`get-task-allow=false`，无 `ProvisionedDevices`）
- `DistributionSummary.plist`: versionNumber `0.6.2`，buildNumber `602`，certificate `Apple Distribution`

## 2. B) 上传 COS + version.json

- COS 对象: `cos://gzbucket/coolie/app/0.6.2/coolie-release-ios.ipa`（`public-read`）
- 直链: `https://dls.xrobinai.cn/coolie/app/0.6.2/coolie-release-ios.ipa`
  - HEAD `HTTP 200`，`content-type: application/octet-stream`
  - range `0-1` → `HTTP 206`，首字节 `PK`
- `version.json`（仓库 + 生产 `/opt/coolie/ui/dist/version.json`，**顶层扁平字段**，无 `platform{}` 嵌套）:

```json
{
  "version": "0.6.2",
  "versionCode": 602,
  "downloadUrl": "https://dls.xrobinai.cn/coolie/app/0.6.2/coolie-release.apk",
  "iosDownloadUrl": "https://dls.xrobinai.cn/coolie/app/0.6.2/coolie-release-ios.ipa",
  "iosBundleId": "cn.xrobinai.app",
  "iosSha256": "2e7d63c06857dfb115f318e36ece2945b0f4cd4259b13fea0a009a9cf6e6b4c0",
  "iosTestFlightUrl": null,
  "releaseNotes": "wave157 开发基座(5 默认模块, 无业务域) + App 实例目标可切换 + 模板预设收敛; 含 wave153 登录修复",
  "commitSha": "786cb44aba325f80223f03dd44e49609befaea76"
}
```

## 3. 4 护栏（公网实测）

| 护栏 | URL | 结果 |
|---|---|---|
| version.json | `https://xrobinai.cn/version.json` | **200**（读回 version=0.6.2，iosDownloadUrl 指 0.6.2） |
| ota/manifest | `https://xrobinai.cn/ota/manifest` | **200** |
| APK | `https://dls.xrobinai.cn/coolie/app/0.6.2/coolie-release.apk` | **206** |
| api/health | `https://xrobinai.cn/api/health` | **200** |
| （附加）新 ipa | `https://dls.xrobinai.cn/coolie/app/0.6.2/coolie-release-ios.ipa` | **206** + `PK` |

## 4. C) 不上 TestFlight — 真值

- **未**执行任何 TestFlight 上传（无 `altool`/`notarytool`/`iTMSTransporter` 调用）。
- 改动前后各取一次 ASC 只读快照（`asc-api/` vs `asc-api/post/`），`build-summary.json` 与 `beta-group-…-testers.json` **diff 为空**:
  - Build `c6f5a5fb-7f2b-4a60-90e7-bc2f9f6eceaa`（version 600）: `processingState=VALID`，`expired=false`，`expirationDate 2026-12-28`
  - internal 组 `coolie`（`2fe78acd-…`，`isInternalGroup=true`）唯一测试员 `waj_615@qq.com`（`3155a0ed-…`）: `state=INVITED`
  - App 记录 `6817620959`（Coolie工坊，cn.xrobinai.app）未动
- 结论: **build 600 仍可用、邀请仍在**；新 0.6.2 未进 TestFlight（按 boss 拍板）。

## 5. 诚实标注（必须读）

1. **这个 .ipa 是真机直装不了的（关键限制）**：内嵌 profile 是 **App Store 分发**（无 `ProvisionedDevices`，`get-task-allow=false`）。这种包**只能经 TestFlight / App Store 安装**，**不能**用 QR / itms-services 直链装到非越狱真机。任务写的「boss 装机走 QR / 直链」在本波产物上**不成立**。
   - 若要「真机直装」，需 **Ad Hoc** profile（且 boss 设备 UDID 已登记）或 **Development** profile，重签一个 ad-hoc `.ipa`（ExportOptions `method=ad-hoc`）——那是**另一条产线**，本波未做（任务指定 `method=app-store`，且不新增生产配置）。
   - 若 boss 只是想装 0.6.2：走 TestFlight 需要**新上传 build**（= 冲 build，本波明令不做）；否则只能等下一波（wave-iOS-160）。
2. `codesign -dvv <file>.ipa` 对 **.ipa 容器**返回 `code object is not signed at all`（ipa 是 zip，非可签名对象）——这是预期行为，不是失败。签名验证见 `ipa-verify.txt`（解包后对 `Payload/Coolie.app` 做 `codesign --verify --deep --strict`）。
3. 任务给的 `sed -i '' 's/MARKETING_VERSION = .*/MARKETING_VERSION = 0.6.2/'` 会把行尾分号一起吃掉；本波改用 `s/MARKETING_VERSION = [^;]*;/MARKETING_VERSION = 0.6.2;/g`（与仓库既有 `release-ios-build.sh` 一致）。
4. prebuild 用 `--no-install`，随后显式 `pod install --repo-update`（与仓库既有脚本一致；比「prebuild 自动装 pod 再冗余装一次」更可控，效果等同任务的「prebuild + pod install --repo-update」）。
5. 导出文件名为 `Coolie.ipa`（Xcode 按 product 名），已改名为任务要求的 `cn.xrobinai.app.ipa`；改名不影响内容/sha256。
6. `-exportArchive` 告警 `"app-store" is deprecated, use "app-store-connect"`——仅告警，导出成功。
7. **未**动 `PAPERCLIP_API_KEY` / `DEPLOYMENT_MODE`；**未**启停 dev 进程；**未**改 bundle id；**未**改 `server/`/`ui/`/`packages/`/`clients/expo` 任何业务代码；**未**用 `eas build`。
8. 后端 `releaseNotes`/`commitSha` 沿用 786cb44ab 真值（本波未改发版内容，仅换 ios 直链/sha）。若需把「iOS 已上 0.6.2」写进 `releaseNotes`，属另一处内容变更，本波未擅自改。

## 6. 证据文件清单

- `QA-REPORT.md` — 本报告
- `build-transcript.md` — archive/export 命令与结果（ARCHIVE/EXPORT SUCCEEDED）
- `ipa-verify.txt` — file / sha256 / 内层签名 / Info.plist / embedded profile 真值
- `distribution-summary.txt` — Xcode `DistributionSummary.plist` 全量（versionNumber 0.6.2 / buildNumber 602 / cert / profile UUID `2630cad1-…`）
- `asc-api/*`（改动前）与 `asc-api/post/*`（改动后）— ASC 只读快照：`apps.json` / `builds.json` / `build-summary.json` / `beta-groups.json` / `beta-group-2fe78acd-…-testers.json`

## 7. 关键 ID / 值速查

- App: `6817620959` Coolie工坊 / `cn.xrobinai.app`
- Build 600: `c6f5a5fb-7f2b-4a60-90e7-bc2f9f6eceaa`（VALID，未动）
- internal 组 "coolie": `2fe78acd-8eb1-489b-a351-a18b797dd2a5`（测试员仅 `waj_615@qq.com` INVITED）
- Profile `Coolie工坊` UUID: `2630cad1-f54c-498b-912b-1965443c488b`（App Store 分发，2027-09-08 过期）
- 新 .ipa: `cos://gzbucket/coolie/app/0.6.2/coolie-release-ios.ipa`，sha256 `2e7d63c06857dfb115f318e36ece2945b0f4cd4259b13fea0a009a9cf6e6b4c0`，14,286,676 B
