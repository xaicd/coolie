# Release History

Git 里程碑 tag 流水。自 **v0.5.97** 起建立本文件；此前的 0.5.x 发版只改 `version.json` /
`clients/expo`，未打 git tag（`git tag -l` 为空即历史事实）。

| Tag | Date | Version | Commit | Notes |
|---|---|---|---|---|
| v0.5.97 | 2026-09-29 | 0.5.97 | bc48b1e80 | wave142: WBS 任务自动路由 + 沙箱附件真渲染 + 启动链路端到端可观察 |
| v0.6.0 | 2026-09-29 | 0.6.0 | 269526f19 | wave150 合并发版: wave147 spec-driven + wave148 多对话 + wave144 board-chat 修复（见 §v0.6.0） |

约定: tag 指向该版本「发版完成」的提交（含 `chore(release): version.json …` 这一步），
注释写本波主题。推送方式 `git push origin <tag>`（本仓库 push 需绕本地代理）。

## v0.6.0 — 已发出 (wave150)

`bash scripts/release-app.sh 0.6.0 "…"` **exit 0**，发版 commit **`269526f19`**。真值：

- APK：`https://dls.xrobinai.cn/coolie/app/0.6.0/coolie-release.apk`，78,117,898 Byte (74.50 MB)，
  sha256 `5fd43b4436538b549075e58481d802962f9b0a99ab73bc13e7c39dd8b7022978`（COS 对象 `cos://gzbucket/coolie/app/0.6.0/coolie-release.apk`）。
- version.json / OTA(android, runtimeVersion 0.6.0) / server 联动部署 均已完成；**4 护栏全 200**
  （version.json=0.6.0 · ota/manifest 200 · APK 206 · api/health 200）。
- 本波同时把 wave147 的 7 个 commit push 上 `origin/main`（`0cc1a63eb` → `536fcca9f`）。

**5 波合并的真实构成（诚实标注）**：0.6.0 实际只含 **3 波**——wave147 spec-driven、wave148 工坊多对话、
wave144 board-chat 修复。**wave146「init script」从未落地**（该波自己的 `FINDINGS.md` 记录 P0-A 前提被
推翻、P2-D/P2-E 未做）；**wave149「浏览器打开按钮」修法仍在 `clients/expo` 的未提交改动里**，本波按纪律
`stash`（`stash@{0}`）而未入包。故 production `version.json` 的 `releaseNotes` 里「wave146 init script /
wave149 浏览器打开按钮」两句名不副实，需修正或由下一版补。详见
`docs-coolie/evidence/wave150/QA-REPORT.md` §6。

> 本节同时**作废**下方「v0.5.98 未发出」「v0.6.1 未发起」两节的等待前提：0.6.0 已落地，0.5.98 / 0.6.1
> 作为独立版本号不再需要；`clients/expo` 工作区在发版时是干净的（未提交改动已 stash 保留）。

## v0.5.98 — 已发起, 未发出 (blocked)

wave148 按 boss 拍板发起 `scripts/release-app.sh 0.5.98`, 在 `[1/9] 前置检查`
被拦下: 另一条并发工作线在 `clients/expo` 下有未提交的 tracked 改动
(`App.tsx` / `app.json` / `AppVersion.ts` / `PrototypeSandboxScreen.tsx`, 像是
iOS 发版在飞)。release-app.sh 拒绝为「对不上任何 commit」的产物出包, 而本波
纪律不允许提交别人未提交的仓区 —— 因此 **没有** v0.5.98 tag / APK / OTA。

wave144 修复 (`078923ead`) 与 wave148 全部改动已在 `main` 提交。工作区一干净即可
一条命令发出 (gradle → COS → version.json → OTA android → 联动部署 server):

```sh
bash scripts/release-app.sh 0.5.98 "wave144 工坊对话修复 + wave148 工坊多对话(新建/切换/重命名/归档)"
```

详见 `docs-coolie/evidence/wave148/QA-REPORT.md` §3B。

> wave148b 复核: v3 退出后这 4 个文件仍是未提交的改动, 由 wave150 以 `stash@{0}`
> (「wave149-v3 in-flight (do not touch)」) 保留; **0.5.98 不再单独发出** (已由 0.6.0 全额覆盖)。
> 详见 `docs-coolie/evidence/wave148b/QA-REPORT.md`。

## v0.6.1 — 未发起 (本波未发版)

wave147 的 spec-driven 开发链（requirement/bugfix → design → task）代码已全部落 `main`，但**本波没有发版**:

- 目标版本按 brief 为 0.6.1，前提是 wave146 先发 0.6.0；实际 `version.json`/`app.json`
  仍是 **0.5.97**，wave146 的 0.6.0 未落地，wave148 的 0.5.98 也因 `clients/expo`
  有他人未提交改动被 `release-app.sh` 拦下（上节）。此时 bump 0.6.1 会跨版本、并冲撞
  其它并发工作线的发版 —— 违反「一波一版本、不动他人发版」。
- 出 APK 还需 Android 工具链且要五面对齐（version.json / OTA / sha256 / app.json / APK badging）。

→ 待 0.6.0/0.5.98 之一落地、`clients/expo` 工作区干净后，再出 0.6.1。
详见 `docs-coolie/evidence/wave147/QA-REPORT.md`。

## v0.6.0-ios — iOS 包已出，TestFlight 未上（阻塞）

wave149-v6 走 iOS「打包 → TestFlight」路径。**本波不新增 tag 行**（上方表格只记 git tag，本波未打 tag），真实状态：

- `ASC_ISSUER_ID` 已到位，并**经真实 App Store Connect API 校验通过**（`GET /v1/apps` → HTTP 200）——首轮 v6 报告里「Issuer ID 空」的阻塞已解除。
- iOS 包已出：`https://dls.xrobinai.cn/coolie/app/0.6.0/coolie-release-ios.ipa`，14,274,490 Byte (13.61 MB)，
  sha256 `bea5ad103dba0bb2a7547bbc67930af2ec0122069fb275de39cc9531872bae09`（COS 对象 `cos://gzbucket/coolie/app/0.6.0/coolie-release-ios.ipa`）；
  App Store Distribution 签名（`Apple Distribution: wei chen (UU7T5893WZ)` + profile `Coolie工坊`），`codesign --verify --deep --strict` 通过。
- `version.json` 顶层新增**扁平** ios 字段（`iosDownloadUrl` / `iosBundleId` / `iosSha256` / `iosTestFlightUrl: null`），已部署，公网校验 8/8 PASS。
- **TestFlight 未上 —— 硬阻塞**：App Store Connect 帐号内**没有 `cn.xrobinai.app` 应用记录**（`GET /v1/apps` total=1，仅 `HJ大眼蛙`），
  `altool --upload-app` 报错 19「Unable to find Apple ID for Bundle ID 'cn.xrobinai.app' … create this app first」。需 boss/PM 先在 ASC 建档。
- 另注：该 profile 是 App Store 分发 profile（无 `ProvisionedDevices`），**ipa 不能真机直装**，只能走 TestFlight。

详见 `docs-coolie/evidence/wave149/QA-REPORT-v6.md` §11。
