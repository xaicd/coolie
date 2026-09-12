import { useCallback, useEffect, useRef, useState } from "react";
import { isAsrNotConfigured, type Company, type Issue } from "@coolie/api-client";
import { clearAuthToken, coolie, getAuthToken, saveAuthToken } from "./coolie";

/**
 * Coolie H5 (mobile web) skeleton on the shared @coolie/api-client:
 * connect with an agent API key -> pick company -> list/create tasks + voice
 * dispatch (MediaRecorder -> Tencent ASR -> task).
 */
export function App() {
  const [token, setToken] = useState<string | null>(getAuthToken());
  if (!token) return <SignIn onSignedIn={(t) => { saveAuthToken(t); setToken(t); }} />;
  return <Home onSignOut={() => { clearAuthToken(); setToken(null); }} />;
}

function SignIn({ onSignedIn }: { onSignedIn: (t: string) => void }) {
  const [key, setKey] = useState("");
  return (
    <main style={s.wrap}>
      <h1 style={s.h1}>Coolie</h1>
      <p style={s.muted}>Paste an agent API key to connect. Email/password session sign-in is also supported (see clients/README.md).</p>
      <input style={s.input} type="password" placeholder="Agent API key" value={key} onChange={(e) => setKey(e.target.value)} />
      <button style={s.btn} disabled={!key.trim()} onClick={() => onSignedIn(key.trim())}>Connect</button>
    </main>
  );
}

function Home({ onSignOut }: { onSignOut: () => void }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const loadIssues = useCallback(async (cid: string) => {
    try { setIssues(await coolie.listIssues(cid, { limit: 50 })); }
    catch (e) { alert(`Failed to load tasks: ${(e as Error).message}`); }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const list = await coolie.listCompanies();
        setCompanies(list);
        if (list[0]) { setCompanyId(list[0].id); await loadIssues(list[0].id); }
      } catch (e) { alert(`Failed to load companies: ${(e as Error).message}`); }
    })();
  }, [loadIssues]);

  const createTask = useCallback(async () => {
    if (!companyId || !title.trim()) return;
    setBusy(true);
    try { await coolie.createIssue({ companyId, title: title.trim() }); setTitle(""); await loadIssues(companyId); }
    catch (e) { alert(`Failed to create task: ${(e as Error).message}`); }
    finally { setBusy(false); }
  }, [companyId, title, loadIssues]);

  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => { const s = String(r.result ?? ""); const c = s.indexOf(","); resolve(c >= 0 ? s.slice(c + 1) : s); };
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });

  const toggleVoice = useCallback(async () => {
    if (!companyId) return;
    if (!recording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const rec = new MediaRecorder(stream);
        chunksRef.current = [];
        rec.ondataavailable = (e) => chunksRef.current.push(e.data);
        rec.start();
        recRef.current = rec;
        setRecording(true);
      } catch (e) { alert(`Mic error: ${(e as Error).message}`); }
      return;
    }
    // stop + dispatch
    const rec = recRef.current;
    if (!rec) return;
    setRecording(false);
    rec.stop();
    rec.stream.getTracks().forEach((t) => t.stop());
    await new Promise<void>((res) => { rec.onstop = () => res(); });
    setBusy(true);
    try {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const base64 = await blobToBase64(blob);
      // Browser MediaRecorder yields webm/ogg-opus; send ogg-opus.
      const res = await coolie.voiceDispatch({ companyId, audioBase64: base64, format: "ogg-opus" });
      if (res.issue) { alert(`Task created: ${res.issue.title}`); await loadIssues(companyId); }
      else alert(`Transcribed: ${res.transcription.text || "(empty)"}`);
    } catch (e) {
      if (isAsrNotConfigured(e)) alert("Voice not configured on this instance. Type the task instead.");
      else alert(`Voice dispatch failed: ${(e as Error).message}`);
    } finally { setBusy(false); }
  }, [companyId, recording, loadIssues]);

  return (
    <main style={s.wrap}>
      <div style={s.rowBetween}>
        <h1 style={s.h1}>Tasks</h1>
        <button style={s.link} onClick={onSignOut}>Sign out</button>
      </div>
      {companies.length > 1 && (
        <div style={s.chips}>
          {companies.map((c) => (
            <button key={c.id} style={{ ...s.chip, ...(companyId === c.id ? s.chipActive : {}) }}
              onClick={() => { setCompanyId(c.id); void loadIssues(c.id); }}>{c.name}</button>
          ))}
        </div>
      )}
      <div style={s.row}>
        <input style={s.input} placeholder="New task…" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button style={s.btn} disabled={!title.trim() || busy} onClick={createTask}>Add</button>
        <button style={{ ...s.btn, ...s.btnAlt }} disabled={busy} onClick={toggleVoice}>{recording ? "◼ Stop" : "🎤"}</button>
      </div>
      <ul style={s.list}>
        {issues.length === 0 && <li style={s.muted}>No tasks yet.</li>}
        {issues.map((i) => (
          <li key={i.id} style={s.task}>
            <div style={{ fontWeight: 500 }}>{i.title}</div>
            <div style={s.muted}>{i.status} · {i.priority}</div>
          </li>
        ))}
      </ul>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 560, margin: "0 auto", padding: 20, fontFamily: "system-ui, sans-serif", display: "flex", flexDirection: "column", gap: 12 },
  h1: { fontSize: 24, fontWeight: 700, margin: 0 },
  muted: { color: "#888", fontSize: 13 },
  link: { background: "none", border: "none", color: "#2563eb", fontWeight: 600, cursor: "pointer" },
  input: { flex: 1, border: "1px solid #ddd", borderRadius: 10, padding: "10px 12px", fontSize: 15 },
  btn: { background: "#111", color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 600, cursor: "pointer" },
  btnAlt: { background: "#2563eb" },
  row: { display: "flex", gap: 8, alignItems: "center" },
  rowBetween: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  chips: { display: "flex", gap: 8, flexWrap: "wrap" },
  chip: { border: "1px solid #ddd", borderRadius: 999, padding: "6px 12px", background: "#fff", cursor: "pointer" },
  chipActive: { background: "#111", color: "#fff", borderColor: "#111" },
  list: { listStyle: "none", padding: 0, margin: 0 },
  task: { borderBottom: "1px solid #eee", padding: "12px 0" },
};
