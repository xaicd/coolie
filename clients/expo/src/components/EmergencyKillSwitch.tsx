import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  Vibration,
  View,
} from "react-native";
import { C } from "../coolie";

export interface EmergencyKillSwitchProps {
  domainId: string;
  domainName: string;
  isLocked?: boolean;
  disabled?: boolean;
  onTrigger: () => Promise<void> | void;
  actor?: string;
  compact?: boolean;
}

const THUMB_WIDTH = 54;
const TRACK_HEIGHT = 56;
const PADDING = 4;

/**
 * 红色紧急熔断滑块 (DESIGN.md Linear 设计系统规范)
 * - 滑动确认防误触 (Slide-to-Confirm)
 * - 超过 80% 触发熔断加锁
 * - 触觉振动反馈与秒级锁定
 * - 纯色/半透明红层: err rgba(239, 68, 68, 0.12) + border rgba(239, 68, 68, 0.3)
 */
export function EmergencyKillSwitch({
  domainId: _domainId,
  domainName,
  isLocked = false,
  disabled = false,
  onTrigger,
  actor = "admin",
  compact = false,
}: EmergencyKillSwitchProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [triggering, setTriggering] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const slideX = useRef(new Animated.Value(0)).current;
  const currentX = useRef(0);
  const maxSlideRef = useRef(0);

  useEffect(() => {
    const listener = slideX.addListener(({ value }) => {
      currentX.current = value;
    });
    return () => {
      slideX.removeListener(listener);
    };
  }, [slideX]);

  const maxSlide = Math.max(0, containerWidth - THUMB_WIDTH - PADDING * 2);
  maxSlideRef.current = maxSlide;

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    if (width > 0) {
      setContainerWidth(width);
    }
  }, []);

  const resetSlider = useCallback(() => {
    Animated.spring(slideX, {
      toValue: 0,
      useNativeDriver: false,
      friction: 7,
      tension: 40,
    }).start();
  }, [slideX]);

  const executeKill = useCallback(async () => {
    if (triggering || isLocked || disabled) return;
    setTriggering(true);

    try {
      if (Platform.OS !== "web") {
        Vibration.vibrate([0, 60, 40, 60]);
      }
    } catch {
      // ignore vibration error
    }

    Animated.timing(slideX, {
      toValue: maxSlideRef.current,
      duration: 150,
      useNativeDriver: false,
    }).start();

    try {
      await onTrigger();
      setConfirmed(true);
    } catch (err) {
      Alert.alert(
        "熔断执行失败",
        `操作人: ${actor}\n本体域: ${domainName}\n原因: ${String((err as Error)?.message ?? err)}`,
      );
      resetSlider();
    } finally {
      setTriggering(false);
    }
  }, [triggering, isLocked, disabled, onTrigger, actor, domainName, slideX, resetSlider]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !isLocked && !disabled && !triggering,
      onMoveShouldSetPanResponder: (_, gesture) =>
        !isLocked && !disabled && !triggering && Math.abs(gesture.dx) > 5,
      onPanResponderGrant: () => {
        // user started dragging
      },
      onPanResponderMove: (_, gesture) => {
        if (isLocked || disabled || triggering) return;
        const max = maxSlideRef.current;
        const newX = Math.min(Math.max(0, gesture.dx), max);
        slideX.setValue(newX);
      },
      onPanResponderRelease: (_, gesture) => {
        if (isLocked || disabled || triggering) return;
        const max = maxSlideRef.current;
        if (max > 0 && gesture.dx >= max * 0.78) {
          void executeKill();
        } else {
          resetSlider();
        }
      },
      onPanResponderTerminate: () => {
        resetSlider();
      },
    }),
  ).current;

  if (isLocked || confirmed) {
    return (
      <View style={[styles.lockedContainer, compact && styles.compactLocked]}>
        <View style={styles.lockedHeader}>
          <View style={styles.lockedBadge}>
            <Text style={styles.lockedBadgeText}>LOCKED</Text>
          </View>
          <Text style={styles.lockedTitle}>已熔断锁死 (安全隔离中)</Text>
        </View>
        <Text style={styles.lockedDesc}>
          本体域「{domainName}」读写闸门已全部封锁，后续请求均被拦截，审计记录已入库。
        </Text>
      </View>
    );
  }

  const textOpacity = slideX.interpolate({
    inputRange: [0, Math.max(1, maxSlide * 0.5), Math.max(2, maxSlide)],
    outputRange: [1, 0.4, 0],
    extrapolate: "clamp",
  });

  const trackBgWidth = slideX.interpolate({
    inputRange: [0, Math.max(1, maxSlide)],
    outputRange: [THUMB_WIDTH, containerWidth > 0 ? containerWidth : THUMB_WIDTH],
    extrapolate: "clamp",
  });

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.track,
          compact && styles.compactTrack,
          disabled && styles.disabledTrack,
        ]}
        onLayout={handleLayout}
      >
        {/* 滑动进度高亮填充 */}
        <Animated.View
          style={[
            styles.fillBar,
            {
              width: trackBgWidth,
            },
          ]}
        />

        {/* 提示文案 */}
        <Animated.View
          style={[styles.textLayer, { opacity: textOpacity }]}
          pointerEvents="none"
        >
          <Text style={styles.hintText}>
            {triggering ? "正在执行紧急熔断锁死…" : "向右滑动进行紧急熔断 ➔"}
          </Text>
          <Text style={styles.hintSub}>防误触滑动确认 · 秒级生效</Text>
        </Animated.View>

        {/* 滑块 Thumb */}
        <Animated.View
          style={[
            styles.thumb,
            {
              transform: [{ translateX: slideX }],
            },
          ]}
          {...panResponder.panHandlers}
        >
          {triggering ? (
            <ActivityIndicator color={C.ink} size="small" />
          ) : (
            <View style={styles.thumbInner}>
              <Text style={styles.thumbIcon}>⚡</Text>
              <Text style={styles.thumbLabel}>熔断</Text>
            </View>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: 8,
  },
  track: {
    height: TRACK_HEIGHT,
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderColor: "rgba(239, 68, 68, 0.28)",
    borderWidth: 1,
    borderRadius: 28,
    position: "relative",
    justifyContent: "center",
    padding: PADDING,
    overflow: "hidden",
  },
  compactTrack: {
    height: 48,
    borderRadius: 24,
  },
  disabledTrack: {
    opacity: 0.4,
  },
  fillBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(239, 68, 68, 0.22)",
    borderRadius: 28,
  },
  textLayer: {
    position: "absolute",
    left: THUMB_WIDTH + 8,
    right: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  hintText: {
    color: C.err,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  hintSub: {
    color: C.ink3,
    fontSize: 10,
    fontWeight: "400",
    marginTop: 2,
  },
  thumb: {
    width: THUMB_WIDTH,
    height: TRACK_HEIGHT - PADDING * 2,
    borderRadius: (TRACK_HEIGHT - PADDING * 2) / 2,
    backgroundColor: C.err,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: C.err,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  thumbInner: {
    alignItems: "center",
    justifyContent: "center",
  },
  thumbIcon: {
    color: C.ink,
    fontSize: 14,
    lineHeight: 16,
  },
  thumbLabel: {
    color: C.ink,
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  lockedContainer: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderColor: "rgba(239, 68, 68, 0.25)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginVertical: 8,
  },
  compactLocked: {
    padding: 10,
  },
  lockedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  lockedBadge: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    borderColor: "rgba(239, 68, 68, 0.4)",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  lockedBadgeText: {
    color: C.err,
    fontSize: 10,
    fontWeight: "600",
  },
  lockedTitle: {
    color: C.err,
    fontSize: 14,
    fontWeight: "600",
  },
  lockedDesc: {
    color: C.ink3,
    fontSize: 12,
    lineHeight: 17,
  },
});
