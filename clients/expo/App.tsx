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
import { DashboardScreen } from "./src/screens/DashboardScreen";

/**
 * Coolie mobile client — 品牌版界面。
 *
 * 深靛蓝品牌底 + 亮青强调色(与 App 图标同源),卡片式布局、中文文案。
 * 凭据流程与数据层不变:邮箱会话或粘贴 API key,公司按成员关系解析
 * (见 `credentialCompanies`),零公司账号会得到明确说明。
 * 仍无导航库:屏幕由状态决定,没有返回栈与深链——刻意保持轻量。
 */

// ── 品牌色板(与图标一致的靛蓝→亮青体系) ────────────────────────────
const C = {
  bg: "#0B1023",        // 页面深底
  card: "#151B36",      // 卡片
  cardHi: "#1B2347",    // 卡片高亮/输入框
  line: "#27305C",      // 分隔线
  ink: "#EEF2FF",       // 主文字
  inkDim: "#8A93B8",    // 次文字
  accent: "#22D3EE",    // 亮青(按钮/激活)
  accentDeep: "#0E7490",
  danger: "#F87171",
  ok: "#34D399",
  warn: "#FBBF24",
} as const;

const PRIORITY_LABEL: Record<IssuePriority, string> = {
  low: "低", medium: "中", high: "高", critical: "紧急",
};
const PRIORITY_COLOR: Record<IssuePriority, string> = {
  low: C.inkDim, medium: C.accent, high: C.warn, critical: C.danger,
};
const STATUS_LABEL: Record<string, string> = {
  open: "待处理", in_progress: "进行中", blocked: "受阻", done: "已完成",
};
const STATUS_COLOR: Record<string, string> = {
  open: C.inkDim, in_progress: C.accent, blocked: C.danger, done: C.ok,
};

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
      <View style={[styles.center, { backgroundColor: C.bg }]}>
        <ActivityIndicator color={C.accent} />
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
  if (credential.kind === "agent") return `${credential.identity.name} · 智能体`;
  if (credential.kind === "board") return "管理密钥";
  return credential.user.name ?? credential.user.email ?? "已登录";
}

/**
 * 解析要进入的公司:只有一个就自动进入,多个让用户选,零公司给出解释
 * ——零公司是真实状态而不是错误。
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
    <Surface>
      <View style={styles.rowBetween}>
        <Text style={styles.h1}>Coolie</Text>
        <Pressable onPress={onSignOut} hitSlop={12}>
          <Text style={styles.link}>退出</Text>
        </Pressable>
      </View>

      {companies === null ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: 24 }} />
      ) : error !== null ? (
        <Text style={styles.error}>{error}</Text>
      ) : companies.length === 0 ? (
        <Text style={styles.muted}>
          {whoamiFor(credential)} 还不是任何公司的成员。请管理员在后台把账号加入公司。
        </Text>
      ) : (
        <>
          <Text style={styles.muted}>选择要进入的公司</Text>
          {companies.map((company) => (
            <Pressable
              key={company.id}
              style={styles.cardBtn}
              onPress={() => setChosen(company)}
            >
              <Text style={styles.cardBtnTitle}>{company.name}</Text>
            </Pressable>
          ))}
        </>
      )}
    </Surface>
  );
}

function Surface({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView style={{ backgroundColor: C.bg, flex: 1 }} contentContainerStyle={styles.screen}>
      <StatusBar style="light" />
      {children}
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
        // 先验证 key 再存储。先存后失败会表现为空任务列表,读起来像"没数据"而不是"key 错了"。
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
    <Surface>
      <View style={styles.hero}>
        <Text style={styles.brandBig}>Coolie</Text>
        <Text style={styles.tagline}>把 AI 智能体当成一支团队来管理</Text>
      </View>

      {useToken ? (
        <>
          <Text style={styles.muted}>
            粘贴智能体 API Key 或管理 Key,应用会自动识别类型。
          </Text>
          <TextInput
            style={styles.input}
            placeholder="API Key"
            placeholderTextColor={C.inkDim}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            value={token}
            onChangeText={setToken}
          />
        </>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="邮箱"
            placeholderTextColor={C.inkDim}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="密码"
            placeholderTextColor={C.inkDim}
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
          {busy ? "验证中…" : useToken ? "连接" : "登录"}
        </Text>
      </Pressable>

      <Pressable onPress={() => { setUseToken(!useToken); setError(null); }}>
        <Text style={styles.link}>
          {useToken ? "改用邮箱密码登录" : "改用 API Key 登录"}
        </Text>
      </Pressable>
    </Surface>
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
  const [tab, setTab] = useState<"tasks" | "dashboard">("tasks");
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
      Alert.alert("加载失败", String((e as Error)?.message ?? e));
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
      Alert.alert("创建失败", String((e as Error)?.message ?? e));
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
      if (res.issue) Alert.alert("任务已创建", res.issue.title);
      else Alert.alert("转写结果", res.transcription.text || "(空)");
      await loadIssues();
    } catch (e) {
      if (isAsrNotConfigured(e)) {
        Alert.alert("语音未配置", "该实例尚未配置腾讯 ASR 凭据,请改用文字输入。");
      } else {
        Alert.alert("语音派发失败", String((e as Error)?.message ?? e));
      }
    } finally {
      setBusy(false);
    }
  }, [companyId, recording, start, stop, loadIssues]);

  if (tab === "dashboard") {
    return <DashboardScreen company={company} onBack={() => setTab("tasks")} />;
  }

  if (selected) {
    return <TaskDetail issue={selected} onBack={() => setSelected(null)} />;
  }

  const open = issues.filter((i) => i.status !== "done").length;

  return (
    <Surface>
      <View style={styles.rowBetween}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>工坊控制台</Text>
          <Text style={styles.muted} numberOfLines={1}>
            {company.name} · {whoami}
          </Text>
        </View>
        <Pressable onPress={onSignOut} hitSlop={12}>
          <Text style={styles.link}>退出</Text>
        </Pressable>
      </View>

      {/* 顶部标签切换 */}
      <View style={styles.tabSwitcher}>
        <Pressable
          style={[styles.tabBtn, styles.tabBtnActive]}
          onPress={() => setTab("tasks")}
        >
          <Text style={[styles.tabBtnText, styles.tabBtnTextActive]}>
            任务工单 ({issues.length})
          </Text>
        </Pressable>
        <Pressable
          style={styles.tabBtn}
          onPress={() => setTab("dashboard")}
        >
          <Text style={styles.tabBtnText}>
            效能驾驶舱
          </Text>
        </Pressable>
      </View>

      {/* 概览条 */}
      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNum}>{issues.length}</Text>
          <Text style={styles.statLabel}>全部</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNum, { color: C.accent }]}>{open}</Text>
          <Text style={styles.statLabel}>进行中</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNum, { color: C.ok }]}>{issues.length - open}</Text>
          <Text style={styles.statLabel}>已完成</Text>
        </View>
      </View>

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="新任务标题…"
          placeholderTextColor={C.inkDim}
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          placeholder="描述(可选)"
          placeholderTextColor={C.inkDim}
          multiline
          value={description}
          onChangeText={setDescription}
        />
        <View style={styles.chips}>
          {(["low", "medium", "high", "urgent"] as IssuePriority[]).map((p) => (
            <Pressable
              key={p}
              onPress={() => setPriority(p)}
              style={[styles.chip, priority === p && styles.chipActive]}
            >
              <Text style={priority === p ? styles.chipTextActive : styles.chipText}>
                {PRIORITY_LABEL[p]}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.rowGap}>
          <Pressable
            style={[styles.btn, styles.btnFlex, (!title.trim() || busy) && styles.btnDisabled]}
            disabled={!title.trim() || busy}
            onPress={createTask}
          >
            <Text style={styles.btnText}>添加任务</Text>
          </Pressable>
          <Pressable
            style={[styles.btnVoice, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={voiceDispatch}
          >
            <Text style={styles.btnVoiceText}>{recording ? "■ 停止并派发" : "🎤 语音"}</Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          scrollEnabled={false}
          data={issues}
          keyExtractor={(i) => i.id}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>还没有任务</Text>
              <Text style={styles.muted}>在上方输入标题创建第一个任务,或用语音派发。</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.taskCard} onPress={() => setSelected(item)}>
              <Text style={styles.taskTitle} numberOfLines={2}>{item.title}</Text>
              <View style={styles.taskMeta}>
                <View style={[styles.badge, {
                  backgroundColor: `${STATUS_COLOR[item.status] ?? C.inkDim}22`,
                  borderColor: `${STATUS_COLOR[item.status] ?? C.inkDim}55`,
                }]}>
                  <Text style={{ color: STATUS_COLOR[item.status] ?? C.inkDim, fontSize: 11, fontWeight: "600" }}>
                    {STATUS_LABEL[item.status] ?? item.status}
                  </Text>
                </View>
                <View style={[styles.badge, {
                  backgroundColor: `${PRIORITY_COLOR[item.priority] ?? C.inkDim}22`,
                  borderColor: `${PRIORITY_COLOR[item.priority] ?? C.inkDim}55`,
                }]}>
                  <Text style={{ color: PRIORITY_COLOR[item.priority] ?? C.inkDim, fontSize: 11, fontWeight: "600" }}>
                    {PRIORITY_LABEL[item.priority] ?? item.priority}
                  </Text>
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
    </Surface>
  );
}

function TaskDetail({ issue, onBack }: { issue: Issue; onBack: () => void }) {
  return (
    <Surface>
      <Pressable onPress={onBack} hitSlop={12}>
        <Text style={styles.link}>‹ 返回</Text>
      </Pressable>
      <Text style={styles.detailTitle}>{issue.title}</Text>
      <View style={styles.detailCard}>
        <DetailRow
          label="状态"
          value={STATUS_LABEL[issue.status] ?? issue.status}
          valueColor={STATUS_COLOR[issue.status] ?? C.ink}
        />
        <DetailRow
          label="优先级"
          value={PRIORITY_LABEL[issue.priority] ?? issue.priority}
          valueColor={PRIORITY_COLOR[issue.priority] ?? C.ink}
        />
        {issue.description ? <DetailRow label="描述" value={issue.description} /> : null}
        <DetailRow label="编号" value={issue.id} valueColor={C.inkDim} />
      </View>
    </Surface>
  );
}

function DetailRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={[styles.detailValue, valueColor ? { color: valueColor } : null]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  screen: { padding: 20, paddingTop: 64, gap: 12, backgroundColor: C.bg },
  hero: { alignItems: "center", gap: 6, marginVertical: 28 },
  h1: { fontSize: 26, fontWeight: "800", color: C.ink, letterSpacing: 0.4 },
  brandBig: { fontSize: 36, fontWeight: "800", color: C.ink, letterSpacing: 0.6 },
  tagline: { fontSize: 13, color: C.inkDim },
  muted: { color: C.inkDim, fontSize: 13 },
  error: { color: C.danger, fontSize: 13 },
  link: { color: C.accent, fontWeight: "600" },
  input: {
    backgroundColor: C.cardHi, borderColor: C.line, borderWidth: 1,
    borderRadius: 12, padding: 13, fontSize: 15, color: C.ink,
  },
  inputMultiline: { minHeight: 64, textAlignVertical: "top" },
  btn: {
    backgroundColor: C.accent, borderRadius: 12,
    paddingVertical: 13, paddingHorizontal: 16, alignItems: "center",
    shadowColor: C.accent, shadowOpacity: 0.35, shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  btnFlex: { flex: 1 },
  btnVoice: {
    backgroundColor: "#1E2A5E", borderColor: C.accentDeep, borderWidth: 1,
    borderRadius: 12, paddingVertical: 13, paddingHorizontal: 18, alignItems: "center",
  },
  btnVoiceText: { color: C.accent, fontWeight: "700" },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: "#06202B", fontWeight: "800", fontSize: 15 },
  cardBtn: {
    backgroundColor: C.card, borderRadius: 14, padding: 16, gap: 4,
    borderColor: C.line, borderWidth: 1,
  },
  cardBtnTitle: { color: C.ink, fontSize: 16, fontWeight: "700" },
  composer: {
    gap: 8, backgroundColor: C.card, padding: 14,
    borderRadius: 16, borderWidth: 1, borderColor: C.line,
  },
  rowGap: { flexDirection: "row", gap: 8 },
  rowBetween: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", gap: 12,
  },
  tabSwitcher: {
    flexDirection: "row",
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: C.line,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 9,
  },
  tabBtnActive: {
    backgroundColor: C.cardHi,
    borderWidth: 1,
    borderColor: C.accent,
  },
  tabBtnText: {
    fontSize: 13,
    color: C.inkDim,
    fontWeight: "600",
  },
  tabBtnTextActive: {
    color: C.accent,
    fontWeight: "800",
  },
  chips: { flexGrow: 0, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1, borderColor: C.line, borderRadius: 999,
    paddingVertical: 5, paddingHorizontal: 14, backgroundColor: C.cardHi,
  },
  chipActive: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.inkDim, fontSize: 13 },
  chipTextActive: { color: "#06202B", fontSize: 13, fontWeight: "700" },
  statRow: { flexDirection: "row", gap: 10 },
  statCard: {
    flex: 1, backgroundColor: C.card, borderRadius: 14, paddingVertical: 14,
    alignItems: "center", borderWidth: 1, borderColor: C.line, gap: 2,
  },
  statNum: { color: C.ink, fontSize: 22, fontWeight: "800" },
  statLabel: { color: C.inkDim, fontSize: 12 },
  taskCard: {
    backgroundColor: C.card, borderRadius: 14, padding: 14, gap: 8,
    borderWidth: 1, borderColor: C.line,
  },
  taskTitle: { color: C.ink, fontSize: 15, fontWeight: "600" },
  taskMeta: { flexDirection: "row", gap: 8 },
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1 },
  emptyCard: {
    backgroundColor: C.card, borderRadius: 14, padding: 22, alignItems: "center",
    gap: 6, borderWidth: 1, borderColor: C.line, borderStyle: "dashed",
  },
  emptyTitle: { color: C.ink, fontSize: 15, fontWeight: "700" },
  detailTitle: { fontSize: 22, fontWeight: "800", color: C.ink },
  detailCard: {
    backgroundColor: C.card, borderRadius: 14, borderWidth: 1,
    borderColor: C.line, padding: 14, gap: 12,
  },
  detailRow: { gap: 2 },
  detailValue: { fontSize: 15, color: C.ink },
});
