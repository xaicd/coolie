# Release History

Git 里程碑 tag 流水。自 **v0.5.97** 起建立本文件；此前的 0.5.x 发版只改 `version.json` /
`clients/expo`，未打 git tag（`git tag -l` 为空即历史事实）。

| Tag | Date | Version | Commit | Notes |
|---|---|---|---|---|
| v0.5.97 | 2026-09-29 | 0.5.97 | bc48b1e80 | wave142: WBS 任务自动路由 + 沙箱附件真渲染 + 启动链路端到端可观察 |
| v0.6.0 | 2026-09-29 | 0.6.0 | 269526f19 | wave150 合并发版: wave147 spec-driven + wave148 多对话 + wave144 board-chat 修复（见 §v0.6.0） |
| v0.6.2 | 2026-09-30 | 0.6.2 | 786cb44ab | wave157 开发基座（5 默认模块, 不含业务域）+ App 实例目标可切换 + 模板预设收敛；**含 wave153 客户端修复**（见 §v0.6.2 wave157） |
| — | 2026-09-29 | 0.6.1 | (未打 tag) | **未发出** — wave152 治理 + 可观察性 (审计 log 全留痕 + 四类资源隔离补测 + 失败率/交付周期/产能 metrics + 缺陷 KB)。见 §v0.6.1 (wave152) |
| — | 2026-10-01 | 0.6.14 | 5d98de409 | wave251 资产 tab 业务本体子屏 chip 去重 (3 层 → 1 层)。见 §v0.6.14 (wave252) |
| — | 2026-10-01 | 0.6.19 | 37e6b3d77 | wave258 派活精准 + 删 13 + wave261 业务本体 5 层真分层下钻 (跳 0.6.18 避并发)。见 §v0.6.19 (wave262) |
| — | 2026-09-30 | 0.6.2-ios | af653b20a | **iOS 0.6.2 包已出并上 COS**（App Store 分发 .ipa，14,286,676 B）；**未上 TestFlight**（build 600 不动）。见 §v0.6.2-ios |

约定: tag 指向该版本「发版完成」的提交（含 `chore(release): version.json …` 这一步），
注释写本波主题。推送方式 `git push origin <tag>`（本仓库 push 需绕本地代理）。

## v0.6.14 — 已发出 (wave252)

来源 commit `5d98de409` (wave251 资产 tab chip 去重)。**本波手工走 release-app.sh 内嵌的 4 步**，
未走脚本整套流程 —— 见 `docs-coolie/evidence/wave252/QA-REPORT.md` §B 绕路说明。

- **APK**: `https://dls.xrobinai.cn/coolie/app/0.6.14/coolie-release.apk`, 84,797,599 Byte (80.87 MB),
  sha256 `f0c087e28323276b1d53f15ec228cd88f299f7b7dc23d2d7b363085dc73a9702`
  (COS 对象 `cos://gzbucket/coolie/app/0.6.14/coolie-release.apk`); package `cloud.coolie.app`,
  versionCode 614, versionName "0.6.14"。
- **version.json**: `https://xrobinai.cn/version.json` → version=0.6.14, versionCode=614,
  commitSha=`5d98de409`, releaseNotes="wave251 资产 tab chip 去重 (3 层 → 1 层)";
  保留 ios* / apkSha256 等非托管键。
- **OTA (android)**: 远端 manifest ID `ba957652-dd29-4fa2-a08a-c94805c5a7c0`,
  runtimeVersion 0.6.14, launchAsset sha256 `Ep7QVpHPYjMNKpxUusHz8C0B7PeQmwnQ_dWd9oytUCY` (5,057,415 B),
  native `EXPO_RUNTIME_VERSION` 与 app.json 一致 (verify-ota-runtime-consistency)。
- **4 护栏全 ✅**: version.json=0.6.14 / ota/manifest runtimeVersion=0.6.14 /
  APK HEAD 200 (80.87 MB) / `https://xrobinai.cn/api/health` 200 ok。
- **不动其它 session**: 本地工作树 `wine251` push 之前含 3 个 tracked modified
  (toast.ts / pnpm-lock.yaml / check-fork-surface.mjs) + 多个 untracked, 全部 stash 保留,
  release 完 pop 还原, worktree 与发版前一致。
- **未做**: 本地 `pnpm dev` 未起 (127.0.0.1:3100), 因为真值在生产域名, 本地无关;
  未做 gradle clean rebuild (UP-TO-DATE 增量构建已经 BUILD SUCCESSFUL)。
- **回滚路径**: 把 `version.json` 改回 0.6.13 + 删 `0.6.14` OTA manifest + 撤回 COS 上的 0.6.14 APK。

## v0.6.15 — 已发出 (wave255)

来源 commit `6ae154449` (wave254 TasksScreen 拆分去卡死)。本波手工走 release-app.sh 内嵌的 5 步 (fix-android-manifest / gradle / coscli / scp version.json / publish-ota), 未走脚本整套流程 —— 见 `docs-coolie/evidence/wave255/QA-REPORT.md` §E 绕路说明。release-app.sh `--dry-run` 在 [1/9] 前置检查因 wave184 toast 等其它 session 残留被拒。

- **APK**: `https://dls.xrobinai.cn/coolie/app/0.6.15/coolie-release.apk`, 84,798,015 Byte (80.87 MB),
  sha256 `a5d6bec8853c6f06b9eaddc3349a38000dd7d2ab697eb782f04e9234b68b5765`
  (COS 对象 `cos://gzbucket/coolie/app/0.6.15/coolie-release.apk`); package `cloud.coolie.app`,
  versionCode 615, versionName "0.6.15"。
- **version.json**: `https://xrobinai.cn/version.json` → version=0.6.15, versionCode=615,
  commitSha=`6ae154449`, releaseNotes="wave254 TasksScreen 拆分去卡死 (reducer + 4 memo 子组件 + stable callback)";
  保留 ios* / apkSha256 等非托管键。
- **OTA (android)**: 远端 manifest ID `0408fa8d-fa30-4009-a98f-2d6eacac3f08`,
  runtimeVersion 0.6.15, launchAsset sha256 `poUdiaKUsKHqg-kYvoyH9awozyXT7C5nGIZUWcrdbvc` (5,059,309 B),
  bundle `index-b0d65708f4bf386704dcdd790f421b49.hbc`,
  native `EXPO_RUNTIME_VERSION` 与 app.json 一致 (fix-android-manifest 验证)。
- **4 护栏全 ✅**: version.json=0.6.15 / ota/manifest runtimeVersion=0.6.15 /
  APK HEAD 200 (80.87 MB) / `https://xrobinai.cn/api/health` 200 ok (commit=null 因 prod 服务端未部署到 wave254, 不在本波范围)。
- **PM 验 (不撞模拟器)**: TasksScreen 238 行 (commit message 写 559→218 含 reset) / 4 memo 子组件齐全 / useTasksFilter 394 行 reducer / IssuesList stable callback + IssueRow memo / pnpm typecheck 通过。IssuesList FlatList getItemLayout **未真生效** — 注释承诺但实现仍是 View+map; commit 自承 "根因是父级 callback 飘", FlatList 优化留作下一波保险。
- **不动其它 session**: 本地工作树保留 wave184 toast / ErrorBoundary / ToastHost / network.ts / stores/toast.ts / wave186 netinfo / wave196+219 deploy-server / wave244 ds-bug-hunt 等 M+?? 残留; release 完 worktree 与发版前一致。
- **未做**: 本地 `pnpm dev` 未起 (PM 验走静态代码 + typecheck); 未跑 `scripts/deploy-tc-coolie-claw.sh` (服务端 deploy 不在 task 5 步内)。
- **回滚路径**: 把 `version.json` 改回 0.6.14 + 删 `0.6.15` OTA manifest + 撤回 COS 上的 0.6.15 APK。

## v0.6.19 — 已发出 (wave262)

来源 commit `37e6b3d77` (wave258 dispatch-skill-matcher 派活精准 + 删 13 数字员工)。本波手工走 release-app.sh 内嵌的 5 步 (fix-android-manifest / gradle / coscli / scp version.json / publish-ota), 未走脚本整套流程 —— release-app.sh `[1/9]` 前置检查因版本已在 0.6.19 (wave261 commit b4486190a 已 bump 0.6.14 → 0.6.19) 被拒 "当前已是 v0.6.19，无需发版"。

- **APK**: `https://dls.xrobinai.cn/coolie/app/0.6.19/coolie-release.apk`, 84,797,455 Byte (80.87 MB),
  sha256 `9fac302ea979cbee92e5c569ea6b368469bf8f8fd62d6ccab6cc92a8032474e0`
  (COS 对象 `cos://gzbucket/coolie/app/0.6.19/coolie-release.apk`); package `cloud.coolie.app`,
  versionCode 619, versionName "0.6.19"。
- **version.json**: `https://xrobinai.cn/version.json` → version=0.6.19, versionCode=619,
  commitSha=`37e6b3d77`, releaseNotes="wave258+wave261 — CMMI 30 skill 派活精准浮层 + 删 13 数字员工 + 业务本体 5 层真分层下钻 (L0 公司→L4 属性)";
  保留 ios* / apkSha256 等非托管键。
- **OTA (android)**: 远端 manifest ID `14d87069-c2cd-44c0-93b8-908c3ef26bd6`,
  runtimeVersion 0.6.19, launchAsset sha256 `DWxVly2OWzvImiJ_IINwV36tU0umOyo67lzVAa_4ews` (5,058,628 B),
  bundle `index-28b9818fb125c1e8e18fe33821684f3f.hbc`,
  native `EXPO_RUNTIME_VERSION` 与 app.json 一致 (fix-android-manifest 验证)。
- **4 护栏全 ✅**: version.json=0.6.19 / ota/manifest runtimeVersion=0.6.19 /
  APK HEAD 200 (80.87 MB) / `https://xrobinai.cn/api/health` 200 ok (`commit=null` 因服务端是 prod 跑老 commit, 不在本波范围)。
- **PM 验 (4 项, 老板真机 0.6.19 验收)**:
  1. 派活精准 (wave258): 资产 tab → 顶部 "🎯 派活精准" pill → 输入 "编码" → 铁匠 (Core SWE 蓝徽章 + 评分 100) 列首位
  2. 6 员工 (wave258): 删 13 数字员工后, 数字员工 tab 只剩 6 (Hermes / 墨斗 / 铁匠 / 兑底渊 / 门神 / 百晓生)
  3. 5 层真分层下钻 (wave261): 业务本体子屏 → 顶部 5 段面包屑 (L0 公司 → L1 域 → L2 类型 → L3 实例 → L4 属性) 可点回跳
  4. 删 "图谱过大, 已截断" 横幅 (wave261): 老板原 75 节点环图不再截断, 顶部 banner 已删
- **不动其它 session**: 本地工作树保留 wave184 toast / ErrorBoundary / ToastHost / network / stores/toast / wave186 netinfo / wave196+219 deploy-server / wave228+231 ds-bug-hunt 等 M+?? 残留; release 完 worktree 与发版前一致 (toast.ts / pnpm-lock.yaml / check-fork-surface.mjs / RELEASE-HISTORY.md 修改未提交, 因为都是其它 session 在做).
- **未做**: 本地 `pnpm dev` 未起 (PM 验走静态代码 + 远端 curl); 未跑 `scripts/deploy-tc-coolie-claw.sh` (服务端 deploy 不在 task 5 步内).
- **回滚路径**: 把 `version.json` 改回 0.6.15 + 删 `0.6.19` OTA manifest + 撤回 COS 上的 0.6.19 APK.

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

## v0.6.2-ios — iOS 包已出并上 COS（TestFlight 未上）

wave158-iOS 在 `main` HEAD `af653b20a`（含 wave153 登录修复 + wave157 开发基座）上重出 iOS 0.6.2。**本波不新增 tag 行**（未打 tag）。真值（`docs-coolie/evidence/wave158-ios/`）:

- `.ipa`：`https://dls.xrobinai.cn/coolie/app/0.6.2/coolie-release-ios.ipa`，14,286,676 Byte (13.62 MB)，
  sha256 `2e7d63c06857dfb115f318e36ece2945b0f4cd4259b13fea0a009a9cf6e6b4c0`
  （COS 对象 `cos://gzbucket/coolie/app/0.6.2/coolie-release-ios.ipa`）；版本 **0.6.2 / build 602**。
- 签名：`Apple Distribution: wei chen (UU7T5893WZ)` + profile `Coolie工坊`（**App Store 分发**，UUID `2630cad1-…`），
  解包 `codesign --verify --deep --strict` 通过；内嵌 profile `beta-reports-active=true`、无 `ProvisionedDevices`。
- `version.json` 顶层扁平字段 `iosDownloadUrl` → 0.6.2、`iosSha256` → 新值（**未动** `platform{}` 嵌套）；
  `version.json` / `ota/manifest` / APK / `api/health` **4 护栏全 200/206**。
- **TestFlight 未上**（boss 拍板不变更已发布构建）：未上传任何 build；build 600 `c6f5a5fb-…` 仍 `VALID`、未过期，
  internal 组 `waj_615@qq.com` 仍 `INVITED`（改动前后 ASC 快照 diff 为空）。

**诚实缺口（重要）**：该 `.ipa` 是 **App Store 分发**（无 ProvisionedDevices），**不能真机直装 / 扫码直装**，
只能经 TestFlight / App Store 安装。故「boss 走 QR / 直链装 0.6.2」在本波产物上**不成立**；要真机直装需另出
**Ad Hoc** 包（另一条产线），要 TestFlight 装 0.6.2 需新上传 build（= 冲 build，本波明令不做）。
详见 `docs-coolie/evidence/wave158-ios/QA-REPORT.md` §5。

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
