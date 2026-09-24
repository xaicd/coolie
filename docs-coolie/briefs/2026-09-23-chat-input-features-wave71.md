# Brief: wave 71 — 对话框缺失功能补全 (boss 26:18 '派 70 + 71' — 加 typing/loading + 清空按钮 + 附件上传)

PM: Jason
Worker: claude

## 0. Boss 09-23 26:18 OOB 「派 70 + 71」

老板让 PM 派 wave71 (跟 wave70 P1 剩余一起派):

**wave70 (已在跑)** — P1 剩余 3 件:
- 收件箱 client-side 排查 + 修
- 5 角色描述彻底删
- git-ops App UI 4 屏

**wave71 (本次)** — 对话框缺失功能补全:
- typing/loading indicator (老板等回复时无反馈)
- 「清空对话」按钮 (老板想清空没快捷方式)
- 附件上传 (+) (老板想发图发不了)

## 1. PM 老实盘点 (波次依据)

```
boss 截图 + OOB 26:18:
1. chat input 没看到 + 上传附件/图片 → 老板想发图发不了
2. chat 没看到 typing/loading indicator → 老板等回复时无反馈
3. chat 没看到「清空对话」按钮 → 老板想清空没快捷方式 (前一轮 xrobinai 纠错回复, 想清)
```

## 2. 目标

**Coolie工坊 0.5.47** 对话框 3 件补全:

A. **typing/loading indicator** — MiniMax-M3 SSE 流式响应时, 显示"正在思考..." 三点动画
B. **清空对话按钮** — chat 顶部 header 加 🗑️ icon, 弹确认后 DELETE server
C. **附件上传 (+)** — chat input 旁边加 + 按钮, 弹菜单 (图片/文件)

## 3. 任务 (4 步)

### 3.1 TASK A: typing/loading indicator

1. clients/expo/src/screens/BoardChatScreen.tsx
2. 加 loadingState state: 'idle' | 'thinking' | 'streaming'
3. SSE 响应开始 → state = 'thinking', 显示三个点动画
4. 收到 first token → state = 'streaming', 隐藏动画
5. 结束 → state = 'idle'
6. 用 react-native Animated 做三点跳

### 3.2 TASK B: 清空对话按钮

1. clients/expo/src/components/ChatHeader.tsx (新, 抽出 header)
   - 标题 (Coolie 智能体工坊 董事长助理) + 时间戳 + 🗑️ icon
2. server/src/routes/board-chat.ts: DELETE /api/board/chat/conversation/:id
   - 删 board_chat_messages where conversation_id = id
3. clients/expo/src/screens/BoardChatScreen.tsx: 接 DELETE + 弹确认 modal
4. h5 镜像同步

### 3.3 TASK C: 附件上传 (+)

1. clients/expo/src/components/ChatInput.tsx (新, 抽出 input)
   - TextInput + + 按钮 + 🎤 mic 按钮 + send 按钮
2. + 按钮弹 ActionSheet:
   - 相册 (expo-image-picker)
   - 拍照 (expo-camera)
   - 文件 (expo-document-picker)
3. 上传走 /api/multimodal/upload (paperclip 已有, wave14 接通)
4. 发送时: text + attachment_id(s) 一起 POST
5. h5 镜像同步 (h5 input 简单, h5 <input type="file">)

### 3.4 bump + 真发版

1. bump 0.5.46 → 0.5.47 (clients/expo/app.json + package.json + CHANGELOG, versionCode 546 → 547)
2. Build APK + adb install + emulator 真验 (3 件全 OK)
3. publish to https://dls.xrobinai.cn/coolie/app/0.5.47/coolie-release.apk
4. commit + push (SSH proxy bypass)

## 4. Constraints

- ❌ DON'T 用 agy (本地员工)
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.47 之外
- ✅ DO 3 件 补全
- ✅ DO 用 zsh-safe single quotes

## 5. semver + PM-CHECKLIST

- 当前 0.5.46
- 对话框 3 件 补全 = patch bump → 0.5.47 ✅
- PM-CHECKLIST 32 项: J1-J3 + I1 + I2

## 6. Done definition

4 步全完 + typing/loading indicator + 清空对话按钮 + 附件上传 + bump 0.5.47 + 模拟器真验 3 件全 OK + commit + push + 发版:

```
Coolie工坊 0.5.47: https://dls.xrobinai.cn/coolie/app/0.5.47/coolie-release.apk
对话框 3 件: typing/loading + 清空按钮 + 附件上传
```