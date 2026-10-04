/**
 * [停用预留 · d5e3fac7 问②B 裁决] 零挂载死件, 保留不删 (2026-10-04 复核仍零消费)。
 * 宿主 ComposeScreen 随方案1 (b56f6ac94「+号直通两卡」) 精简退役后, composer
 * 展示层家族整体失宅 (import 级复核见 COOA-4 评论 1a5edf60)。勿当现役链路引用,
 * 勿在无关波次顺手改造 (wave132 误养先例); 复活需先重建宿主入口。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, PanResponder, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { isAsrNotConfigured } from "@coolie/api-client";
import { C, coolie } from "../../coolie";
import { ELEVATION, RADIUS, SPACING } from "../../ui/tokens";
import { useRecorder } from "../../useRecorder";

/** A hold shorter than this is treated as a mis-tap, not speech (300ms). */
const MIN_VOICE_HOLD_MS = 300;

/**
 * 新建任务里的语音输入 —— brief §3.5 (boss「这个页面的样子加语音按钮」)。
 *
 * 遵循微信、QQ 经典语音手势规范:
 * - 按住说话，居中松开转文字
 * - 向左滑动 (dx < -40): 触发「取消」警示，松开取消录音
 * - 向右滑动 (dx > 40): 触发「转文字」确认，松开转文字
 * - 转写只产出文本, 自动填入标题
 */
export function VoiceInputButton({
  companyId,
  onTranscript,
  disabled = false,
}: {
  companyId: string;
  /** Called with the recognised text; the caller decides where it lands. */
  onTranscript: (text: string) => void;
  disabled?: boolean;
}) {
  const { recording, start, stop, forceStop } = useRecorder();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [gestureMode, setGestureMode] = useState<"recording" | "cancel" | "transcribe">("recording");

  const pressRef = useRef<{ startedAt: number; promise: Promise<boolean> | null }>({
    startedAt: 0,
    promise: null,
  });

  // 音浪动效
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

  const handlePressIn = useCallback(() => {
    if (busy || disabled) return;
    pressRef.current.startedAt = Date.now();
    pressRef.current.promise = (async () => {
      try {
        await start();
        setStatus("🎤 录音中… (←左滑取消 | 右滑转文字→)");
        return true;
      } catch (e) {
        Alert.alert("录音失败", String((e as Error)?.message ?? e));
        return false;
      }
    })();
  }, [busy, disabled, start]);

  const handleCancel = useCallback(async () => {
    pressRef.current.promise = null;
    await forceStop();
    setStatus("🎤 录音已取消");
    setBusy(false);
  }, [forceStop]);

  const handlePressOut = useCallback(async () => {
    const press = pressRef.current;
    if (!press.promise) return;
    pressRef.current.promise = null;

    setBusy(true);
    setStatus("识别中…");
    try {
      const started = await press.promise;
      if (!started) return;

      const { base64, format } = await stop();
      if (!base64) {
        setStatus("🎤 未采集到有效声音, 请重试");
        return;
      }
      if (Date.now() - press.startedAt < MIN_VOICE_HOLD_MS) {
        setStatus("🎤 按太短了, 请长按说话");
        return;
      }

      const res = await coolie.voiceDispatch({
        companyId,
        audioBase64: base64,
        format,
        mode: "transcribe-only",
      });
      const text = (res.text ?? res.transcription?.text ?? "").trim();
      if (text) {
        onTranscript(text);
        setStatus(`🎤 已转写: ${text}`);
      } else {
        setStatus("🎤 没听清, 请再说一次");
      }
    } catch (e) {
      setStatus(
        isAsrNotConfigured(e)
          ? "🎤 语音未配置: 该实例尚未配置腾讯 ASR 凭据, 请改用文字输入"
          : `🎤 转写失败: ${String((e as Error)?.message ?? e)}`,
      );
    } finally {
      setBusy(false);
    }
  }, [companyId, onTranscript, stop]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled && (!busy || recording),
        onMoveShouldSetPanResponder: () => !disabled && (!busy || recording),
        onPanResponderGrant: () => {
          setGestureMode("recording");
          handlePressIn();
        },
        onPanResponderMove: (_, gestureState) => {
          if (gestureState.dx < -40) {
            setGestureMode("cancel");
          } else if (gestureState.dx > 40) {
            setGestureMode("transcribe");
          } else {
            setGestureMode("recording");
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          const isCancel = gestureState.dx < -40;
          setGestureMode("recording");
          if (isCancel) {
            void handleCancel();
          } else {
            void handlePressOut();
          }
        },
        onPanResponderTerminate: () => {
          setGestureMode("recording");
          void handleCancel();
        },
      }),
    [disabled, busy, recording, handlePressIn, handleCancel, handlePressOut],
  );

  const label = recording
    ? gestureMode === "cancel"
      ? "松开取消"
      : gestureMode === "transcribe"
      ? "松开转文字"
      : "正在录音…松开发送"
    : "语音输入";

  return (
    <View style={styles.block}>
      {/* 录音浮层提示 (微信/QQ 风格轻量 HUD) */}
      {recording ? (
        <View style={styles.hudBubble}>
          <Text
            style={[
              styles.hudText,
              gestureMode === "cancel" && styles.hudTextCancel,
              gestureMode === "transcribe" && styles.hudTextTranscribe,
            ]}
          >
            {gestureMode === "cancel"
              ? "松开手指，取消发送"
              : gestureMode === "transcribe"
              ? "松开手指，转为文字"
              : "← 左滑取消 | 松开发送 | 右滑转文字 →"}
          </Text>
        </View>
      ) : null}

      <View
        accessibilityRole="button"
        accessibilityLabel="语音输入 (长按说话)"
        {...panResponder.panHandlers}
        style={[
          styles.btn,
          recording && styles.btnRecording,
          recording && gestureMode === "cancel" && styles.btnCancel,
          recording && gestureMode === "transcribe" && styles.btnTranscribe,
          (disabled || (busy && !recording)) && styles.disabled,
        ]}
      >
        <Ionicons
          name={
            recording
              ? gestureMode === "cancel"
                ? "trash-outline"
                : "radio-button-on"
              : "mic-outline"
          }
          size={14}
          color={
            recording
              ? gestureMode === "cancel"
                ? "#FFFFFF"
                : C.err
              : C.ink3
          }
        />
        <Text
          style={[
            styles.label,
            recording && styles.labelRecording,
            recording && gestureMode === "cancel" && styles.labelCancel,
          ]}
        >
          {label}
        </Text>
      </View>
      {status ? <Text style={styles.status}>{status}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    flexWrap: "wrap",
  },
  hudBubble: {
    position: "absolute",
    bottom: 34,
    left: 0,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
    zIndex: 99,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  hudText: {
    color: C.ink2,
    fontSize: 11,
    fontWeight: "500",
  },
  hudTextCancel: {
    color: C.err,
    fontWeight: "bold",
  },
  hudTextTranscribe: {
    color: "#10B981",
    fontWeight: "bold",
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: ELEVATION.base,
  },
  btnRecording: {
    borderColor: "rgba(239, 68, 68, 0.4)",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  btnCancel: {
    borderColor: C.err,
    backgroundColor: C.err,
  },
  btnTranscribe: {
    borderColor: "#10B981",
    backgroundColor: "rgba(16, 185, 129, 0.15)",
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    color: C.ink3,
    fontSize: 12,
    fontWeight: "500",
  },
  labelRecording: {
    color: C.err,
    fontWeight: "600",
  },
  labelCancel: {
    color: "#FFFFFF",
  },
  status: {
    color: C.ink4,
    fontSize: 11,
    flexShrink: 1,
  },
});
