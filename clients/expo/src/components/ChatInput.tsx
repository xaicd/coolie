import React, { useCallback, useEffect, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Animated,
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
 *   [🎤] 长按 mic (父屏传入 onMicPressIn/Out 接管录音逻辑)
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
  onSend,
  onStop,
  onPickAttachment,
  uploading = false,
  disabled = false,
}: ChatInputProps) {
  const micPulse = React.useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!recording) {
      micPulse.setValue(1);
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
    return () => loop.stop();
  }, [recording, micPulse]);

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
  const canEdit = !sending && !disabled;

  return (
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
        style={[styles.textInput, !canEdit && styles.textInputDisabled]}
        placeholder="派个活, 或问点什么"
        placeholderTextColor={C.ink3}
        value={value}
        onChangeText={onChangeText}
        multiline
        maxLength={1000}
        editable={canEdit}
      />

      {/* [🎤] 长按 mic — 父屏 race-safe 串接 startRecording/stopRecording */}
      {onMicPressIn && onMicPressOut ? (
        <Animated.View style={{ opacity: recording ? micPulse : 1 }}>
          <Pressable
            onPressIn={onMicPressIn}
            onPressOut={onMicPressOut}
            onPress={() => {
              // 防御: 录音态下轻点一下强制停止
              if (recording) {
                onMicPressOut();
              }
            }}
            onResponderTerminate={onMicPressOut}
            disabled={!canEdit || voiceBusy}
            hitSlop={12}
            style={({ pressed }) => [
              styles.iconBtn,
              pressed && styles.iconBtnPressed,
              recording && styles.iconBtnRecording,
              (!canEdit || voiceBusy) && styles.iconBtnDisabled,
            ]}
          >
            {voiceBusy && !recording ? (
              <ActivityIndicator size="small" color={C.accent} />
            ) : (
              <Ionicons
                name={recording ? "mic" : "mic-outline"}
                size={18}
                color={recording ? C.err : C.ink2}
              />
            )}
          </Pressable>
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
  );
}

const styles = StyleSheet.create({
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