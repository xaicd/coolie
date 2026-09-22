# Brief: wave 37 — 只搞 Coolie工坊 App (boss 23:57 '咱只搞 coolie 工坊吧')

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 23:57 OOB 「咱只搞coolie工坊吧」

老板撤回 Coolie Web 方向, 只保留 Coolie工坊 App:
- ❌ Coolie Web 不再投入 (wave36 审计已 kill)
- ❌ Coolie Web 0.6.4 OTA 修不修不重要 (老板不装 Coolie Web)
- ❌ Coolie Web i18n 字典扩展 60 条 不再发版
- ✅ 只搞 Coolie工坊 App (0.5.19 / 0.5.20 / 0.5.21 ...)

## 1. 已知现状

```
✅ Coolie工坊 0.5.18 已发版
⏸ wave32 (computer UI) proc killed, 工作树保留 modified (App.tsx + 删 composer 子组件)
⏸ wave33 仿豆包 brief 入档 (41ad89dee) — 待派实施
⏸ wave34 v2 Coolie Web i18n + 0.6.4 已发 — 老板不用, 重要性低
✅ wave35 OTA 触发 + Caddy fix — paperclip-web 不影响 Coolie工坊
✅ wave36 审计 brief 入档 (74f4147ae) — boss 说不要了
```

## 2. 目标

**Coolie工坊 App 0.5.20 — 仿豆包新会话 (按 wave33 brief 实施)**:

A. 丢掉 wave32 工作树改动 (App.tsx + 删 composer 子组件 — 老板说删 composer 是错的, 重设计)
B. 仿豆包: 主新会话页 (Empty state + 模式切换 + 4 chip + 按住说话大按钮)
C. 现有 `/api/multimodal/transcriptions` (transcribe-only) + `/api/issues` POST — 底层用现有, 不新加 server API

## 3. 任务 (5 步)

### 3.1 清理 wave32 工作树

```bash
cd ~/workspace/xaicd/coolie
git checkout -- clients/expo/App.tsx
git status --short | head
```

(撤销 wave32 删的 composer 子组件 + App.tsx 修改, 回到 wave31 状态)

### 3.2 仿豆包新会话页

新建 `clients/expo/src/screens/NewTaskPage.tsx` (替代 ComposeOverlay + ComposeScreen):

```tsx
// Empty state 中央大字
<Text style={styles.greeting}>新建什么任务?</Text>

// 模式切换 pill
<ModeSwitch options={['对话', '工作']} value="工作" />

// 4 chip 快捷功能
<QuickActionsRow actions={[
  { icon: '💬', label: '对话', target: '/chat' },
  { icon: '🎤', label: '录音转写', onPress: voiceQuickStart },
  { icon: '🤖', label: 'AI 创建', target: '/chat/build' },
  { icon: '📷', label: '拍照上传', onPress: openCamera },
]} />

// 底部「按住说话」大按钮 (主输入)
<HoldToTalkButton
  onPress={async () => {
    const text = await voiceTranscribe();
    setTitle(text);  // 入 title
  }}
/>

// 底部辅助 row
<BottomAuxRow>
  <CameraBtn />
  <KeyboardBtn onPress={openKeyboardInput} />
  <MoreBtn onPress={showTools} />
</BottomAuxRow>
```

### 3.3 长按 mic 入 title (豆包模式)

复用 wave21 useRecorder + voiceDispatch 链路 (transcribe-only):

```ts
async function voiceTranscribe() {
  const { start, stop } = useRecorder();
  await start();
  // 等用户松开 (UI 处理 onPressOut)
  const { base64, format } = await stop();
  
  const res = await fetch('/api/multimodal/transcriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': 'https://xrobinai.cn' },
    body: JSON.stringify({ audio: base64, format, mode: 'transcribe-only' })
  });
  const { text } = await res.json();
  return text;
}
```

不直接 dispatch, 用户确认 input 后点 [Create Task] 才创建.

### 3.4 创建任务 modal (按 Create Task 才出现)

用户录入 title (或语音转写后) → 点 Create Task → 弹 CreateTaskModal:

```tsx
// 简化的 modal (2 卡片):
<SectionCard title="主要内容">
  <Input title="标题" value={title} />
  <Textarea description="描述" />
</SectionCard>

<SectionCard title="指派">
  <AssigneeSelect />
  <ProjectSelect />
  <PriorityChips />
</SectionCard>

<View style={styles.footer}>
  <DiscardBtn />
  <CreateTaskBtn onPress={createIssue} />
</View>
```

createIssue → POST `/api/issues` (现有) → 跳详情.

### 3.5 bump 0.5.18 → 0.5.20 + 模拟器验证

```bash
1. bump 0.5.18 → 0.5.20 (release-app.sh runtimeVersion drift fix from wave16)
2. Build APK + adb install
3. 测试场景:
   a. [+] 中央 → NewTaskPage 打开 (Empty state)
   b. 长按 mic → 录音 3s → 松开 → transcribed text 入 title input
   c. 点 Create Task → 弹 CreateTaskModal (2 卡片)
   d. 填完 → POST /api/issues 201 → 跳任务详情
   e. 模拟器验底部 tab + 抽屉菜单 正常
4. 截图 /tmp/emu-evidence/wave37-0.5.20/
```

## 4. Constraints

- ❌ DON'T 改 Coolie Web
- ❌ DON'T 新加 server API (用现有)
- ❌ DON'T 保留 wave32 工作树改动 (撤销)
- ✅ DO 仿豆包主新会话页 (Empty state + 按住说话 + 4 chip)
- ✅ DO 长按 mic → 转写 → 入 title (豆包模式)
- ✅ DO 用户确认 → Create Task 才创建

## 5. Done definition

5 步全完 + Coolie工坊 0.5.20 APK 装机 + 模拟器验证 (豆包新会话页 + 长按 mic + 入 title + Create Task) + commit + push + 发版 + 上 COS:

```
Coolie工坊 0.5.20: https://dls.xrobinai.cn/coolie/app/0.5.20/coolie-release.apk
```

## 6. 后续规划 (老板确认后)

- wave38: Coolie工坊 仿豆包左侧抽屉菜单 (历史对话 + 工具入口)
- wave39: Coolie Web 全部 retire (do not ship, 不要在 git 删, 标记 deprecated)
- wave40: Coolie工坊 A 按钮组 (Build/Pipeline/Plan) + B 智能识别 增量发版