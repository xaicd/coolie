# Brief: wave 22 — 删除独立 "语音派单" 按钮 (老板 22:58 嫌弃)

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-21 22:58 OOB 「不要再有显示的什么语音派单那个功能了，你现在那个那个功能按钮独立出来有什么用呢」

老板嫌弃独立的"语音派单"按钮 — 长按 mic 入会话 input 已覆盖场景, 独立按钮无意义. 必须删.

## 1. 已知现状 (PM 09-21 真查)

```
✅ BoardChatScreen 长按 mic → text 入 input → 用户确认发送 (wave21, 0.5.11 已发)
❌ TasksScreen appBar 右上 [🎤 语音派发] 独立按钮 (波 20 加的) — 删
❌ AppBar.tsx 全局顶栏 [🎤 语音派发] 独立按钮 (波 18 加的) — 删
❌ h5 TasksScreen 镜像 — 删
✅ AppBar 已有 [驾驶舱Web] 按钮 (保留)
✅ 编排按钮组 [🔨 Build 5 步链] [🛤️ Pipeline] [📋 Plan] (波 20 加的) — 保留
✅ BoardChatScreen 长按 mic 按钮 — 保留
```

## 2. 目标

**Coolie工坊 0.5.12 App** 删 3 处"语音派发"独立按钮, 保留会话内长按 mic.

## 3. 任务 (3 步)

### 3.1 删 TasksScreen appBar mic 按钮

读 `clients/expo/src/screens/TasksScreen.tsx`:

```tsx
// 删这一段 (波 20 加的)
<Pressable onPress={() => setShowVoiceDispatch(true)}>
  <Text style={styles.micEmoji}>🎤</Text>
</Pressable>

// 同时删相关 state
const [showVoiceDispatch, setShowVoiceDispatch] = useState(false);

// 删 dispatchVoice 函数调用
```

### 3.2 删 AppBar.tsx 全局顶栏 mic 按钮

读 `clients/expo/src/components/AppBar.tsx`:

```tsx
// 删 mic button (波 18 加的)
// 删 onVoiceDispatch prop
// 删 dispatchVoice 完整处理逻辑 (类似 wave14 那套)
```

### 3.3 镜像 h5

`clients/h5/src/screens/TasksScreen.tsx` + `clients/h5/src/components/AppBar.tsx`:

- 删对应 mic 按钮
- 保留长按 mic (h5 BoardChatScreen 走 Web Speech API, 不变)

## 4. 模拟器验证

```bash
1. bump 0.5.11 → 0.5.12 (release-app.sh runtimeVersion drift fix from wave16)
2. Build APK + adb install + 启动
3. 进 [任务] tab:
   - appBar 右上 [🎤 语音派发] 按钮消失
   - 还能看到 [驾驶舱Web] 按钮
   - 还能看到编排按钮组 [🔨 Build 5 步链] [🛤️ Pipeline] [📋 Plan]
4. 进 BoardChatScreen:
   - chat input 旁长按 mic 还在 ✅
5. 进 [+] 中央 FAB → 新建任务浮层打开:
   - 浮层下边让出 TabBar 高度 (约 60-80px)
   - **底部 5 tab 仍可见** (汇览/任务/+/员工/收件箱) ✅
   - 浮层不覆盖 TabBar
6. 截图 /tmp/emu-evidence/wave22-0.5.12/
```

## 4.b 新增需求 (boss 22:59 OOB 「底部导航呢」)

老板 OOB 反馈: 新建任务浮层打开时看不到底部 5 tab (汇览/任务/+/员工/收件箱).

**修法**: 浮层下边让出 TabBar 高度 (约 60-80px, 或用 SafeAreaView), 或浮层打开时让 TabBar 仍可见但禁用.

两种方案选一:
- A) composeOverlay 用 flex:1 + paddingBottom = TAB_HEIGHT (让出底部)
- B) composeOverlay 不全屏 (top 50%, bottom 留 TabBar 高度)

PM 建议 A (简单, 让出 60-80px 即可). 门神选一个干.

## 5. Constraints

- ❌ DON'T touch paperclip 上游 (ui/)
- ❌ DON'T 删 BoardChatScreen 长按 mic (会话内, 老板要的)
- ❌ DON'T 删 voiceDispatch server 端点 (server 仍在, 只是 client 不调)
- ✅ DO 删 3 处 client 独立按钮 (TasksScreen + AppBar + h5 镜像)

## 6. Done definition

3 步全完 + 0.5.12 APK 装机 + 模拟器验证 (3 处 mic 按钮消失, 会话内长按 mic 还在) + commit + push + 发版 + 上 COS:

```
Coolie工坊 0.5.12: https://dls.xrobinai.cn/coolie/app/0.5.12/coolie-release.apk
```