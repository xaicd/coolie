import { useCallback, useEffect, useRef, useState } from "react";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";

/**
 * Minimal voice recorder hook. Records to an m4a file and returns it as base64
 * so it can be sent to the Coolie multimodal transcription endpoint.
 *
 * ## Bug history
 *
 * - wave21 (初版): 没有 useEffect cleanup → 屏幕卸载时 native Recording 不释放, 下次
 *   createAsync 抛 "Only one Recording object can be prepared at a given time"。
 * - wave74 (boss 26:36 OOB 「录音bug」): 多次按 mic 同样炸。根因是 start() 异步,
 *   用户连按时两次都跑进 createAsync, 第二个实例被 native 拒。
 *
 * ## 修法
 *
 * A. **Module-level singleton** (moduleShared): expo-av Audio.Recording 一次只允许
 *    一个实例 prepared, 但同一个 hook 会被 BoardChatScreen / VoiceInputButton /
 *    useVoiceInput 三处调用, 各有各自的 useState 副本会让第二处 start() 撞第一处。
 *    改成模块级 mutex + 单例 ref, 三处共享同一份 native Recording。
 * B. **useEffect cleanup**: 卸载时如果还在录 → 静默 unload + 把 audio mode 复位。
 * C. **start() 异常路径**: try/catch 包 setAudioModeAsync + createAsync, 失败立刻
 *    复位 audio mode + 清 ref, 下一次按下不会被「上一次半成品」阻塞。
 * D. **stop() 异常路径**: Promise.race 一个 5s 超时, 失败时 force unload, finally
 *    清 ref + 复位 audio mode, 释放 iOS audio session。
 * E. **并发 start() 防护**: startPromise 单例, 第二次调用复用同一个 promise 而不是
 *    再开一个新录音。
 *
 * NOTE: skeleton. Tencent one-sentence recognition expects <= 60s, <= 3MB.
 * Enforce/trim before dispatch in a real build.
 */

// ----- Module-level singleton (shared by every useRecorder() caller) -----
// expo-av Audio.Recording is a native single-instance resource; the old per-hook
// ref lets two screens race to createAsync. Centralize at module scope so any
// caller is observing the same native object and the same "is recording" state.

type ModuleShared = {
  recording: Audio.Recording | null;
  // 正在跑的 start(): 第二次按 mic 直接复用同一个 promise, 避免竞态。
  startPromise: Promise<Audio.Recording> | null;
};

const moduleShared: ModuleShared = {
  recording: null,
  startPromise: null,
};

// 只在有调用者挂载时才需要 reset iOS audio session —— 用 refcount 计数,
// 全部卸载再真正复位, 否则单页面切换会让下一个页面拿不到录音权限。
let mountRefCount = 0;

async function safeUnload(rec: Audio.Recording | null): Promise<void> {
  if (!rec) return;
  try {
    // Android 上 stopAndUnloadAsync 偶发挂起: race 一个 5s 超时, 超时强制再 unload 一次
    // (第二次通常立即返回, 因为 native 已经在第一次试图 unload)
    await Promise.race([
      rec.stopAndUnloadAsync(),
      new Promise((r) => setTimeout(r, 5000)),
    ]).catch(async () => {
      try {
        await rec.stopAndUnloadAsync();
      } catch {
        /* 已经 unload */
      }
    });
  } catch {
    // 已经 unload / native 状态错乱 → 忽略, 下一次 createAsync 会重建
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
  // 保留本地 ref 用于 unmount cleanup 强制 unload (即使 module ref 已被别人覆盖)。
  const localRef = useRef<Audio.Recording | null>(null);

  useEffect(() => {
    mountRefCount += 1;
    return () => {
      mountRefCount -= 1;
      // 只有这个 hook 实例对应的 recording 还活着才需要 unload (避免别人复用中的实例被卸)。
      if (localRef.current && moduleShared.recording === localRef.current) {
        const rec = localRef.current;
        moduleShared.recording = null;
        moduleShared.startPromise = null;
        localRef.current = null;
        setRecording(false);
        // fire-and-forget: cleanup 路径不能 await, 否则卸载阻塞
        void safeUnload(rec).then(() => {
          if (mountRefCount === 0) void resetAudioMode();
        });
      } else if (mountRefCount === 0) {
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
        // 上一次 start() 失败: 清掉, 重新走一遍
        moduleShared.startPromise = null;
      }
    }

    const p = (async () => {
      // 2) 已经有 active recording (来自其他组件 / 早一次调用) → 先 unload 它
      //    (理论上 start 的并发保护应该挡住这一路径, 但保留作为防御)
      if (moduleShared.recording) {
        await safeUnload(moduleShared.recording);
        moduleShared.recording = null;
      }

      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) throw new Error("Microphone permission denied");
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
        // setAudioModeAsync 已开 iOS 录音 session, 失败要把 session 关回去,
        // 否则下一个 start() 会卡在 iOS audio session 锁上。
        await resetAudioMode();
        throw e;
      }

      moduleShared.recording = rec;
      localRef.current = rec;
      setRecording(true);
      return rec;
    })();

    moduleShared.startPromise = p;
    try {
      await p;
    } finally {
      // 成功 / 失败都清掉 startPromise, 让下一次 start() 重新走完整流程
      // (失败时已经在 catch 里清过一次, 但这里 finally 再清一次防御).
      if (moduleShared.startPromise === p) {
        moduleShared.startPromise = null;
      }
    }
  }, []);

  /** Stop and return { base64, format }. */
  const stop = useCallback(async (): Promise<{ base64: string; format: "m4a" }> => {
    const rec = moduleShared.recording;
    if (!rec) throw new Error("Not recording");

    // 立即清模块状态 + state, 让 UI 立刻退出录音态
    moduleShared.recording = null;
    moduleShared.startPromise = null;
    setRecording(false);

    try {
      // Android 上 stopAndUnloadAsync 偶发挂起: race 一个 5s 超时, 超时强制 unload
      await Promise.race([
        rec.stopAndUnloadAsync(),
        new Promise((r) => setTimeout(r, 5000)),
      ]).catch(async () => {
        try {
          await rec.stopAndUnloadAsync();
        } catch {
          /* 已经 unload */
        }
      });

      const uri = rec.getURI();
      if (!uri) throw new Error("No recording URI");
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return { base64, format: "m4a" };
    } finally {
      // 不管 stop 成功 / 失败 / 抛错, 都复位 audio session, 释放 iOS 锁
      if (localRef.current === rec) localRef.current = null;
      await resetAudioMode();
    }
  }, []);

  return { recording, start, stop };
}
