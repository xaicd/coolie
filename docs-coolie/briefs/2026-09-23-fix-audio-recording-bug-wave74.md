# Brief: wave 74 — 修 Audio.Recording 多实例冲突 bug (boss 26:36 '新任务 录音bug')

PM: Jason
Worker: claude

## 0. Boss 09-23 26:36 OOB 「新任务 录音bug」

老板装 0.5.48 APK, 进任务 tab → 新建任务 → 长按 mic → 弹错: `录音失败 / Only one Recording object can be prepared at a given time.`

## 1. PM 老实盘点 (截图真值)

```
屏幕: 任务 tab → 新建任务 (空状态 "新建什么任务?")
- 切换 tab: 对话 / 工作 (工作高亮)
- 底部 mic: 松开发送 (按住录音)
- 底部 + 按钮: 相机 / 键盘 / 更多
- 弹错: 录音失败 / Only one Recording object can be prepared at a given time.
```

## 2. 真因

```
RN expo-av Audio.Recording API:
- Audio.Recording.createAsync() 创建一个 Recording 实例
- 每次长按 mic 创建新实例, 但**老的实例没释放** (useEffect cleanup)
- 第二次按 mic → RN 抛 "Only one Recording object can be prepared at a given time"
- 真因: useEffect cleanup 缺失 + Recording 实例未 single source of truth + 异常路径未 unloadAsync
```

## 3. 目标

**Coolie工坊 0.5.50** 修 audio recording bug:

A. Recording 实例 single source of truth (useRef 或 state in useRecorder hook)
B. useEffect cleanup: 卸载时 `await recording.unloadAsync(); setRecording(null)`
C. onPressIn/onPressOut 异常路径: try/catch Recording creation + finally unload
D. onPanResponderRelease 释放麦克风 + 解锁 iOS audio session

## 4. 任务 (3 步)

### 4.1 找 audio recording 代码真值

1. cd ~/workspace/xaicd/coolie
2. grep "Audio.Recording\|createAsync\|prepareToRecordAsync" in clients/expo/src/
3. 找 useRecorder hook + BoardChatScreen + NewTaskPage 引用
4. 看真值: 是否 single source of truth, 是否有 cleanup, 异常路径

### 4.2 修

1. clients/expo/src/hooks/useRecorder.ts (或合并到 useRecorder)
2. Recording 用 useRef 保活实例 + state 显示 UI
3. useEffect cleanup: 卸载 + 录音停止 → unloadAsync + setRecording(null)
4. onPressIn: try { await Recording.createAsync(...); } catch (e) { alert + cleanup }
5. onPressOut: await recording.stopAndUnloadAsync(); await getStatus + getURI; 清理 state
6. h5 镜像同步 (h5 用 MediaRecorder webm/opus, 不需要修)

### 4.3 bump + 真发版

1. bump 0.5.49 → 0.5.50 (clients/expo/app.json + package.json + CHANGELOG, versionCode 549 → 550)
2. Build APK + adb install + emulator 真验 (长按 mic 多次不报错)
3. publish to https://dls.xrobinai.cn/coolie/app/0.5.50/coolie-release.apk
4. commit + push (SSH proxy bypass)

## 5. Constraints

- ❌ DON'T 用 agy (本地员工)
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.50 之外
- ✅ DO 修 audio recording bug
- ✅ DO 用 zsh-safe single quotes

## 6. semver + PM-CHECKLIST

- 当前 0.5.49 (待 wave73 出)
- audio bug fix = patch bump → 0.5.50 ✅
- PM-CHECKLIST 32 项: J1-J3 + I1

## 7. Done definition

3 步全完 + useRecorder cleanup + Recording single source of truth + 异常 try/catch + bump 0.5.50 + 模拟器真验长按 mic 多次不报错 + commit + push + 发版:

```
Coolie工坊 0.5.50: https://dls.xrobinai.cn/coolie/app/0.5.50/coolie-release.apk
修: Audio.Recording 多实例冲突 → useEffect 释放 + 异常 try/catch
```