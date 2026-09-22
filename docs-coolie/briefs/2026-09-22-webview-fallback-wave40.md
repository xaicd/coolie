# Brief: wave 40 — 选方案 B 内置 webview 兜底 (boss 23:59 OOB 'b')

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 23:59 OOB 「b」

老板选方案 B: 内置 webview 兜底.

## 1. 方案 B 简述 (wave39 评估)

Coolie工坊 App 启动时:
1. 检测 Coolie Web APK (cloud.coolie.app.web) 是否安装
2. 装: 深链 coolieweb:// 打开 (现有行为)
3. 没装: 内置 webview 加载 https://www.xrobinai.cn/XROA (兜底, 不强装 APK)

## 2. 已知现状

```
✅ react-native-webview 已 Coolie工坊 依赖 (wave39 真查 9 文件在用)
✅ AppBar 「[驾驶舱Web]」 按钮已存在 (clients/expo/src/components/AppBar.tsx)
✅ 现有深链 coolieweb:// 触发 Activity (Android intent)
❌ 检测 + 兜底 webview 没做
```

## 3. 目标

**Coolie工坊 0.5.22 App** [驾驶舱Web] 按钮 智能路由:

- 检测 coolie Web APK (cloud.coolie.app.web) 是否安装:
  - 装: 跳 coolieweb:// 深链 (现有)
  - 没装: 内置 webview 加载 https://www.xrobinai.cn/XROA (兜底)
  - 用户可手动 [安装独立 Coolie Web] (跳 APK 下载)

## 4. 任务 (5 步)

### 4.1 读现有 AppBar 按钮 + Linking.openURL

读 `clients/expo/src/components/AppBar.tsx` 找 [驾驶舱Web] 按钮:

```tsx
// 当前 (估计)
<Pressable onPress={() => Linking.openURL('coolieweb://')}>
  <Text>驾驶舱Web</Text>
</Pressable>
```

### 4.2 加检测 + 兜底 webview

```tsx
import { Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Application from 'expo-application';  // 检测其他 APK

async function openCoolieWeb() {
  // 1. 检测 cloud.coolie.app.web 是否安装
  const canOpen = await Linking.canOpenURL('coolieweb://');
  if (canOpen) {
    // 装: 深链打开 (现有)
    Linking.openURL('coolieweb://');
  } else {
    // 没装: 兜底 webview
    setShowWebView(true);
  }
}

// 2. 兜底 webview 全屏 modal
{showWebView && (
  <Modal visible animationType="slide">
    <View style={styles.webViewHeader}>
      <Text>Coolie Web (webview 模式)</Text>
      <Pressable onPress={() => setShowWebView(false)}>
        <Text>✕</Text>
      </Pressable>
      <Pressable onPress={() => Linking.openURL('https://dls.xrobinai.cn/coolie/app/0.6.4-paperclip-web/coolie-release.apk')}>
        <Text>安装独立</Text>
      </Pressable>
    </View>
    <WebView source={{ uri: 'https://www.xrobinai.cn/XROA' }} />
  </Modal>
)}
```

### 4.3 加 npm 依赖 (如果缺)

`react-native-webview` 已 Coolie工坊 依赖 (wave39 验证), 不需装. `expo-application` 检查是否已装:

```bash
grep "expo-application" clients/expo/package.json
# 期望: "expo-application": "^..."
```

如未装, 跑 `npx expo install expo-application`.

### 4.4 bump 0.5.21 → 0.5.22 + 模拟器验证

```bash
1. bump 0.5.21 → 0.5.22 (release-app.sh runtimeVersion drift fix from wave16)
2. Build APK + adb install
3. 测试场景:
   a. 装 0.5.22 但不装 Coolie Web → 点 [驾驶舱Web] → 期望内置 webview 加载 https://www.xrobinai.cn/XROA (兜底)
   b. (可选) 装 Coolie Web 0.6.4 APK → 重启 0.5.22 → 点 [驾驶舱Web] → 期望深链打开 (现有行为)
   c. 兜底 webview modal 顶部 [安装独立] 按钮 → 期望跳 APK 下载页
4. 截图 /tmp/emu-evidence/wave40-0.5.22/
```

### 4.5 commit + push + 发版 + 上 COS

```bash
git add clients/expo/src/components/AppBar.tsx
git -c user.email=hermes@nous.local -c user.name='Hermes PM' commit -m "feat(app): [驾驶舱Web] 内置 webview 兜底 (boss 23:59 'b' 选方案 B)"
git push origin main
bash scripts/release-app.sh 0.5.22 "..."
```

## 5. Constraints

- ❌ DON'T 删独立 Coolie Web APK
- ❌ DON'T 强装 Coolie Web (只提示)
- ✅ DO 检测 + 兜底
- ✅ DO 顶部 [安装独立] 按钮 (手动引导)
- ✅ DO 复用 react-native-webview (已在)

## 6. Done definition

5 步全完 + Coolie工坊 0.5.22 APK 装机 + 模拟器验证 ([驾驶舱Web] 检测 + 兜底 webview + 安装独立按钮) + commit + push + 发版 + 上 COS:

```
Coolie工坊 0.5.22: https://dls.xrobinai.cn/coolie/app/0.5.22/coolie-release.apk
```