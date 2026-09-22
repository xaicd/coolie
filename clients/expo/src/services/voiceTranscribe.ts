import { coolie } from "../coolie";

/**
 * 语音转写 —— boss 09-22 23:40「像豆包一样, 新会话, 要么打字, 要么语音转文字输入」。
 *
 * 长按 mic 录完音, 只把语音**转成文字**: 服务端 (multimodal 插件) 以
 * `mode: "transcribe-only"` 提交时不建任务, 只回转写文本 (wave21 模式)。
 * 文字落到调用方的输入框 (ComposeScreen 的标题 / 工坊会话的输入框), 由用户
 * 确认或补充后再自己点「创建任务」—— 不替用户建单。
 *
 * (wave32 v1 曾按 boss 23:38 的字面把这里改成 `mode: "dispatch"` 直接建任务;
 *  23:40 的「像豆包一样」把口径纠正回 transcribe-only, 见 brief §3.1 补丁。)
 */
export interface VoiceTranscription {
  /** 转写文本; 空串表示没听清。 */
  text: string;
}

export async function voiceTranscribe({
  companyId,
  audioBase64,
  format,
}: {
  companyId: string;
  /** 录音 base64 (无 data: 前缀)。 */
  audioBase64: string;
  format: "m4a";
}): Promise<VoiceTranscription> {
  const res = await coolie.voiceDispatch({
    companyId,
    audioBase64,
    format,
    mode: "transcribe-only",
  });
  return { text: (res.text ?? res.transcription?.text ?? "").trim() };
}
