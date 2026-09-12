import {
  DataTable,
  StatusBadge,
  useHostNavigation,
  usePluginAction,
  usePluginData,
  type PluginPageProps,
  type PluginSidebarProps,
} from "@paperclipai/plugin-sdk/ui";
import { useCallback, useState, type CSSProperties, type ReactElement } from "react";

const tokens = {
  border: "var(--border, oklch(0.269 0 0))",
  card: "var(--card, oklch(0.205 0 0))",
  bg: "var(--background, oklch(0.145 0 0))",
  fg: "var(--foreground, oklch(0.985 0 0))",
  muted: "var(--muted-foreground, oklch(0.708 0 0))",
  primary: "var(--primary, oklch(0.985 0 0))",
  primaryFg: "var(--primary-foreground, oklch(0.205 0 0))",
};

const AUDIO_FORMATS = ["mp3", "wav", "m4a", "pcm", "flac", "ogg-opus"] as const;
type AudioFormat = (typeof AUDIO_FORMATS)[number];
type TranscriptionStatus = "pending" | "done" | "failed";

interface TranscriptionRow {
  id: string;
  transcription_key: string;
  provider: string;
  audio_format: string;
  audio_bytes: number;
  status: TranscriptionStatus;
  text: string;
  error: string;
  duration_ms: number;
  created_at: string;
}

const page: CSSProperties = { padding: "1.5rem", background: tokens.bg, color: tokens.fg, minHeight: "100%" };
const cardStyle: CSSProperties = {
  border: `1px solid ${tokens.border}`,
  background: tokens.card,
  borderRadius: "0.75rem",
  padding: "1rem",
  marginBottom: "0.75rem",
};
const inputStyle: CSSProperties = {
  border: `1px solid ${tokens.border}`,
  background: tokens.bg,
  color: tokens.fg,
  borderRadius: "0.5rem",
  padding: "0.4rem 0.6rem",
  marginRight: "0.5rem",
};
const btnStyle: CSSProperties = {
  border: "none",
  background: tokens.primary,
  color: tokens.primaryFg,
  borderRadius: "0.5rem",
  padding: "0.4rem 0.9rem",
  cursor: "pointer",
};

const SIDEBAR_ROW_CLASS =
  "flex items-center gap-2.5 mx-2 rounded-lg px-2 py-1.5 pointer-coarse:py-1 " +
  "text-(length:--text-compact) font-medium transition-colors no-underline " +
  "text-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

function statusKind(s: TranscriptionStatus): "ok" | "pending" | "error" {
  if (s === "done") return "ok";
  if (s === "failed") return "error";
  return "pending";
}

export function SidebarLink(_props: PluginSidebarProps): ReactElement {
  const nav = useHostNavigation();
  return (
    <a {...nav.linkProps("/voice")} className={SIDEBAR_ROW_CLASS}>
      <span data-slot="sidebar-nav-icon" className="relative shrink-0" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
      </span>
      <span className="min-w-0 flex-1 truncate">Voice</span>
    </a>
  );
}

/** Read a File as base64 (no data: prefix). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

export function VoicePage({ context }: PluginPageProps): ReactElement {
  const companyId = context.companyId ?? undefined;
  const { data, loading, error, refresh } = usePluginData<{ transcriptions: TranscriptionRow[] }>(
    "list-transcriptions",
    companyId ? { companyId } : undefined,
  );
  const createTranscription = usePluginAction("create-transcription");
  const [format, setFormat] = useState<AudioFormat>("mp3");
  const [fileName, setFileName] = useState("");
  const [audioBase64, setAudioBase64] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastText, setLastText] = useState<string | null>(null);

  const onFile = useCallback(async (file: File | undefined) => {
    setErr(null);
    setLastText(null);
    if (!file) return;
    try {
      const b64 = await fileToBase64(file);
      setAudioBase64(b64);
      setFileName(`${file.name} (${Math.round(file.size / 1024)} KB)`);
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext && (AUDIO_FORMATS as readonly string[]).includes(ext)) setFormat(ext as AudioFormat);
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    }
  }, []);

  const submit = useCallback(async () => {
    if (!companyId || !audioBase64) return;
    setBusy(true);
    setErr(null);
    setLastText(null);
    try {
      const res = (await createTranscription({ companyId, audioBase64, format })) as {
        transcription?: TranscriptionRow;
        error?: string;
      };
      if (res?.transcription?.status === "done") setLastText(res.transcription.text);
      else if (res?.error) setErr(res.error);
      setAudioBase64("");
      setFileName("");
      refresh();
    } catch (e) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [companyId, audioBase64, format, createTranscription, refresh]);

  if (!companyId) {
    return (
      <div style={page}>
        <p style={{ color: tokens.muted }}>Select a company to transcribe voice.</p>
      </div>
    );
  }

  return (
    <div style={page}>
      <h1 style={{ fontSize: "1.25rem", marginBottom: "0.25rem" }}>Voice</h1>
      <p style={{ color: tokens.muted, fontSize: "0.85rem", marginBottom: "1rem" }}>
        Speech-to-text via Tencent Cloud ASR (one-sentence recognition, ≤60s, ≤3MB).
      </p>

      <div style={cardStyle}>
        <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Transcribe audio</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
          <input
            type="file"
            accept="audio/*"
            style={{ ...inputStyle, padding: "0.3rem" }}
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <select style={inputStyle} value={format} onChange={(e) => setFormat(e.target.value as AudioFormat)}>
            {AUDIO_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <button style={btnStyle} disabled={busy || !audioBase64} onClick={submit}>
            {busy ? "Transcribing…" : "Transcribe"}
          </button>
        </div>
        {fileName && <div style={{ color: tokens.muted, fontSize: "0.8rem", marginTop: "0.5rem" }}>{fileName}</div>}
        {lastText !== null && (
          <div style={{ marginTop: "0.75rem", padding: "0.6rem", border: `1px solid ${tokens.border}`, borderRadius: "0.5rem" }}>
            <div style={{ fontSize: "0.72rem", color: tokens.muted, marginBottom: "0.25rem" }}>Recognized text</div>
            <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{lastText || "(empty)"}</div>
          </div>
        )}
        {err && <div style={{ color: tokens.muted, marginTop: "0.5rem" }}>{err}</div>}
        <div style={{ color: tokens.muted, fontSize: "0.75rem", marginTop: "0.5rem" }}>
          Tencent ASR keys are stored as secret refs by the operator config, never entered here.
        </div>
      </div>

      <DataTable
        loading={loading}
        emptyMessage={error ? `Failed: ${error.message}` : "No transcriptions yet."}
        rows={(data?.transcriptions ?? []) as unknown as Record<string, unknown>[]}
        columns={[
          {
            key: "text",
            header: "Text",
            render: (_v, row) => {
              const r = row as unknown as TranscriptionRow;
              return r.status === "failed" ? (
                <span style={{ color: tokens.muted }}>{r.error || "failed"}</span>
              ) : (
                <span>{r.text || "—"}</span>
              );
            },
          },
          { key: "audio_format", header: "Format", width: "90px" },
          {
            key: "audio_bytes",
            header: "Size",
            width: "90px",
            render: (v) => `${Math.round((Number(v) || 0) / 1024)} KB`,
          },
          { key: "duration_ms", header: "ms", width: "80px" },
          {
            key: "status",
            header: "Status",
            width: "100px",
            render: (_v, row) => {
              const st = (row as unknown as TranscriptionRow).status;
              return <StatusBadge label={st} status={statusKind(st)} />;
            },
          },
        ]}
      />
    </div>
  );
}
