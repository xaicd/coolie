import { useCallback, useRef, useState } from "react";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";

/**
 * Minimal voice recorder hook. Records to an m4a file and returns it as base64
 * so it can be sent to the Coolie multimodal transcription endpoint.
 *
 * NOTE: skeleton. Tencent one-sentence recognition expects <= 60s, <= 3MB.
 * Enforce/trim before dispatch in a real build.
 */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const recRef = useRef<Audio.Recording | null>(null);

  const start = useCallback(async () => {
    const perm = await Audio.requestPermissionsAsync();
    if (!perm.granted) throw new Error("Microphone permission denied");
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const { recording: rec } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY,
      { progressUpdateIntervalMillis: 1000 } as never,
    );
    recRef.current = rec;
    setRecording(true);
  }, []);

  /** Stop and return { base64, format }. */
  const stop = useCallback(async (): Promise<{ base64: string; format: "m4a" }> => {
    const rec = recRef.current;
    if (!rec) throw new Error("Not recording");
    recRef.current = null;
    setRecording(false);
    // Android 上 stopAndUnloadAsync 偶发挂起: race 一个 5s 超时,超时强制 unload
    await Promise.race([
      rec.stopAndUnloadAsync(),
      new Promise((r) => setTimeout(r, 5000)),
    ]).catch(async () => {
      try { await rec.stopAndUnloadAsync(); } catch { /* 已经卸载 */ }
    });
    const uri = rec.getURI();
    recRef.current = null;
    setRecording(false);
    if (!uri) throw new Error("No recording URI");
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return { base64, format: "m4a" };
  }, []);

  return { recording, start, stop };
}
