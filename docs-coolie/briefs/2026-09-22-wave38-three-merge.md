# Brief: wave 38 — 3 件事合一 (PM-CHECKLIST 计数修 + h5 版本联动 + Coolie工坊 仿豆包)

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 23:59 OOB 「都可以」

老板批准 wave37 v2 门神提的 2 个 PM 拍板 + wave38 仿豆包新会话页:

1. ✅ PM-CHECKLIST 计数 24 → 31 项 (26 项实列 + 5 项加固)
2. ✅ h5 版本联动 (clients/h5/package.json 0.1.0 → 0.6.2)
3. ✅ Coolie工坊 0.5.21 仿豆包新会话页 (按 wave33 brief)

## 1. 已知现状

```
✅ wave37 v2 完成: 3 个 CHANGELOG + PM-CHECKLIST 24 → 29 项 + skill 门禁
⚠️ PM-CHECKLIST 计数不严: 实列 26 项 (但文档标 24, brief 标 29, 真正应 31 = 26+5)
⚠️ h5 版本未联动 (clients/h5/package.json 0.1.0 vs CHANGELOG 写 0.6.2)
✅ wave33 brief 入档: 仿豆包新会话页
```

## 2. 目标

3 件事合一, 一次性完:

A. **PM-CHECKLIST 计数修**: 24 → 31 项 (26 实列 + 5 加固)
B. **h5 版本联动 bump**: clients/h5/package.json 0.1.0 → 0.6.2 (跟 CHANGELOG 对齐)
C. **Coolie工坊 0.5.21 仿豆包**: 按 wave33 brief 实施 (Empty state + 模式切换 + 4 chip + 按住说话)

## 3. 任务 (7 步)

### 3.1 PM-CHECKLIST 计数修

读 `docs-coolie/PM-RELEASE-CHECKLIST.md`, 改:
- 头部 "24 项" → "31 项"
- A6 / B4 / C4 / D3 / E4 / F3 / G2 检查项存在性确认 (实际 26 项)
- 速查表 / 头尾文案同步

### 3.2 h5 版本联动 bump

```bash
# 1. 读 clients/h5/package.json
cat clients/h5/package.json | python3 -c "import json,sys; print(json.load(sys.stdin)['version'])"

# 2. 改 0.1.0 → 0.6.2
sed -i '' 's/"version": "0.1.0"/"version": "0.6.2"/' clients/h5/package.json

# 3. 验证
cat clients/h5/package.json | python3 -c "import json,sys; print(json.load(sys.stdin)['version'])"
# 期望: 0.6.2
```

### 3.3 清理 wave32 工作树

```bash
cd ~/workspace/xaicd/coolie
git checkout -- clients/expo/App.tsx
git status --short  # 期望 wave32 改的撤销
```

### 3.4 仿豆包新会话页

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

// 底部「按住说话」大按钮
<HoldToTalkButton onPress={async () => {
  const text = await voiceTranscribe();
  setTitle(text);
}} />

// 底部辅助 row
<BottomAuxRow>
  <CameraBtn onPress={openCamera} />
  <KeyboardBtn onPress={openKeyboardInput} />
  <MoreBtn onPress={showTools} />
</BottomAuxRow>
```

### 3.5 长按 mic → 转写 → 入 title (豆包模式)

复用 wave21 useRecorder + voiceDispatch (transcribe-only):

```ts
async function voiceTranscribe() {
  const { start, stop } = useRecorder();
  await start();
  // UI 处理 onPressOut
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

### 3.6 CreateTaskModal (按 Create Task 才弹)

```tsx
<Modal>
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
</Modal>
```

createIssue → POST `/api/issues` (现有) → 跳详情.

### 3.7 bump 0.5.20 → 0.5.21 + 模拟器验证

```bash
1. bump 0.5.20 → 0.5.21 (release-app.sh runtimeVersion drift fix from wave16)
2. Build APK + adb install
3. 测试场景:
   a. [+] 中央 → NewTaskPage 打开 (Empty state 中央大字)
   b. 长按 mic → 录音 3s → 松开 → transcribed text 入 title input
   c. 点 Create Task → CreateTaskModal (2 卡片)
   d. 填完 → POST /api/issues 201 → 跳任务详情
4. 截图 /tmp/emu-evidence/wave38-0.5.21/
```

## 4. Constraints

- ❌ DON'T bump 0.5.21 之外的版本 (不改 server / 其他资产)
- ❌ DON'T 改 Coolie Web
- ❌ DON'T 改 paperclip 上游
- ❌ DON'T 保留 wave32 工作树改动
- ✅ DO 仿豆包新会话页
- ✅ DO h5 版本联动 (0.1.0 → 0.6.2)
- ✅ DO PM-CHECKLIST 计数修 (31 项)

## 5. Done definition

7 步全完 + Coolie工坊 0.5.21 APK 装机 + 模拟器验证 (仿豆包 + 长按 mic + 创建任务) + h5 package.json 0.6.2 + PM-CHECKLIST 31 项 + commit + push + 发版 + 上 COS:

```
Coolie工坊 0.5.21: https://dls.xrobinai.cn/coolie/app/0.5.21/coolie-release.apk
h5 version:       0.6.2 (package.json)
PM-CHECKLIST:     31 项 gate (24+7 实列, 修订版)
```