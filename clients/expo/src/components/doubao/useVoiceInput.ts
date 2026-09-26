import { useCallback, useRef, useState } from "react";
import { Alert } from "react-native";
import { isAsrNotConfigured } from "@coolie/api-client";
import { voiceTranscribe } from "../../services/voiceTranscribe";
import { useRecorder } from "../../useRecorder";

/** 短于这个时长算误触, 不当一句话 (与 composer 的 mic 同一口径)。 */
const MIN_VOICE_HOLD_MS = 500;

/**
 * 「按住说话」的录音 → 转写链路 —— wave21 那条 transcribe-only 链路的豆包版封装。
 *
 * 新会话页上同时有两个入口会用它: 底部的「按住说话」大按钮 (pressIn/pressOut) 和
 * 快捷行里的「录音转写」chip (toggle)。两者共用同一份录音状态, 所以录音机放在这里
 * 而不是某个按钮组件里 —— 页面上只允许存在一条录音。
 *
 * 转写**只出文字**: `voiceTranscribe` 走 `mode: "transcribe-only"`, 服务端不建任务。
 * 文字交给 `onTranscript`, 由页面决定落到哪 (新会话页 = 标题输入框)。
 */
export function useVoiceInput({
  companyId,
  onTranscript,
}: {
  companyId: string;
  onTranscript: (text: string) => void;
}) {
  const { recording, start, stop } = useRecorder();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  // start() 是异步的 (要权限 + 起录音机), 用户可能在它完成前就松手。按下时先存这个
  // 承诺, 松开时先 await 它再停录音 —— 否则「松手时 recording 还是 false」会让录音机
  // 空转 (composer 的 VoiceInputButton 踩过同一个坑)。
  const pressRef = useRef<{ startedAt: number; promise: Promise<boolean> | null }>({
    startedAt: 0,
    promise: null,
  });

  const begin = useCallback(async (): Promise<boolean> => {
    try {
      await start();
      setStatus("🎤 录音中… 松开转文字");
      return true;
    } catch (e) {
      Alert.alert("录音失败", String((e as Error)?.message ?? e));
      return false;
    }
  }, [start]);

  const finish = useCallback(
    async (startedAt: number, began: Promise<boolean> | null) => {
      if (!began) return;
      setBusy(true);
      setStatus("识别中…");
      try {
        const started = await began;
        if (!started) return;

        const { base64, format } = await stop();
        // stop() 失败/看门狗强制切断时返回空 base64, 不要把空音频送去转写
        if (!base64) return;
        if (Date.now() - startedAt < MIN_VOICE_HOLD_MS) {
          setStatus("🎤 按太短了, 请长按说话");
          return;
        }

        const { text } = await voiceTranscribe({ companyId, audioBase64: base64, format });
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
    },
    [companyId, onTranscript, stop],
  );

  const pressIn = useCallback(() => {
    if (busy) return;
    pressRef.current.startedAt = Date.now();
    pressRef.current.promise = begin();
  }, [begin, busy]);

  const pressOut = useCallback(() => {
    const press = pressRef.current;
    if (!press.promise) return;
    pressRef.current.promise = null;
    void finish(press.startedAt, press.promise);
  }, [finish]);

  /** 点一下开始, 再点一下结束 —— 快捷行「录音转写」chip 用。 */
  const toggle = useCallback(() => {
    if (busy) return;
    if (recording) pressOut();
    else pressIn();
  }, [busy, pressIn, pressOut, recording]);

  return { recording, busy, status, pressIn, pressOut, toggle };
}
