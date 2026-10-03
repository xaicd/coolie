# wave275 QA 报告 — 第一刀 P0 真修 + 兑底渊发版 0.6.21

## 老板原话
> "DS 继续发版本, 我看看效果" → "b" = DS = 兑底渊 (PRE-SRE 匠人, copilot 工具)

## 修复目标
| P0 | 来源 | 文件 | 真因 | 修法 |
|----|------|------|------|------|
| **P0-NEW-5** 抽屉吞 TabBar | wave270/271 QA 实测, screen-13 老板真机截图 | `clients/expo/src/screens/OrgAssetsScreen.tsx` | MoreSheet (Modal transparent fade) zIndex 高于 TabBar, 浮层没让出 TAB_BAR_HEIGHT 让底栏 5 tab 永远可点 | MoreSheet 改用底部抽屉 `Sheet` (Sheet.tsx) + `paddingBottom: TAB_BAR_HEIGHT` 让底栏永远露出 |
| **P0-03** 看板/列表 toggle 按了屏不切 | wave271 QA, 老板日常死循环 | `clients/expo/src/screens/TaskKanbanScreen.tsx` | `SegmentedControl` 设了 `view` state, 渲染处没读它 — 永远渲染看板 | 加 `view === "board"` 三元条件, 否则用 `IssuesList` 复用 wave254 列表逻辑 |
| **P0-01** 本体工作台进不去 | wave271 QA | `clients/expo/App.tsx` + `OrgAssetsScreen.tsx` | `setOntologyWorkbenchOpen(true)` 只在 `InstanceGraphScreen.onOpenWorkbench` 触发 — 必须先经 instanceGraph | OrgAssetsScreen 顶部 pill 加 `onOpenWorkbench` 直接入口, 老板不必绕 InstanceGraph |
| **P0-02** 插件设置进不去 | wave271 QA | `App.tsx` + `OrgAssetsScreen.tsx` | MoreSheet 4 项 Modal 拦截 onOpenPluginManager, 老板点不到 | 抽 `buildMoreItems()` 在主屏组装, 改用 Sheet 浮层 (与 P0-NEW-5 同源) |

## 改动 (3 文件)
```
feat(expo): wave275 — 第一刀 P0 真修 (P0-NEW-5 抽屉吞 TabBar / P0-03 看板列表 toggle / P0-01+P0-02 三元锁死)

clients/expo/App.tsx                          |  +7 -2
clients/expo/src/screens/OrgAssetsScreen.tsx  | +93/-30
clients/expo/src/screens/TaskKanbanScreen.tsx | +29/-12
```

版本号 / CHANGELOG 由 release-app.sh 自动 bump (不手改).

## 不动
- TasksScreen (wave254 已重构, 不动)
- 5 tab 结构 (老板硬规矩, 不动)
- AGENT_ROLES enum (5 角色不变)
- server 业务 / ui / api-client

## 护栏 (4 绿)

| 护栏 | 结果 | 说明 |
|------|------|------|
| **typecheck** (`pnpm -r typecheck`) | ✅ PASS | clients/expo + 全仓 typecheck 都 clean, 无 JSX / TSV 多重 attribute 错误 |
| **token-gates** (`pnpm check:token-gates`) | ✅ PASS | 1083 文件扫描, 4 gate 全 clean, 没引入新的 color literal / bracket val / raw font-size |
| **fork-surface** (`scripts/check-fork-surface.mjs`) | ✅ PASS | 改的 3 个文件都在 `clients/` owned prefix, 无需在 `fork-surface.json` 内 declare |
| **release-app.sh 4 护栏** (`--with-4-guard`) | ✅ PASS | version.json / ota/manifest / APK HEAD / /api/health (后由 release-app.sh 自动跑) |

## 发版流程
1. `git reset --soft HEAD~1` revert 手改版本号 (release-app.sh 是 source-of-truth)
2. `git commit -m "feat(expo): wave275 ..."` 仅含代码改动 (3 文件)
4. `bash scripts/release-app.sh 0.6.21 "wave275 — ..."  --skip-server-deploy --with-4-guard`
   - step [0/9] DS 投产一票否决: 跳过 (无 company_id)
   - step [1/9] 前置检查: PASS
   - step [2/9] 自动 bump app.json / package.json 0.6.20 → 0.6.21
   - step [3/9] 自动顶部插 v0.6.21 到 CHANGELOG.md
   - step [4/9] 自动 commit ("release: v0.6.21 — ...")
   - step [5/9] 修 AndroidManifest OTA 打开 + runtimeVersion
   - step [6/9] gradle assembleRelease 出 APK
   - step [7/9] coscli 上传 APK 到 COS (`cos://gzbucket/coolie/app/0.6.21/coolie-release.apk`)
   - step [8/9] 生成 version.json 含 commitSha, scp 到生产 `/opt/coolie/ui/dist/version.json`
   - step [9/9] publish-ota 增量更新
   - step [10/9] (skip) server 联动部署 (wave275 不动 server)
   - step [11/9] 4 护栏 (version.json / ota/manifest / APK HEAD / /api/health) PASS
   - step [12/9] 打 git tag v0.6.21 + push origin v0.6.21

## QA 验证 (老板真机装 0.6.21 看效果)
- [ ] 点 "资产" tab → 进 OrgAssetsScreen 真屏, TabBar 5 tab 永远在底部, **不被任何浮层吞掉**
- [ ] 资产 tab 顶部 pill "更多" → 弹底部抽屉 (而非全屏 Modal), 底栏 TabBar 仍可见
- [ ] 任务看板右上角 "看板 / 列表" toggle → 按了真切 (看板显示 5 列拖拽, 列表显示 IssuesList 复用)
- [ ] 资产 tab 顶部 pill "工作台" → 直接进 App 端 Workbench 屏 (不必先经 InstanceGraph)
- [ ] 资产 tab 顶部 pill "更多" → "插件管理" 项 → 进 PluginManagerScreen (再点一项进 PluginSettingsScreen)

## 老板真机截图位置
- 模拟器装 0.6.21 → `docs-coolie/evidence/wave275/screen-*.png`

## 范围外 (不动)
- wave270 / wave271 (审计报告, 不动)
- wave272 / wave273 (在跑, 不动)
- v0.6.20 tag (不动)
- server 业务 / ui (不动)
- 13 数字员工相关 (不动)
- AGENT_ROLES (不动)