import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Animated,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { C } from "../coolie";
import { ELEVATION, RADIUS, SPACING } from "../ui/tokens";

/**
 * ChatInput — 工坊对话框底部输入区 (wave71 抽出 + wave362 动态语音手势重构)
 *
 * 核心人机工程学改进:
 * 1. 【键盘 / 语音】模式切换: 切换为语音时呈现横跨屏幕的宽阔「按住 说话」条，彻底消灭右下角 36px 狭窄处手势滑出屏幕的致命缺陷；
 * 2. 真实物理跟手 HUD 浮层: 左滑取消动态放大变红、右滑转文字动态放大变绿，带有秒表计时 (00:03) 与 5 频真实呼吸音浪；
 * 3. 三态终态明确分流: 居中松开发送 ("send")、右滑松开转文字填入输入框 ("transcribe")、左滑松开彻底丢弃 ("cancel")。
 */

export interface StagedAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  uri: string;
}

export interface ChatInputProps {
  value: string;
  onChangeText: (text: string) => void;
  sending?: boolean;
  /** 录音中 — 父屏 useRecorder().recording */
  recording?: boolean;
  /** 录音机转写中 — 父屏 voiceBusy */
  voiceBusy?: boolean;
  /** 长按 mic 接管 — 父屏实现 startRecording / stopRecording 的 race-safe 串接 */
  onMicPressIn?: () => void;
  /** 松手完成录音: 区分 "send" (直接发送) 或 "transcribe" (转文字填入输入框) */
  onMicPressOut?: (mode?: "send" | "transcribe") => void;
  /** 向左滑动取消录音 (彻底丢弃) */
  onMicCancel?: () => void;
  /** send 按钮: 由父屏实际发请求 */
  onSend: () => void;
  /** 手动停止生成 */
  onStop?: () => void;
  /** 选完附件后的回调 — 父屏调用 uploadAttachment 拿 id */
  onPickAttachment: (attachment: StagedAttachment) => void;
  /** 上传中标志 — 让 [+] 按钮变 loading */
  uploading?: boolean;
  disabled?: boolean;
}

export function ChatInput({
  value,
  onChangeText,
  sending = false,
  recording = false,
  voiceBusy = false,
  onMicPressIn,
  onMicPressOut,
  onMicCancel,
  onSend,
  onStop,
  onPickAttachment,
  uploading = false,
  disabled = false,
}: ChatInputProps) {
  // 模式切换: "text" (文字输入) vs "voice" (全宽按住说话长条)
  const [inputMode, setInputMode] = useState<"text" | "voice">("text");

  // 录音中的实时三态: "send" (居中发送) | "cancel" (左滑取消) | "transcribe" (右滑转文字)
  const [gestureMode, setGestureMode] = useState<"send" | "cancel" | "transcribe">("send");

  // 录音秒数计时器 (00:03)
  const [recordSeconds, setRecordSeconds] = useState(0);

  // 动态手势跟手变形插值
  const cancelScaleAnim = useRef(new Animated.Value(1)).current;
  const transcribeScaleAnim = useRef(new Animated.Value(1)).current;

  // 微信/飞书风格音浪动效高度
  const waveAnim1 = useRef(new Animated.Value(0.35)).current;
  const waveAnim2 = useRef(new Animated.Value(0.75)).current;
  const waveAnim3 = useRef(new Animated.Value(1.0)).current;
  const waveAnim4 = useRef(new Animated.Value(0.6)).current;
  const waveAnim5 = useRef(new Animated.Value(0.4)).current;

  // 录音计时器
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (recording) {
      setRecordSeconds(0);
      timer = setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } else {
      setRecordSeconds(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [recording]);

  // 音浪动效动画循环
  useEffect(() => {
    if (!recording) {
      waveAnim1.setValue(0.35);
      waveAnim2.setValue(0.75);
      waveAnim3.setValue(1.0);
      waveAnim4.setValue(0.6);
      waveAnim5.setValue(0.4);
      cancelScaleAnim.setValue(1);
      transcribeScaleAnim.setValue(1);
      setGestureMode("send");
      return;
    }

    const createWaveAnim = (anim: Animated.Value, minVal: number, maxVal: number, duration: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: maxVal, duration, useNativeDriver: true }),
          Animated.timing(anim, { toValue: minVal, duration, useNativeDriver: true }),
        ]),
      );

    const w1 = createWaveAnim(waveAnim1, 0.25, 1.1, 320);
    const w2 = createWaveAnim(waveAnim2, 0.35, 1.4, 420);
    const w3 = createWaveAnim(waveAnim3, 0.45, 1.6, 360);
    const w4 = createWaveAnim(waveAnim4, 0.3, 1.3, 400);
    const w5 = createWaveAnim(waveAnim5, 0.2, 1.0, 300);

    w1.start();
    w2.start();
    w3.start();
    w4.start();
    w5.start();

    return () => {
      w1.stop();
      w2.stop();
      w3.stop();
      w4.stop();
      w5.stop();
    };
  }, [recording, waveAnim1, waveAnim2, waveAnim3, waveAnim4, waveAnim5, cancelScaleAnim, transcribeScaleAnim]);

  /** ActionSheet 三选一: 相册 / 拍照 / 文件 */
  const showAttachmentSheet = useCallback(() => {
    const handleAlbum = async () => {
      try {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("未授权", "请在系统设置中允许访问相册");
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.85,
        });
        if (result.canceled) return;
        const asset = result.assets[0];
        if (!asset) return;
        onPickAttachment({
          id: `img-${asset.uri}:${asset.fileSize ?? 0}`,
          name: asset.fileName ?? "image.jpg",
          mimeType: asset.mimeType ?? "image/jpeg",
          size: asset.fileSize ?? null,
          uri: asset.uri,
        });
      } catch (e) {
        Alert.alert("选图失败", String((e as Error)?.message ?? e));
      }
    };

    const handleCamera = async () => {
      try {
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.85,
        });
        if (result.canceled) return;
        const asset = result.assets[0];
        if (!asset) return;
        onPickAttachment({
          id: `cam-${asset.uri}:${asset.fileSize ?? 0}`,
          name: asset.fileName ?? "photo.jpg",
          mimeType: asset.mimeType ?? "image/jpeg",
          size: asset.fileSize ?? null,
          uri: asset.uri,
        });
      } catch (e) {
        Alert.alert("拍照失败", String((e as Error)?.message ?? e));
      }
    };

    const handleFile = async () => {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: "*/*",
          copyToCacheDirectory: true,
        });
        if (result.canceled) return;
        const asset = result.assets[0];
        if (!asset) return;
        onPickAttachment({
          id: `file-${asset.uri}:${asset.size ?? 0}`,
          name: asset.name,
          mimeType: asset.mimeType ?? "application/octet-stream",
          size: asset.size ?? null,
          uri: asset.uri,
        });
      } catch (e) {
        Alert.alert("选文件失败", String((e as Error)?.message ?? e));
      }
    };

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["相册", "拍照", "文件", "取消"],
          cancelButtonIndex: 3,
        },
        (idx) => {
          if (idx === 0) void handleAlbum();
          else if (idx === 1) void handleCamera();
          else if (idx === 2) void handleFile();
        },
      );
    } else {
      Alert.alert("添加附件", "选择附件来源", [
        { text: "相册", onPress: () => void handleAlbum() },
        { text: "拍照", onPress: () => void handleCamera() },
        { text: "文件", onPress: () => void handleFile() },
        { text: "取消", style: "cancel" },
      ]);
    }
  }, [onPickAttachment]);

  const showSend = value.trim().length > 0 && !sending;
  const canEdit = !sending && !disabled;

  // 微信/飞书动态手势识别器: 宽阔居中按压，支持连续跟手位移
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => canEdit && !voiceBusy,
        onMoveShouldSetPanResponder: () => canEdit && !voiceBusy,
        onPanResponderGrant: () => {
          setGestureMode("send");
          cancelScaleAnim.setValue(1);
          transcribeScaleAnim.setValue(1);
          onMicPressIn?.();
        },
        onPanResponderMove: (_, gestureState) => {
          const { dx } = gestureState;
          if (dx < -45) {
            setGestureMode("cancel");
            Animated.spring(cancelScaleAnim, {
              toValue: 1.35,
              useNativeDriver: true,
              friction: 6,
            }).start();
            Animated.spring(transcribeScaleAnim, {
              toValue: 0.9,
              useNativeDriver: true,
              friction: 6,
            }).start();
          } else if (dx > 45) {
            setGestureMode("transcribe");
            Animated.spring(transcribeScaleAnim, {
              toValue: 1.35,
              useNativeDriver: true,
              friction: 6,
            }).start();
            Animated.spring(cancelScaleAnim, {
              toValue: 0.9,
              useNativeDriver: true,
              friction: 6,
            }).start();
          } else {
            setGestureMode("send");
            Animated.spring(cancelScaleAnim, {
              toValue: 1,
              useNativeDriver: true,
              friction: 6,
            }).start();
            Animated.spring(transcribeScaleAnim, {
              toValue: 1,
              useNativeDriver: true,
              friction: 6,
            }).start();
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          const { dx } = gestureState;
          cancelScaleAnim.setValue(1);
          transcribeScaleAnim.setValue(1);

          if (dx < -45) {
            // 左滑松手: 彻底取消
            setGestureMode("send");
            onMicCancel?.();
          } else if (dx > 45) {
            // 右滑松手: 转文字并填入输入框，切回键盘模式
            setGestureMode("send");
            onMicPressOut?.("transcribe");
            setInputMode("text");
          } else {
            // 居中松手: 直接发送！
            setGestureMode("send");
            onMicPressOut?.("send");
          }
        },
        onPanResponderTerminate: () => {
          cancelScaleAnim.setValue(1);
          transcribeScaleAnim.setValue(1);
          setGestureMode("send");
          onMicCancel?.();
        },
      }),
    [canEdit, voiceBusy, onMicPressIn, onMicPressOut, onMicCancel, cancelScaleAnim, transcribeScaleAnim],
  );

  // 格式化秒数
  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <View style={styles.wrapper} testID="ChatInput__Wrapper">
      {/* ── 全屏/半屏沉浸式动态手势 HUD 浮层 ── */}
      {recording ? (
        <View style={styles.hudOverlay} testID="ChatInput__VoiceHUD">
          <View style={styles.hudCard}>
            {/* 顶部: 动态秒表与计时 */}
            <View style={styles.hudHeaderRow}>
              <View
                style={[
                  styles.hudLiveDot,
                  gestureMode === "cancel" && styles.hudLiveDotCancel,
                  gestureMode === "transcribe" && styles.hudLiveDotTranscribe,
                ]}
              />
              <Text
                style={[
                  styles.hudTimerText,
                  gestureMode === "cancel" && styles.hudTimerTextCancel,
                  gestureMode === "transcribe" && styles.hudTimerTextTranscribe,
                ]}
              >
                {formatTimer(recordSeconds)}
              </Text>
            </View>

            {/* 中间: 5 频真实呼吸声波 */}
            <View style={styles.waveRow}>
              <Animated.View
                style={[
                  styles.waveBar,
                  gestureMode === "cancel" && styles.waveBarCancel,
                  gestureMode === "transcribe" && styles.waveBarTranscribe,
                  { transform: [{ scaleY: waveAnim1 }] },
                ]}
              />
              <Animated.View
                style={[
                  styles.waveBar,
                  gestureMode === "cancel" && styles.waveBarCancel,
                  gestureMode === "transcribe" && styles.waveBarTranscribe,
                  { transform: [{ scaleY: waveAnim2 }] },
                ]}
              />
              <Animated.View
                style={[
                  styles.waveBar,
                  gestureMode === "cancel" && styles.waveBarCancel,
                  gestureMode === "transcribe" && styles.waveBarTranscribe,
                  { transform: [{ scaleY: waveAnim3 }] },
                ]}
              />
              <Animated.View
                style={[
                  styles.waveBar,
                  gestureMode === "cancel" && styles.waveBarCancel,
                  gestureMode === "transcribe" && styles.waveBarTranscribe,
                  { transform: [{ scaleY: waveAnim4 }] },
                ]}
              />
              <Animated.View
                style={[
                  styles.waveBar,
                  gestureMode === "cancel" && styles.waveBarCancel,
                  gestureMode === "transcribe" && styles.waveBarTranscribe,
                  { transform: [{ scaleY: waveAnim5 }] },
                ]}
              />
            </View>

            {/* 动态手势提示卡 */}
            <View style={styles.hudTipBox}>
              <Text
                style={[
                  styles.hudTipText,
                  gestureMode === "cancel" && styles.hudTipTextCancel,
                  gestureMode === "transcribe" && styles.hudTipTextTranscribe,
                ]}
              >
                {gestureMode === "cancel"
                  ? "⚠️ 松开手指，取消发送"
                  : gestureMode === "transcribe"
                  ? "✏️ 松开手指，转文字并预览"
                  : "松开 发送 (←左滑取消 · 右滑转文字→)"}
              </Text>
            </View>

            {/* 下部: 左右双极动态吸附热区 */}
            <View style={styles.hudActionsZone}>
              {/* 左侧: 取消热区 */}
              <View style={styles.zoneSideItem} testID="ChatInput__CancelZone">
                <Animated.View
                  style={[
                    styles.zoneCircle,
                    gestureMode === "cancel" && styles.zoneCircleCancelActive,
                    { transform: [{ scale: cancelScaleAnim }] },
                  ]}
                >
                  <Ionicons
                    name="trash-outline"
                    size={22}
                    color={gestureMode === "cancel" ? "#FFFFFF" : C.ink3}
                  />
                </Animated.View>
                <Text
                  style={[
                    styles.zoneLabel,
                    gestureMode === "cancel" && styles.zoneLabelCancelActive,
                  ]}
                >
                  {gestureMode === "cancel" ? "松开 取消" : "← 左滑 取消"}
                </Text>
              </View>

              {/* 中间手势引导轨 */}
              <View style={styles.zoneCenterTrack}>
                <Text style={styles.trackArrowText}>‹ ‹ ‹</Text>
                <View style={styles.trackAnchorDot} />
                <Text style={styles.trackArrowText}>› › ›</Text>
              </View>

              {/* 右侧: 转文字热区 */}
              <View style={styles.zoneSideItem} testID="ChatInput__TranscribeZone">
                <Animated.View
                  style={[
                    styles.zoneCircle,
                    gestureMode === "transcribe" && styles.zoneCircleTranscribeActive,
                    { transform: [{ scale: transcribeScaleAnim }] },
                  ]}
                >
                  <Ionicons
                    name="document-text-outline"
                    size={22}
                    color={gestureMode === "transcribe" ? "#FFFFFF" : C.ink3}
                  />
                </Animated.View>
                <Text
                  style={[
                    styles.zoneLabel,
                    gestureMode === "transcribe" && styles.zoneLabelTranscribeActive,
                  ]}
                >
                  {gestureMode === "transcribe" ? "松开 转文字" : "右滑 转文字 →"}
                </Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      {/* ── 底部输入操作栏 ── */}
      <View style={styles.row}>
        {/* 1. [+] 附件按钮 */}
        <Pressable
          onPress={showAttachmentSheet}
          disabled={!canEdit || uploading}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="添加附件"
          style={({ pressed }) => [
            styles.iconBtn,
            pressed && styles.iconBtnPressed,
            (!canEdit || uploading) && styles.iconBtnDisabled,
          ]}
          testID="ChatInput__AttachBtn"
        >
          {uploading ? (
            <ActivityIndicator size="small" color={C.ink2} />
          ) : (
            <Ionicons name="add" size={20} color={C.ink2} />
          )}
        </Pressable>

        {/* 2. 【语音 / 键盘】模式切换按钮 */}
        <Pressable
          onPress={() => {
            if (voiceBusy || recording) return;
            setInputMode((m) => (m === "text" ? "voice" : "text"));
          }}
          disabled={!canEdit || voiceBusy}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={inputMode === "text" ? "切换语音输入" : "切换键盘输入"}
          style={({ pressed }) => [
            styles.iconBtn,
            inputMode === "voice" && styles.iconBtnModeActive,
            pressed && styles.iconBtnPressed,
            (!canEdit || voiceBusy) && styles.iconBtnDisabled,
          ]}
          testID="ChatInput__ModeToggleBtn"
        >
          <Ionicons
            name={inputMode === "text" ? "mic-outline" : "keypad-outline"}
            size={19}
            color={inputMode === "voice" ? C.accent : C.ink2}
          />
        </Pressable>

        {/* 3. 中间区域: 文本输入框 vs 全宽按住说话长条 */}
        {inputMode === "text" ? (
          <TextInput
            style={[styles.textInput, disabled && styles.textInputDisabled]}
            placeholder="派个活, 或问点什么"
            placeholderTextColor={C.ink3}
            value={value}
            onChangeText={onChangeText}
            multiline
            maxLength={1000}
            editable={!disabled}
            testID="ChatInput__TextInput"
          />
        ) : (
          <View
            style={styles.holdToTalkWrap}
            {...panResponder.panHandlers}
            testID="ChatInput__HoldToTalkBar"
          >
            <View
              style={[
                styles.holdToTalkBar,
                recording && styles.holdToTalkBarRecording,
                (!canEdit || voiceBusy) && styles.holdToTalkBarDisabled,
              ]}
            >
              {voiceBusy && !recording ? (
                <View style={styles.voiceBusyRow}>
                  <ActivityIndicator size="small" color={C.accent} />
                  <Text style={styles.voiceBusyText}>识别处理中…</Text>
                </View>
              ) : (
                <View style={styles.voiceNormalRow}>
                  <Ionicons
                    name={recording ? "radio-button-on" : "mic"}
                    size={17}
                    color={recording ? C.err : C.ink2}
                  />
                  <Text
                    style={[
                      styles.holdToTalkText,
                      recording && styles.holdToTalkTextRecording,
                    ]}
                  >
                    {recording ? "松开 发送 (滑动选择)" : "按住 说话"}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* 4. 发送 / 停止按钮 */}
        {sending && onStop ? (
          <Pressable
            onPress={onStop}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="停止生成"
            style={styles.stopBtn}
            testID="ChatInput__StopBtn"
          >
            <View style={styles.stopIcon} />
          </Pressable>
        ) : (
          <Pressable
            onPress={onSend}
            disabled={!showSend}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="发送"
            style={[styles.sendBtn, !showSend && styles.sendBtnDisabled]}
            testID="ChatInput__SendBtn"
          >
            <Text style={styles.sendBtnIcon}>↑</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
  },

  /* 沉浸式动态 HUD 浮层 */
  hudOverlay: {
    position: "absolute",
    bottom: 66,
    left: 12,
    right: 12,
    zIndex: 999,
  },
  hudCard: {
    backgroundColor: C.panel,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    alignItems: "center",
    gap: SPACING.sm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  hudHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  hudLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.accent,
  },
  hudLiveDotCancel: {
    backgroundColor: C.err,
  },
  hudLiveDotTranscribe: {
    backgroundColor: "#10B981",
  },
  hudTimerText: {
    fontSize: 22,
    fontWeight: "700",
    color: C.ink,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    letterSpacing: 1,
  },
  hudTimerTextCancel: {
    color: C.err,
  },
  hudTimerTextTranscribe: {
    color: "#10B981",
  },

  /* 5 柱动态音浪 */
  waveRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 32,
    gap: 6,
    paddingVertical: 2,
  },
  waveBar: {
    width: 4,
    height: 22,
    borderRadius: RADIUS.pill,
    backgroundColor: C.accent,
  },
  waveBarCancel: {
    backgroundColor: C.err,
  },
  waveBarTranscribe: {
    backgroundColor: "#10B981",
  },

  /* 动态手势提示 */
  hudTipBox: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  hudTipText: {
    fontSize: 12,
    color: C.ink2,
    fontWeight: "600",
  },
  hudTipTextCancel: {
    color: C.err,
    fontWeight: "700",
  },
  hudTipTextTranscribe: {
    color: "#10B981",
    fontWeight: "700",
  },

  /* 左右双极动态手势区 */
  hudActionsZone: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingTop: 6,
    paddingHorizontal: 8,
  },
  zoneSideItem: {
    alignItems: "center",
    justifyContent: "center",
    width: 84,
    gap: 4,
  },
  zoneCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: C.lineSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  zoneCircleCancelActive: {
    backgroundColor: C.err,
    borderColor: C.err,
  },
  zoneCircleTranscribeActive: {
    backgroundColor: "#10B981",
    borderColor: "#10B981",
  },
  zoneLabel: {
    fontSize: 11,
    color: C.ink3,
    fontWeight: "500",
  },
  zoneLabelCancelActive: {
    color: C.err,
    fontWeight: "700",
  },
  zoneLabelTranscribeActive: {
    color: "#10B981",
    fontWeight: "700",
  },
  zoneCenterTrack: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    opacity: 0.35,
  },
  trackArrowText: {
    color: C.ink3,
    fontSize: 12,
    fontWeight: "600",
  },
  trackAnchorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.ink3,
  },

  /* 底部操作行 */
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: C.panel,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surface,
    borderColor: C.line,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnModeActive: {
    backgroundColor: "rgba(94, 106, 210, 0.16)",
    borderColor: C.accent,
  },
  iconBtnPressed: {
    backgroundColor: C.surfaceHover,
  },
  iconBtnDisabled: {
    opacity: 0.4,
  },

  /* 文本输入框 */
  textInput: {
    flex: 1,
    backgroundColor: C.surface,
    borderColor: C.lineSubtle,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    minHeight: 38,
    maxHeight: 100,
    color: C.ink,
    fontSize: 14,
    lineHeight: 18,
  },
  textInputDisabled: {
    opacity: 0.4,
  },

  /* 全宽「按住 说话」长条 */
  holdToTalkWrap: {
    flex: 1,
  },
  holdToTalkBar: {
    height: 38,
    backgroundColor: C.surface,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.md,
  },
  holdToTalkBarRecording: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderColor: "rgba(239, 68, 68, 0.45)",
  },
  holdToTalkBarDisabled: {
    opacity: 0.45,
  },
  voiceNormalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  holdToTalkText: {
    fontSize: 14,
    fontWeight: "600",
    color: C.ink,
  },
  holdToTalkTextRecording: {
    color: C.err,
    fontWeight: "700",
  },
  voiceBusyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  voiceBusyText: {
    fontSize: 13,
    color: C.accent,
    fontWeight: "500",
  },

  /* 发送与停止按钮 */
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: C.surface,
    opacity: 0.4,
  },
  sendBtnIcon: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
    marginTop: -2,
  },
  stopBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    borderColor: "rgba(239, 68, 68, 0.4)",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stopIcon: {
    width: 12,
    height: 12,
    backgroundColor: C.err,
    borderRadius: 2,
  },
});

export type { StagedAttachment as ChatInputStagedAttachment };