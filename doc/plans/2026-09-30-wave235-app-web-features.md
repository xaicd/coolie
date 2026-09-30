# wave235 — 把 web 端 本体/插件/图谱 相关功能抄到 App

> **日期:** 2026-09-30
> **状态:** PM 起草, 待老板拍板
> **范围:** clients/expo (App) + clients/api-client (调用方法); 不动 ui/ 不动 server/ 不动 plugins/
> **版本:** 复用 wave178 ErrorBoundary 的 0.6.9 (versionCode 609), 不重新 bump
> **不动:** wave218 APK 0.6.8 / wave213 Kanban / wave230 chip 修复 / wave225-229 文档

---

## 0. 一句话

老板原话: "原生 APP 资产 业务本体 相关功能, 最好把 web 端 本体插件 页相关功能抄过来".

web 端 ui/ 已有 `OntologyGraphPage` / `PluginPage` / `PluginManager` / `PluginSettings` / `CompanySettingsPluginPage` / `PluginOrganizationSwitcher` 6 个组件, 但 App 端
1. **没插件管理屏** (PluginManager / PluginSettings 都缺)
2. **没组织切换器** (web 有顶部 sidebar 切换, App 只有 1 个 company 上下文)
3. **资产页弱化** (没 Plate / Onboard / Showcase 入口)
4. **本体图谱已有基础** (`OntologyDomainListScreen` viewMode="graph"), 但缺拖拽节点改 viewpoint UX

不重 build 底层 (web 那 6 个文件 7000+ 行, 抄全炸 App). 只做 **app 端该有的最小集**: API 方法 + 列表屏 + 设置屏 + 切换器 + 资产页入口.

---

## 1. 真因

| 现状 | 期望 | 缺口 |
|---|---|---|
| App 装了 plugin-ontology 等 5 个插件, 看不到列表 | 列出 + 启停 + 配置 | **PluginManagerScreen 缺** |
| App 只有一个 company 上下文, 切公司只能重启 | 顶部一键切 | **PluginOrgSwitcher 缺** |
| 资产页 (Tab 5) 只有本体/项目/员工/产物 4 tab | 加 Plate / Onboard / Showcase 入口 | **3 个入口组件缺** |
| 本体域列表只有列表/详情/图 3 模式, 不能"拖节点换视角" | 拖拽节点改 view | **OntologyDomainListScreen UX 升级** |
| PluginSettings / CompanySettingsPluginPage 在 web 端是单插件详细配置 | App 同等能力 | **PluginSettingsScreen 缺** |

---

## 2. 范围 & 交付物 (5 子任务 / 9 文件)

### A. 本体图谱升级 (1 文件)

| 文件 | 状态 | 说明 |
|---|---|---|
| `clients/expo/src/screens/OntologyDomainListScreen.tsx` | M | 在现有 graph mode 加拖拽节点 → 切 viewpoint (再点节点设 rootType + rootId) |

**重要选择**: brief 提到 "react-native-force-graph + reanimated", 但:
- 该 lib 不在 `package.json`, 加它需要 `pnpm install` + 完整 native rebuild + gradle (本地有 Android SDK 但耗时 30+ 分钟)
- 现 App 已有纯 RN 图谱 view (line 442-672), 用 `View` 渲染节点 + 计算位置
- 不引入新依赖是 OTA 友好的, 否则任何 native 变动都要重新 build APK

**结论**: 沿用现有纯 RN graph view, 加 gesture-handler 拖拽节点. **不**加 react-native-force-graph. 这条决策会写进 CHANGELOG / commit / plan, 老板如有异议可改.

### B. 插件管理 (1 新文件 + 1 新组件)

| 文件 | 状态 | 说明 |
|---|---|---|
| `clients/expo/src/screens/PluginManagerScreen.tsx` | A | 列表 5+ 插件 / 启停 / 卸载 / 查看设置 (新窗口) |
| `clients/api-client/src/client.ts` | M | 加 `listPlugins` / `setPluginEnabled` / `uninstallPlugin` 3 方法 |

### C. 插件设置 (1 新文件)

| 文件 | 状态 | 说明 |
|---|---|---|
| `clients/expo/src/screens/PluginSettingsScreen.tsx` | A | 单插件详情 (id / version / description / config schema 渲染 / 本地文件夹 / capabilities) |
| `clients/api-client/src/client.ts` | M | 加 `getPlugin` / `updatePluginConfig` 2 方法 |

### D. 组织切换器 (1 新组件)

| 文件 | 状态 | 说明 |
|---|---|---|
| `clients/expo/src/components/PluginOrgSwitcher.tsx` | A | 顶部 Pressable pill, 列 companies, 点切; 复用现有 `coolie.ts` 的 `credentialCompanies` |

### E. 资产页强化 (1 文件)

| 文件 | 状态 | 说明 |
|---|---|---|
| `clients/expo/src/screens/OrgAssetsScreen.tsx` | M | 在 segmented control 旁加 3 个 pill 入口 (PlateOrgAssets / OnboardFlowEntry / PluginShowcase) |

---

## 3. 任务拆解 (单 commit + 单发版)

按 brief "拆 5 子任务内部跑, 但要 1 个 commit + 1 个发版":

1. **api-client 先加** — 5 方法 (listPlugins / setPluginEnabled / uninstallPlugin / getPlugin / updatePluginConfig). 引用 server 真实 routes (`/api/plugins`, `/api/plugins/:id/config`).
2. **PluginManagerScreen** — listPlugins → FlatList 渲染 → 每行 Pressable 启停 + 长按卸载.
3. **PluginSettingsScreen** — getPlugin → 显示描述 + 配置表单 + 保存.
4. **PluginOrgSwitcher** — 列 companies → onPress → setSelectedCompanyId (复用 coolie.ts store).
5. **OrgAssetsScreen** — 加 3 个 pill 入口 (PlateOrgAssets 跳 sandbox / OnboardFlowEntry 跳 onboarding / PluginShowcase 跳 PluginManager).
6. **OntologyDomainListScreen** — 加 gesture-handler 拖拽节点 handler.
7. **typecheck** — 4 护栏 (`pnpm --filter @coolie/expo typecheck`).
8. **release** — `release-app.sh` 出 APK + OTA bundle 0.6.9.
9. **QA** — 模拟器装 0.6.9, 跑 4 屏 + 截图 + 报告.
10. **push origin main** — 1 commit (含 5-7 改动 + 1 plan + 1 QA).

---

## 4. 不动 / 不要顺手改

- ❌ wave218 APK 0.6.8 (复用 0.6.9 的 ErrorBoundary)
- ❌ wave213 Kanban
- ❌ wave230 chip 修复
- ❌ wave225-229 文档 (5 员工映射等)
- ❌ ui/ (web 端)
- ❌ server/ (端点已有)
- ❌ packages/plugins/ (不动)
- ❌ react-native-force-graph (重大决策, 见 §2 A)

---

## 5. 验收

- [ ] `pnpm --filter @coolie/expo typecheck` 绿
- [ ] `pnpm --filter @coolie/api-client typecheck` 绿
- [ ] 4 屏在模拟器可开 (PluginManager / PluginSettings / PluginOrgSwitcher / 资产页新 pill)
- [ ] 拖拽节点改 viewpoint 在本体域 graph mode 可用
- [ ] 老板真机装 0.6.9 截图过
- [ ] docs-coolie/evidence/wave235/QA-REPORT.md 写完
- [ ] `pnpm check:token-gates` 不报新违规

---

## 6. 风险

| 风险 | 概率 | 处置 |
|---|---|---|
| 老板坚持要 react-native-force-graph | 低 | 单独 wave, 不阻塞本 wave |
| 本地 Android SDK / gradle 不全 | 中 | 用 release-app.sh (已有) — 它会报 |
| OTA bundle id 与 APK 内嵌 id 不一致 | 低 | 沿用 wave178 0.6.9 versionCode 609, OTA 同号段 |
| 5 屏代码质量不达标 | 中 | 沿用现有 ui/* tokens / theme.ts, 不引入新 design pattern |
| commit 夹带 wave231/232 文档 | 中 | `git diff --stat` 复核只含 wave235 白名单 |

---

## 7. 反例 / 已退路

- ~~整屏 plugin settings dialog~~ — 单屏更清楚
- ~~native force-graph 引入~~ — 纯 RN + gesture-handler 即可
- ~~iOS TestFlight bump~~ — 老板原话"不动 iOS", 不擅自升级
- ~~新增 design token / 主题色~~ — 沿用 wave215+ 现有 `C.*` + `RADIUS.*`

---

## 8. 时序

| 步骤 | 预计 |
|---|---|
| plan 起草 + 老板 review | 10 min |
| api-client 5 方法 | 30 min |
| 5 屏 / 4 组件 | 2.5 h |
| typecheck + 修 | 30 min |
| release-app.sh + OTA | 30 min |
| 模拟器 QA + 截图 | 30 min |
| QA-REPORT + push | 20 min |
| **合计** | **~5 h** |
