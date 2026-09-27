# Brief: wave 115 — 修工坊清空对话后一堆空透明气泡 (boss 22:50 真机截图)

PM: Jason
Worker: cmd (门神)

## 0. Boss 09-27 22:50 OOB 「工坊对话 页面有些问题，我删除清理当前会话之后，再次打开，一堆 空透明对话」

## 1. 现象 (老板截图 img_e238b4611002)

清空对话后重开工坊 Tab: 列表出现一串空透明气泡 (机器人头像 + 空紫泡 + 时间戳 21:54/21:56/22:13/23:28), 内容全空。

## 2. 已知代码线索 (PM 预查)

- `clients/expo/src/screens/BoardChatScreen.tsx:330` messages 初始 [WELCOME_MESSAGE]
- `:421 loadHistory` + `:440 useEffect` 打开时拉历史
- `:1054` wave71 清空对话 → `DELETE /api/board/chat/conversation/:issueId`
- `server/src/routes/board-chat.ts:775` DELETE conversation / `:856` DELETE conversations (before cutoff)
- 高嫌疑: DELETE 只清 message 内容 (置空) 或删了部分行, 但留下的会话壳/空消息行仍被 loadHistory 拉回来渲染; 或客户端把空 content 的消息仍渲染成气泡

## 3. 任务 (4 步)

### TASK 1: 复现 + 真因
1. 模拟器装当前最新 APK, 登录 (robinschen1989@gmail.com / Cx-TWzbcbpOSLCxb4), 进工坊 Tab 发几条消息
2. 点清空对话 → 重进工坊 Tab → 复现空透明气泡
3. 抓 server 端真相: ssh tc-coolie-claw 查 DB (board chat messages 表) — DELETE 后到底剩了什么行 (空 content 行? 会话壳?)
4. 看 loadHistory 拉到的数据 + 客户端渲染逻辑 (空 content 是否该跳过)

### TASK 2: 修 (两端按真因)
- server: DELETE 应彻底删行 (不是置空); 或 loadHistory/接口过滤掉空 content 行
- client: loadHistory 后过滤空 content 消息 (防御); 确认清空后重开只显示 WELCOME_MESSAGE

### TASK 3: 真验 + 发版
1. 模拟器复测: 发消息 → 清空 → 重进 → 只见欢迎语, 无空泡; 再发新消息正常
2. 若 wave114 已发 0.5.79 则 bump 0.5.80/580, 否则跟 wave114 合并检查最新版本号再 bump; 全套 release (gradle + coscli + version.json + publish-ota)

### TASK 4: commit + push + 报告

## 4. Constraints
- ❌ 不用 agy / 不动 PAPERCLIP_API_KEY / DEPLOYMENT_MODE
- ✅ 先拿 DB 真相再修, 不许猜
- ✅ zsh-safe quotes

## 5. Done
新版本真发版 + 模拟器复测清空→重开无空泡 + commit push + 报告真因。