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
import {
  isAsrNotConfigured,
  type Company,
  type Issue,
  type IssuePriority,
} from "@coolie/api-client";
import {
  classifyToken,
  coolie,
  credentialCompanies,
  restoreCredential,
  saveAuthToken,
  signInWithEmail,
  signOutEverywhere,
  type Credential,
} from "./src/coolie";
import { useRecorder } from "./src/useRecorder";

/**
 * Coolie mobile client.
 *
 * Sign in with an email and password (a session), or paste a bearer key for
 * scripted and agent use — the two are deliberately different affordances,
 * because a person who is handed this app is not going to paste a key.
 *
 * Which companies you then see differs by credential and is not a preference: a
 * session sees its memberships, a board key the same, an agent key exactly one
 * company it cannot even list. So the company is resolved rather than configured
 * (see `credentialCompanies`), and zero-company accounts are told so plainly.
 *
 * Still no navigation library: the screen is chosen from state, so there is no
 * back stack and no deep linking — a real limitation, kept small until a router
 * earns its place.
 */
export default function App() {
  const [credential, setCredential] = useState<Credential | null | undefined>(undefined);

  useEffect(() => {
    void restoreCredential().then(setCredential);
  }, []);

  const signOut = useCallback(() => {
    void signOutEverywhere().then(() => setCredential(null));
  }, []);

  if (credential === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  return credential ? (
    <CompanyGate credential={credential} onSignOut={signOut} />
  ) : (
    <SignInScreen onSignedIn={setCredential} />
  );
}

function whoamiFor(credential: Credential): string {
  if (credential.kind === "agent") return `${credential.identity.name} · agent key`;
  if (credential.kind === "board") return "board key";
  return credential.user.name ?? credential.user.email ?? "signed in";
}

/**
 * Resolve the company to work in before showing the board: auto-enter the one
 * company, ask when there are several, and explain the empty case — an account
 * with no membership is a real state here, not an error.
 */
function CompanyGate({
  credential,
  onSignOut,
}: {
  credential: Credential;
  onSignOut: () => void;
}) {
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Company | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const list = await credentialCompanies(credential);
        setCompanies(list);
        if (list.length === 1) setChosen(list[0]);
      } catch (e) {
        setError(String((e as Error)?.message ?? e));
        setCompanies([]);
      }
    })();
  }, [credential]);

  if (chosen) {
    return (
      <HomeScreen
        company={chosen}
        whoami={whoamiFor(credential)}
        onSignOut={onSignOut}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <StatusBar style="auto" />
      <View style={styles.rowBetween}>
        <Text style={styles.h1}>Coolie</Text>
        <Pressable onPress={onSignOut}>
          <Text style={styles.link}>Sign out</Text>
        </Pressable>
      </View>

      {companies === null ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : error !== null ? (
        <Text style={styles.error}>{error}</Text>
      ) : companies.length === 0 ? (
        <Text style={styles.muted}>
          {whoamiFor(credential)} is not a member of any company on this instance. An
          administrator can add the account to one in the board, under the company's
          people. Nothing is wrong with the app or your sign-in.
        </Text>
      ) : (
        <>
          <Text style={styles.muted}>Choose a company to work in.</Text>
          {companies.map((company) => (
            <Pressable
              key={company.id}
              style={styles.taskRow}
              onPress={() => setChosen(company)}
            >
              <Text style={styles.taskTitle}>{company.name}</Text>
              <Text style={styles.muted}>{company.id}</Text>
            </Pressable>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function SignInScreen({ onSignedIn }: { onSignedIn: (credential: Credential) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [useToken, setUseToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (useToken) {
        // Prove the key before storing it. Storing first and failing later shows
        // up as an empty task list, which reads as "no data" rather than "bad key".
        const candidate = token.trim();
        const credential = await classifyToken(candidate);
        await saveAuthToken(candidate);
        onSignedIn(credential);
      } else {
        const user = await signInWithEmail({ email: email.trim(), password });
        onSignedIn({ kind: "session", user });
      }
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [useToken, token, email, password, onSignedIn]);

  const ready = useToken
    ? token.trim().length > 0
    : email.trim().length > 0 && password.length > 0;

  return (
    <View style={styles.screen}>
      <StatusBar style="auto" />
      <Text style={styles.h1}>Coolie</Text>

      {useToken ? (
        <>
          <Text style={styles.muted}>
            Paste an agent API key, or a board API key. The app works out which one it
            is: an agent key is scoped to a single company, a board key sees the
            companies its owner belongs to.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="API key"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            value={token}
            onChangeText={setToken}
          />
        </>
      ) : (
        <>
          <Text style={styles.muted}>
            Sign in with your account on this instance. Which companies you can reach
            is decided by that account's memberships.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Email"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            secureTextEntry
            textContentType="password"
            value={password}
            onChangeText={setPassword}
          />
        </>
      )}

      {error !== null && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.btn, (!ready || busy) && styles.btnDisabled]}
        disabled={!ready || busy}
        onPress={submit}
      >
        <Text style={styles.btnText}>
          {busy ? "Checking…" : useToken ? "Connect" : "Sign in"}
        </Text>
      </Pressable>

      <Pressable onPress={() => { setUseToken(!useToken); setError(null); }}>
        <Text style={styles.link}>
          {useToken ? "Use email and password instead" : "Use an API key instead"}
        </Text>
      </Pressable>
    </View>
  );
}

function HomeScreen({
  company,
  whoami,
  onSignOut,
}: {
  company: Company;
  whoami: string;
  onSignOut: () => void;
}) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selected, setSelected] = useState<Issue | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<IssuePriority>("medium");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const { recording, start, stop } = useRecorder();

  const companyId = company.id;

  const loadIssues = useCallback(async () => {
    setLoading(true);
    try {
      setIssues(await coolie.listIssues(companyId, { limit: 50 }));
    } catch (e) {
      Alert.alert("Failed to load tasks", String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void loadIssues();
  }, [loadIssues]);

  const createTask = useCallback(async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await coolie.createIssue({
        companyId,
        title: title.trim(),
        priority,
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      setTitle("");
      setDescription("");
      setPriority("medium");
      await loadIssues();
    } catch (e) {
      Alert.alert("Failed to create task", String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [companyId, title, description, priority, loadIssues]);

  const voiceDispatch = useCallback(async () => {
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
        Alert.alert(
          "Voice not configured",
          "This instance has no Tencent ASR credentials for the company yet. Type the task instead.",
        );
      } else {
        Alert.alert("Voice dispatch failed", String((e as Error)?.message ?? e));
      }
    } finally {
      setBusy(false);
    }
  }, [companyId, recording, start, stop, loadIssues]);

  if (selected) {
    return <TaskDetail issue={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <StatusBar style="auto" />
      <View style={styles.rowBetween}>
        <View>
          <Text style={styles.h1}>Tasks</Text>
          <Text style={styles.muted}>
            {company.name} · {whoami}
          </Text>
        </View>
        <Pressable onPress={onSignOut}>
          <Text style={styles.link}>Sign out</Text>
        </Pressable>
      </View>

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="New task…"
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          placeholder="Description (optional)"
          multiline
          value={description}
          onChangeText={setDescription}
        />
        <View style={styles.chips}>
          {(["low", "medium", "high"] as IssuePriority[]).map((p) => (
            <Pressable
              key={p}
              onPress={() => setPriority(p)}
              style={[styles.chip, priority === p && styles.chipActive]}
            >
              <Text style={priority === p ? styles.chipTextActive : styles.chipText}>{p}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.rowGap}>
          <Pressable
            style={[styles.btn, (!title.trim() || busy) && styles.btnDisabled]}
            disabled={!title.trim() || busy}
            onPress={createTask}
          >
            <Text style={styles.btnText}>Add</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, styles.btnAlt, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={voiceDispatch}
          >
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
            <Pressable style={styles.taskRow} onPress={() => setSelected(item)}>
              <Text style={styles.taskTitle}>{item.title}</Text>
              <Text style={styles.muted}>
                {item.status} · {item.priority}
              </Text>
            </Pressable>
          )}
        />
      )}
    </ScrollView>
  );
}

function TaskDetail({ issue, onBack }: { issue: Issue; onBack: () => void }) {
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <StatusBar style="auto" />
      <Pressable onPress={onBack}>
        <Text style={styles.link}>‹ Back</Text>
      </Pressable>
      <Text style={styles.h1}>{issue.title}</Text>
      <View style={styles.detailRows}>
        <DetailRow label="Status" value={issue.status} />
        <DetailRow label="Priority" value={issue.priority} />
        {issue.description ? <DetailRow label="Description" value={issue.description} /> : null}
        <DetailRow label="ID" value={issue.id} />
      </View>
    </ScrollView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  screen: { padding: 20, paddingTop: 64, gap: 12 },
  h1: { fontSize: 24, fontWeight: "700" },
  muted: { color: "#888", fontSize: 13 },
  error: { color: "#b91c1c", fontSize: 13 },
  link: { color: "#2563eb", fontWeight: "600" },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12, fontSize: 15 },
  inputMultiline: { minHeight: 64, textAlignVertical: "top" },
  btn: { backgroundColor: "#111", borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, alignItems: "center" },
  btnAlt: { backgroundColor: "#2563eb" },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: "#fff", fontWeight: "600" },
  composer: { gap: 8 },
  rowGap: { flexDirection: "row", gap: 8 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chips: { flexGrow: 0, flexDirection: "row" },
  chip: { borderWidth: 1, borderColor: "#ddd", borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, marginRight: 8 },
  chipActive: { backgroundColor: "#111", borderColor: "#111" },
  chipText: { color: "#111" },
  chipTextActive: { color: "#fff" },
  taskRow: { borderBottomWidth: 1, borderBottomColor: "#eee", paddingVertical: 12 },
  taskTitle: { fontSize: 15, fontWeight: "500" },
  detailRows: { gap: 10, marginTop: 4 },
  detailRow: { gap: 2 },
  detailValue: { fontSize: 15 },
});
