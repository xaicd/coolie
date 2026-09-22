# Brief: wave 34 (v2) — Coolie Web 底部 5 tab 中文 + i18n 字典继续搞全 (boss 23:48 '底部导航 5 个得中文吧, 国际化不全')

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 23:48 OOB 「底部导航 5 个得中文吧, 国际化不全」

老板 23:48 装 Coolie Web 0.6.2 真机, 看到:
- ❌ 底部 5 tab 还是英文 (Home / Tasks / New Task / Agents / Inbox)
- ❌ "AGENTS" "No linked task" "Finished Xd ago" "Dashboard" 等英文未翻译
- ❌ 底部 tab 重叠 ("View dInboxs")

**boss 要求**: 底部 5 tab 全部中文 + i18n 字典继续搞全.

## 1. 已知现状 (PM 09-22 真查)

```
✅ wave10.1 i18n PATCH 字典 180 条入 clients/expo-paperclip-web/App.tsx
✅ wave18 patch2 加 11 条 (NewTaskDialog 中文)
✅ wave24 加 6 条 (Assignee/Project/Work Mode/Auto/Code/Plan/Auto-PR)
✅ wave26 加 20+ 条 (跟 NewIssueDialog 字段 label 一一对应)
❓ 总条数: 约 220 条 (但 Coolie Web 上还有更多英文短语未翻译)
```

## 2. 目标

**Coolie Web 0.6.4 (i18n 字典扩展)** + **Coolie工坊 0.5.21 App 仿豆包** 同时发:

A. Coolie Web 0.6.4: 扫 Coolie Web 0.6.2 上所有硬编码英文, 加 i18n 字典 + 字典 +180 条 (wave26 后又 5+ 页新加字段, 漏翻译)
B. Coolie工坊 0.5.21: 仿豆包主对话页 + 左侧抽屉 (按 wave33 brief)

## 3. 任务 (4 步)

### 3.1 扫 Coolie Web 硬编码英文

```bash
ssh tc-coolie-claw 'grep -rohE ">[A-Z][a-zA-Z ]{3,40}<|placeholder=\\"[A-Z][a-zA-Z ]{3,40}\\"|\"[A-Z][a-zA-Z ]{3,40}\"" /opt/coolie/ui/src/pages/ /opt/coolie/ui/src/components/ 2>/dev/null' | sort -u | head -50
```

读 server 上 `/opt/coolie/ui/src/pages/*.tsx` + `/opt/coolie/ui/src/components/*.tsx`, 找:
- 中文缺失的英文 UI label
- 未翻译的 placeholder
- 未翻译的 toast / error message
- 新加 5 个页面的字段 (wave26 后: Usage/Cost / PipelineEditor / PlanDetail / etc)

### 3.2 翻译 + 加 i18n 字典

```ts
// clients/expo-paperclip-web/App.tsx I18N_PATCH 字典加 50 条
'I18N_PATCH': {
  // 之前 220 条 ...
  // 新加:
  'Project' → '项目',
  'New project' → '新建项目',
  'All projects' → '所有项目',
  'Cost' → '成本',
  'Usage' → '用量',
  'Failure rate' → '失败率',
  'Efficiency' → '效率',
  'Delivery cycle' → '交付周期',
  'Pipeline editor' → 'Pipeline 编辑器',
  'Add stage' → '添加阶段',
  'Configure pipeline' → '配置 Pipeline',
  'Plan review' → 'Plan 评审',
  'Approve plan' → '批准 Plan',
  'Reject plan' → '拒绝 Plan',
  'Plan feedback' → 'Plan 反馈',
  '...' // 其他 30+ 条
}
```

### 3.3 bump Coolie Web 0.6.2 → 0.6.4 + 发版

```bash
1. bump clients/expo-paperclip-web/app.json + package.json: 0.6.2 → 0.6.3 (versionCode 3 → 4)
   # 或跳到 0.6.4
2. Build Coolie Web APK (paperclip-web 套壳 + i18n patch2 注入)
3. adb install + 模拟器验证:
   - 装 Coolie Web 0.6.4
   - 扫所有新页面 (Usage/Cost / PipelineEditor / PlanDetail 等), 期望中文
4. 上 COS:
   https://dls.xrobinai.cn/coolie/app/0.6.4-paperclip-web/coolie-release.apk
```

### 3.4 Coolie工坊 App 0.5.21 仿豆包 (按 wave33 brief)

按 wave33 brief 跑 (mockup 设计先行 → 老板预览 → 通过后实施 0.5.21).

(可选, 跟 wave33 并行; 但门神单进程 — 串行)

## 4. Constraints

- ❌ DON'T 改 Coolie Web UI (老板认为不错)
- ❌ DON'T 新加 server API (底层用现有)
- ✅ DO 扫 + 加 i18n 字典 (50+ 条)
- ✅ DO bump Coolie Web 0.6.2 → 0.6.4 + 发版
- ⏸️ wave33 仿豆包 等 wave34 完了再派 (串行)

## 5. Done definition

4 步全完 + Coolie Web 0.6.4 i18n 字典扩展 + 模拟器验证所有新页面中文 + commit + push + 发版 + 上 COS:

```
Coolie Web 0.6.4:   https://dls.xrobinai.cn/coolie/app/0.6.4-paperclip-web/coolie-release.apk
```

## 6. 老板验收

- 装机 0.6.4 → 扫 5+ 个新页面 (Usage/Cost / PipelineEditor / PlanDetail / Settings / NotificationsCenter), 期望中文 100%
- 看 Coolie Web 0.6.4 OTA 拉新 (bump 0.6.2 → 0.6.4)
- 装 Coolie工坊 0.5.21 仿豆包 (wave33 完了之后)