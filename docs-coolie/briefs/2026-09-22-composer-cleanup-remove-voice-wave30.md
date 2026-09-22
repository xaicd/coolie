# Brief: wave 30 — composer 视觉整理 + 删 voice 按钮 (boss 23:25 '页面看起来有点乱, 语音暂时不了')

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 23:25 OOB 「页面看起来有点乱, 语音暂时不了」

老板看了 0.5.17 真机截图, 觉得 composer 1:1 抄 Coolie Web NewIssueDialog 太乱 (字段全堆), 且不要 wave26 §3.5 voice 按钮.

## 1. 已知现状

```
✅ Coolie工坊 0.5.17 composer 1:1 抄 Coolie Web NewIssueDialog (wave26 完成):
   - 标题 + Description + For/Assignee + in/Project
   - ⋯ 添加 Reviewer/Approver/Watchdog
   - 优先级 4 chip + Status chip + Mode chips + Upload
   - Discard Draft + Create Task 双按钮
❌ 字段全堆在一起视觉乱 (老板)
❌ wave26 §3.5 加的 voice 按钮 — 删
```

## 2. 目标

**Coolie工坊 0.5.19 App** composer 视觉整理:

- ❌ 删 voice 按钮 (wave26 §3.5 撤回)
- ✅ 字段分组: Title/Description 一组, Assignee/Project/Status/Priority 二组, Mode/Upload 三组, ⋯ Reviewer/Approver/Watchdog 默认收起 (折叠)
- ✅ 间距加大, 卡片化分组 (减少视觉混乱)
- ✅ 字段减少到核心: Title + Description + Assignee + Project + Mode + Priority + Discard/Create

## 3. 任务 (4 步)

### 3.1 删 voice 按钮 (wave26 §3.5)

读 `clients/expo/src/screens/ComposeScreen.tsx` (wave26 新建) 找 voiceRow + voiceBtn + voiceEmoji + voiceLabel + useRecorder + dispatchVoice 全部删除.

同时删:
- `clients/expo/src/components/composer/VoiceInput.tsx` (如果新建了)
- 任何 `mode='transcribe-only'` 相关调用
- server 端 `mode: 'transcribe-only'` 分支 (波 21 加的, 现删 client 不再调用 — 保留 server 不破坏)
- TODO 文档加注: voice dispatch 暂未集成, 后续如要恢复可重启 wave21 + wave26 §3.5

### 3.2 字段视觉整理

把 1:1 抄 NewIssueDialog 的所有字段, **视觉分组**:

```tsx
<View style={styles.composeBody}>
  {/* 主组: 标题 + 描述 */}
  <SectionCard title="主要内容">
    <Input title="标题" />
    <Textarea description="描述" />
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

### 3.4 bump 0.5.17 → 0.5.19 (跳过 0.5.18) + 模拟器验证

```bash
1. bump 0.5.17 → 0.5.19 (跳过 0.5.18, wave29 取消)
2. Build APK + adb install
3. 进 [任务] tab → 点 [+] → composer 浮层打开:
   ✅ 标题 + 描述 主卡片
   ✅ Assignee + Project 指派卡片
   ✅ Mode + Priority + Status 设置卡片
   ✅ 高级选项 默认折叠 (点展开 Reviewer/Approver/Watchdog)
   ✅ 附件 卡片
   ❌ 没有 voice 按钮
   ✅ 整体视觉: 4 个卡片 + 1 折叠, 字段不堆
4. 截图 /tmp/emu-evidence/wave30-0.5.19/
```

## 4. Constraints

- ❌ DON'T 保留 voice 按钮 (boss 不要)
- ❌ DON'T 重设计字段 (只视觉整理分组, 不删字段)
- ❌ DON'T 触碰 paperclip 上游
- ✅ DO 卡片化分组 (4 SectionCard + 1 Disclosure)
- ✅ DO 默认折叠 Reviewer/Approver/Watchdog (高级)

## 5. Done definition

4 步全完 + 0.5.19 APK 装机 + 模拟器验证 (4 卡片 + 折叠 1 + 无 voice 按钮) + commit + push + 发版 + 上 COS:

```
Coolie工坊 0.5.19: https://dls.xrobinai.cn/coolie/app/0.5.19/coolie-release.apk
```