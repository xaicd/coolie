import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../../coolie";
import { RADIUS, SPACING } from "../../ui/tokens";

/**
 * 「按住说话」大按钮 —— 新会话页的主输入 (豆包核心体验)。
 *
 * 纯展示: 录音状态和手势回调都由 `useVoiceInput` 提供, 因为同一个页面上的
 * 「录音转写」chip 也要驱动同一台录音机。这里只管按下/松开的视觉反馈。
 */
export function HoldToTalkButton({
  recording,
  busy,
  disabled = false,
  status,
  onPressIn,
  onPressOut,
}: {
  recording: boolean;
  busy: boolean;
  disabled?: boolean;
  status: string | null;
  onPressIn: () => void;
  onPressOut: () => void;
}) {
  const label = recording ? "松开发送" : busy ? "识别中…" : "按住说话";
  return (
    <View style={styles.block}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="按住说话"
        accessibilityHint="按住录音, 松开转成文字"
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled || busy}
        style={({ pressed }) => [
          styles.btn,
          recording && styles.btnRecording,
          pressed && !recording && styles.btnPressed,
          (disabled || busy) && styles.disabled,
        ]}
      >
        <Ionicons
          name={recording ? "radio-button-on" : "mic"}
          size={20}
          color={recording ? "#FFFFFF" : C.ink}
        />
        <Text style={[styles.label, recording && styles.labelRecording]}>{label}</Text>
      </Pressable>
      {status ? <Text style={styles.status}>{status}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: SPACING.sm,
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
  btnPressed: {
    backgroundColor: C.surfaceHover,
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
