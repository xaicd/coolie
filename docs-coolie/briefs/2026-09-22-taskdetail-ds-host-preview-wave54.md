# Brief: wave 54 — 任务详情页审计 + 学 DS host preview (boss 24:38 '预览方式太差了, 学人家 DS 的 host preview')

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 24:38 OOB 「任务详情页审计一下, 学人家 DS 的 host preview」

老板:
1. 任务详情页 审计 (看现有 UX 真值)
2. 学 DeepSeek (DS) host preview — 在 Coolie 主机内部 sandbox 跑预览 URL, 不跳出 app 到 OS browser

## 1. 已知现状 (PM 09-22 真查)

```
✅ 上游 web 没有「代码 Diff」「原型沙箱」按钮 — App 端 fork 自己加的
✅ App 端 TaskDetailScreen.tsx 加 onOpenDiff + onOpenSandbox handler
✅ CodeDiffScreen.tsx (943 行) — 真有 (git diff 渲染)
✅ PrototypeSandboxScreen.tsx (917 行) — 用 react-native-webview (in-app WebView, 不是 OS browser, 但老板觉得体验差)
✅ App.tsx state: setDiffContext + setSandboxContext + EdgeSwipeBack 都接
✅ 上游 server 端 useManagedSandboxOnly hook 存在 (但 UI 没暴露)
✅ 上游 server 端 sandboxed-parser-worker 存在
✅ 真问题: 预览方式 = WebView 嵌入浏览器 → 体验差 (boss 想要类似 DS 的 host preview 模式)
```

## 2. 目标

**Coolie工坊 0.5.32 App** 任务详情页改造:

A. 审计 TaskDetailScreen 真值 (所有按钮/字段/UX 问题)
B. 学 DS host preview 模式 — 改 PrototypeSandboxScreen:
   - 不再用 react-native-webview (in-app browser)
   - 改用 host 内部 sandbox 渲染 (server-side 跑 + 推流到 App, 或 shared runtime URL with auth)
   - 类似 DS 的"在我电脑跑"模式
C. 删/改 CodeDiff 按钮 (上游没有, fork 私货)

## 3. 任务 (5 步)

### 3.1 审计 TaskDetailScreen

读 `clients/expo/src/screens/TaskDetailScreen.tsx` (整文件), 出审计报告:

```markdown
# TaskDetailScreen 审计 (wave54)

## 字段真值
- 标题
- 描述
- 状态 / 优先级
- assignee / project
- 创建时间 / 更新时间
- 评论列表
- 审批

## 按钮 (App 端 fork 加)
- 代码 Diff (CodeDiffScreen 943 行)
- 原型沙箱 (PrototypeSandboxScreen 917 行 — react-native-webview)
- 添加评论
- 编辑任务 (?)
- 跳 ChatHome (?)

## UX 问题
- 按钮太多 (?)
- 描述渲染 (?)
- 评论交互 (?)
- 5 tab nav 可见 (wave51 已修)
- EdgeSwipeBack (wave28 已修)

## 跟上游 web IssueDetail.tsx 差异
- 上游有 (列)
- 上游没有 (列)
- App fork 加的 (列)
```

### 3.2 看 DS host preview 模式 (查文档/截图)

```
DS 的 host preview 特点:
- 在用户主机 (本地) 跑 docker / sandbox
- 暴露本地 URL 到 internet (类似 ngrok)
- App 端显示的是 "本地预览" 标签, 不是 "远程 URL"
- 通常支持 port forwarding + auth token
```

PM 真查 (搜 DS docs / 看现有 sandbox 框架):
```bash
ssh tc-coolie-claw 'grep -rE "ngrok|tailscale|localtunnel|preview.*host|host.*preview" /opt/coolie/ui/src/ /opt/coolie/server/src/ /opt/coolie/packages/adapters/ 2>/dev/null | head -10'
```

### 3.3 改造 PrototypeSandboxScreen (DS 模式)

```tsx
// 当前: react-native-webview (in-app browser, 体验差)
// 改: 用 host sandbox 推流

function PrototypeSandboxScreen({ company, initialUrl, ... }) {
  // 1. 调 server /api/runtime-services 起 host sandbox (server 端 docker)
  // 2. server 暴露 ngrok-style URL (e.g. https://preview.coolie.app/<token>)
  // 3. App 端用 react-native-webview 加载 sandbox URL (但带 DS 风格 UI: 「在我电脑跑」标签)
  // 4. 显示 runtime status (CPU/内存/启动进度)
  // 5. 用户可停 sandbox / 重启 / 查看日志
}
```

最小化改造 (不引入 ngrok / sandbox runtime):
- 加 header banner: 「Host preview (类似 DS 模式, 跑在 Coolie 主机 sandbox)」 (而不是 in-app browser)
- 显示 server runtime service 状态 (从 /api/runtime-services 拉)
- 加 "View logs" 按钮 (调 /api/runtime-services/:id/logs)

### 3.4 删/改 CodeDiff 按钮

PM 拍板:
- A. 删 CodeDiff 按钮 (上游没有, fork 私货, 老板没要)
- B. 保留 CodeDiffScreen 但按钮改名 + 加 "实验功能" 提示

PM 推荐 A (删, 跟上游对齐).

### 3.5 bump 0.5.31 → 0.5.32 + 模拟器验证

```bash
1. bump 0.5.31 → 0.5.32 (release-app.sh, J1-J3 gate)
2. Build APK + adb install
3. 验证:
   a. 进任务详情 → 看到任务字段 (审计后精简)
   b. 「原型沙箱」按钮 → 跳 PrototypeSandboxScreen → 看到 DS 风格 banner + runtime status
   c. 「代码 Diff」按钮 → 不存在 (删)
   d. 5 tab 底部 nav 永远可见 (wave51 已修)
4. 截图 /tmp/emu-evidence/wave54-0.5.32/
5. commit + push + 发版 0.5.32 + 上 COS:
   https://dls.xrobinai.cn/coolie/app/0.5.32/coolie-release.apk
```

## 4. Constraints

- ❌ DON'T 删任务详情页基础功能 (字段 / 评论 / 状态)
- ❌ DON'T bump 0.5.32 之外
- ❌ DON'T 触碰 paperclip 上游
- ❌ DON'T 用 react-native-webview 真浏览器模式 (老板嫌)
- ✅ DO 加 DS host preview 标识 (banner + runtime status)
- ✅ DO 删 CodeDiff 按钮 (fork 私货, 跟上游对齐)
- ✅ DO 出审计报告 docs-coolie/TASKDETAIL-AUDIT.md

## 5. semver + PM-CHECKLIST

- 当前 0.5.31
- 改造 UI = patch bump → 0.5.32 ✅
- PM-CHECKLIST 32 项: J1-J3 + I1

## 6. Done definition

5 步全完 + 审计报告 docs-coolie/TASKDETAIL-AUDIT.md + PrototypeSandboxScreen 改 DS 模式 + 删 CodeDiff 按钮 + 模拟器验证 + commit + push + 发版 0.5.32 + 上 COS:

```
Coolie工坊 0.5.32: https://dls.xrobinai.cn/coolie/app/0.5.32/coolie-release.apk
任务详情页: 简化 + DS host preview 模式 + 删 CodeDiff
```