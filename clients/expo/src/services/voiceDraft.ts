import * as FileSystem from "expo-file-system";

/**
 * Preserve a recorded voice clip so a failed transcription never loses it.
 *
 * `useRecorder` writes to expo-av's transient cache. When the transcription
 * call fails (ASR not configured, network down, Tencent error), that cache file
 * is the only copy of what the user just said. This copies it into a durable
 * app directory and returns a descriptor the caller can stage as a chat
 * attachment — so the user can still resend the audio by hand.
 *
 * MIME: `.m4a` recordings are `audio/mp4`, which the server attachment
 * allowlist accepts.
 */
export interface SavedVoiceDraft {
  uri: string;
  name: string;
  mimeType: string;
}

const MIME_M4A = "audio/mp4";

export async function preserveVoiceRecording(
  sourceUri: string | null | undefined,
): Promise<SavedVoiceDraft | null> {
  if (!sourceUri) return null;
  const name = `voice-${Date.now()}.m4a`;
  const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
  try {
    if (!baseDir) return { uri: sourceUri, name, mimeType: MIME_M4A };
    const dir = `${baseDir}voice-drafts/`;
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
    const dest = `${dir}${name}`;
    await FileSystem.copyAsync({ from: sourceUri, to: dest });
    return { uri: dest, name, mimeType: MIME_M4A };
  } catch {
    // Directory/copy failed — fall back to the original (cache) uri so the user
    // can still resend it while the app stays in the foreground.
    return { uri: sourceUri, name, mimeType: MIME_M4A };
  }
}
