import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, type ViewStyle } from "react-native";
import { C } from "../coolie";

export type StatusDotKind =
  | "ok"
  | "idle"
  | "err"
  | "active"
  | "running"
  | "paused"
  | "error";

export interface StatusDotProps {
  status?: StatusDotKind;
  color?: string;
  pulse?: boolean;
  size?: number;
  style?: ViewStyle;
}

/**
 * Linear 设计系统规范状态点 (DESIGN.md 第3节)
 * - 圆点 8px: 活跃 #27A644 / 空闲 #8A8F98 / 异常 #EF4444
 * - 活跃呼吸: 外圈 ok@20% 动画扩散
 */
export function StatusDot({
  status = "idle",
  color: customColor,
  pulse: customPulse,
  size = 8,
  style,
}: StatusDotProps) {
  const isOk = status === "ok" || status === "active" || status === "running";
  const isErr = status === "err" || status === "error";

  const dotColor =
    customColor ?? (isOk ? C.ok : isErr ? C.err : C.ink3);
  const shouldPulse = customPulse ?? isOk;

  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!shouldPulse) {
      anim.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 1600,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 1600,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [shouldPulse, anim]);

  const ringScale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2.2],
  });

  const ringOpacity = anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.6, 0.2, 0],
  });

  return (
    <View
      style={[
        styles.wrapper,
        { width: Math.max(16, size * 2), height: Math.max(16, size * 2) },
        style,
      ]}
    >
      {shouldPulse && (
        <Animated.View
          style={[
            styles.pulseRing,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: dotColor,
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            },
          ]}
        />
      )}
      <View
        style={[
          styles.dot,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: dotColor,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    position: "absolute",
  },
  dot: {},
});
