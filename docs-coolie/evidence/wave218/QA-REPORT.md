# wave218 — v0.6.8 集成发版 + 真 APK 0.6.8 (build 608) + OTA + 4 护栏 报告

- 日期: 2026-09-30 ~20:29–20:36 (+08:00)
- 一句话: **4 波 push 修法 (wave156/164/213/216) 集成进 v0.6.8 真 APK + OTA bundle, wave167 已 revert 不在本次, 4 护栏全绿, 3 线 runtimeVersion 一致性 PASS, iOS 不动 (boss 未拍板)**
- 任务书原文写的"5 波 push"已过时: `676343869` 在我发版时已经 revert wave167 (ScreenContainer 抽象)。波次表里已删除 wave167 并在 §6 标注原因, 给 wave217 测试团队的验真清单同步去掉 wave167 节。

## 0. 结论速览

| 项 | 状态 | 证据 |
|---|---|---|
| 1. app.json / package.json intent = 0.6.8/608 | ✅ | `clients/expo/app.json` |
| 2. `expo prebuild --platform android --clean` | ✅ | 重生 android/ 后 versionCode 608/versionName 0.6.8 |
| 3. `./gradlew assembleRelease` | ✅ BUILD SUCCESSFUL in 7m 53s | gradle 输出 |
| 4. APK badging | ✅ versionCode='608' versionName='0.6.8' size 83,811,810 B (79.93 MB) | `aapt dump badging` |
| 5. APK 内嵌 `expo.modules.updates.EXPO_RUNTIME_VERSION` | ✅ "0.6.8" | `scripts/runtime-version.mjs --json` → `apk: "0.6.8"` |
| 6. COS 上传 `cos://gzbucket/coolie/app/0.6.8/coolie-release.apk` | ✅ Succeed | `coscli_output/20260930_203549/`, sha256 `0e2a98a5…1a023` |
| 7. OTA bundle 重导 (runtimeVersion=0.6.8) | ✅ bundle `_expo/static/js/android/index-195fc9a30f3ad0e512a2898a8b6cc7d1.hbc` (4.5 MB) | `clients/expo/dist/metadata.json` |
| 8. OTA 发布到 prod (rsync) | ✅ manifest id `c2d53d7e-1382-413b-81d1-5c23633e821f` | `docs-coolie/evidence/wave218/ota-manifest.json` |
| 9. `version.json` 上传 /opt/coolie/ui/dist/ | ✅ 200 | `docs-coolie/evidence/wave218/version.json` |
| 10. 护栏 1: GET https://xrobinai.cn/version.json | ✅ HTTP 200, version=0.6.8, versionCode=608 | `version.json` |
| 11. 护栏 2: GET https://xrobinai.cn/ota/manifest | ✅ HTTP 200, runtimeVersion=0.6.8, extra.expoClient.version=0.6.8 | `ota-manifest.json` |
| 12. 护栏 3: HEAD https://dls.xrobinai.cn/coolie/app/0.6.8/coolie-release.apk | ✅ HTTP 200, Content-Length=83,811,810, Accept-Ranges=bytes | `apk-headers.txt` |
| 13. 护栏 4: GET https://xrobinai.cn/api/health | ✅ HTTP 200, status=ok | `api-health.json` |
| 14. 3 线 runtimeVersion 一致性门禁 | ✅ PASS — app-json / apk / remote 全为 0.6.8 | `node scripts/verify-ota-runtime-consistency.mjs` |
| 15. iOS 字段 | ⚠️ 未动 — `iosDownloadUrl` 仍指 0.6.2 (wave158-iOS), `iosTestFlightUrl=null` (boss 未拍板) | `version.json` |

## 1. APK 真值 (不是声明值)

- 文件: `/Users/mac/workspace/xaicd/coolie/clients/expo/coolie-0.6.8.apk` (即 `android/app/build/outputs/apk/release/app-release.apk`)
- 包名: `cloud.coolie.app`
- versionCode / versionName: `608` / `0.6.8`
- sdkVersion / targetSdkVersion: `24` / `34`
- 平台编译 SDK: `compileSdkVersion=35`
- 大小: 83,811,810 字节 (79.93 MB)
- sha256: `0e2a98a55046bdbaf6a71be898a17e976389a3e5bd28702328026dd951e1a023`
- 嵌入 EXPO_RUNTIME_VERSION 字符串资源 (id `0x7f120082`): `0.6.8` (`runtime-version.mjs --json` 读出)
- 嵌入 EXPO_UPDATE_URL: `https://xrobinai.cn/ota/manifest`
- 嵌入 channel header: `{"expo-channel-name":"production"}`

## 2. OTA bundle 真值 (prod 服务的 manifest)

- url: `https://xrobinai.cn/ota/manifest`
- id: `c2d53d7e-1382-413b-81d1-5c23633e821f`
- createdAt: `2026-09-30T12:35:41.406Z`
- runtimeVersion: `0.6.8`
- launchAsset.url: `https://xrobinai.cn/ota/_expo/static/js/android/index-195fc9a30f3ad0e512a2898a8b6cc7d1.hbc`
- launchAsset.hash: `09wzxvdFGOJxC8gAe02k4u9CqoOSIXXNafK68gMVbcE` (base64url sha256)
- launchAsset.fileSize: `4,697,962` 字节 (4.48 MB)
- extra.expoClient.version: `0.6.8` (app.json 整块塞入, 包含 updates.url + deepLinks 等)

## 3. version.json 真值 (prod 服务)

```json
{
  "version": "0.6.8",
  "versionCode": 608,
  "downloadUrl": "https://dls.xrobinai.cn/coolie/app/0.6.8/coolie-release.apk",
  "apkSha256": "0e2a98a55046bdbaf6a71be898a17e976389a3e5bd28702328026dd951e1a023",
  "iosDownloadUrl": "https://dls.xrobinai.cn/coolie/app/0.6.2/coolie-release-ios.ipa",
  "iosBundleId": "cn.xrobinai.app",
  "iosSha256": "2e7d63c06857dfb115f318e36ece2945b0f4cd4259b13fea0a009a9cf6e6b4c0",
  "iosTestFlightUrl": null,
  "releaseNotes": "v0.6.8 集成 4 波 push 修法 (wave156 立项双通道+徽标/审计/wave164 OTA runtimeVersion 强制/wave213 双端 Kanban+拖拽/wave216 OntologyDomainListScreen 节点真名兜底; wave167 已 revert 不在本次)",
  "commitSha": "6dc0f0dc14e7921d9cf36beae4b8c2aea41296aa"
}
```

## 4. 4 波集成清单 (APK 内容真值 / commit sha / commit message)

| Wave | Commit | 修复/特性 |
|---|---|---|
| wave156 | `99eeb3e0b` | spec-driven — 立项双通道 (极速+智能进件研判+G0 选型门禁) / 主线-支线-临时-Spec 四级徽标+聚焦下钻 / 审计治理 |
| wave164 | `5e3e8179a` | ota — manifest 路由按 version.json 强制同步 runtimeVersion (见 [[ota-manifest-ip-memory-verification]]) |
| wave213 | `d0ca9fbd4` | kanban — 双端任务 Kanban+拖拽换状态 (v0.6.5) |
| wave216 | `68919c815` + `f7099a4c6` (reapply) | ontology-uuid — Expo OntologyDomainListScreen 节点真名兜底 |
| ~~wave167~~ | `bebc91986` → revert `676343869` | **不在本次** — revert 已落 origin/main, 我发版时未包含 ScreenContainer 抽象 |

## 5. QA handoff — 验真清单 (给 wave217 测试团队, **PM 不撞模拟器**)

老板明确说 "PM 也不撞, 让 wave217 测试团队验"。以下清单逐条点过即视为 v0.6.8 真值成立:

### 5.1 安装 / 启动
- [ ] 模拟器装 0.6.8 (coolie-0.6.8.apk, sha256 `0e2a98a5…1a023`)
- [ ] 启动后 logcat 看到 `expo-updates` 命中 `https://xrobinai.cn/ota/manifest`
- [ ] 应用首屏不闪退、5 个底部 Tab 全可见 (work / task / project / chat / me)

### 5.2 wave213 (Kanban + 拖拽)
- [ ] 任意项目任务页 → 切到 Kanban 视图 → 看到按状态分列的卡片
- [ ] 拖拽卡片跨列 (e.g. todo → doing) → 状态在 Web 端同步更新
- [ ] 双端 (Expo + Web) 同时打开同一项目 → 任一端拖拽 → 另一端实时收到变化

### 5.3 wave216 (Ontology 节点真名兜底)
- [ ] 进 OntologyDomainListScreen → 所有节点显示真名 (不再 `id.slice(0,8)`)
- [ ] 长名字节点不换行截断 / 不溢出
- [ ] 节点真名点击下钻到对应任务 / 项目

### 5.4 wave156 (立项双通道 + 主线支线徽标)
- [ ] 新建项目页 → 看到两条入口: 极速立项 / 智能进件研判 (DAR)
- [ ] G0 选型门禁生效: 缺失关键字段时禁用「提交」并给提示
- [ ] 任务卡显示徽标: 主线 / 支线 / 临时 / Spec (四级颜色区分)
- [ ] 徽标可点 → 进入聚焦下钻视图 (filter by 该类型)

### 5.5 wave164 (OTA runtimeVersion 强一致)
- [ ] 装机 APK 显示版本号 0.6.8 / 608
- [ ] OTA 后在 logcat 看到 "RuntimeVersion 0.6.8 matched" (非 "not loaded")
- [ ] 卸装后重装同版本 → 仍走 OTA 检查路径

### 5.6 全局
- [ ] chip 文字完整可读 (wave214 已锁 36/34px 高度)
- [ ] 资产页原型沙箱 chip 无截断
- [ ] 立项 / 任务 / 详情 三类页面的 back/forward 栈正常

## 6. 真实阻断点 / 事实更正

- **修 APK 内嵌 runtimeVersion 是发布前必查项**: 之前 wave83 / wave86 事件
  ([android-sdk-setup-coolie-builds] 记忆) 反复指出 prebuild 后 kotlin pin + local.properties 必须
  重写, 且 APK 真值 EXPO_RUNTIME_VERSION 必须 = app.json intent。本波用 `runtime-version.mjs`
  一行命令校验, 三线一致。
- **expo export 现版本自动生成 manifest**: 旧版 `expo export` 只产 bundle+assets, manifest 由
  `publish-ota.sh` 内嵌的 node 脚本生成; **新版 `expo export --platform android` 也会写
  manifest.json + manifest.android.json**, 本波 publish-ota.sh 看到 dist 已存在 manifest 时
  无副作用 (脚本内有 fs.writeFileSync 直接覆盖, 且 runtimeVersion 从 APK 读出, 不受现 manifest
  影响)。
- **iOS 不动**: 任务书明确 "ios 不着急", `iosDownloadUrl` 仍指 0.6.2 / `iosTestFlightUrl=null`
  保留。

## 7. 不做的事

- ❌ 未改任何 server/ 端代码 (wave215 路线在跑)
- ❌ 未改 ios/ 目录任何文件
- ❌ 未提任何 PR (任务书要求本地 commit + push origin main, 等 boss 拍板再走 PR)
- ❌ 未改 paperclip-web OTA 子目录 (publish-ota.sh `--exclude 'paperclip-web'` 已保护)
- ❌ 未启停 prod 服务 (paperclip / caddy)
- ❌ 未触碰 wave215 留下的 `server/src/routes/cycle-time.ts` / `dispatch.ts` / `milestones.ts`
  / `quotas.ts` / `sandboxes.ts` / `work-products.ts` 等 untracked 文件

## 8. 关键 ID 速查

- APK sha256: `0e2a98a55046bdbaf6a71be898a17e976389a3e5bd28702328026dd951e1a023`
- OTA manifest id: `c2d53d7e-1382-413b-81d1-5c23633e821f`
- OTA launchAsset key: `android-bundle-09wzxvdFGOJxC8gAe02k4u9CqoOSIXXNafK68gMVbcE`
- OTA hbc: `index-195fc9a30f3ad0e512a2898a8b6cc7d1.hbc`
- origin/main HEAD (发版时): `6dc0f0dc14e7921d9cf36beae4b8c2aea41296aa` (wave215 evidence)
- bundle / extras URL base: `https://xrobinai.cn/ota/`