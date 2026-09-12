import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { isAsrNotConfigured, type Company, type Issue } from "@coolie/api-client";
import { clearAuthToken, coolie, getAuthToken, saveAuthToken } from "./src/coolie";
import { useRecorder } from "./src/useRecorder";

/**
 * Coolie mobile skeleton: sign in (bearer token) -> pick company -> list tasks,
 * create a task, and voice-dispatch (record -> ASR -> task).
 * Screens are intentionally minimal; wire real navigation/styling per product.
 */
export default function App() {
  const [token, setToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    void getAuthToken().then(setToken);
  }, []);

  if (token === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  return token ? (
    <HomeScreen onSignOut={() => { void clearAuthToken().then(() => setToken(null)); }} />
  ) : (
    <SignInScreen onSignedIn={(t) => setToken(t)} />
  );
}

function SignInScreen({ onSignedIn }: { onSignedIn: (token: string) => void }) {
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    setBusy(true);
    try {
      await saveAuthToken(apiKey.trim());
      onSignedIn(apiKey.trim());
    } finally {
      setBusy(false);
    }
  }, [apiKey, onSignedIn]);

  return (
    <View style={styles.screen}>
      <StatusBar style="auto" />
      <Text style={styles.h1}>Coolie</Text>
      <Text style={styles.muted}>
        Paste an agent API key to connect. (Session sign-in with email/password is also
        supported by the API — see clients/README.md.)
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Agent API key (Bearer)"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        value={apiKey}
        onChangeText={setApiKey}
      />
      <Pressable style={[styles.btn, (!apiKey.trim() || busy) && styles.btnDisabled]} disabled={!apiKey.trim() || busy} onPress={submit}>
        <Text style={styles.btnText}>{busy ? "…" : "Connect"}</Text>
      </Pressable>
    </View>
  );
}

function HomeScreen({ onSignOut }: { onSignOut: () => void }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const { recording, start, stop } = useRecorder();

  const loadCompanies = useCallback(async () => {
    try {
      const list = await coolie.listCompanies();
      setCompanies(list);
      if (list[0] && !companyId) setCompanyId(list[0].id);
    } catch (e) {
      Alert.alert("Failed to load companies", String((e as Error)?.message ?? e));
    }
  }, [companyId]);

  const loadIssues = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      setIssues(await coolie.listIssues(companyId, { limit: 50 }));
    } catch (e) {
      Alert.alert("Failed to load tasks", String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void loadCompanies(); }, [loadCompanies]);
  useEffect(() => { void loadIssues(); }, [loadIssues]);

  const createTask = useCallback(async () => {
    if (!companyId || !title.trim()) return;
    setBusy(true);
    try {
      await coolie.createIssue({ companyId, title: title.trim() });
      setTitle("");
      await loadIssues();
    } catch (e) {
      Alert.alert("Failed to create task", String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [companyId, title, loadIssues]);

  const voiceDispatch = useCallback(async () => {
    if (!companyId) return;
    try {
      if (!recording) {
        await start();
        return;
      }
      const { base64, format } = await stop();
      setBusy(true);
      const res = await coolie.voiceDispatch({ companyId, audioBase64: base64, format });
      if (res.issue) Alert.alert("Task created", res.issue.title);
      else Alert.alert("Transcribed", res.transcription.text || "(empty)");
      await loadIssues();
    } catch (e) {
      if (isAsrNotConfigured(e)) {
        Alert.alert("Voice not configured", "Tencent ASR is not set up on this instance. Type the task instead.");
      } else {
        Alert.alert("Voice dispatch failed", String((e as Error)?.message ?? e));
      }
    } finally {
      setBusy(false);
    }
  }, [companyId, recording, start, stop, loadIssues]);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <StatusBar style="auto" />
      <View style={styles.rowBetween}>
        <Text style={styles.h1}>Tasks</Text>
        <Pressable onPress={onSignOut}><Text style={styles.link}>Sign out</Text></Pressable>
      </View>

      {companies.length > 1 && (
        <ScrollView horizontal style={styles.chips} showsHorizontalScrollIndicator={false}>
          {companies.map((c) => (
            <Pressable key={c.id} onPress={() => setCompanyId(c.id)} style={[styles.chip, companyId === c.id && styles.chipActive]}>
              <Text style={companyId === c.id ? styles.chipTextActive : styles.chipText}>{c.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View style={styles.composer}>
        <TextInput style={styles.input} placeholder="New task…" value={title} onChangeText={setTitle} />
        <View style={styles.rowGap}>
          <Pressable style={[styles.btn, (!title.trim() || busy) && styles.btnDisabled]} disabled={!title.trim() || busy} onPress={createTask}>
            <Text style={styles.btnText}>Add</Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.btnAlt, busy && styles.btnDisabled]} disabled={busy} onPress={voiceDispatch}>
            <Text style={styles.btnText}>{recording ? "◼ Stop & dispatch" : "🎤 Voice task"}</Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          scrollEnabled={false}
          data={issues}
          keyExtractor={(i) => i.id}
          ListEmptyComponent={<Text style={styles.muted}>No tasks yet.</Text>}
          renderItem={({ item }) => (
            <View style={styles.taskRow}>
              <Text style={styles.taskTitle}>{item.title}</Text>
              <Text style={styles.muted}>{item.status} · {item.priority}</Text>
            </View>
          )}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  screen: { padding: 20, paddingTop: 64, gap: 12 },
  h1: { fontSize: 24, fontWeight: "700" },
  muted: { color: "#888", fontSize: 13 },
  link: { color: "#2563eb", fontWeight: "600" },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12, fontSize: 15 },
  btn: { backgroundColor: "#111", borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, alignItems: "center" },
  btnAlt: { backgroundColor: "#2563eb" },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: "#fff", fontWeight: "600" },
  composer: { gap: 8 },
  rowGap: { flexDirection: "row", gap: 8 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chips: { flexGrow: 0 },
  chip: { borderWidth: 1, borderColor: "#ddd", borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, marginRight: 8 },
  chipActive: { backgroundColor: "#111", borderColor: "#111" },
  chipText: { color: "#111" },
  chipTextActive: { color: "#fff" },
  taskRow: { borderBottomWidth: 1, borderBottomColor: "#eee", paddingVertical: 12 },
  taskTitle: { fontSize: 15, fontWeight: "500" },
});
