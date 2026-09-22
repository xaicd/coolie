# Brief: wave 28 — App 端左缘右滑手势返回上一页 (不退出 App)

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 23:08 OOB 「app, 我左手, 手机左边长按右滑要支持返回上一页, 不能直接退出 app」

老板用左手操作 (左手握手机), 物理上右滑 (从屏幕左边向右边) 不便, 但 Android/iOS 默认 edge swipe 是从屏幕左缘向右滑 (forward navigation). 老板希望:
- **从屏幕左缘向右滑** → **返回上一页** (iOS-style back gesture)
- 不能: 直接退出 App 或 Round-Trip 到 root 页面

## 1. 现状 (PM 09-22 真查)

```
✅ Coolie Web 0.6.2 paperclip-web 套壳用的是 Web back gesture (浏览器自带)
✅ Coolie工坊 App 0.5.15 当前 React Navigation 默认:
   - 左缘右滑 = pop screen (返回上一页, 标准 RN 行为)
   - 但 App 端某些路由 (TasksScreen / BoardChatScreen 等) 可能在 Tab 切换时直接跳到 root 而非返回上级
❌ 老板体验问题: 某些页面 (浮层 / 中央 + 创建 / 任务详情) 滑了直接退 App 而非返回上级
❌ 没有自定义 PanGestureHandler 配置
```

## 2. 目标

**Coolie工坊 0.5.16 App** 全屏支持 iOS-style edge swipe back gesture:

- 从屏幕左缘 (< 30px) 开始向右滑 → 触发"返回上一页"
- 距离屏幕右边 < 50px 时释放 → 完成显示 (返 ANIMATION)
- 不是回退 App
- 适用于所有 Stack 路由 (tasks → home / task detail → tasks list / compose overlay close)

## 3. 任务 (4 步)

### 3.1 检查 React Navigation 配置

读 `clients/expo/App.tsx` 找 NavigationContainer + Stack 配置:

```tsx
<NavigationContainer>
  <Stack.Navigator
    initialRouteName="Home"
    screenOptions={{
      headerShown: false,
      // 新增:
      gestureEnabled: true,
      gestureDirection: 'horizontal',
      cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
    }}
  >
    ...
  </Stack.Navigator>
</NavigationContainer>
```

确认 `gestureEnabled: true` (默认 true, 但显式声明).

### 3.2 检查浮层 / Tab 切换的 edge case

读 TasksScreen + ComposeOverlay:

- 浮层 (ComposeOverlay) **不**走 Stack (自定义 View) — 用户在浮层内左缘右滑应**关闭浮层**而非返回上一路由
- 中央 [+] Tab 在 5 tab 中间, 滑回去应跳"任务"tab (不是回 root)

### 3.3 加 PanGestureHandler 顶层包裹

新建 `clients/expo/src/components/EdgeSwipeBack.tsx`:

```tsx
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';

export function EdgeSwipeBack({ children }: { children: React.ReactNode }) {
  const navigation = useNavigation();
  const pan = Gesture.Pan()
    .activeOffsetX([-10, 9999])  // 只识别右滑
    .failOffsetY([-10, 10])
    .onEnd((e) => {
      if (e.translationX > 80 && e.velocityX > 500) {
        if (navigation.canGoBack()) {
          navigation.goBack();
        }
      }
    });
  return <GestureDetector gesture={pan}>{children}</GestureDetector>;
}
```

(react-native-gesture-handler 已 expo 默认带, 不需额外装)

App.tsx 顶层包 `EdgeSwipeBack`:

```tsx
<NavigationContainer>
  <EdgeSwipeBack>
    <Stack.Navigator ...>...</Stack.Navigator>
  </EdgeSwipeBack>
</NavigationContainer>
```

### 3.4 浮层 edge swipe close

ComposeOverlay 加类似 pan 监听,触发 `setComposeOpen(false)` 而非 navigation.goBack():

```tsx
// In ComposeOverlay
const pan = Gesture.Pan()
  .activeOffsetX([-10, 9999])
  .failOffsetY([-10, 10])
  .onEnd((e) => {
    if (e.translationX > 80 && e.velocityX > 500) {
      setComposeOpen(false);
    }
  });

<GestureDetector gesture={pan}>
  <View style={styles.composeOverlay}>
    ...
  </View>
</GestureDetector>
```

## 4. 模拟器验证

```bash
1. bump 0.5.15 → 0.5.16 (release-app.sh runtimeVersion drift fix from wave16)
2. Build APK + adb install
3. 测试场景:
   a. 进 [任务] tab → 点 [+] → 浮层打开 → 左缘右滑 → 浮层关闭 (不是 app back)
   b. 进 [任务] tab → 点任务行 → TaskDetail → 左缘右滑 → 回到任务列表
   c. 进 [任务] tab → 左缘右滑 → 不会退出 app (会回到前一页)
   d. 在 Root 页面 (汇览) → 左缘右滑 → 不退出 app
4. 截图 /tmp/emu-evidence/wave28-0.5.16/
```

## 5. Constraints

- ❌ DON'T 触碰 paperclip 上游 (ui/)
- ❌ DON'T 重写整个 NavigationContainer
- ❌ DON'T 让 gesture 误触发 (filter activeOffsetX 只识别右滑)
- ✅ DO 加 EdgeSwipeBack 顶层
- ✅ DO ComposeOverlay 自定义 pan close

## 6. Done definition

4 步全完 + 0.5.16 APK 装机 + 4 种场景都正确 (返回上一页 / 关闭浮层 / 不退 App) + commit + push + 发版 + 上 COS:

```
Coolie工坊 0.5.16: https://dls.xrobinai.cn/coolie/app/0.5.16/coolie-release.apk
```