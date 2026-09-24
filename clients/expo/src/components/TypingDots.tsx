import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { C } from "../coolie";

/**
 * TypingDots — 「正在思考」三点动画 (wave71)
 *
 * 三段位移 0 → -4px, 错相位 0/120/240ms, ease-out 400ms 来回。
 * 跟 ChatGPT / Notion AI / Slack DM 的三点风格一致, 比 ActivityIndicator
 * 更轻量、不抢视觉焦点; 与 AssistantBubble 头部并排渲染。
 */
export interface TypingDotsProps {
  visible?: boolean;
  color?: string;
  size?: number;
}

export function TypingDots({
  visible = true,
  color = C.accent,
  size = 6,
}: TypingDotsProps) {
  const dots = useRef<Animated.Value[]>([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  useEffect(() => {
    if (!visible) {
      dots.forEach((d) => d.setValue(0));
      return;
    }
    const loop = Animated.loop(
      Animated.stagger(
        120,
        dots.map((d) =>
          Animated.sequence([
            Animated.timing(d, {
              toValue: -4,
              duration: 400,
              useNativeDriver: true,
            }),
            Animated.timing(d, {
              toValue: 0,
              duration: 400,
              useNativeDriver: true,
            }),
          ]),
        ),
      ),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, dots]);

  return (
    <View style={styles.row}>
      {dots.map((d, idx) => (
        <Animated.View
          key={idx}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            marginHorizontal: 1.5,
            transform: [{ translateY: d }],
          }}
        />
      ))}
    </View>
  );
}

/**
 * TypingBubbleText — 助手气泡内嵌的思考提示文本 + 三点动画。
 * 显示 "总办正在处理并调取工坊数据…" 等, 三点在文本右侧跳动。
 */
export function TypingBubbleText({
  text,
  visible = true,
}: {
  text?: string;
  visible?: boolean;
}) {
  return (
    <View style={styles.typingRow}>
      <Text style={styles.typingText} numberOfLines={1}>
        {text ?? "总办正在处理并调取工坊数据…"}
      </Text>
      <TypingDots visible={visible} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 2,
  },
  typingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  typingText: {
    color: C.ink3,
    fontSize: 12,
    flexShrink: 1,
  },
});