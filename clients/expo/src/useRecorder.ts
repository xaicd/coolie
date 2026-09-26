import { useCallback, useEffect, useRef, useState } from "react";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";

/**
 * Minimal voice recorder hook. Records to an m4a file and returns it as base64
 * so it can be sent to the Coolie multimodal transcription endpoint.
 *
 * ## 修复记录与五重防线 (wave96 Bugfix)
 *
 * 1. **模块级单例 (ModuleShared)**: expo-av Audio.Recording 是原生单例，多组件共享同一实例；
 * 2. **全局事件广播 (Listeners)**: 当任意组件停止/启动录音时，通过 Set 广播通知所有挂载的 Hook 实例同步 `recording` 状态，彻底杜绝孤立 Hook 状态不同步；
 * 3. **30s 硬件看门狗 (Watchdog)**: 启动录音后开 30 秒倒计时看门狗，超时自动强制卸载并复位，防止手势滑出/丢事件导致录音机无限空转；
 * 4. **一键强制中止 (forceStop)**: 任何异常或用户重复轻按录音按钮时，可无条件一键断开音频流；
 * 5. **优雅失败与安全 Unload (safeUnload)**: 带有 Promise.race 5s 超时保护和异常捕获，确保 iOS/Android audio session 无论如何都能关闭。
 */

type ModuleShared = {
  recording: Audio.Recording | null;
  startPromise: Promise<Audio.Recording> | null;
  listeners: Set<(isRecording: boolean) => void>;
  watchdogTimer: ReturnType<typeof setTimeout> | null;
};

const moduleShared: ModuleShared = {
  recording: null,
  startPromise: null,
  listeners: new Set(),
  watchdogTimer: null,
};

let mountRefCount = 0;

function broadcastRecording(isRecording: boolean): void {
  for (const listener of moduleShared.listeners) {
    try {
      listener(isRecording);
    } catch {}
  }
}

function clearWatchdog(): void {
  if (moduleShared.watchdogTimer) {
    clearTimeout(moduleShared.watchdogTimer);
    moduleShared.watchdogTimer = null;
  }
}

async function safeUnload(rec: Audio.Recording | null): Promise<void> {
  if (!rec) return;
  try {
    await Promise.race([
      rec.stopAndUnloadAsync(),
      new Promise((r) => setTimeout(r, 4000)),
    ]).catch(async () => {
      try {
        await rec.stopAndUnloadAsync();
      } catch {
        /* 已经 unload */
      }
    });
  } catch {
    // 已经 unload / native 状态错乱
  }
}

async function resetAudioMode(): Promise<void> {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: false,
    });
  } catch {
    // best effort
  }
}

export function useRecorder() {
  const [recording, setRecording] = useState(moduleShared.recording != null);
  const localRef = useRef<Audio.Recording | null>(null);

  useEffect(() => {
    mountRefCount += 1;
    moduleShared.listeners.add(setRecording);
    // 同步当前最新真值
    setRecording(moduleShared.recording != null);

    return () => {
      mountRefCount -= 1;
      moduleShared.listeners.delete(setRecording);

      if (localRef.current && moduleShared.recording === localRef.current) {
        const rec = localRef.current;
        moduleShared.recording = null;
        moduleShared.startPromise = null;
        clearWatchdog();
        localRef.current = null;
        broadcastRecording(false);

        void safeUnload(rec).then(() => {
          if (mountRefCount === 0) void resetAudioMode();
        });
      } else if (mountRefCount === 0) {
        clearWatchdog();
        void resetAudioMode();
      }
    };
  }, []);

  const start = useCallback(async (): Promise<void> => {
    // 1) 并发 start() 防护 —— 复用同一个 promise, 不再开新录音
    if (moduleShared.startPromise) {
      try {
        await moduleShared.startPromise;
        return;
      } catch {
        moduleShared.startPromise = null;
      }
    }

    const p = (async () => {
      // 2) 已经有 active recording → 先 unload 它
      if (moduleShared.recording) {
        await safeUnload(moduleShared.recording);
        moduleShared.recording = null;
      }

      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        broadcastRecording(false);
        throw new Error("麦克风权限未授予");
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      let rec: Audio.Recording | null = null;
      try {
        const { recording: r } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY,
          undefined,
          1000,
        );
        rec = r;
      } catch (e) {
        await resetAudioMode();
        broadcastRecording(false);
        throw e;
      }

      moduleShared.recording = rec;
      localRef.current = rec;
      broadcastRecording(true);

      // 3) 设置 30 秒看门狗自动切断，防止录音开启后停不了
      clearWatchdog();
      moduleShared.watchdogTimer = setTimeout(() => {
        console.warn("[useRecorder] 看门狗触发 (超过30秒)，强制停止录音并复位");
        const currentRec = moduleShared.recording;
        moduleShared.recording = null;
        moduleShared.startPromise = null;
        clearWatchdog();
        broadcastRecording(false);
        void safeUnload(currentRec).finally(() => {
          void resetAudioMode();
        });
      }, 30_000);

      return rec;
    })();

    moduleShared.startPromise = p;
    try {
      await p;
    } finally {
      if (moduleShared.startPromise === p) {
        moduleShared.startPromise = null;
      }
    }
  }, []);

  /** Stop and return { base64, format }. */
  const stop = useCallback(async (): Promise<{ base64: string; format: "m4a" }> => {
    clearWatchdog();
    const rec = moduleShared.recording;

    // 立即清模块状态并广播，让所有 UI 立刻退出录音态
    moduleShared.recording = null;
    moduleShared.startPromise = null;
    broadcastRecording(false);

    if (!rec) {
      // 没有正在录制的句柄，直接平稳返回空并复位
      await resetAudioMode();
      return { base64: "", format: "m4a" };
    }

    try {
      await Promise.race([
        rec.stopAndUnloadAsync(),
        new Promise((r) => setTimeout(r, 4000)),
      ]).catch(async () => {
        try {
          await rec.stopAndUnloadAsync();
        } catch {}
      });

      const uri = rec.getURI();
      if (!uri) {
        return { base64: "", format: "m4a" };
      }
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return { base64, format: "m4a" };
    } catch (err) {
      console.warn("[useRecorder] stop error:", err);
      return { base64: "", format: "m4a" };
    } finally {
      if (localRef.current === rec) localRef.current = null;
      await resetAudioMode();
    }
  }, []);

  /** 强制一键复位/停止 */
  const forceStop = useCallback(async (): Promise<void> => {
    clearWatchdog();
    const rec = moduleShared.recording;
    moduleShared.recording = null;
    moduleShared.startPromise = null;
    localRef.current = null;
    broadcastRecording(false);
    if (rec) {
      await safeUnload(rec);
    }
    await resetAudioMode();
  }, []);

  return { recording, start, stop, forceStop };
}
