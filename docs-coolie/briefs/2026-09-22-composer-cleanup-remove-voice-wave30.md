# Brief: wave 30 (v2) — composer 视觉整理 (KEEP voice 按钮, boss 23:28 OOB '语音要的')

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 23:28 OOB 「语音要的」

老板撤回 23:25 的 "语音暂时不了", 说语音功能还是要保留. wave30 改为:**视觉整理 + KEEP voice 按钮**.

## 1. 已知现状

```
✅ Coolie工坊 0.5.17 composer 1:1 抄 Coolie Web NewIssueDialog (wave26):
  - 标题 + Description + For/Assignee + in/Project
  - ⋯ 添加 Reviewer/Approver/Watchdog
  - 优先级 4 chip + Status chip + Mode chips + Upload
  - **Voice 按钮 (wave26 §3.5) — 老板说保留**
  - Discard Draft + Create Task 双按钮
❌ 字段全堆在一起视觉乱 (老板 23:25)
❌ wave30 (proc_c56e161d158d) 已 kill, 没真发版
```

## 2. 目标

**Coolie工坊 0.5.19 App** composer 视觉整理 + **KEEP voice 按钮**:

- ✅ 字段分组: 4 SectionCard + 1 Disclosure
- ✅ **Voice 按钮保留** (放在「主要内容」卡片下方, 或 Description 与「指派」卡片之间)
- ✅ 间距加大, 卡片化分组
- ✅ Mode chips 折叠到「设置」卡片 (不占独立行)
- ✅ 高级选项默认折叠

## 3. 任务 (4 步)

### 3.1 KEEP voice 按钮 (wave26 §3.5 不删)

读 `clients/expo/src/screens/ComposeScreen.tsx` (wave26 新建) **保留**:
- voiceRow + voiceBtn + voiceEmoji + voiceLabel
- useRecorder + dispatchVoice 调用
- `mode: 'transcribe-only'` 链路

### 3.2 字段视觉整理

把字段**卡片化分组** (但不删字段):

```tsx
<View style={styles.composeBody}>
  {/* 主组: 标题 + 描述 + voice 按钮 */}
  <SectionCard title="主要内容">
    <Input title="标题" />
    <Textarea description="描述" />
    <VoiceInputButton />   {/* KEEP! */}
  </SectionCard>

  {/* 任务组: 关键指派 */}
  <SectionCard title="指派">
    <AssigneeSelect />  {/* For [自动派发 / Hermes] */}
    <ProjectSelect />   {/* in [无项目 / Onboarding] */}
  </SectionCard>

  {/* 设置组: Mode + Priority + Status */}
  <SectionCard title="设置">
    <ModeChips />       {/* Auto / Plan / Ask */}
    <PriorityChips />   {/* 紧急/高/中/低 */}
    <StatusSelect />    {/* 待处理 + ⋯ */}
  </SectionCard>

  {/* 高级组: 默认折叠 (⋯ Reviewer/Approver/Watchdog) */}
  <Disclosure title="高级选项" defaultOpen={false}>
    <ReviewerSelect />
    <ApproverSelect />
    <WatchdogSelect />
  </Disclosure>

  {/* 附件组 */}
  <SectionCard title="附件">
    <Upload />
  </SectionCard>
</View>
```

新增 `clients/expo/src/components/composer/SectionCard.tsx` (卡片化容器, padding/margin/radius).

新建 `clients/expo/src/components/composer/Disclosure.tsx` (折叠展开组件).

### 3.3 i18n + 视觉规范

i18n 字典加:
```
'主要内容' → '主要内容'
'指派' → '指派'
'设置' → '设置'
'高级选项' → '高级选项'
'附件' → '附件'
```

视觉规范:
- 卡片间距 12px
- 卡片内部 padding 16px
- 卡片 background var(--bg-2), border 1px var(--border)
- 卡片 radius var(--radius)
- section title fontSize 11px, color var(--ink-3), uppercase letter-spacing 0.5px

### 3.4 bump 0.5.18 → 0.5.19 + 模拟器验证

```bash
1. bump 0.5.18 → 0.5.19 (release-app.sh runtimeVersion drift fix from wave16)
2. Build APK + adb install
3. 进 [任务] tab → 点 [+] → composer 浮层打开:
   ✅ 标题 + 描述 + voice 按钮 主卡片
   ✅ Assignee + Project 指派卡片
   ✅ Mode + Priority + Status 设置卡片
   ✅ 高级选项 默认折叠
   ✅ 附件 卡片
   ✅ 整体视觉: 4 卡片 + 1 折叠, 字段不堆
   ✅ Voice 按钮 还在
4. 截图 /tmp/emu-evidence/wave30-0.5.19/
```

## 4. Constraints

- ❌ DON'T 删 voice 按钮 (boss 23:28 '语音要的')
- ❌ DON'T 触碰 paperclip 上游
- ✅ DO 卡片化分组
- ✅ DO 默认折叠 Reviewer/Approver/Watchdog (高级)

## 5. Done definition

4 步全完 + 0.5.19 APK 装机 + 模拟器验证 (4 卡片 + 1 折叠 + voice 按钮 还在) + commit + push + 发版 + 上 COS:

```
Coolie工坊 0.5.19: https://dls.xrobinai.cn/coolie/app/0.5.19/coolie-release.apk
```