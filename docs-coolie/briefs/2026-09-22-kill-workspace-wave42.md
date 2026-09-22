# Brief: wave 42 — 砍 WorkspaceScreen (boss 24:00 OOB '工作空间很乱, 对话不像对话, chathome 也不像')

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 24:00 OOB 「工作空间很乱, 对话不像对话, chathome 也不像」

老板对 WorkspaceScreen (工坊 4 Tab 屏) 不满:
- 4 Tab (Conversation/Preview/Files/Terminal) 是 wave18 抄 ChatHome 的 RN 骨架, 不是 ChatHome 真传
- ConversationTab 简陋, 不像对话
- PreviewTab / FilesTab / TerminalTab mock 数据, 不真用

PM 拍板: 砍 WorkspaceScreen (BoardChatScreen 已够用).

## 1. 已知现状

```
✅ clients/expo/src/screens/workspace/ 7 文件:
   - WorkspaceScreen.tsx (主)
   - ConversationTab.tsx
   - FilesTab.tsx
   - PreviewTab.tsx
   - TerminalTab.tsx
   - mock-files.ts
   - useWorkspaceStore.ts
✅ BoardChatScreen (clients/expo/src/screens/BoardChatScreen.tsx) 已够用:
   - 工坊对话 + 智能识别 (build/plan/pipeline/pr/chat)
   - Quick chips 快捷
   - SSE 流式回复
   - mic 长按 (wave21 入 title)
✅ App.tsx WorkspaceScreen 入口 (右上角 [Workspace] 按钮)
```

## 2. 目标

**Coolie工坊 0.5.23 App** 砍 WorkspaceScreen + 入口, BoardChatScreen 替代:

- ❌ 删 WorkspaceScreen 入口 ([Workspace] 按钮)
- ❌ 删 7 个 workspace/ 文件
- ✅ 保留 BoardChatScreen (现有 + wave21 + wave25 + wave30)
- ✅ 工坊对话能力 (build/plan/pipeline) 由 BoardChatScreen 智能识别 + Quick chip 触发

## 3. 任务 (5 步)

### 3.1 找 WorkspaceScreen 入口

读 `clients/expo/App.tsx` 找 [Workspace] 按钮 + 打开 WorkspaceScreen 的代码:

```bash
grep -n "Workspace\|workspace" clients/expo/App.tsx | head -20
```

### 3.2 删 WorkspaceScreen 入口

改 `clients/expo/App.tsx`:
- 删 [Workspace] 按钮
- 删 `import WorkspaceScreen`
- 删 WorkspaceScreen state + Modal
- 删相关路由 (`/workspace`)

### 3.3 删 workspace/ 目录

```bash
rm -rf clients/expo/src/screens/workspace/
```

(7 文件全删: WorkspaceScreen.tsx / ConversationTab.tsx / FilesTab.tsx / PreviewTab.tsx / TerminalTab.tsx / mock-files.ts / useWorkspaceStore.ts)

### 3.4 h5 镜像同步

读 `clients/h5/src/screens/WorkspaceScreen.tsx` (如果有):
- 删入口 + import
- 保留 BoardChatScreen (或类名 ChatScreen)
- 跑 tsc 验证

### 3.5 bump 0.5.22 → 0.5.23 + 模拟器验证

```bash
1. bump 0.5.22 → 0.5.23 (release-app.sh, J1-J3 gate 走)
2. Build APK + adb install
3. 测试场景:
   a. 装 0.5.23 → 看 BoardChatScreen (没 Workspace 入口)
   b. 验证 build 智能识别 (发 "build xxx" → BuildProgressCard)
   c. 验证 Quick chips (工坊今日花销 / 员工都在忙啥 / etc)
   d. 验证 mic 长按 (入 title)
   e. 验证 webview 兜底 ([驾驶舱Web] 装/没装)
4. 截图 /tmp/emu-evidence/wave42-0.5.23/
5. commit + push + 发版 0.5.23 + 上 COS:
   https://dls.xrobinai.cn/coolie/app/0.5.23/coolie-release.apk
```

## 4. Constraints

- ❌ DON'T 改 BoardChatScreen (保留)
- ❌ DON'T 改 ConversationTab 数据 (Workspace 已删, 但 BoardChatScreen 自己的对话流保留)
- ❌ DON'T 触碰 paperclip 上游
- ✅ DO 删 WorkspaceScreen 7 文件 + 入口
- ✅ DO BoardChatScreen 替代 (现有够用)

## 5. Done definition

5 步全完 + Coolie工坊 0.5.23 APK 装机 + BoardChatScreen 跑通所有功能 + 无 Workspace 入口 + commit + push + 发版 + 上 COS:

```
Coolie工坊 0.5.23: https://dls.xrobinai.cn/coolie/app/0.5.23/coolie-release.apk
```