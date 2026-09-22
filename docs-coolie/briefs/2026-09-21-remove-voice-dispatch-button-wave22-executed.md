# Wave 22 执行记录 — 删除独立「语音派发」按钮 + 新建任务浮层让出底部导航

Brief: [`2026-09-21-remove-voice-dispatch-button-wave22.md`](./2026-09-21-remove-voice-dispatch-button-wave22.md)
Repo: `~/workspace/xaicd/coolie` (main)
Release: **Coolie工坊 0.5.12** — https://dls.xrobinai.cn/coolie/app/0.5.12/coolie-release.apk

---

## 1. 先纠正 brief §1 的现状描述(实测)

Brief §1/§3 说有三处独立「语音派发」按钮: TasksScreen appBar、AppBar.tsx、h5 镜像。
**实测只有两处,而且没有一处在 TasksScreen。**

| Brief 说 | 实际 | 证据 |
|---|---|---|
| TasksScreen appBar 右上 mic (波20 加) | **不存在** | 当前 `clients/expo/src/screens/TasksScreen.tsx` 全文无 mic;`git log -S micEmoji` / `-S showVoiceDispatch` 全仓 **零命中**(只有 brief 自己命中);波18 提交 `918aafa0c` 的信息写着「AppBar 右侧加语音按钮」,mic 自始至终在 AppBar |
| AppBar.tsx 全局顶栏 mic (波18 加) | **存在** (prop `onVoice`) | `clients/expo/src/components/AppBar.tsx` |
| h5 TasksScreen 镜像 mic | **不存在** | `clients/h5/` 下无 `components/AppBar.tsx`;h5 全文只有 BoardChatScreen 会话内 mic |
| (brief 未提及) | **存在**:新建任务 composer 里的「🎤 语音派发」(wave14 原始入口) | `clients/expo/App.tsx` `TaskComposer` |

所以「3 处」实为 **2 处**。第 2 处(brief 不知道的 composer 按钮)按老板原话
「不要再有显示的什么语音派单那个功能了」一并删除 —— 目标写明「保留会话内长按 mic」,
即独立入口一个不留。

## 2. 改了什么

- `a196ff64c` feat(expo): wave22 — 删除独立的「语音派发」按钮
  - AppBar: 删 `onVoice`/`voiceRecording`/`voiceBusy` props、「🎤 派发」按钮及样式
  - `TaskComposer`: 删「🎤 语音派发」按钮及 `recording`/`onVoice` props
  - 连带删除只服务这两个按钮的 `voiceDispatch` / `useRecorder` / `recording` / `isAsrNotConfigured`
  - 净 **-145 行 / +5 行**
- `a3694611c` fix(expo): wave22 — 新建任务浮层让出底部 TabBar (§4.b)
  - `TabBar` 导出 `TAB_BAR_HEIGHT = 60`,`bar.height` 改用它(单一来源)
  - `composeOverlay` 覆写 `bottom: TAB_BAR_HEIGHT`,`absoluteFill` 的 `bottom:0` 原本把 5 个 tab 整个盖住
  - 底栏既然可见就让它可点:点任一 tab 先收起浮层再切页
- `536c98489` release: v0.5.12(release-app.sh 生成)

**没动**:BoardChatScreen 会话内长按 mic、`voiceDispatch` server 端点、`api-client` 的
`voiceDispatch()`、`src/useRecorder.ts`(会话内仍在用)、AppBar 的 [驾驶舱Web]、编排按钮组、上游 `ui/`。

## 3. 验证(模拟器 0.5.12, 证据 `/tmp/emu-evidence/wave22-0.5.12/`)

| Brief §4 要求 | 结果 | 截图 |
|---|---|---|
| bump 0.5.11 → 0.5.12 | ✅ app.json / package.json / build.gradle / 原生 `EXPO_RUNTIME_VERSION` 全 0.5.12 | `10-boot.png` |
| Build APK + adb install + 启动 | ✅ APK 77659082 B,装机 versionName=0.5.12 | `10-boot.png` |
| [任务] tab: appBar mic 消失 | ✅ 顶栏只剩 通知铃铛 / Coolie工坊 / [驾驶舱Web] | `16-tasks.png` |
| [任务] tab: [驾驶舱Web] 还在 | ✅ | `16-tasks.png` |
| [任务] tab: 编排按钮组还在 | ✅ 🔨 Build 5 步链 / 🛤️ Pipeline / 📋 Plan | `16-tasks.png` |
| BoardChatScreen 长按 mic 还在 | ✅ 输入行 = [输入框][🎤 mic][发送] | `19-chat.png`, `crop-chat-inputrow.png` |
| [+] 浮层: 底部让出 TabBar | ✅ | `17-compose-overlay.png`, `crop-bottom.png` |
| [+] 浮层: 底部 5 tab 仍可见 | ✅ 汇览/任务/+/员工/收件箱 全部可见且可点 | `17-compose-overlay.png` |
| [+] 浮层: 不覆盖 TabBar | ✅ | `crop-bottom.png` |
| [+] 浮层内无语音按钮 | ✅ 只剩 [添加任务] | `17-compose-overlay.png` |

另核对装机 APK 内嵌 bundle(二进制查,`strings` 看不见 CJK):
`🎤 派发`=0 / `语音派发任务`=0 / `■ 停止`=0 / `🎤 语音派发`=0;
`驾驶舱Web`=1 / `🎤 录音中… 松开转文字`=1 —— 删的删了、该留的都在。

发版产物:APK 已上 COS(`cos://gzbucket/coolie/app/0.5.12/coolie-release.apk`)、
`version.json` 已 scp 到 `tc-coolie-claw:/opt/coolie/ui/dist/version.json`、
OTA 已发布(runtimeVersion 0.5.12)。

## 4. 运行时才发现的坑(下次省一趟)

1. **模拟器的 quickboot 快照会把新装的 App 回滚掉。** 波22 中途模拟器崩过一次,重启时
   加载了旧快照 —— `adb install -r` 装的 0.5.12 被整体退回 0.5.10(`lastUpdateTime` 早于装机时间)。
   现象极具误导性:屏幕上出现了**代码里早删掉的**「🎤 派发」,会让人以为改动没生效。
   判定顺序应该是:**先 `adb pull` 设备上真实的 base.apk 查内嵌 bundle**,再怀疑代码。
   (容器内 `createReleaseUpdatesResources` 显示 `UP-TO-DATE` 时也值得警惕,别据此下结论。)
2. **`uiautomator dump` 在带动画的屏上会 `ERROR: could not get idle state`**,并且失败时
   **保留上一次的 dump** —— 若先 dump 再 pull,会静默拿到旧屏内容(本波被它骗过一次)。
   可靠做法:`adb shell rm -f /sdcard/uidump.xml` → dump → 校验存在再 pull。
   公司选择页/驾驶舱这类常驻动画的屏基本 dump 不出来,改用 `screencap` + 像素定位。
3. **本机环境变量里预置了大小写错误的 `DEVELOPER_DIR`**(`CommandlineTools`,正确是
   `CommandLineTools`),会让 `git` 和 `python3` 直接报 "unable to find Xcode installation"。
   `"${DEVELOPER_DIR:-默认}"` 这种写法会**留用坏值**,必须硬赋值。
4. 底栏中央 `+` 与各 tab 的 Ionicons 字形在装机包里画不出来(0.5.6 起的老问题),
   所以 FAB 是个**没有加号的纯色圆**,底栏只有文字标签 —— 不是波22 改出来的。

## 5. 未做

- **Paperclip artifact 挂载未做**:AGENTS.md §6 要求把可见产物挂到 Paperclip API,
  但本机没有 `PAPERCLIP_API_URL` / `PAPERCLIP_API_KEY` / `PAPERCLIP_RUN_ID`,
  也没有本波对应的 issue/company 上下文,helper `paperclip-upload-artifact.sh` 会直接报
  "Missing ..."。证据按 brief 要求留在 `/tmp/emu-evidence/wave22-0.5.12/`(非持久);
  持久产物是上架的 APK 直链。
- h5 侧无需改动(无独立语音按钮,无底部 TabBar)。
