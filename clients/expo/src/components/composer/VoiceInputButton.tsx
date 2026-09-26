import { useCallback, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { isAsrNotConfigured } from "@coolie/api-client";
import { C, coolie } from "../../coolie";
import { ELEVATION, RADIUS, SPACING } from "../../ui/tokens";
import { useRecorder } from "../../useRecorder";

/** A hold shorter than this is treated as a mis-tap, not speech. */
const MIN_VOICE_HOLD_MS = 500;

/**
 * 新建任务里的语音输入 —— brief §3.5 (boss「这个页面的样子加语音按钮」)。
 *
 * 复用 wave21 那条**长按 mic → transcribe-only → 填进输入框**的链路
 * (`clients/expo/src/screens/BoardChatScreen.tsx` 里的 `handleMicPressIn/Out`):
 * 转写只产出文本, 不建任务、不派发, 用户看到字再决定要不要建。
 *
 * 与 BoardChatScreen 同一个竞态处理: `start()` 是异步的 (要权限 + 起录音机), 用户
 * 可能在它完成前就松手, 所以按下时先存一个启动承诺, 松开时先 await 它再停录音 ——
 * 否则「松手时 recording 还是 false」会让录音机继续空转。
 *
 * 转写文字按 brief 的 PM 决策进 **标题** (长按 mic 通常是一句话当 task title)。
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
  const { recording, start, stop } = useRecorder();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const pressRef = useRef<{ startedAt: number; promise: Promise<boolean> | null }>({
    startedAt: 0,
    promise: null,
  });

  const handlePressIn = useCallback(() => {
    if (busy || disabled) return;
    pressRef.current.startedAt = Date.now();
    pressRef.current.promise = (async () => {
      try {
        await start();
        setStatus("🎤 录音中… 松开转文字");
        return true;
      } catch (e) {
        Alert.alert("录音失败", String((e as Error)?.message ?? e));
        return false;
      }
    })();
  }, [busy, disabled, start]);

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
      // stop() 失败/看门狗强制切断时返回空 base64, 不要把空音频送去转写
      if (!base64) return;
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

  return (
    <View style={styles.block}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="语音输入 (长按说话)"
        onPressIn={handlePressIn}
        onPressOut={() => void handlePressOut()}
        disabled={disabled || busy}
        style={({ pressed }) => [
          styles.btn,
          recording && styles.btnRecording,
          pressed && styles.btnPressed,
          (disabled || busy) && styles.disabled,
        ]}
      >
        <Ionicons
          name={recording ? "radio-button-on" : "mic-outline"}
          size={14}
          color={recording ? C.err : C.ink3}
        />
        <Text style={styles.label}>{recording ? "正在录音…松开发送" : "语音输入"}</Text>
      </Pressable>
      {status ? <Text style={styles.status}>{status}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    flexWrap: "wrap",
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
  btnPressed: {
    backgroundColor: ELEVATION.active,
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    color: C.ink3,
    fontSize: 12,
    fontWeight: "500",
  },
  status: {
    color: C.ink4,
    fontSize: 11,
    flexShrink: 1,
  },
});
