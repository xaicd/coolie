# Brief: wave 73 — 删 AppBar 左上角「Coolie工坊」标题 + 底部「驱动 5 角色员工」工坊描述 (boss 26:32 '左上角工坊 驱动5角色员工 这些描述都不要了')

PM: Jason
Worker: claude

## 0. Boss 09-23 26:32 OOB 「左上角 工坊 驱动5角色员工 这些描述都不要了」+ 26:35 OOB 「顶部中间标题留着 / 对话框中的去掉」

老板装 0.5.48 APK 看到:
- AppBar 左上角标题 "Coolie工坊" → ❌ 删 (boss 26:32 OOB)
- **AppBar 中间标题** (中央) → ✅ **保留** (boss 26:35 OOB 「顶部中间标题留着」)
- 对话框 ChatHeader "Coolie 智能体工坊 董事长助理" → ❌ 删 (boss 26:35 OOB)
- 底部工坊描述 "驱动 5 角色员工" → ❌ 删 (boss 26:32 OOB)
- 其他 (🔔 通知 + 🔍 搜索 + 🗑️ 清空 + 驾驶舱Web) → ✅ 保留

## 1. PM 老实盘点 (截图真值)

```
截图真值 (boss 装 0.5.48):
顶部 AppBar:
- 左侧: "Coolie工坊" ← 删
- 右侧: 🔔(20) 🔍 "驾驶舱Web" 紫蓝按钮

底部工坊描述 (BoardChatScreen 气泡下面):
- "驱动 5 角色员工" ← 删

保留:
- 聊天气泡顶部 header (Coolie 智能体工坊 董事长助理) — 内部对话用
- 🔔 通知 + 🔍 搜索
- "驾驶舱Web" 按钮 (webview 兜底)
- 5 角色 templates 不动 (老板 25:00 OOB 删 description 已实施, 这里只删 UI 文字)
```

## 2. 目标

**Coolie工坊 0.5.49** UI 文字精简:

A. **删** AppBar 左上角 "Coolie工坊" 标题 (保留中间标题 + logo + 右侧 3 icon)
B. **删** ChatHeader "Coolie 智能体工坊 董事长助理" 标题 (保留 🗑️ 清空按钮 + 时间戳)
C. **删** 底部工坊描述 "驱动 5 角色员工" (BoardChatScreen + SpaceScreens)
D. splash 屏 logo "Coolie" 保留 (品牌认知)

## 3. 任务 (3 步)

### 3.1 删 AppBar "Coolie工坊" 标题

1. grep clients/expo/src/components/AppBar.tsx 真值
2. 找 "Coolie工坊" / "Coolie 工坊" 字面
3. 删 (保留 logo icon, 删 Text)
4. h5 镜像同步

### 3.2 删底部 "驱动 5 角色员工"

1. grep "驱动 5 角色员工" / "驱动.*角色" / "5 角色员工" 字面在 clients/expo/src/
2. 找 BoardChatScreen.tsx + SpaceScreens
3. 删 Text 组件
4. h5 镜像同步

### 3.3 bump + 真发版

1. bump 0.5.48 → 0.5.49 (clients/expo/app.json + package.json + CHANGELOG, versionCode 548 → 549)
2. Build APK + adb install + emulator 真验
3. publish to https://dls.xrobinai.cn/coolie/app/0.5.49/coolie-release.apk
4. commit + push (SSH proxy bypass)

## 4. Constraints

- ❌ DON'T 用 agy (本地员工)
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.49 之外
- ✅ DO 删 AppBar 标题 + 底部描述
- ✅ DO 用 zsh-safe single quotes

## 5. semver + PM-CHECKLIST

- 当前 0.5.48
- UI 文字精简 = patch bump → 0.5.49 ✅
- PM-CHECKLIST 32 项: J1-J3 + I1

## 6. Done definition

3 步全完 + AppBar "Coolie工坊" 标题删 + 底部"驱动 5 角色员工"删 + bump 0.5.49 + 模拟器真验 + commit + push + 发版:

```
Coolie工坊 0.5.49: https://dls.xrobinai.cn/coolie/app/0.5.49/coolie-release.apk
AppBar: 删 "Coolie工坊" 标题 (保留 logo)
底部: 删 "驱动 5 角色员工" 描述
```