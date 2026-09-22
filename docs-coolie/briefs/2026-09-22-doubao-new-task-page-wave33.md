# Brief: wave 33 — 像豆包一样新会话 (底层用现有接口 + 重新设计 voice 体验)

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 23:42 OOB 「底层用咱现有接口，看看像豆包体验一样的开展设计开发」

老板撤回 wave32 改造 (kill 已生效 proc_f7b9c3d2f517, 留下工作树未 commit, 不保留), 重新对齐:

1. **底层用现有接口** — server 端 `/api/multimodal/transcriptions` 已存在, `/api/issues` POST 已存在, 不新加 API
2. **看豆包体验** — 豆包 (boss 23:42 OOB 截图) UI 模式:
   - Empty state 中央欢迎语
   - 「对话 / 工作」模式切换 pill
   - 快捷功能 row (对话 / 录音转写 / AI 创作 / 拍题)
   - 底部「按住说话」大按钮 (voice 主输入, 不是附属)
   - 底部辅助: 📷 相机 + 键盘 + ⊕ 加号
3. **开展设计 → 开发** — 先设计 mockup 给老板预览, 通过后再写代码

## 1. 已知现状 (PM 09-22 真查)

```
✅ 豆包截图已分析 (vision_analyze)
✅ server 现有接口:
   - POST /api/multimodal/transcriptions (mode=transcribe-only) — 入 input 链路
   - POST /api/issues — 创建任务
   - GET /api/agents, /api/projects, /api/companies — 列数据
✅ wave26 已经 1:1 抄 NewIssueDialog (Coolie Web) + voice 按钮
✅ wave32 已 kill, 工作树 modified (App.tsx, app.json, CHANGELOG, package.json + 删 composer 几个子组件)
❌ 当前 App UI 太复杂 (boss 23:35 字段全堆)
❌ 当前 voice 按钮不是主输入 (是附属), 不像豆包
```

## 2. 目标

**Coolie工坊 0.5.21 App** 「新会话」页 (= 当前 TasksScreen / ComposerOverlay) 仿豆包:

- **Empty state**: 中央大字欢迎语 (「老板, 新建什么任务?」)
- **模式切换 pill**: 「对话 / 工作」 (对话 = 已有 BoardChatScreen, 工作 = 新建任务)
- **快捷功能 row**: 「对话 / 录音转写 / AI 创建 / 拍照上传」 4 chip
- **底部「按住说话」大按钮**: voice = 主输入 (像豆包核心体验)
- **底部辅助**: 📷 相机 + ⌨️ 键盘 + ⊕ 工具

## 3. 任务 (4 步 — 设计先行)

### 3.1 设计豆包式新会话页 mockup HTML

读 `docs-coolie/mockups/composer-full-preview.html` (上一版 mockup) - 删除.

新建 `docs-coolie/mockups/doubao-new-task-page.html`:

- 412×915 Pixel6 模拟器外框
- 紫蓝 #5E6AD2 + 近黑背景 + Linear 风 (跟 Coolie 风格一致)
- **顶部**: ☰ 菜单 + 中间「Coolie工坊」 + 右上「驾驶舱Web」按钮
- **Empty state 中央**: 大字「新建什么任务?」或「要派什么活?」
- **模式切换 pill**: 「对话 / 工作」 (默认工作)
- **快捷功能 row** (4 个 chip):
  - 💬 对话 → BoardChatScreen
  - 🎤 录音转写 → 调 voice 录 → 入 input
  - 🤖 AI 创建 → ChatHome 派活生成任务
  - 📷 拍照上传 → 上传图片到附件
- **底部大按钮**: 「🎤 按住说话」 (横跨底部, 紫蓝大字)
- **底部辅助 row**: 📷 相机 + ⌨️ 键盘 + ⊕ 加号

### 3.2 上传 mockup 给老板

```bash
no_proxy=.myqcloud.com coscli cp \
  /Users/mac/workspace/xaicd/coolie/docs-coolie/mockups/doubao-new-task-page.html \
  cos://gzbucket/coolie/mockups/doubao-new-task-page.html
```

老板手机预览: `https://dls.xrobinai.cn/coolie/mockups/doubao-new-task-page.html`

**等待老板拍板** (通过 / 改 XXX / 重设计).

### 3.3 老板拍板后, 用现有 server 接口开发 0.5.21

- 底层用现有 server 接口 (不动):
  - `/api/multimodal/transcriptions` (mode=transcribe-only) — voice 转写
  - `/api/issues` POST — 创建任务
  - `/api/agents` GET — Assignee 下拉
  - `/api/projects` GET — Project 下拉
  - `/api/assets` POST — 拍照上传
- 客户端新增: `clients/expo/src/screens/NewTaskPage.tsx` (= 仿豆包空状态)
- `clients/expo/src/components/doubao/HoldToTalkButton.tsx` (按住说话)
- `clients/expo/src/components/doubao/QuickActionsRow.tsx` (4 chip 快捷)
- `clients/expo/src/components/doubao/ModeSwitch.tsx` (对话/工作)
- 替换现有 ComposeScreen + ComposerOverlay (wave32 工作树改动全部丢弃)

### 3.4 bump 0.5.20 → 0.5.21 + 真验证

```bash
1. bump 0.5.20 → 0.5.21
2. Build APK + adb install
3. 进 [+] 中央 → 新会话页打开:
   ✅ Empty state 中央大字
   ✅ 模式切换 pill
   ✅ 4 chip 快捷功能
   ✅ 底部「按住说话」大按钮
   ✅ 长按 mic → ASR → transcribed text 入 input (transcribe-only)
   ✅ 用户确认 → 点 [Create Task] 才创建 (POST /api/issues)
4. 截图 /tmp/emu-evidence/wave33-0.5.21/
```

## 4. Constraints

- ❌ DON'T 新加 server API (用现有)
- ❌ DON'T 重发明豆包 (照搬 UI 模式)
- ❌ DON'T 保留 wave32 工作树 (丢弃)
- ✅ DO 先设计 mockup 给老板预览
- ✅ DO 用现有 `/api/multimodal/transcriptions` + `/api/issues`

## 5. Done definition (Step 1 — 先设计)

3.1 + 3.2 完成:
- mockup HTML 入档 docs-coolie/mockups/doubao-new-task-page.html
- 上传 COS 给老板手机预览
- 等老板拍板 (通过/改XXX/重设计)

之后再派 wave33 实施.

```
mockup URL: https://dls.xrobinai.cn/coolie/mockups/doubao-new-task-page.html
```