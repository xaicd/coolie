# 变更规范审计 — wave 37 (v2)

> 触发: 老板 2026-09-22 23:58 OOB「变更内容, 更新规范没有吗」
> PM: Hermes · Worker: cmd
> Brief: `docs-coolie/briefs/2026-09-22-change-mgmt-audit-wave37.md`
> 范围: **DOCS ONLY** — 不改代码, 不 bump 版本。

---

## 1. 审计结论（盘点前 → 盘点后）

| 项 | 盘点前 | 盘点后 |
|---|---|---|
| `clients/expo/CHANGELOG.md` (Coolie工坊 App) | ⚠️ 有, 但 0.5.15 未标 NOT RELEASED; 缺 0.5.16/0.5.17 部分条目 | ✅ 补全 |
| `clients/expo-paperclip-web/CHANGELOG.md` (Coolie Web 套壳) | ❌ 不存在 | ✅ 新建 (0.6.2 → 0.6.4) |
| `clients/h5/CHANGELOG.md` (h5 web) | ❌ 不存在 | ✅ 新建 (0.5.0 → 0.6.2) |
| `docs-coolie/PM-RELEASE-CHECKLIST.md` | ⚠️ 24 项 (A-G), 无变更规范 gate | ✅ 29 项 (+ H1-H4 / I1) |
| `.agents/skills/release-flow/SKILL.md` | ⚠️ 有 4 类资产发布方式, 无「必跑 checklist」前置门禁 | ✅ 加「发版前必跑」节 |
| `docs-coolie/VERSIONING.md` | ✅ 已有 (semver 三段) | 不动 (被 I1 引用) |

---

## 2. 实际改动 (5 步)

### 2.1 新建 Coolie Web CHANGELOG

`clients/expo-paperclip-web/CHANGELOG.md`
- `0.6.4 (2026-09-22)`: 5 tab 中文化 / i18n 字典 +60 条 / MobileBottomNav light mode 透明修复 / I18N_PATTERNS / I18N_CSS_PATCH / `/ota/paperclip-web/manifest` 端点
- `0.6.2 (2026-09-21)`: 初版 wave9 套壳 / i18n 字典 180 条 (wave10.1) / +11 条 (wave18 patch2)

### 2.2 新建 h5 web CHANGELOG

`clients/h5/CHANGELOG.md`
- `0.6.2 (2026-09-21)`: h5 TasksScreen / 17 字段 ComposeScreen (wave24/26) / 新建任务 modal (wave30) / keyboardShouldPersistTaps (wave29)
- `0.5.0 (2026-09-20)`: 初版 h5 web 镜像

### 2.3 backfill Coolie工坊 CHANGELOG (0.5.5 → 0.5.18)

`clients/expo/CHANGELOG.md` 追加/订正:
- `v0.5.15` → 标题标 **⚠️ NOT RELEASED** + 说明 (wave26 release commit 跳过 `release-app.sh` export/gradle/coscli/version.json 4-9 步, wave27 披露)
- `v0.5.17` → 补「Alert dialog queue 修 (OTA 不再 20+ 弹窗排队)」
- `v0.5.16` → 补「修系统返回键不退出 App (BackHandler 映射为 App 内返回)」

> 说明: 0.5.5-0.5.18 的版本节在本次之前已由各 wave 的 release commit 落库, 内容完整; 本次只补上述 3 处准确性缺口, 未重写既有节 (避免丢信息)。

### 2.4 加固 PM-RELEASE-CHECKLIST

`docs-coolie/PM-RELEASE-CHECKLIST.md`
- 新增 **H. 变更规范 (4 项)**: H1 expo CHANGELOG / H2 Coolie Web CHANGELOG / H3 h5 CHANGELOG / H4 brief 拍板理由+资产+装机直链
- 新增 **I. 变更语义 (1 项)**: I1 version bump 符合 semver (联动 `VERSIONING.md`)
- 计数 24 → 29; 速查表加 2 行; 顶部/结尾「24 项」文案同步

### 2.5 release-flow skill 加前置门禁

`.agents/skills/release-flow/SKILL.md`
- §1 表格下新增「**发版前必跑（⛔ 前置门禁）**」: 任何发版前必跑 PM-RELEASE-CHECKLIST 全部 gate, 跳一项 = 不发版, PM 签字
- 附「之前发版的问题（反思）」: wave26 0.5.15 只 bump version → APK 没真发
- §7/§9 里陈旧的「24 项 gate」文案同步为 29

---

## 3. 审计发现的落差 (open items, 未擅自改)

1. **PM-RELEASE-CHECKLIST 计数不一致 (既有)**: 文档标称「24 项」, 但逐节实列 A6+B4+C4+D3+E4+F3+G2 = **26 项**。本次按 brief 口径记为 `24 + 新增 5 = 29`, 未重编既有节。**建议 PM 裁定后统一口径** (若要改, 一次性校正为 26+5=31)。
2. **h5 版本口径**: brief 指定 h5 CHANGELOG 版本为 `0.6.2 / 0.5.0`, 但 `clients/h5/package.json` 的 `version` 仍为 `0.1.0`。二者无自动联动。brief 的口径 = 跟 Coolie Web/平台整体版本对齐; `package.json` 未动 (本任务禁 bump)。**建议后续明确 h5 是否以平台版本为准。**
3. **brief §5 文案**: 写的「25 项」与 §3.5 的「24 + 5 项」= 29 不一致, 本次取 29。

---

## 4. 验证

- DOCS ONLY: 未动任何 `.ts/.tsx/.gradle/.json` 代码文件, 未 bump 任何版本。
- 未触碰 paperclip 上游。
- 目标文件均不在 `scripts/fork-surface.json` (非上游所有), 无需登记。
- 仅提交本任务 6 个文件 (见下), 不夹带工作区既有未提交改动。

改动文件:

```
A  clients/expo-paperclip-web/CHANGELOG.md   (新建)
A  clients/h5/CHANGELOG.md                   (新建)
M  clients/expo/CHANGELOG.md                 (backfill/订正)
M  docs-coolie/PM-RELEASE-CHECKLIST.md       (H/I 5 项)
M  .agents/skills/release-flow/SKILL.md      (前置门禁)
A  docs-coolie/CHANGE-MGMT-AUDIT.md          (本文件)
```

---

## 5. Done definition 对照

- [x] 5 步全完
- [x] 3 个 CHANGELOG 补全 (expo 订正 + Coolie Web 新建 + h5 新建)
- [x] PM-RELEASE-CHECKLIST 29 项 (24 + H1-H4/I1)
- [x] release-flow skill 加「必跑」
- [x] 本报告 `docs-coolie/CHANGE-MGMT-AUDIT.md`
- [x] commit + push（本报告随同一 commit 提交）
