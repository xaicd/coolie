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

/**
 * ChatInput — 工坊对话框底部输入区 (wave71 抽出)
 *
 * 三件按钮 + 一段多行文本:
 *   [+] 弹 ActionSheet (相册 / 拍照 / 文件) -> 走 picker
 *   [🎤] 长按 mic (父屏传入 onMicPressIn/Out 接管录音逻辑, 仿微信QQ左滑取消/右滑转文字)
 *   [send] / [stop] — sending 时显示停止
 *
 * 附件上传由父屏注入 `onUploadAttachment(file)`, 父屏拿到返回的 attachmentId
 * 后塞到 BoardChatMessage 一起 POST。
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
  onMicPressOut?: () => void;
  /** 向左滑动取消录音 (仿微信/QQ) */
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
  const micPulse = React.useRef(new Animated.Value(1)).current;
  const [gestureMode, setGestureMode] = useState<"recording" | "cancel" | "transcribe">("recording");

  // 微信/QQ 风格音浪动效高度
  const waveAnim1 = React.useRef(new Animated.Value(0.4)).current;
  const waveAnim2 = React.useRef(new Animated.Value(0.8)).current;
  const waveAnim3 = React.useRef(new Animated.Value(1.0)).current;

  useEffect(() => {
    if (!recording) {
      micPulse.setValue(1);
      waveAnim1.setValue(0.4);
      waveAnim2.setValue(0.8);
      waveAnim3.setValue(1.0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(micPulse, {
          toValue: 0.4,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(micPulse, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();

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
      loop.stop();
      w1.stop();
      w2.stop();
      w3.stop();
    };
  }, [recording, micPulse, waveAnim1, waveAnim2, waveAnim3]);

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
      // coolie 工坊 + / 文件夹里的「拍照」走 expo-image-picker.launchCameraAsync —
      // expo-camera 在 SDK 57 之后改为 React <CameraView/> 组件模型, 不再提供
      // imperative launcher; image-picker 的 launchCameraAsync 是标准做法, 不需要
      // 单独再装 expo-camera (它在 SDK 52 上是 imperative launcher, 但跟 SDK 52 的
      // react-native 0.76 API 偶发冲突, 走 image-picker 更稳)。
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
  // wave144: buttons (attach / mic) stand down while a reply is streaming, but
  // the text box must not. The boss read the disabled input as "the page is
  // locked" and could not even draft the next message. `editable` below is
  // driven by `disabled` alone; the send button is already replaced by the stop
  // button while `sending`, so nothing can be dispatched twice.
  const canEdit = !sending && !disabled;

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => canEdit && !voiceBusy,
        onMoveShouldSetPanResponder: () => canEdit && !voiceBusy,
        onPanResponderGrant: () => {
          setGestureMode("recording");
          onMicPressIn?.();
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
          const finalMode = gestureState.dx < -45 ? "cancel" : "transcribe";
          setGestureMode("recording");
          if (finalMode === "cancel") {
            if (onMicCancel) onMicCancel();
            else onMicPressOut?.();
          } else {
            onMicPressOut?.();
          }
        },
        onPanResponderTerminate: () => {
          setGestureMode("recording");
          if (onMicCancel) onMicCancel();
          else onMicPressOut?.();
        },
      }),
    [canEdit, voiceBusy, onMicPressIn, onMicPressOut, onMicCancel],
  );

  return (
    <View style={styles.wrapper}>
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

      <View style={styles.row}>
        {/* [+] 弹 ActionSheet */}
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
        >
          {uploading ? (
            <ActivityIndicator size="small" color={C.ink2} />
          ) : (
            <Ionicons name="add" size={20} color={C.ink2} />
          )}
        </Pressable>

        <TextInput
          style={[
            styles.textInput,
            recording && styles.textInputRecording,
            disabled && styles.textInputDisabled,
          ]}
          placeholder={
            recording
              ? gestureMode === "cancel"
                ? "⚠️ 松开手指将取消发送"
                : "🎤 正在录音… 松开转文字"
              : "派个活, 或问点什么"
          }
          placeholderTextColor={recording ? (gestureMode === "cancel" ? C.err : C.accent) : C.ink3}
          value={value}
          onChangeText={onChangeText}
          multiline
          maxLength={1000}
          editable={!disabled}
        />

        {/* [🎤] 微信/QQ 风格滑动 mic: PanResponder 驱动左滑取消 / 右滑转文字 */}
        {onMicPressIn && onMicPressOut ? (
          <Animated.View
            style={{ opacity: recording ? micPulse : 1 }}
            {...panResponder.panHandlers}
          >
            <View
              style={[
                styles.iconBtn,
                recording && styles.iconBtnRecording,
                (!canEdit || (voiceBusy && !recording)) && styles.iconBtnDisabled,
              ]}
            >
              {voiceBusy && !recording ? (
                <ActivityIndicator size="small" color={C.accent} />
              ) : (
                <Ionicons
                  name={recording ? "mic" : "mic-outline"}
                  size={18}
                  color={recording ? (gestureMode === "cancel" ? C.err : C.accent) : C.ink2}
                />
              )}
            </View>
          </Animated.View>
        ) : null}

      {sending && onStop ? (
        <Pressable
          onPress={onStop}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="停止生成"
          style={styles.stopBtn}
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
  hudContainer: {
    position: "absolute",
    bottom: 58,
    left: 12,
    right: 12,
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
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
  iconBtnPressed: {
    backgroundColor: C.surfaceHover,
  },
  iconBtnDisabled: {
    opacity: 0.4,
  },
  iconBtnRecording: {
    backgroundColor: "rgba(239, 68, 68, 0.16)",
    borderColor: "rgba(239, 68, 68, 0.4)",
  },
  textInput: {
    flex: 1,
    backgroundColor: C.surface,
    borderColor: C.lineSubtle,
    borderWidth: 1,
    borderRadius: 10,
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
  textInputRecording: {
    borderColor: "rgba(239, 68, 68, 0.4)",
    backgroundColor: "rgba(239, 68, 68, 0.05)",
  },
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