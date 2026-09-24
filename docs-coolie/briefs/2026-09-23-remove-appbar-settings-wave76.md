# Brief: wave 76 — 删 AppBar 中间设置按钮 (boss 26:42 '首页 顶部 中间的设置按钮去掉')

PM: Jason
Worker: claude

## 0. Boss 09-23 26:42 OOB 「首页 顶部 中间的设置按钮去掉」

老板装 0.5.52 APK 看到:
- AppBar 顶部中间标题 "Coolie工坊" (✅ 留, boss 26:35 OOB)
- AppBar 中间右侧设置齿轮图标 (❌ 删)

## 1. 目标

**Coolie工坊 0.5.53** UI 文字 + 按钮精简:

A. **删 AppBar 中间右侧 设置齿轮图标** (boss 26:42)
B. **保留 AppBar 中间标题 "Coolie工坊"** (boss 26:35 「顶部中间标题留着」)
C. 保留 🔔 通知 + 🔍 搜索 + 驾驶舱Web (boss 26:42 没提)

## 2. 任务 (3 步)

### 2.1 删设置按钮

1. cd ~/workspace/xaicd/coolie
2. grep "Settings\|settings\|齿轮\|cog\|gear" 字面 in clients/expo/src/components/AppBar.tsx
3. 找中间右侧设置按钮 (IconButton / TouchableOpacity / onPress 进 settings)
4. 删 整个 <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
5. h5 镜像同步 (h5 顶部 nav 类似精简)

### 2.2 验其他元素保留

- 中间 "Coolie工坊" 标题 ✅
- 🔔 通知 ✅
- 🔍 搜索 ✅
- 驾驶舱Web ✅

### 2.3 bump + 真发版

1. bump 0.5.52 → 0.5.53 (clients/expo/app.json + package.json + CHANGELOG, versionCode 552 → 553)
2. Build APK + adb install + emulator 真验 (中间设置按钮 0 hit)
3. publish to https://dls.xrobinai.cn/coolie/app/0.5.53/coolie-release.apk
4. commit + push (SSH proxy bypass)

## 3. Constraints

- ❌ DON'T 用 agy (本地员工)
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.53 之外
- ✅ DO 删中间设置按钮
- ✅ DO 保留中间标题 + 其他 3 icon
- ✅ DO 用 zsh-safe single quotes

## 4. semver + PM-CHECKLIST

- 当前 0.5.52
- UI 按钮精简 = patch bump → 0.5.53 ✅
- PM-CHECKLIST 32 项: J1-J3 + I1

## 5. Done definition

3 步全完 + AppBar 中间设置按钮删 + 中间标题 + 其他 3 icon 保留 + bump 0.5.53 + 模拟器真验中间设置按钮 0 hit + commit + push + 发版:

```
Coolie工坊 0.5.53: https://dls.xrobinai.cn/coolie/app/0.5.53/coolie-release.apk
AppBar: 中间设置按钮 0 hit
```