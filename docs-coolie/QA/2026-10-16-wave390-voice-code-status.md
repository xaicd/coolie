# wave390 — v0.6.60 工坊语音代码真实状态核查报告 (只查不改)

> 波次: wave390  
> 执行员工: 铁匠贰号 (forge-ii-core-swe)  
> 角色代码: forge-ii-core-swe  
> 底层引擎: cmd  
> 日期: 2026-10-16  
> 仓库: /Users/mac/workspace/xaicd/coolie @ main (映射至 /host-workspace/xaicd/coolie)  
> 调度令任务: 老板拍 'v0.6.60 工坊语音还是不行' = 单任务: 找 v0.6.60 voice 真实代码状态, 不要修。  
> 规则遵守: 只查不改、不调 sub-agent、不 reset --hard、保持工作区 0 dirty。

---

## 0. 核心结论摘要 (一句话核查结论)

**代码在仓库中确实改了，但 v0.6.60 发版制品与后续 wave389 关键补丁存在“已提交但未发版”的时间差**：
1. **服务端 Tencent ASR (`packages/plugins/plugin-multimodal/src/asr/tencent.ts`)**：`VoiceFormat` 已在 wave388 (`4d83f2312b`) 改为 `string`，已合入 tag `v0.6.60`，且生产服务端 (`tc-coolie-claw`) 已热加载生效；注意指令中提及的 `server/src/asr/tencent.ts` 在仓库中不存在（真实路径在 multimodal 插件中）。
2. **客户端录音器 (`clients/expo/src/useRecorder.ts`)**：`stop()` 方法已改，已支持返回 `{ base64, format, uri }`，已合入 tag `v0.6.60`。
3. **客户端录音兜底 (`clients/expo/src/services/voiceDraft.ts`)**：已新增并实现 `preserveVoiceRecording`（转写失败保住本地 m4a），已合入 tag `v0.6.60`。
4. **老板在 v0.6.60 手机上依然反馈“还是不行”的真因**：
   - v0.6.60 发版（commit `bb187541af`）时，`BoardChatScreen.tsx` 缺少录音超时防御与强提示横幅。若长按未采集到声音或权限静默拒绝，只推了一条易被忽略的聊天气泡，老板体感“按了没反应”；
   - 随后的修复波次 wave389（commit `4dc3f4e2d8`）针对该问题补充了 `withVoiceTimeout(8000)` 死锁硬超时与 `voiceError` 红色持久横幅，**但 commit `4dc3f4e2d8` 产生于 v0.6.60 发版之后，至今尚未打包打 tag 发版（手机仍运行 v0.6.60 旧 bundle）**。

---

## 1. 第一步：Voice 真文件路径寻址结果 (只读探测)

根据调度令要求，在宿主机 `/Users/mac/workspace/xaicd/coolie`（容器挂载点 `/host-workspace/xaicd/coolie`）执行真实文件寻址：

| 查询模式 | 实际物理文件路径 | 状态与说明 |
|---|---|---|
| `tencent*.ts` | `packages/plugins/plugin-multimodal/src/asr/tencent.ts` | **存在**。注意：`server/src/asr/` 下无此文件，历史 Git 树亦从未有过该路径 |
| `useRecorder*` | `clients/expo/src/useRecorder.ts` | **存在**。Expo 移动端录音核心 Hook |
| `voiceDraft*` | `clients/expo/src/services/voiceDraft.ts` | **存在**。wave388 新增的本地音频兜底草稿服务 |
| `*asr*` | `packages/plugins/plugin-multimodal/src/asr/` (含 `tencent.ts`) | **存在**。多模态插件的 ASR 模块目录 |

---

## 2. 第二步：v0.6.60 Voice 代码当前状态核查 (逐项确认)

### 2.1 检查 Tencent ASR (`packages/plugins/plugin-multimodal/src/asr/tencent.ts`)
> 对应检查指令: `cat server/src/asr/tencent.ts (看 VoiceFormat 改没改)`

- **路径澄清**：`server/src/asr/tencent.ts` 不存在；真实业务文件位于 `packages/plugins/plugin-multimodal/src/asr/tencent.ts`。
- **VoiceFormat 类型**：
  ```typescript
  export interface TencentSentencePayload {
    EngSerViceType: string;
    SourceType: number;
    VoiceFormat: string; // ✅ 已改为 string，此前曾为 number
    Data: string;
    DataLen: number;
  }
  ```
- **枚举与映射实现**：
  ```typescript
  export const TENCENT_VOICE_FORMAT_MAP: Record<string, string> = {
    wav: "wav",
    pcm: "pcm",
    spx: "speex",
    speex: "speex",
    silk: "silk",
    mp3: "mp3",
    aac: "aac",
    m4a: "m4a", // ✅ 映射为字符串 "m4a"
    opus: "ogg-opus",
    amr: "amr",
  };

  export function resolveTencentVoiceFormat(format: string | number): string {
    // ✅ 返回值为 string
    ...
  }
  ```
- **结论**：**VoiceFormat 已经改了**。在 commit `4d83f2312b` (wave388) 中已完成修复，并在 tag `v0.6.60` 中完全生效。

---

### 2.2 检查 useRecorder (`clients/expo/src/useRecorder.ts`)
> 对应检查指令: `cat clients/expo/src/useRecorder.ts (看 stop() 改没改)`

- **stop() 函数签名与实现**：
  ```typescript
  /**
   * Stop and return { base64, format, uri }.
   *
   * `uri` is the on-disk m4a the recorder produced. It is handed back so the
   * caller can preserve the audio (copy it out of the transient cache) when a
   * transcription attempt fails, instead of silently losing the recording.
   */
  const stop = useCallback(async (): Promise<{ base64: string; format: "m4a"; uri: string | null }> => {
    ...
    let uri: string | null = null;
    try {
      await Promise.race([
        rec.stopAndUnloadAsync(),
        new Promise((r) => setTimeout(r, 3000)),
      ]).catch((err) => {
        console.warn("[useRecorder] stopAndUnloadAsync warning:", err);
      });

      uri = rec.getURI();
      if (!uri) {
        console.warn("[useRecorder] rec.getURI() is null");
        return { base64: "", format: "m4a", uri: null };
      }

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      return { base64: base64 ?? "", format: "m4a", uri };
    } catch (err) {
      console.warn("[useRecorder] stop read error:", err);
      return { base64: "", format: "m4a", uri };
    } finally {
      if (localRef.current === rec) localRef.current = null;
      await resetAudioMode();
    }
  }, []);
  ```
- **结论**：**stop() 已经改了**。返回对象由原先的 `{ base64, format }` 升级为 `{ base64, format, uri }`，使得调用方可以获取物理音频文件路径用于持久化缓存。

---

### 2.3 检查 voiceDraft (`clients/expo/src/services/voiceDraft.ts`)
> 对应检查指令: `cat clients/expo/src/services/voiceDraft.ts (看兜底改没改)`

- **兜底函数实现**：
  ```typescript
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
      return { uri: sourceUri, name, mimeType: MIME_M4A };
    }
  }
  ```
- **结论**：**兜底已经改了 / 已落地**。该文件已存在并导出 `preserveVoiceRecording`，在转写失败时会将缓存文件无损拷贝至 `documentDirectory/voice-drafts/`。

---

## 3. Git 版本与时间线关键对齐 (为什么老板测试 v0.6.60 会感到不行)

通过 Git 提交拓扑分析，可以清晰还原状态：

```
[4d83f2312b] wave388: 修复 VoiceFormat 为 string + stop() 增补 uri + 新增 voiceDraft.ts
     │
[bb187541af] (tag: v0.6.60, 2026-10-16 12:10:15) 打包发布 v0.6.60 APK / OTA
     │   └─ 老板手机安装此版本，但在工坊实测时出现录音无提示、单例死锁或未采到声音
     │
[4dc3f4e2d8] wave389: 修复工坊录音 8s 硬超时死锁 + 增加红色常驻 voiceErrorBar 横幅 (13:53:20)
     │   └─ 此提交在 main 分支上，但【从未打 tag、从未打包发布】
     │
[HEAD @ main] 包含 wave389 代码，但尚未推送到老板手机端
```

### 对比清单

| 关注维度 | v0.6.60 交付物 (tag: v0.6.60) | 当前 main (含 wave389) | 老板当前手机端状态 |
|---|---|---|---|
| ASR 服务端 VoiceFormat | string ✅ (已部署) | string ✅ | 服务端正常识别 |
| useRecorder.stop() 返回 uri | 是 ✅ | 是 ✅ | 客户端具备 |
| voiceDraft 兜底 | 是 ✅ | 是 ✅ | 客户端具备 |
| 录音启动/停止 8s 硬超时 | ❌ 无 (易死锁) | ✅ 有 (`withVoiceTimeout`) | **手机端无此超时保护** |
| 语音失败常驻错误横幅 | ❌ 无 (仅易被忽略的提示) | ✅ 有 (`voiceErrorBar`) | **手机端无此横幅** |
| 当前发版状态 | 已发版 (v0.6.60) | **未发版 (未包含在 0.6.60 中)** | 跑的是发版前的旧 bundle |

---

## 4. 纪律与操作自查

1. **只查不改**：本波次未修改任何应用或服务代码，仅执行查验并生成此报告。
2. **工作树干净**：未执行 `git reset --hard`，未残留任何临时文件。
3. **无 Sub-Agent 调用**：全过程由【铁匠贰号】直接执行完成。
