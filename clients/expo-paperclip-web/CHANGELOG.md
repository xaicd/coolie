# Coolie Web (paperclip-web 套壳) CHANGELOG

Coolie Web 移动套壳 App（Expo + WebView 包 paperclip UI）版本流水。

> 溯源自 wave37 变更规范补全（2026-09-22）。此前 Coolie Web 没有 CHANGELOG。

---

## 0.6.4 (2026-09-22) — commit `29a033dd5`

- 底部 5 tab 100% 中文（仪表盘 / 任务 / 新建任务 / 员工 / 收件箱）
- i18n 字典扩展 60 条（跟 NewIssueDialog 字段 label + boss 截图发现的英文）
- 修 MobileBottomNav `bg-border/50` 在 light mode 下透明导致内容透出（加 opaque style）
- 新增 I18N_PATTERNS（regex 匹配 runtime-built strings: "Finished 2d ago → 2d 前完成"）
- 新增 I18N_CSS_PATCH + delayed re-sweeps（300/1000/2500ms）
- `/ota/paperclip-web/manifest` 端点建立（Caddy `@manifest` matcher 加 `/paperclip-web/manifest`）

---

## 0.6.2 (2026-09-21) — commit `d3af9a1f3`

- 初版 wave9 paperclip-web 套壳（Cloud + UI 路由）
- i18n PATCH 字典 180 条（wave10.1）
- 新增 11 条 i18n 字典（wave18 patch2: NewTaskDialog）
