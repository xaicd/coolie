import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../../coolie";
import { RADIUS, SPACING } from "../../ui/tokens";

/**
 * 「按住说话」大按钮 —— 新会话页的主输入 (豆包核心体验)。该页自方案1 (`b56f6ac94`)
 * 起未挂载, 本组件随之停用预留。
 *
 * 遵循微信、QQ 经典语音交互规范:
 * - 按住说话，居中松开转文字
 * - 向左滑动 (dx < -45): 触发「取消发送」红色警告区，松开丢弃
 * - 向右滑动 (dx > 45): 触发「转文字」高亮区，松开转文字
 * - 录音中浮层展示实时音浪波形与两侧状态指示
 */
export function HoldToTalkButton({
  recording,
  busy,
  disabled = false,
  status,
  onPressIn,
  onPressOut,
  onCancel,
}: {
  recording: boolean;
  busy: boolean;
  disabled?: boolean;
  status: string | null;
  onPressIn: () => void;
  onPressOut: () => void;
  onCancel?: () => void;
}) {
  const [gestureMode, setGestureMode] = useState<"recording" | "cancel" | "transcribe">("recording");

  // 微信/QQ 风格音浪动效高度
  const waveAnim1 = useRef(new Animated.Value(0.4)).current;
  const waveAnim2 = useRef(new Animated.Value(0.8)).current;
  const waveAnim3 = useRef(new Animated.Value(1.0)).current;

  useEffect(() => {
    if (!recording) {
      waveAnim1.setValue(0.4);
      waveAnim2.setValue(0.8);
      waveAnim3.setValue(1.0);
      setGestureMode("recording");
      return;
    }

    const createWaveAnim = (anim: Animated.Value, minVal: number, maxVal: number, duration: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: maxVal, duration, useNativeDriver: true }),
          Animated.timing(anim, { toValue: minVal, duration, useNativeDriver: true }),
        ]),
      );

    const w1 = createWaveAnim(waveAnim1, 0.3, 1.2, 350);
    const w2 = createWaveAnim(waveAnim2, 0.4, 1.5, 450);
    const w3 = createWaveAnim(waveAnim3, 0.3, 1.1, 400);
    w1.start();
    w2.start();
    w3.start();

    return () => {
      w1.stop();
      w2.stop();
      w3.stop();
    };
  }, [recording, waveAnim1, waveAnim2, waveAnim3]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled && !busy,
        onMoveShouldSetPanResponder: () => !disabled && !busy,
        onPanResponderGrant: () => {
          setGestureMode("recording");
          onPressIn();
        },
        onPanResponderMove: (_, gestureState) => {
          if (gestureState.dx < -45) {
            setGestureMode("cancel");
          } else if (gestureState.dx > 45) {
            setGestureMode("transcribe");
          } else {
            setGestureMode("recording");
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          const isCancel = gestureState.dx < -45;
          setGestureMode("recording");
          if (isCancel) {
            if (onCancel) onCancel();
            else onPressOut();
          } else {
            onPressOut();
          }
        },
        onPanResponderTerminate: () => {
          setGestureMode("recording");
          if (onCancel) onCancel();
          else onPressOut();
        },
      }),
    [disabled, busy, onPressIn, onPressOut, onCancel],
  );

  const label = recording
    ? gestureMode === "cancel"
      ? "松开手指，取消发送"
      : gestureMode === "transcribe"
      ? "松开手指，转为文字"
      : "松开发送 (←左滑取消 | 右滑转文字→)"
    : busy
    ? "识别中…"
    : "按住说话";

  return (
    <View style={styles.block}>
      {/* 微信/QQ 风格录音滑动 HUD 浮层 */}
      {recording ? (
        <View style={styles.hudContainer}>
          {/* 左侧: 取消区 */}
          <View
            style={[
              styles.hudActionItem,
              gestureMode === "cancel" && styles.hudActionCancelActive,
            ]}
          >
            <View
              style={[
                styles.hudIconCircle,
                gestureMode === "cancel" && styles.hudIconCircleCancelActive,
              ]}
            >
              <Ionicons
                name="trash-outline"
                size={22}
                color={gestureMode === "cancel" ? "#FFFFFF" : C.ink3}
              />
            </View>
            <Text
              style={[
                styles.hudActionText,
                gestureMode === "cancel" && styles.hudActionTextCancelActive,
              ]}
            >
              {gestureMode === "cancel" ? "松开 取消" : "← 左滑 取消"}
            </Text>
          </View>

          {/* 中间: 录音音浪与提示 */}
          <View style={styles.hudCenter}>
            <View style={styles.waveRow}>
              <Animated.View style={[styles.waveBar, { transform: [{ scaleY: waveAnim1 }] }]} />
              <Animated.View style={[styles.waveBar, { transform: [{ scaleY: waveAnim2 }] }]} />
              <Animated.View style={[styles.waveBar, { transform: [{ scaleY: waveAnim3 }] }]} />
              <Animated.View style={[styles.waveBar, { transform: [{ scaleY: waveAnim2 }] }]} />
              <Animated.View style={[styles.waveBar, { transform: [{ scaleY: waveAnim1 }] }]} />
            </View>
            <Text
              style={[
                styles.hudTipText,
                gestureMode === "cancel" && styles.hudTipTextCancel,
                gestureMode === "transcribe" && styles.hudTipTextTranscribe,
              ]}
            >
              {gestureMode === "cancel"
                ? "松开手指，取消发送"
                : gestureMode === "transcribe"
                ? "松开手指，转为文字"
                : "按住说话，滑动选择"}
            </Text>
          </View>

          {/* 右侧: 转文字区 */}
          <View
            style={[
              styles.hudActionItem,
              gestureMode === "transcribe" && styles.hudActionTranscribeActive,
            ]}
          >
            <View
              style={[
                styles.hudIconCircle,
                gestureMode === "transcribe" && styles.hudIconCircleTranscribeActive,
              ]}
            >
              <Ionicons
                name="document-text-outline"
                size={22}
                color={gestureMode === "transcribe" ? "#FFFFFF" : C.ink3}
              />
            </View>
            <Text
              style={[
                styles.hudActionText,
                gestureMode === "transcribe" && styles.hudActionTextTranscribeActive,
              ]}
            >
              {gestureMode === "transcribe" ? "松开 转文字" : "右滑 转文字 →"}
            </Text>
          </View>
        </View>
      ) : null}

      <View
        accessibilityRole="button"
        accessibilityLabel="按住说话"
        accessibilityHint="按住录音, 向左滑动取消, 向右滑动转文字"
        {...panResponder.panHandlers}
        style={[
          styles.btn,
          recording && styles.btnRecording,
          recording && gestureMode === "cancel" && styles.btnCancel,
          recording && gestureMode === "transcribe" && styles.btnTranscribe,
          (disabled || busy) && styles.disabled,
        ]}
      >
        <Ionicons
          name={
            recording
              ? gestureMode === "cancel"
                ? "trash-outline"
                : "radio-button-on"
              : "mic"
          }
          size={20}
          color={recording ? "#FFFFFF" : C.ink}
        />
        <Text style={[styles.label, recording && styles.labelRecording]}>{label}</Text>
      </View>
      {status ? <Text style={styles.status}>{status}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    position: "relative",
    gap: SPACING.sm,
  },
  hudContainer: {
    position: "absolute",
    bottom: 60,
    left: 4,
    right: 4,
    backgroundColor: C.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 999,
  },
  hudActionItem: {
    alignItems: "center",
    justifyContent: "center",
    width: 76,
    paddingVertical: 6,
    borderRadius: 12,
  },
  hudActionCancelActive: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
  },
  hudActionTranscribeActive: {
    backgroundColor: "rgba(16, 185, 129, 0.12)",
  },
  hudIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  hudIconCircleCancelActive: {
    backgroundColor: C.err,
    borderColor: C.err,
    transform: [{ scale: 1.15 }],
  },
  hudIconCircleTranscribeActive: {
    backgroundColor: "#10B981",
    borderColor: "#10B981",
    transform: [{ scale: 1.15 }],
  },
  hudActionText: {
    fontSize: 11,
    color: C.ink3,
    fontWeight: "500",
  },
  hudActionTextCancelActive: {
    color: C.err,
    fontWeight: "bold",
  },
  hudActionTextTranscribeActive: {
    color: "#10B981",
    fontWeight: "bold",
  },
  hudCenter: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  waveRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 28,
    gap: 5,
    marginBottom: 4,
  },
  waveBar: {
    width: 3.5,
    height: 18,
    borderRadius: 2,
    backgroundColor: C.accent,
  },
  hudTipText: {
    fontSize: 12,
    color: C.ink2,
    fontWeight: "500",
  },
  hudTipTextCancel: {
    color: C.err,
    fontWeight: "bold",
  },
  hudTipTextTranscribe: {
    color: "#10B981",
    fontWeight: "bold",
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    paddingVertical: 14,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.surface,
  },
  btnRecording: {
    borderColor: C.brand,
    backgroundColor: C.brand,
  },
  btnCancel: {
    borderColor: C.err,
    backgroundColor: C.err,
  },
  btnTranscribe: {
    borderColor: "#10B981",
    backgroundColor: "#10B981",
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    color: C.ink,
    fontSize: 15,
    fontWeight: "600",
  },
  labelRecording: {
    color: "#FFFFFF",
  },
  status: {
    color: C.ink4,
    fontSize: 12,
    textAlign: "center",
  },
});
