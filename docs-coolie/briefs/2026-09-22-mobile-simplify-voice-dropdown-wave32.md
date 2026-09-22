# Brief: wave 32 — 手机简单化 (语音=完整任务 + 下拉框 + 砍重叠)

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 OOB 三连

boss 23:30 23:35 23:36 23:38 OOB:

```
23:30 「只是页面要开始审计精简收敛, 选择」      → 选保守 (审计完成, wave31)
23:35 「该用下拉框的别展开」                    → ⋯ 展开 / Disclosure 折叠 → 下拉框
23:36 「手机安排工作要简单点」                   → 字段精简, 流程短
23:38 「语音说完就是一个完整任务才对」           → "完整任务" = task 完整 (标题+字段), 不是 "直接 dispatch"
23:40 「像豆包一样, 新会话, 要么打字, 要么语音转文字输入」  → 语音转写 → 入 input → 用户确认 → Create (豆包模式)
```

## 1. 已知现状

```
✅ wave31 审计完成 (docs-coolie/APP-PAGES-AUDIT.md), PM 推荐「中庸」: 砍 3 屏 + 合并 3 处
✅ wave26 §3.5 voice 按钮: 长按 mic → ASR 转写 → transcribed text 入 title (需用户再编辑 + 点 Create)
✅ 现有 composer (0.5.18): 4 SectionCard + 1 Disclosure (高级折叠) + voice 按钮
✅ PRD #1 语音派发: 之前 wave14 是 voiceDispatch (直接建任务), wave21 后改成 transcribe-only
```

## 2. 目标

**Coolie工坊 0.5.20 App** 极简单化:

A. **语音 = 直接建任务**: 长按 mic 录音 → ASR → 直接 issue 创建 (title=transcript, 跳任务详情, 不在 composer 浮层)
B. **下拉框替代展开**: 所有 ⋯ / Disclosure → 下拉框 select
C. **砍 3 屏**: NotificationsScreen (与 InboxScreen 重叠) + TaskComposer 内嵌 (与 ComposeScreen 重叠) + ComposerOverlay (与 ComposeScreen 重叠)
D. **composer 简化**: 4 卡片 + 1 折叠 → 2 卡片 (主要内容 + 指派), 高级选项下拉框, 折叠删

## 3. 任务 (5 步)

### 3.1 voice 按钮 → transcribe-only 入 input (boss 23:38 「像豆包一样」)

**回退 wave32 v1 思路**: boss OOB 「语音说完就是一个完整任务才对」+ 「像豆包一样, 新会话, 要么打字, 要么语音转文字输入」 = 语音**只转写**, 不直接 dispatch 建任务. 用户确认 input 后再点 Create.

新建 `clients/expo/src/services/voiceQuickCreate.ts`:

```ts
import { useRecorder } from '../useRecorder';

export async function voiceTranscribe() {
  const { start, stop } = useRecorder();
  await start();
  // ... 等待用户松开 (UI 端处理 onPressOut)
  const { base64, format } = await stop();
  
  const res = await fetch('/api/multimodal/transcriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': 'https://xrobinai.cn' },
    body: JSON.stringify({ audio: base64, format, mode: 'transcribe-only' })  // ← transcribe-only (波 21 模式)
  });
  const { text } = await res.json();
  return text;
}
```

UI 集成 (ComposeScreen 上 mic icon):

```tsx
const onVoicePress = async () => {
  setRecording(true);
  // 显示 toast "正在录音..."
  // 等用户再按一次 (release) — 类似 Telegram 风格
  setRecording(false);
  
  const text = await voiceTranscribe();
  if (text) {
    setTitle(prev => prev ? `${prev} ${text}` : text);  // 入 title, 不是 description
    toast.show('🎤 已转写: ' + text);
  } else {
    toast.show('🎤 没听清, 请再说一次');
  }
};
```

(像豆包: 录音完弹回 input 框, 用户确认后点 Create)

### 3.2 ⋯ 展开 / Disclosure → 下拉框

读 `clients/expo/src/components/composer/Disclosure.tsx` (wave26 新建), 改成 Dropdown select:

```tsx
<Dropdown
  label="高级选项"
  options={[
    { value: 'reviewer', label: '复核人' },
    { value: 'approver', label: '审批人' },
    { value: 'watchdog', label: '看守' },
  ]}
  onSelect={(value) => {
    // 展开对应字段
  }}
/>
```

(用 RN Picker 或 react-native-picker-select 跨平台下拉)

其他 ⋯ 按钮 (TasksScreen / BoardChatScreen) 也改下拉框 (如果太杂就 disable, 不动).

### 3.3 砍 3 屏

```bash
rm clients/expo/src/screens/NotificationsScreen.tsx
rm clients/expo/src/components/composer/TaskComposer.tsx
rm clients/expo/src/components/composer/ComposerOverlay.tsx  # if exists
```

(删完留注释说"已并入 ComposeScreen")

更新 App.tsx routes + 5 tab bar (NotificationsScreen 路由删).

### 3.4 composer 简化 (2 卡片)

把 wave30 4 SectionCard + 1 Disclosure 简化到 2 卡片:

```tsx
<View style={styles.composeBody}>
  <SectionCard title="主要内容">
    <Input title="标题" />
    <Textarea description="描述" />
  </SectionCard>

  <SectionCard title="指派">
    <AssigneeSelect />
    <ProjectSelect />
    <PriorityChips />
    <StatusSelect />
    <Dropdown label="高级选项" options={...} />  {/* 下拉框替代 Disclosure */}
    <Upload />
  </SectionCard>
</View>
```

(砍 Mode chips + Tags + Due date + Trust policy — 留核心, 高级的放 Dropdown 里)

### 3.5 bump 0.5.18 → 0.5.20 + 模拟器验证

```bash
1. bump 0.5.18 → 0.5.20 (release-app.sh runtimeVersion drift fix from wave16)
2. Build APK + adb install
3. 测试场景:
   a. [+] 中央 → composer 浮层 → 长按 mic → 录音 3s → 松开 → transcribed text 入 title (类似豆包)
      → 用户确认 / 修改 → 点 [Create Task] 才创建 (不是自动)
   c. [+] 中央 → composer 浮层 → 2 卡片 (主要内容 + 指派), 无 ⋯ 展开, 无 Disclosure
   d. 高级选项 Dropdown select 可下拉选复核人/审批人/看守
   e. NotificationsScreen 路由删, 5 tab 不变
4. 截图 /tmp/emu-evidence/wave32-0.5.20/
```

## 4. Constraints

- ❌ DON'T 触碰 paperclip 上游
- ❌ DON'T 重设计字段 (只精简)
- ✅ DO voice 改回 'dispatch' 模式 (直接建任务, 不入 input)
- ✅ DO ⋯/Disclosure 改下拉框
- ✅ DO 砍 3 屏
- ✅ DO composer 简到 2 卡片

## 5. Done definition

5 步全完 + 0.5.20 APK 装机 + 4 场景验证 (voice 直接建任务 / 下拉框 / 2 卡片 / Notifications 删) + commit + push + 发版 + 上 COS:

```
Coolie工坊 0.5.20: https://dls.xrobinai.cn/coolie/app/0.5.20/coolie-release.apk
```