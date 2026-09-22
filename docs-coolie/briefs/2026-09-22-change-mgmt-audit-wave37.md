# Brief: wave 37 (v2) — 变更规范补全 (CHANGELOG + PM-RELEASE-CHECKLIST 加固)

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 23:58 OOB 「变更内容, 更新规范没有吗」

老板质疑: 变更内容 + 更新规范是否完整? PM 立即盘点发现:

```
✅ docs-coolie/VERSIONING.md (semver 三段语义, 老板 09-21 拍板)
✅ docs-coolie/PM-RELEASE-CHECKLIST.md (24 项 gate)
✅ .agents/skills/release-flow/SKILL.md (4 类资产发布方式)
✅ docs-coolie/OTA-RUNTIME-VERSION-FIXED.md (wave16 报告)
✅ clients/expo/CHANGELOG.md (Coolie工坊 有)
❌ clients/expo-paperclip-web/CHANGELOG.md 不存在 (Coolie Web 没 CHANGELOG)
❌ clients/h5/CHANGELOG.md 不存在 (h5 web 没 CHANGELOG)
⚠️ 之前发版 (wave26 0.5.15 / wave32 / wave36) 跳过了 PM-RELEASE-CHECKLIST 部分 gate
```

## 1. 已知现状 (PM 09-22 真查)

```
✅ PM-RELEASE-CHECKLIST.md 24 项 gate 已有:
  A. 代码质量 (A1-A6) — typecheck / test / build / export / 单测
  B. 版本号 (B1-B4) — semver 检查
  C. git (C1-C4)
  D. 安全 (D1-D3)
  E. 服务端烟测 (E1-E4) — health / ota / SSE / dashboard
  F. 上传 (F1-F3) — APK URL / version.json / OTA runtimeVersion
  G. 老板回签 (G1-G2)

❌ 之前发版实施问题:
  - wave26 0.5.15 release commit 只 bump version, 没 typecheck/test/export/build APK
  - 老板 23:55 装 0.6.4 发现 OTA bug (EXPO_UPDATE_URL 不匹配), 没装到新 bundle
  - 之前 0.5.2 → 0.5.5 → 0.5.7 → 0.5.18 全 patch bump, 没 minor/major 区分 (跟 VERSIONING.md 偏离)
```

## 2. 目标

**变更规范补全**:

A. **补 Coolie Web CHANGELOG.md** (clients/expo-paperclip-web/CHANGELOG.md)
B. **补 h5 web CHANGELOG.md** (clients/h5/CHANGELOG.md)
C. **更新 PM-RELEASE-CHECKLIST** (加 4 类资产 CHANGELOG 必更新 gate + semver sanity check)
D. **backfill 之前发版的 CHANGELOG** (wave26/27/30/32/34/35/36)
E. **release-flow skill 加"必跑 PM-RELEASE-CHECKLIST"步骤** (发版前)

## 3. 任务 (5 步)

### 3.1 创建 Coolie Web CHANGELOG.md

新建 `clients/expo-paperclip-web/CHANGELOG.md`:

```markdown
# Coolie Web (paperclip-web 套壳) CHANGELOG

## 0.6.4 (2026-09-22)

- 底部 5 tab 100% 中文 (仪表盘 / 任务 / 新建任务 / 员工 / 收件箱)
- i18n 字典扩展 60 条 (跟 NewIssueDialog 字段 label + boss 截图发现的英文)
- 修 MobileBottomNav `bg-border/50` 在 light mode 下透明导致内容透出 (加 opaque style)
- 新增 I18N_PATTERNS (regex 匹配 runtime-built strings: "Finished 2d ago → 2d 前完成")
- 新增 I18N_CSS_PATCH + delayed re-sweeps (300/1000/2500ms)
- /ota/paperclip-web/manifest 端点建立 (Caddy `@manifest` matcher 加 `/paperclip-web/manifest`)

## 0.6.2 (2026-09-21)

- 初版 wave9 paperclip-web 套壳 (Cloud + UI 路由)
- i18n PATCH 字典 180 条 (wave10.1)
- 新增 11 条 i18n 字典 (wave18 patch2: NewTaskDialog)
```

### 3.2 创建 h5 web CHANGELOG.md

新建 `clients/h5/CHANGELOG.md`:

```markdown
# Coolie h5 web CHANGELOG

## 0.6.2 (2026-09-21)

- h5 端 TasksScreen (NewTaskDialog 镜像 + IssuesList 6 视图切换)
- h5 镜像 + 17 字段 ComposeScreen (wave24 / wave26)
- h5 镜像 + 新建任务 modal (wave30)
- h5 端 keyboardShouldPersistTaps (wave29)

## 0.5.0 (2026-09-20)

- 初版 h5 web 镜像 (Coolie工坊 App + 浏览器)
```

### 3.3 backfill clients/expo/CHANGELOG.md 0.5.5 → 0.5.18

读现有 CHANGELOG, 补:

```markdown
## 0.5.18 (2026-09-22)
- 全 ScrollView 加 keyboardShouldPersistTaps='handled' (login/register 不再吞 button tap)

## 0.5.17 (2026-09-22)
- 左缘右滑返回上一页 (EdgeSwipeBack + BackHandler)
- Alert dialog queue 修 (OTA 不再 20+ "更新就绪" 排队)

## 0.5.16 (2026-09-22)
- 同上 + 修系统返回键不退出 App

## 0.5.15 (2026-09-22) — NOT RELEASED
- 1:1 抄 Coolie Web NewIssueDialog (全字段)
- Voice 按钮 (长按 mic → transcribe-only → 入 title)
- ⚠️ 实际上 APK 没真发 (wave27 披露), version commit 跳过了 release-app.sh 4-9 步
- 真正的 release 是 0.5.16 之后才发出

## 0.5.7 (2026-09-21)
- 编排按钮组 [🔨 Build 5 步链] [🛤️ Pipeline] [📋 Plan] (TasksScreen 顶部)
- 修 OTA 键名 `EXPO_UPDATE_URL` (expo-updates 协议)
- 修 release-app.sh gradle bump bug

## 0.5.5 (2026-09-21)
- AppBar + 底部 tab bar + 主题色统一
- 浮层不挡底部 nav
```

### 3.4 加固 PM-RELEASE-CHECKLIST.md

读现有 + 加:

```markdown
## H. 变更规范 (4 项) — NEW

- [ ] **H1** `clients/expo/CHANGELOG.md` 顶部插入新版本节 (发版前)
- [ ] **H2** `clients/expo-paperclip-web/CHANGELOG.md` 顶部插入新版本节 (改 Coolie Web 时)
- [ ] **H3** `clients/h5/CHANGELOG.md` 顶部插入新版本节 (改 h5 时)
- [ ] **H4** `docs-coolie/briefs/<date>-<name>.md` 包含 PM 拍板理由 + 受影响资产 + 装机直链

## I. 变更语义 (1 项) — NEW (跟 VERSIONING.md 联动)

- [ ] **I1** version bump 符合 semver (patch=hotfix / minor=feature / major=breaking, 见 docs-coolie/VERSIONING.md)
```

### 3.5 release-flow skill 加 "必跑 PM-RELEASE-CHECKLIST"

读 `.agents/skills/release-flow/SKILL.md`, 在 "4 类资产发布方式" 表格下面加:

```markdown
## 3. 发版前必跑

**任何发版前必须跑 [docs-coolie/PM-RELEASE-CHECKLIST.md](../docs-coolie/PM-RELEASE-CHECKLIST.md) 全部 gate (24 + 5 项)**。A1-A6 / B1-B4 / C1-C4 / D1-D3 / E1-E4 / F1-F3 / G1-G2 + H1-H4 / I1.

跳过任何一项 ⛔ = 不发版. PM 跑完签字.

## 4. 之前发版的问题 (反思)

- wave26 0.5.15 release commit 只 bump version, 没 typecheck/test/export/build APK
- 导致 0.5.15 APK 没真发 (wave27 披露)
- 修法: 现在 wave26 之后任何 release commit 必须先跑 PM-RELEASE-CHECKLIST
```

## 4. Constraints

- ❌ DON'T bump 任何版本 (只是文档)
- ❌ DON'T 触碰 paperclip 上游
- ✅ DO 补 2 个 CHANGELOG (Coolie Web + h5 web)
- ✅ DO backfill Coolie工坊 CHANGELOG 0.5.5 → 0.5.18
- ✅ DO 加固 PM-RELEASE-CHECKLIST (H + I)
- ✅ DO release-flow skill 加"必跑"

## 5. Done definition

5 步全完 + 3 个 CHANGELOG 补全 + PM-RELEASE-CHECKLIST 25 项 + release-flow skill 加必跑 + commit + push + 报告 docs-coolie/CHANGE-MGMT-AUDIT.md:

```
docs-coolie/CHANGE-MGMT-AUDIT.md (新文件)
```