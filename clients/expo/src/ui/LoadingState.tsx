import { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { C } from "../coolie";
import { ELEVATION, RADIUS, SPACING } from "./tokens";

export interface LoadingStateProps {
  mode?: "spinner" | "skeleton";
  text?: string;
  size?: "small" | "large";
  rows?: number;
  style?: StyleProp<ViewStyle>;
}

/** 加载态: spinner (可带文案) 或骨架屏两模式 (DESIGN.md 第5节) */
export function LoadingState({
  mode = "spinner",
  text,
  size = "large",
  rows = 3,
  style,
}: LoadingStateProps) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (mode !== "skeleton") return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [mode, pulse]);

  if (mode === "skeleton") {
    const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.95] });
    return (
      <View style={[styles.skeletonWrap, style]}>
        {Array.from({ length: rows }).map((_, index) => (
          <Animated.View key={index} style={[styles.skeletonRow, { opacity }]} />
        ))}
      </View>
    );
  }

  return (
    <View style={[styles.center, style]}>
      <ActivityIndicator size={size} color={C.accent} />
      {text ? <Text style={styles.text}>{text}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xl,
  },
  text: {
    color: C.ink3,
    fontSize: 13,
    marginTop: SPACING.md,
  },
  skeletonWrap: {
    gap: SPACING.md,
  },
  skeletonRow: {
    height: 56,
    borderRadius: RADIUS.lg,
    backgroundColor: ELEVATION.raised,
  },
});
