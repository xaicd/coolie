# Brief: wave 97 — 删 OrgAssetsScreen 设置齿轮 + 打包 boss Claude 后 commit (如有) + 0.5.69 (boss 23:28 派 '派97')

PM: Jason
Worker: claude

## 0. Boss 09-26 23:28 OOB 「派97」

老板装 0.5.68 APK 看截图, 资产 Tab 看到 ⚙️ 设置齿轮按钮 (应该 wave96 删了但没删干净).

## 1. PM 老实盘点 (真值)

- boss Claude 22:14+ commit 已合:
  - `e18fa521b` docs(spec) mobile entry audit (175 entries inventoried, v4.0 convergence + EARS budgets)
  - 这些是 spec 文档, 无客户端代码改动
- 0.5.68 APK 已发 (PM wave96 + boss Claude 录音修复都覆盖)
- ⚠️ **OrgAssetsScreen 设置齿轮漏删** (boss Claude 75929afe0 加的, wave96 没真删)
- ⚠️ **业务本体空区域** (没示例数据, 绿点状态正常)

## 2. 目标

**Coolie工坊 0.5.69** 删设置齿轮 + 打包任何 boss Claude 后 commit:

A. 删 OrgAssetsScreen 设置齿轮按钮 (75929afe0 加的, wave96 漏删)
B. 看 boss Claude 后有没有客户端代码 commit 待装 (spec 文档不进 APK, 跳过)
C. bump 0.5.68 → 0.5.69 (clients/expo/{app.json, package.json, CHANGELOG.md}, versionCode 568 → 569)
D. npx expo prebuild + gradle build
E. coscli 上传 0.5.69 APK
F. version.json 真值
G. publish-ota.sh 真跑 (runtimeVersion 0.5.69)
H. adb 真验 (设置齿轮真删, 资产 Tab 简版)
I. commit + push (SSH proxy bypass)

## 3. 任务 (5 步)

### 3.1 删 OrgAssetsScreen 设置齿轮

1. cd ~/workspace/xaicd/coolie
2. cat clients/expo/src/screens/OrgAssetsScreen.tsx | grep -B 2 -A 5 "设置\|Settings\|⚙️\|cog\|gear"
3. 删设置齿轮 button
4. 保留 4 子分类 chip + 业务本体图谱按钮 + 新建 + 注入示例域

### 3.2 排查其他 wave96 漏删的按钮/图标

1. grep -rn "⚙️\|cog\|齿轮\|Settings" clients/expo/src/ 2>/dev/null | head -20
2. 看任何其他界面是否有设置齿轮应删
3. 排查 22c17a392 加的 [Web全功能] 等 awkward 按钮是否还有

### 3.3 打包 0.5.69 (如 boss Claude 后有客户端 commit 一起装)

1. bump clients/expo/{app.json, package.json, CHANGELOG.md} 0.5.68 → 0.5.69, versionCode 568 → 569
2. cd clients/expo && npx expo prebuild --platform android --clean
3. 恢复 local.properties + gradle.properties (kotlinVersion=1.9.24)
4. cd clients/expo && ./android/gradlew -p android clean assembleRelease -x lint --no-daemon
5. aapt dump badging 看 versionCode 569 + versionName 0.5.69
6. 验 APK EXPO_RUNTIME_VERSION '0.5.69' (manifest meta-data + strings.xml 一致)

### 3.4 coscli + version.json + publish-ota

1. coscli cp clients/expo/android/app/build/outputs/apk/release/app-release.apk cos://gzbucket/coolie/app/0.5.69/coolie-release.apk
2. 验 curl -sI https://dls.xrobinai.cn/coolie/app/0.5.69/coolie-release.apk | head -3
3. version.json: 0.5.69 / 569 / commitSha 当前 HEAD / notes 自动
4. scp version.json → tc-coolie-claw:/opt/coolie/ui/dist/version.json
5. bash scripts/publish-ota.sh android 'wave97 删设置齿轮 + 0.5.69'

### 3.5 adb 真验 + commit + push

1. adb install emulator-5554 (versionCode=569, versionName=0.5.69)
2. 验 资产 Tab ⚙️ 齿轮真删
3. 装机自检全绿
4. git add + commit + push (SSH proxy bypass)

## 4. Constraints

- ❌ DON'T 用 agy
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.69 之外
- ❌ DON'T 改 boss Claude 后 commit (e18fa521b spec 文档, 保留)
- ❌ DON'T 改 wave84-96 release
- ✅ DO 删 OrgAssetsScreen 设置齿轮
- ✅ DO 排查其他 wave96 漏删按钮
- ✅ DO 用 zsh-safe single quotes

## 5. semver + PM-CHECKLIST

- 当前 0.5.68
- 删齿轮 + 0.5.69 = patch bump
- PM-CHECKLIST 32 项: J1-J3 + I1 + I2

## 6. Done definition

5 步全完 + 删设置齿轮 + 排查其他漏删 + 0.5.69 APK 真发版 + coscli + version.json + publish-ota + adb 真验 + commit + push:

```
Coolie工坊 0.5.69: https://dls.xrobinai.cn/coolie/app/0.5.69/coolie-release.apk    ← NEW (删设置齿轮)
OTA manifest: runtimeVersion 0.5.69
```