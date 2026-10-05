import { useMemo, useRef, type ReactNode } from "react";
import { PanResponder, View, type StyleProp, type ViewStyle } from "react-native";

/**
 * 左缘右滑返回手势 (iOS-style edge swipe back)。
 *
 * 老板 2026-09-22 23:08 OOB: 「左手拿手机, 从屏幕左边长按右滑要支持返回上一页,
 * 不能直接退出 app」。Android 默认没有这个手势 (系统左缘右滑 = 系统返回,
 * 在 root 页会直接退到桌面), 这里补一个 App 内的实现。
 *
 * 与 brief §3.3 的差别 (有意): brief 假设本客户端走 React Navigation + 
 * react-native-gesture-handler。实际 `clients/expo` 是手写的状态机导航
 * (`App.tsx` 的 HomeScreen 用 useState 表示 tab/浮层/详情, 没有 NavigationContainer,
 * 也没装 gesture-handler)。所以这里用 RN 内置的 `PanResponder` 实现同样的手势 ——
 * 不引入新原生依赖, 也不改动既有导航结构。
 *
 * 手势判定 (只认右滑, 不误触发):
 * - 起手点必须在屏幕左缘 {@link EDGE_WIDTH} 内 (`gestureState.x0`), 否则不抢 responder;
 * - 水平位移必须明显大于垂直位移 (1.5x), 否则交给内部 ScrollView 去滚;
 * - 释放时位移 >= {@link BACK_DISTANCE} 或 (位移 >= {@link FLING_DISTANCE} 且
 *   甩动速度 >= {@link FLING_VELOCITY}) 才算「返回」。
 *
 * 没触发阈值时什么都不做 —— 不会退出 App, 也不会误翻页。
 */
const EDGE_WIDTH = 32;
const BACK_DISTANCE = 70;
const FLING_DISTANCE = 40;
const FLING_VELOCITY = 0.4;

export function EdgeSwipeBack({
  onBack,
  enabled = true,
  style,
  children,
}: {
  /** 手势命中后要执行的「返回上一页」。调用方负责保证它是幂等/安全的。 */
  onBack: () => void;
  /** 关掉时完全不抢手势 (留给内部控件自己处理)。 */
  enabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  // PanResponder 只建一次, 所以回调必须走 ref 取最新值 —— 否则它会一直用首帧的
  // onBack/enabled (即第一个渲染闭包), 翻页后手势就打到旧页面上了。
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const responder = useMemo(
    () =>
      PanResponder.create({
        // 起手不抢, 让内容区先拿到触摸 (点击 / 输入框 / 滚动都照常)。
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        // 只有「左缘起手 + 明显水平右滑」才中途接管。
        onMoveShouldSetPanResponder: (_event, gesture) =>
          enabledRef.current &&
          gesture.x0 <= EDGE_WIDTH &&
          gesture.dx > 12 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
        onMoveShouldSetPanResponderCapture: () => false,
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_event, gesture) => {
          const farEnough = gesture.dx >= BACK_DISTANCE;
          const flung = gesture.dx >= FLING_DISTANCE && gesture.vx >= FLING_VELOCITY;
          if (farEnough || flung) onBackRef.current();
        },
      }),
    [],
  );

  return (
    <View style={[{ flex: 1 }, style]} {...responder.panHandlers}>
      {children}
    </View>
  );
}
