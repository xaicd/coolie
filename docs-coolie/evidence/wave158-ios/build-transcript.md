# wave158-ios — xcodebuild archive + exportArchive 记录 (2026-09-30 +08:00)

命令（`<repo>` = `/Users/mac/workspace/xaicd/coolie`）:

```
xcodebuild -workspace <repo>/clients/expo/ios/Coolie.xcworkspace \
  -scheme Coolie -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath <repo>/clients/expo/ios/build/Coolie.xcarchive \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY="Apple Distribution: wei chen (UU7T5893WZ)" \
  PROVISIONING_PROFILE_SPECIFIER="Coolie工坊" \
  DEVELOPMENT_TEAM=UU7T5893WZ \
  clean archive

xcodebuild -exportArchive \
  -archivePath <repo>/clients/expo/ios/build/Coolie.xcarchive \
  -exportPath <repo>/clients/expo/ios/build/ipa \
  -exportOptionsPlist <repo>/clients/expo/ios/ExportOptions.plist
```

signing 参数（来自 `~/secure/ios-build.env`，不入仓）:
```
identity: Apple Distribution: wei chen (UU7T5893WZ)
profile : Coolie工坊
team    : UU7T5893WZ
```

## 结果

| 阶段 | 结果 |
|---|---|
| prebuild (`npx expo prebuild --platform ios --no-install`) | ✔ Finished prebuild（Podfile md5 `18eacf725060a9eb499562699e488b41` 前后一致 → Xcode27 deployment-target 补丁保住） |
| pod install (`pod install --repo-update`) | ✔ 85 deps / 90 pods installed，21s |
| 版本对齐 | pbxproj `MARKETING_VERSION = 0.6.2;` `CURRENT_PROJECT_VERSION = 602;`；Info.plist 0.6.2 / 602；bundle id `cn.xrobinai.app` |
| `clean archive` | **ARCHIVE SUCCEEDED** |
| `-exportArchive` (app-store / manual) | **EXPORT SUCCEEDED** |
| 产物 | `ios/build/ipa/Coolie.ipa`（14,286,676 B）→ 按任务规范改名 `ios/build/ipa/cn.xrobinai.app.ipa` |

## 备注（诚实）

- `-exportArchive` 提示 `Command line name "app-store" is deprecated. Use "app-store-connect" instead.` —— 仅弃用告警，导出成功（Xcode 27）。本波沿用任务指定的 `method=app-store`。
- 归档过程有既有第三方告警（glog `syscall` deprecated、hermes/RN 脚本阶段无 output deps 提示），非本波引入，不影响产物。
- 导出文件名由 Xcode 定为 `Coolie.ipa`（product 名 Coolie）；任务要求路径为 `cn.xrobinai.app.ipa`，故本地改名。**改名不改内容**，sha256 不变。
- 完整原始日志为会话级（Xcode 全量输出 ~84k 行），未入仓。关键行: `ARCHIVE SUCCEEDED` / `EXPORT SUCCEEDED` / 上方签名参数。
