# Brief: wave 36 — Coolie Web 0.6.4 全面审计 (boss 23:55 OOB '全面审计一下')

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 23:55 OOB 「全面审计一下」

老板 23:55 装 Coolie Web 0.6.4 真机, 看到 Plan 详情页 "导航边界都没了" (0.6.4 截图). 要求**全面审计整个 Coolie Web 当前状态**, 出报告.

## 1. 已知现状 (PM 09-22 真查)

```
✅ Coolie Web 0.6.4 APK 真装老板设备
✅ wave34 v2 完成: 底部 5 tab 中文 100% + i18n 字典扩展 60 条 + 修 tab 重叠
✅ wave35 完成: OTA 触发 + Caddy fix + paperclip-web manifest path
❌ 老板截图 Plan 详情页 "导航边界都没了":
   - appBar 「< 任务」返回按钮可能视觉问题 (左侧紧贴屏幕边, 无 margin)
   - 或 Plan 页面没正确包在 Layout 中 (无 appBar 边界)
   - 或 IssuePropertiesPlansTab 嵌入位置错 (appBar 底部无 border)
❌ 老板说 "导航边界都没了" — 不只 Plan 详情页, 可能其他页面也有
```

## 2. 目标

**Coolie Web 0.6.4 全面审计**, 出 `docs-coolie/WEB-AUDIT-WAVE36.md`:

- 列出所有 Coolie Web 页面 (route + 标题)
- 每个页面的 appBar 状态 (有/无, 边界, 返回按钮)
- 视觉问题 (老板发现的 "导航边界没了")
- 移动端适配 (mobile 视图)
- i18n 漏翻译清单
- 修法建议 (3 档: 激进 / 中庸 / 保守)
- 等老板拍板再 wave37 实施

## 3. 任务 (5 步)

### 3.1 列所有 Coolie Web 路由

```bash
ssh tc-coolie-claw 'grep -E "<Route path" /opt/coolie/ui/src/App.tsx | head -40'
```

整理成表格: route path + 标题 + 是否 mobile 友好 + appBar 状态.

### 3.2 看 appBar 怎么渲染

读 server `/opt/coolie/ui/src/components/AppShell.tsx` 或 `/opt/coolie/ui/src/pages/*/Layout.tsx`:

- AppShell 是否包所有路由
- AppBar 组件怎么渲染 (有/无, border, margin)
- 返回按钮 (mobile only?) 在哪
- 移动端 (mobile drawer) 是否覆盖 appBar

### 3.3 跑 Playwright 真截图每个路由

```bash
ssh tc-coolie-claw 'cd /opt/coolie/ui && pnpm test:e2e -- --reporter=line' 2>&1 | tail -20

# 或门神 Playwright 真截:
node scripts/playwright-screenshot.js /opt/coolie/ui --viewport mobile
```

预期截图 evidence: `/tmp/web-audit-wave36/*.png`

### 3.4 老板截图真值分析

老板发的截图 (img_cd66a904b5be.jpg):
- 顶部 appBar 「< 任务」按钮 — 左侧紧贴屏幕边 (无 margin/padding)
- 中央大字 「Plan」 — 应该是中文「计划」
- Plan 卡片里 "xrobinai · 计划任务" — 中文已生效
- 状态徽章 "待办池" — 中文已生效
- ❓ appBar 底部 border 可能没显示 (「导航边界没了」)

要查:
- Plan 详情页的 container/padding/margin
- AppBar border-b 是否在该页渲染
- mobile viewport 是否把 nav 边界隐藏了

### 3.5 出审计报告 docs-coolie/WEB-AUDIT-WAVE36.md

报告结构:

```markdown
# Coolie Web 0.6.4 全面审计 (PM 2026-09-22)

## 1. 所有路由清单
| Route | 标题 | 移动端 | AppBar | 边界 | 备注 |
| --- | --- | --- | --- | --- | --- |
| / | Dashboard | OK | OK | ❌ (no border) | 导航边界没了 |
| /issues | Issues | OK | OK | ❌ | 同 |
| /issues/:id | Plan 详情 | OK | ❌ (顶部按钮无 margin) | ❌ | 老板截图示例 |
| /agents | Agents | OK | OK | ❌ | i18n 漏 |
| /inbox | Inbox | OK | OK | ❌ | 同 |
| /settings | Settings | OK | OK | ❌ | 同 |
| /pipelines | Pipelines | OK | OK | ❌ | 同 |
| /plans | Plans | OK | OK | ❌ | 同 |
| ... | ... | ... | ... | ... | ... |

## 2. 视觉问题汇总

| # | 页面 | 问题 | 严重度 | 修法 |
| --- | --- | --- | --- | --- |
| - | 所有 | AppBar 底部 border 缺失 | 高 | 加 border-b (CSS) |
| - | Plan 详情 | 「< 任务」按钮无 left padding | 高 | 加 px-2 / px-3 |
| - | Plan 详情 | 中央大字「Plan」应「计划」 | 中 | i18n PATCH 加 |

## 3. 移动端适配

| 检查项 | 状态 |
| --- | --- |
| viewport meta | OK |
| drawer 导航 | OK |
| bottom tab | OK (wave34 v2) |
| 输入框键盘适配 | OK |

## 4. i18n 漏翻译 (扫硬编码英文)

| 字段 | 现状 | 应翻译 |
| --- | --- | --- |
| "Plan" (中央标题) | 英文 | "计划" |
| "Dashboard" | 已翻译 | OK |
| "Settings" | 已翻译 | OK |
| ... (扫到的) | ... | ... |

## 5. 修法建议 (3 档)

### 激进: 修 10+ 项视觉 + i18n + 重构
### 中庸: 修 5 项关键 (border + 按钮 padding + i18n)
### 保守: 只修老板看到的 (Plan 详情页)

## 6. 等老板选
- 激进 / 中庸 / 保守 / 自定义 (点名哪几个修)
```

## 4. Constraints

- ❌ DON'T 改代码 (只审计报告)
- ✅ DO 出 3 档方案 + 给老板选
- ✅ DO 用 Playwright 真截图
- ✅ DO 老板截图分析

## 5. Done definition

5 步全完 + docs-coolie/WEB-AUDIT-WAVE36.md 入档 + commit + push + 给老板 3 档选择 + 等拍板再 wave37 实施.

```
docs-coolie/WEB-AUDIT-WAVE36.md (新文件)
```