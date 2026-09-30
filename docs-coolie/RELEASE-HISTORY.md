# Release History

Git 里程碑 tag 流水。自 **v0.5.97** 起建立本文件；此前的 0.5.x 发版只改 `version.json` /
`clients/expo`，未打 git tag（`git tag -l` 为空即历史事实）。

| Tag | Date | Version | Commit | Notes |
|---|---|---|---|---|
| v0.5.97 | 2026-09-29 | 0.5.97 | bc48b1e80 | wave142: WBS 任务自动路由 + 沙箱附件真渲染 + 启动链路端到端可观察 |
| v0.6.0 | 2026-09-29 | 0.6.0 | 269526f19 | wave150 合并发版: wave147 spec-driven + wave148 多对话 + wave144 board-chat 修复（见 §v0.6.0） |
| v0.6.2 | 2026-09-30 | 0.6.2 | 786cb44ab | wave157 开发基座（5 默认模块, 不含业务域）+ App 实例目标可切换 + 模板预设收敛；**含 wave153 客户端修复**（见 §v0.6.2 wave157） |
| — | 2026-09-29 | 0.6.1 | (未打 tag) | **未发出** — wave152 治理 + 可观察性 (审计 log 全留痕 + 四类资源隔离补测 + 失败率/交付周期/产能 metrics + 缺陷 KB)。见 §v0.6.1 (wave152) |

约定: tag 指向该版本「发版完成」的提交（含 `chore(release): version.json …` 这一步），
注释写本波主题。推送方式 `git push origin <tag>`（本仓库 push 需绕本地代理）。

## v0.6.2 — 已发出 (wave157)

`bash scripts/release-app.sh 0.6.2 "…"` **exit 0**，发版 commit **`786cb44ab`**。真实交付：

- **A 开发基座**：`templates/workspace-skel/` 重写为「空壳 + 5 默认模块
  (system/infra/member/audit/api)，**不含业务域**」；删 `.gitmodules` /
  `import-ruoyi.sh` / ruoyi 子模块（**不留兼容层**）。`new-company.sh` 改拉轻量底座
  `coolie-base-1.0`（拉不到不阻断）。模板预设 4 → 1（App + Web 同步）。
  spec `2026-09-21-coolie-workspace-template.md` 同步（+对比表 +标书定制指南）。
- **B App 实例目标可切换**：新增 `clients/expo/src/instanceTarget.ts`（纯模块）+
  `detectAndSetApiBaseUrl()`；默认仍为生产，`EXPO_PUBLIC_COOLIE_USE_DEV_INSTANCE=1`
  切到 dev（默认 `http://10.0.2.2:3100`）。
- 真值（`docs-coolie/evidence/wave157/`）：APK `https://dls.xrobinai.cn/coolie/app/0.6.2/coolie-release.apk`
  （78,126,198 Byte / 74.51 MB）；version.json / OTA(runtimeVersion 0.6.2) / server 联动部署
  均完成；公网 `version.json` = 0.6.2、`/api/health` 200、APK 206、OTA manifest 200。

**附带修的一个真缺陷（诚实标注）**：`release-app.sh` 第 8 步从头重写 version.json，把
本脚本不管理的键抹掉 —— wave149 加的 **iOS 扁平字段**（`iosDownloadUrl`/`iosBundleId`/
`iosSha256`/`iosTestFlightUrl`）因此在本次发版时被静默删除，iOS 升级卡片的「直接下载 .ipa」
按钮随之消失。已修：第 8 步改为**合并保留既有键**（远端真值优先，本地 tracked 兜底），
并已把带 iOS 字段的 version.json 重新部署，公网校验 9/9 字段齐全。

**诚实缺口**：本波**未做**模拟器上用新包真跑 dev 登录（详见 QA 报告 §6.4–6.5：装的旧包
0.6.0 打生产；dev 实例的主机名白名单对 `10.0.2.2` 回 403 —— 需 `allowed-hostname 10.0.2.2`
并重启 dev 才能在模拟器登录 dev）。`coolie-base-1.0` tag 需有推送权限的一方创建。

## v0.6.1 — 未发出 (wave152 治理 + 可观察性)

**本波没有发版，`version.json` 未 bump（仍 0.6.0），未打 tag。** 按 boss 纪律本波只记本文件。
发版被 `scripts/release-app.sh` 前置检查挡下（工作树同时含 wave154 ontology-graph、wave149
e2e/scripts 的他人未提交改动），未尝试绕过。

服务端交付（真值见 `docs-coolie/evidence/wave152/QA-REPORT.md`）:

- **审计 log**：新表 `audit_log`（迁移 **9011**；9009 已被 wave148 占、9010 被并发 wave154 抢注）
  + `services/audit.ts` + `middleware/audit.ts` + `GET /api/companies/:cid/audit-log`；
  写点覆盖 issue 状态/负责人/删除、spec 写入、conversation 建/归档/删、work_product 版本切换/删、
  attachment 删。活机 curl 实测四类事件落库（含 before/after）。
- **隔离补测**：attachment 既有单测已证跨公司 404；本波新增 spec/conversation 跨公司真测（404/403）。
- **metrics**：`services/metrics.ts` + `GET /api/companies/:cid/metrics/overview`
  （failure_rate / delivery_cycle_days_avg / throughput_per_day + by_agent + 14 天 sparkline series）。
- **缺陷 KB**：新表 `defect_kb` + `services/defect-kb.ts` + 关闭钩子（指纹第 3 次 → 自动建 playbook 任务）
  + `GET /api/companies/:cid/defect-kb`。

**缺口（诚实）**：Web/App 三处 UI（AuditLogViewer / Dashboard 卡片 / DefectKBPage）**未做**；
审计未覆盖 agent 任命、role/permission、app_releases；本地实例无 `4cafeb9a`（真值跑在 `onboarding-cache-test-*`）。
验证：wave152 新增 15 单测全过、`packages/db`/`server` tsc 均 exit 0；`issue-attachment-routes` 有 1 条
**本波之前就红**的既有失败（已用 HEAD 版复现，未修）。

## v0.6.2 (原 wave153 段) — 未单独发出, 已并入上方的 v0.6.2 (wave157)

> wave153 的客户端改动（登录 cookie 回放 / 资产筛选竞态 / App spec 编辑器 /
> onboarding 入口）当时未能单独发版，随 **v0.6.2 (wave157)** 一起发出；本节保留
> 当时的记录，结论以 §v0.6.2 (wave157) 为准。

**本波没有发版，`version.json` 未 bump（仍 0.6.0）。** 原因是硬门 + 环境，非实现问题：

- `scripts/release-app.sh` 第 1 步前置检查要求 `clients/expo` 工作区干净、全仓 tracked 无改动。
  当前工作树**同时**含**并行工作线**的未提交改动（wave152 audit/metrics：`server/src/routes/`
  下 `metrics.ts` / `audit-log.ts` / `defect-kb.ts` / `ontology-graph.ts`，`packages/db`、
  `packages/shared`、`ui/` 多处），以及 wave149 的未提交脚本。**必然被该门拦下**；
  且本波纪律不允许把他人的改动卷进自己的 commit。
- 无 Android 工具链/真机，`gradle assembleRelease` 出 APK 亦不可行。

因此本波只 **commit wave153 自己的客户端改动**（`clients/api-client`、`clients/expo` 的
4 屏 + App.tsx + coolie.ts，及本报告/审计文档），发版留给工作区干净后的单独一轮。

真实交付与缺口（诚实）: 见 `docs-coolie/evidence/wave153/QA-REPORT.md`。要点 ——
A 登录根因=App 未回放**签名**会话 cookie（服务端实测签名→200 / 未签名→401, curl 真值），
已改为显式回放 `Cookie` 头 + 冷启动/回前台刷新; D「项目筛选」**服务端本来就正确**
（curl 33→3→2），真 bug 是 App 端**请求竞态**（慢的「全部产物」覆盖了筛选结果），已加请求序号保护;
C 新增 App `SpecEditorScreen`（3 步 + 4 tab, 契约同 wave147）; B 只做了 App 侧 onboarding
入口（**`companies` 表无 `metadata` 列**，brief 的 `onboarded_step` **未做**）。A/C/D 均**未在
老板 Samsung 真机运行**（无实机），不假装跑通。

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
