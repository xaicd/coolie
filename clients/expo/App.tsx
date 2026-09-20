import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
  StatusBar as RNStatusBar,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import {
  isAsrNotConfigured,
  type Approval,
  type Company,
  type Issue,
  type IssuePriority,
  type IssueWorkProduct,
  type WorkspaceRuntimeService,
} from "@coolie/api-client";
import {
  C,
  COOLIE_BASE_URL,
  classifyToken,
  coolie,
  credentialCompanies,
  restoreCredential,
  saveAuthToken,
  signInWithEmail,
  signOutEverywhere,
  type Credential,
  type IssueAttachment,
  type IssueComment,
  type IssueCostSummary,
} from "./src/coolie";
import { StatusDot } from "./src/components/StatusDot";
import { useRecorder } from "./src/useRecorder";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { CodeDiffScreen } from "./src/screens/CodeDiffScreen";
import { OntologyDomainListScreen } from "./src/screens/OntologyDomainListScreen";
import { ArtifactsScreen } from "./src/screens/ArtifactsScreen";
import { PrototypeSandboxScreen } from "./src/screens/PrototypeSandboxScreen";
import { BoardChatScreen, exportBoardEcho } from "./src/screens/BoardChatScreen";
import { AgentsScreen } from "./src/screens/AgentsScreen";
import { useOTA } from "./src/OTA";
import { checkAppVersion, downloadApk, localVersion, type RemoteVersionInfo } from "./src/AppVersion";

/** 统计并清理 App 缓存目录，返回可读大小 */
async function clearAppCache(): Promise<string> {
  try {
    const FS = await import("expo-file-system");
    const cacheDir = FS.cacheDirectory;
    if (!cacheDir) return "0 KB";
    await FS.deleteAsync(cacheDir, { idempotent: true });
    return "已全部清理";
  } catch {
    return "清理失败";
  }
}

async function measureCache(): Promise<string> {
  try {
    const FS = await import("expo-file-system");
    const cacheDir = FS.cacheDirectory;
    if (!cacheDir) return "0 KB";
    let total = 0;
    const walk = async (dir: string) => {
      const items = await FS.readDirectoryAsync(dir);
      for (const name of items) {
        const full = dir.endsWith("/") ? dir + name : `${dir}/${name}`;
        const info = await FS.getInfoAsync(full);
        if (info.exists && !info.isDirectory) total += info.size ?? 0;
        else if (info.exists && info.isDirectory) await walk(full + "/");
      }
    };
    await walk(cacheDir);
    return total > 1048576 ? `${(total / 1048576).toFixed(1)} MB` : `${Math.ceil(total / 1024)} KB`;
  } catch {
    return "-";
  }
}
import { QuickApprovalCard } from "./src/components/QuickApprovalCard";
import { setupOTAListener } from "./src/OTA";

/**
 * Coolie mobile client — Linear 设计系统重构版。
 *
 * 遵循 DESIGN.md 规范:
 * - 近黑三档背景 (bg #08090A / panel #0F1011 / surface #191A1B)
 * - 四级文字亮度分层 (ink / ink2 / ink3 / ink4, 禁纯白 #FFF)
 * - 品牌紫蓝 #5E6AD2 作为唯一彩色 CTA
 * - 半透明卡片 bg rgba(255,255,255,0.02) + 半透明白边 line
 * - 字重三档 400 / 500 / 600 (禁 700/800)
 * - 数字 tabularNum 对齐
 * - 状态点呼吸灯
 */

const PRIORITY_LABEL: Record<IssuePriority, string> = {
  low: "低",
  medium: "中",
  high: "高",
  critical: "紧急",
};

// 胶囊内前缀色点 (DESIGN.md 第3节: P0 #EF4444 / P1 #F59E0B / P2 #8A8F98)
const PRIORITY_DOT_COLOR: Record<IssuePriority, string> = {
  critical: C.err,
  high: C.warn,
  medium: C.ink3,
  low: C.ink4,
};

const STATUS_LABEL: Record<string, string> = {
  open: "待处理",
  in_progress: "进行中",
  blocked: "受阻",
  done: "已完成",
};

const STATUS_DOT_COLOR: Record<string, string> = {
  open: C.ink3,
  in_progress: C.accent,
  blocked: C.err,
  done: C.ok,
};

type TabKey = "dashboard" | "agents" | "chat" | "tasks" | "artifacts" | "ontology";

type BottomTab = {
  key: TabKey;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  activeIcon: React.ComponentProps<typeof Ionicons>["name"];
};

const BOTTOM_TABS: BottomTab[] = [
  { key: "dashboard", label: "汇览", icon: "stats-chart-outline", activeIcon: "stats-chart" },
  { key: "agents", label: "员工", icon: "people-outline", activeIcon: "people" },
  { key: "chat", label: "工坊", icon: "hammer-outline", activeIcon: "hammer" },
  { key: "tasks", label: "任务", icon: "list-outline", activeIcon: "list" },
  { key: "ontology", label: "本体", icon: "git-network-outline", activeIcon: "git-network" },
];
/** 产物不占底部栏，从任务页右上角进入 */
const HIDDEN_TABS = new Set<TabKey>(["artifacts"]);

/** 看板视图：按状态分列横滑，点卡片循环推进状态，长按卡片打开详情 */
const BOARD_COLUMNS: { status: string; label: string; color: string; next: string }[] = [
  { status: "open", label: "待处理", color: C.ink3, next: "in_progress" },
  { status: "in_progress", label: "进行中", color: C.accent, next: "done" },
  { status: "blocked", label: "受阻", color: C.err, next: "in_progress" },
  { status: "done", label: "已完成", color: C.ok, next: "open" },
];

function IssueBoardView({
  issues,
  onMove,
  onOpen,
  onChangePriority,
}: {
  issues: Issue[];
  onMove: (id: string, status: string) => Promise<void>;
  onOpen: (issue: Issue) => void;
  onChangePriority: (id: string, priority: string) => Promise<void>;
}) {
  const handleCardLongPress = (it: Issue) => {
    Alert.alert(
      "修改优先级",
      `任务：${it.title}`,
      [
        {
          text: "低 (low)",
          onPress: () => void onChangePriority(it.id, "low"),
        },
        {
          text: "中 (medium)",
          onPress: () => void onChangePriority(it.id, "medium"),
        },
        {
          text: "高 (high)",
          onPress: () => void onChangePriority(it.id, "high"),
        },
        {
          text: "查看详情",
          onPress: () => onOpen(it),
        },
        {
          text: "取消",
          style: "cancel",
        },
      ],
    );
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 10 }}
    >
      {BOARD_COLUMNS.map((col) => {
        const items = issues.filter((i) => i.status === col.status);
        return (
          <View key={col.status} style={styles.boardCol}>
            <View style={styles.boardColHeader}>
              <View style={[styles.boardColDot, { backgroundColor: col.color }]} />
              <Text style={styles.boardColTitle}>{col.label}</Text>
              <Text style={styles.boardColCount}>{items.length}</Text>
            </View>
            <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 16 }}>
              {items.length === 0 ? (
                <Text style={styles.boardEmpty}>暂无</Text>
              ) : (
                items.map((it) => (
                  <Pressable
                    key={it.id}
                    style={styles.boardCard}
                    onPress={() => void onMove(it.id, col.next)}
                    onLongPress={() => handleCardLongPress(it)}
                  >
                    <Text style={styles.boardCardTitle} numberOfLines={3}>
                      {it.title}
                    </Text>
                    <View style={styles.boardCardMeta}>
                      <View
                        style={[
                          styles.boardPrioDot,
                          { backgroundColor: PRIORITY_DOT_COLOR[it.priority] ?? C.ink3 },
                        ]}
                      />
                      <Text style={styles.boardCardHint}>点按→{BOARD_COLUMNS.find((c) => c.status === col.next)?.label} · 长按改优先级</Text>
                    </View>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        );
      })}
    </ScrollView>
  );
}

/** 应用升级卡片：新版本提示 + 一键下载 APK */
function AppUpdateCard({ info, onClose }: { info: RemoteVersionInfo; onClose: () => void }) {
  const [downloading, setDownloading] = useState(false);
  return (
    <View style={styles.updateBanner}>
      <View style={{ flex: 1 }}>
        <Text style={styles.updateTitle}>📦 新版本 v{info.version}</Text>
        {info.releaseNotes ? (
          <Text style={styles.updateNotes} numberOfLines={2}>
            {info.releaseNotes}
          </Text>
        ) : null}
      </View>
      <Pressable
        style={[styles.updateBtn, downloading && styles.btnDisabled]}
        disabled={downloading}
        onPress={async () => {
          setDownloading(true);
          const ok = await downloadApk(info.downloadUrl);
          setDownloading(false);
          if (!ok) Alert.alert("下载失败", "请稍后重试");
        }}
      >
        <Text style={styles.updateBtnText}>{downloading ? "拉起中…" : "升级"}</Text>
      </Pressable>
      <Pressable onPress={onClose} hitSlop={8}>
        <Ionicons name="close" size={18} color={C.ink4} />
      </Pressable>
    </View>
  );
}

function SettingsSheet({
  whoami,
  ota,
  onClose,
  onSignOut,
}: {
  whoami: string;
  ota: ReturnType<typeof useOTA>;
  onClose: () => void;
  onSignOut: () => void;
}) {
  const [cacheSize, setCacheSize] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const appVer = localVersion();

  useEffect(() => {
    void measureCache().then(setCacheSize);
  }, []);

  return (
    <View style={styles.settingsBackdrop}>
      <Pressable style={{ flex: 1 }} onPress={onClose} />
      <View style={styles.settingsSheet}>
        <View style={styles.settingsHandle} />
        <Text style={styles.settingsTitle}>设置</Text>

        {/* 我的名片 */}
        <View style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>{whoami.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName} numberOfLines={1}>
              {whoami}
            </Text>
            <Text style={styles.profileMeta}>Coolie工坊 · 管理员</Text>
          </View>
          <View style={styles.versionChip}>
            <Text style={styles.versionChipText}>v{appVer}</Text>
          </View>
        </View>

        {/* App 设置分组 */}
        <Text style={styles.settingsGroup}>应用</Text>
        <Pressable
          style={styles.settingsRow}
          disabled={ota.isChecking}
          onPress={() => void ota.checkUpdate(true)}
        >
          <Ionicons name="cloud-download-outline" size={20} color={C.ink3} />
          <Text style={styles.settingsRowLabel}>版本与更新 (OTA)</Text>
          <Text style={styles.settingsRowValue}>
            {ota.isChecking ? "检查中…" : (ota.runtimeVersion ?? appVer)}
          </Text>
        </Pressable>
        <Pressable
          style={styles.settingsRow}
          disabled={clearing}
          onPress={async () => {
            setClearing(true);
            const size = await clearAppCache();
            setCacheSize(size);
            setClearing(false);
            Alert.alert("缓存已清理", `释放 ${size}`);
          }}
        >
          <Ionicons name="trash-outline" size={20} color={C.ink3} />
          <Text style={styles.settingsRowLabel}>清理缓存</Text>
          <Text style={styles.settingsRowValue}>
            {clearing ? "清理中…" : (cacheSize ?? "计算中…")}
          </Text>
        </Pressable>

        <Pressable style={styles.settingsSignOut} onPress={onSignOut}>
          <Text style={styles.settingsSignOutText}>退出登录</Text>
        </Pressable>
      </View>
    </View>
  );
}

function BottomTabBar({
  tab,
  onChange,
}: {
  tab: TabKey;
  onChange: (t: TabKey) => void;
}) {
  return (
    <View style={styles.bottomBar}>
      {BOTTOM_TABS.filter((t) => !HIDDEN_TABS.has(t.key)).map((t) => {
        const active = tab === t.key;
        return (
          <Pressable
            key={t.key}
            style={styles.bottomTab}
            onPress={() => onChange(t.key)}
            hitSlop={4}
          >
            <Ionicons
              name={active ? t.activeIcon : t.icon}
              size={22}
              color={active ? C.accent : C.ink3}
            />
            <Text
              style={[styles.bottomTabLabel, active && styles.bottomTabLabelActive]}
            >
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}


export default function App() {
  const [credential, setCredential] = useState<Credential | null | undefined>(undefined);

  useEffect(() => {
    void restoreCredential().then(setCredential);
    const unsub = setupOTAListener();
    return () => {
      unsub();
    };
  }, []);

  const signOut = useCallback(() => {
    void signOutEverywhere().then(() => setCredential(null));
  }, []);

  if (credential === undefined) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: C.bg, paddingTop: Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 24) : 0 }]}>
        <ActivityIndicator color={C.accent} />
      </SafeAreaView>
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
 * 解析要进入的公司: 只有一个就自动进入，多个让用户选，零公司给出解释。
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
        <Pressable onPress={onSignOut} hitSlop={12} style={styles.btnGhost}>
          <Text style={styles.btnGhostText}>退出</Text>
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
              style={({ pressed }) => [
                styles.cardBtn,
                pressed && styles.cardBtnPressed,
              ]}
              onPress={() => setChosen(company)}
            >
              <View style={styles.rowAlignCenterGap}>
                <StatusDot status="ok" size={6} />
                <Text style={styles.cardBtnTitle}>{company.name}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </>
      )}
    </Surface>
  );
}

function Surface({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={{ backgroundColor: C.bg, flex: 1, paddingTop: Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 24) : 0 }}>
      <StatusBar style="light" />
      <ScrollView
        style={{ backgroundColor: C.bg, flex: 1 }}
        contentContainerStyle={styles.screen}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
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
            粘贴智能体 API Key 或管理 Key，应用会自动识别类型。
          </Text>
          <TextInput
            style={styles.input}
            placeholder="API Key"
            placeholderTextColor={C.ink3}
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
            placeholderTextColor={C.ink3}
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
            placeholderTextColor={C.ink3}
            secureTextEntry
            textContentType="password"
            value={password}
            onChangeText={setPassword}
          />
        </>
      )}

      {error !== null && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.btnPrimary, (!ready || busy) && styles.btnDisabled]}
        disabled={!ready || busy}
        onPress={submit}
      >
        <Text style={styles.btnPrimaryText}>
          {busy ? "验证中…" : useToken ? "连接" : "登录"}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => {
          setUseToken(!useToken);
          setError(null);
        }}
        style={styles.linkWrapper}
      >
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
  const [tab, setTab] = useState<TabKey>("dashboard");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [boardView, setBoardView] = useState(false);
  const [appUpdate, setAppUpdate] = useState<RemoteVersionInfo | null>(null);
  const ota = useOTA();

  useEffect(() => {
    void checkAppVersion().then((r) => {
      if (r.updateAvailable && r.info) setAppUpdate(r.info);
    });
  }, []);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selected, setSelected] = useState<Issue | null>(null);
  const [focusedApprovalId, setFocusedApprovalId] = useState<string | null>(null);
  const [diffContext, setDiffContext] = useState<{
    issue?: Issue | null;
    workProduct?: IssueWorkProduct | null;
  } | null>(null);
  const [sandboxContext, setSandboxContext] = useState<{
    url?: string | null;
    service?: WorkspaceRuntimeService | null;
    workProduct?: IssueWorkProduct | null;
  } | null>(null);
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
      const res = await coolie.voiceDispatch({
        companyId,
        audioBase64: base64,
        format,
      });
      if (res.issue) Alert.alert("任务已创建", res.issue.title);
      else Alert.alert("转写结果", res.transcription.text || "(空)");
      await loadIssues();
    } catch (e) {
      if (isAsrNotConfigured(e)) {
        Alert.alert("语音未配置", "该实例尚未配置腾讯 ASR 凭据，请改用文字输入。");
      } else {
        Alert.alert("语音派发失败", String((e as Error)?.message ?? e));
      }
    } finally {
      setBusy(false);
    }
  }, [companyId, recording, start, stop, loadIssues]);

  if (sandboxContext) {
    return (
      <PrototypeSandboxScreen
        company={company}
        initialUrl={sandboxContext.url}
        service={sandboxContext.service}
        workProduct={sandboxContext.workProduct}
        onBack={() => setSandboxContext(null)}
      />
    );
  }

  if (diffContext) {
    return (
      <CodeDiffScreen
        company={company}
        issue={diffContext.issue}
        workProduct={diffContext.workProduct}
        onBack={() => setDiffContext(null)}
      />
    );
  }

  if (focusedApprovalId) {
    return (
      <ApprovalFocusDetail
        companyId={companyId}
        approvalId={focusedApprovalId}
        onBack={() => setFocusedApprovalId(null)}
      />
    );
  }

  if (selected) {
    return (
      <TaskDetail
        issue={selected}
        company={company}
        onBack={() => setSelected(null)}
        onOpenDiff={(issueItem, wp) =>
          setDiffContext({ issue: issueItem, workProduct: wp })
        }
        onOpenSandbox={(url, service, wp) =>
          setSandboxContext({ url, service, workProduct: wp })
        }
      />
    );
  }

  const open = issues.filter((i) => i.status !== "done").length;

  return (
    <SafeAreaView style={[styles.shell, { paddingTop: Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 24) : 0 }]}>
      <StatusBar style="light" />
      <View style={styles.shellContent}>
        {tab === "dashboard" ? (
          <DashboardScreen
            company={company}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenApprovals={() => setTab("tasks")}
            onOpenApproval={(approvalId) => setFocusedApprovalId(approvalId)}
          />
        ) : tab === "agents" ? (
          <AgentsScreen
            company={company}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenIssue={(issue) => {
              setTab("tasks");
              setSelected(issue);
            }}
          />
        ) : tab === "chat" ? (
          <BoardChatScreen
            company={company}
            whoami={whoami}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenApproval={(approvalId) => setFocusedApprovalId(approvalId)}
            onOpenIssue={(issue) => {
              setTab("tasks");
              setSelected(issue);
            }}
          />
        ) : tab === "ontology" ? (
          <OntologyDomainListScreen company={company} whoami={whoami} onOpenSettings={() => setSettingsOpen(true)} />
        ) : tab === "artifacts" ? (
          <ArtifactsScreen
            company={company}
            whoami={whoami}
            onOpenSandbox={(url, service, wp) =>
              setSandboxContext({ url, service, workProduct: wp })
            }
            onOpenDiff={(issueItem, wp) =>
              setDiffContext({ issue: issueItem, workProduct: wp })
            }
          />
        ) : (
          <ScrollView
            style={{ flex: 1, backgroundColor: C.bg }}
            contentContainerStyle={styles.screen}
          >
            {/* 顶部标题与身份胶囊 */}
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.h1}>工坊控制台</Text>
                <View style={styles.companyCapsule}>
                  <StatusDot status="ok" size={6} />
                  <Text style={styles.companyCapsuleText} numberOfLines={1}>
                    {company.name}
                  </Text>
                  <Text style={styles.companyCapsuleSubText}>· {whoami}</Text>
                </View>
              </View>
              <Pressable
                onPress={() => setBoardView((v) => !v)}
                hitSlop={12}
                style={styles.btnGhost}
              >
                <Ionicons
                  name={boardView ? "list" : "grid"}
                  size={20}
                  color={C.ink2}
                />
              </Pressable>
              <Pressable
                onPress={() => setTab("artifacts")}
                hitSlop={12}
                style={styles.btnGhost}
              >
                <Ionicons name="cube-outline" size={20} color={C.ink2} />
              </Pressable>
              <Pressable onPress={() => setSettingsOpen(true)} hitSlop={12} style={styles.btnGhost}>
                <Ionicons name="settings-outline" size={20} color={C.ink2} />
              </Pressable>
            </View>

            {/* 概览统计卡片 (tabularNum + 亮度分层) */}
      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNum}>{issues.length}</Text>
          <Text style={styles.statLabel}>全部任务</Text>
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

      {/* 创建任务输入框区域 */}
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="新任务标题…"
          placeholderTextColor={C.ink3}
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          placeholder="描述 (可选)"
          placeholderTextColor={C.ink3}
          multiline
          value={description}
          onChangeText={setDescription}
        />

        {/* 优先级徽标胶囊 (前缀色点) */}
        <View style={styles.chips}>
          {(["low", "medium", "high", "critical"] as IssuePriority[]).map((p) => {
            const isSelected = priority === p;
            return (
              <Pressable
                key={p}
                onPress={() => setPriority(p)}
                style={[styles.priorityChip, isSelected && styles.priorityChipActive]}
              >
                <View
                  style={[
                    styles.priorityDot,
                    { backgroundColor: PRIORITY_DOT_COLOR[p] },
                  ]}
                />
                <Text
                  style={isSelected ? styles.chipTextActive : styles.chipText}
                >
                  {PRIORITY_LABEL[p]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.rowGap}>
          <Pressable
            style={[
              styles.btnPrimary,
              styles.btnFlex,
              (!title.trim() || busy) && styles.btnDisabled,
            ]}
            disabled={!title.trim() || busy}
            onPress={createTask}
          >
            <Text style={styles.btnPrimaryText}>添加任务</Text>
          </Pressable>
          <Pressable
            style={[
              styles.btnVoice,
              recording && styles.btnVoiceRecording,
              busy && styles.btnDisabled,
            ]}
            disabled={busy}
            onPress={voiceDispatch}
          >
            <Text style={[styles.btnVoiceText, recording && { color: C.err }]}>
              {recording ? "■ 停止并派发" : "🎤 语音派发"}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* 任务列表 (规范行高 56，状态点呼吸灯) */}
      {boardView && !loading && issues.length > 0 ? (
        <IssueBoardView
          issues={issues}
          onMove={async (id, status) => {
            try {
              await coolie.updateIssueStatus(id, status);
              await loadIssues();
            } catch (e) {
              Alert.alert("状态更新失败", String((e as Error)?.message ?? e));
            }
          }}
          onChangePriority={async (id, prio) => {
            try {
              await coolie.updateIssuePriority(id, prio);
              await loadIssues();
            } catch (e) {
              Alert.alert("优先级更新失败", String((e as Error)?.message ?? e));
            }
          }}
          onOpen={(it) => setSelected(it)}
        />
      ) : loading ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          scrollEnabled={false}
          data={issues}
          keyExtractor={(i) => i.id}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>还没有任务</Text>
              <Text style={styles.muted}>
                在上方输入标题创建第一个任务，或用语音派发。
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isRunning = item.status === "in_progress";
            const dotStatus = isRunning
              ? "ok"
              : item.status === "blocked"
              ? "err"
              : "idle";

            return (
              <Pressable
                style={({ pressed }) => [
                  styles.taskCard,
                  pressed && styles.taskCardPressed,
                ]}
                onPress={() => setSelected(item)}
              >
                <View style={styles.taskCardMain}>
                  <View style={styles.taskTitleRow}>
                    <StatusDot
                      status={dotStatus}
                      color={STATUS_DOT_COLOR[item.status]}
                      pulse={isRunning}
                      size={8}
                    />
                    <Text style={styles.taskTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                  </View>

                  <View style={styles.taskMeta}>
                    {/* 状态徽标胶囊 */}
                    <View style={styles.capsuleBadge}>
                      <View
                        style={[
                          styles.capsuleDot,
                          {
                            backgroundColor:
                              STATUS_DOT_COLOR[item.status] ?? C.ink3,
                          },
                        ]}
                      />
                      <Text style={styles.capsuleText}>
                        {STATUS_LABEL[item.status] ?? item.status}
                      </Text>
                    </View>

                    {/* 优先级徽标胶囊 */}
                    <View style={styles.capsuleBadge}>
                      <View
                        style={[
                          styles.capsuleDot,
                          {
                            backgroundColor:
                              PRIORITY_DOT_COLOR[item.priority] ?? C.ink3,
                          },
                        ]}
                      />
                      <Text style={styles.capsuleText}>
                        {PRIORITY_LABEL[item.priority] ?? item.priority}
                      </Text>
                    </View>
                  </View>
                </View>

                <Text style={styles.chevron}>›</Text>
              </Pressable>
            );
          }}
        />
      )}
      <QuickApprovalCard companyId={companyId} floating={true} />
            </ScrollView>
          )}
      </View>
      {appUpdate ? <AppUpdateCard info={appUpdate} onClose={() => setAppUpdate(null)} /> : null}
      {settingsOpen ? (
        <SettingsSheet
          whoami={whoami}
          ota={ota}
          onClose={() => setSettingsOpen(false)}
          onSignOut={onSignOut}
        />
      ) : null}
      <BottomTabBar tab={tab} onChange={setTab} />
    </SafeAreaView>
  );
}

function approvalLabel(approval: Approval): string {
  if (approval.title) return approval.title;
  const payload = approval.payload ?? {};
  if (typeof payload.title === "string" && payload.title) return payload.title;
  if (typeof payload.name === "string" && payload.name) return payload.name;
  return approval.type;
}

/**
 * 审批裁决页 (驾驶舱待审批卡单条点入)
 * 复用 QuickApprovalCard 就地裁决，并把结果/取消写入工坊聊天流。
 */
function ApprovalFocusDetail({
  companyId,
  approvalId,
  onBack,
}: {
  companyId: string;
  approvalId: string;
  onBack: () => void;
}) {
  const [approval, setApproval] = useState<Approval | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setApproval(await coolie.getApproval(approvalId));
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [approvalId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleResolved = useCallback(
    (resolvedId: string, decision: "approve" | "reject") => {
      const label = approval ? approvalLabel(approval) : resolvedId.slice(0, 8);
      exportBoardEcho(
        decision === "approve"
          ? `✅ 审批已批准：${label}`
          : `⛔ 审批已驳回：${label}`,
      );
      onBack();
    },
    [approval, onBack],
  );

  const handleDismiss = useCallback(() => {
    exportBoardEcho("↩️ 已取消审批处理，该审批单仍待裁决。");
    onBack();
  }, [onBack]);

  return (
    <Surface>
      <Pressable onPress={onBack} hitSlop={12} style={styles.backLinkRow}>
        <Text style={styles.link}>‹ 返回驾驶舱</Text>
      </Pressable>

      <Text style={styles.detailTitle}>审批裁决</Text>

      {loading && !approval ? (
        <ActivityIndicator color={C.accent} style={{ marginVertical: 24 }} />
      ) : error ? (
        <View style={styles.sectionErrorBox}>
          <Text style={styles.sectionErrorText}>⚠️ {error}</Text>
          <Pressable onPress={() => void load()} style={styles.sectionRetryBtn}>
            <Text style={styles.sectionRetryBtnText}>重试</Text>
          </Pressable>
        </View>
      ) : approval ? (
        <>
          <QuickApprovalCard
            companyId={companyId}
            approval={approval}
            floating={false}
            onResolved={handleResolved}
            onDismiss={handleDismiss}
          />
          {approval.status !== "pending" ? (
            <Text style={styles.sectionEmptyText}>
              该审批单已处理完毕（当前状态: {approval.status}）。
            </Text>
          ) : null}
        </>
      ) : null}
    </Surface>
  );
}

function TaskDetail({
  issue,
  company: _company,
  onBack,
  onOpenDiff,
  onOpenSandbox,
}: {
  issue: Issue;
  company: Company;
  onBack: () => void;
  onOpenDiff: (issue: Issue, workProduct?: IssueWorkProduct) => void;
  onOpenSandbox?: (
    url: string,
    service?: WorkspaceRuntimeService | null,
    workProduct?: IssueWorkProduct | null,
  ) => void;
}) {
  const [workProducts, setWorkProducts] = useState<IssueWorkProduct[]>([]);
  const [loadingWp, setLoadingWp] = useState(false);

  // 评论流状态
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  // 附件列表状态
  const [attachments, setAttachments] = useState<IssueAttachment[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [attachmentsError, setAttachmentsError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoadingWp(true);
      try {
        const list = await coolie.listWorkProducts(issue.id);
        setWorkProducts(list);
      } catch {
        // silently ignore if endpoint unavailable
      } finally {
        setLoadingWp(false);
      }
    })();
  }, [issue.id]);

  const loadComments = useCallback(async () => {
    setLoadingComments(true);
    setCommentsError(null);
    try {
      const list = await coolie.getIssueComments(issue.id);
      setComments(list);
    } catch (e) {
      setCommentsError(String((e as Error)?.message ?? e));
    } finally {
      setLoadingComments(false);
    }
  }, [issue.id]);

  const loadAttachments = useCallback(async () => {
    setLoadingAttachments(true);
    setAttachmentsError(null);
    try {
      const list = await coolie.getIssueAttachments(issue.id);
      setAttachments(list);
    } catch (e) {
      setAttachmentsError(String((e as Error)?.message ?? e));
    } finally {
      setLoadingAttachments(false);
    }
  }, [issue.id]);

  useEffect(() => {
    void loadComments();
    void loadAttachments();
  }, [loadComments, loadAttachments]);

  const handleAddComment = useCallback(async () => {
    const text = commentInput.trim();
    if (!text || submittingComment) return;
    setSubmittingComment(true);
    try {
      await coolie.addIssueComment(issue.id, text);
      setCommentInput("");
      await loadComments();
    } catch (e) {
      Alert.alert("评论发送失败", String((e as Error)?.message ?? e));
    } finally {
      setSubmittingComment(false);
    }
  }, [commentInput, issue.id, loadComments, submittingComment]);

  const prototypeWp = workProducts.find(
    (wp) => wp.url || wp.type === "prototype" || wp.runtimeServiceId,
  );

  return (
    <Surface>
      <Pressable onPress={onBack} hitSlop={12} style={styles.backLinkRow}>
        <Text style={styles.link}>‹ 返回任务列表</Text>
      </Pressable>

      <Text style={styles.detailTitle}>{issue.title}</Text>

      <View style={styles.detailCard}>
        <DetailRow
          label="状态"
          value={STATUS_LABEL[issue.status] ?? issue.status}
          valueColor={STATUS_DOT_COLOR[issue.status] ?? C.ink}
        />
        <DetailRow
          label="优先级"
          value={PRIORITY_LABEL[issue.priority] ?? issue.priority}
          valueColor={PRIORITY_DOT_COLOR[issue.priority] ?? C.ink}
        />
        {issue.description ? (
          <DetailRow label="描述" value={issue.description} />
        ) : null}
        <DetailRow label="编号" value={issue.id} valueColor={C.ink3} isMono />
        <IssueCostRow issueId={issue.id} />
      </View>

      {/* 核心动作: 查看代码 Diff 与 打开原型沙箱 */}
      <View style={styles.rowGap}>
        <Pressable
          style={[styles.btnDiffAction, { flex: 1 }]}
          onPress={() => onOpenDiff(issue)}
        >
          <Text style={styles.btnDiffActionText}>
            🔍 代码 Diff
          </Text>
        </Pressable>
        {onOpenSandbox && (
          <Pressable
            style={[
              styles.btnPrimary,
              { flex: 1, paddingVertical: 12 },
              !prototypeWp && { backgroundColor: "rgba(94, 106, 210, 0.2)" },
            ]}
            onPress={() =>
              onOpenSandbox(prototypeWp?.url || "", null, prototypeWp || null)
            }
          >
            <Text style={styles.btnPrimaryText}>
              🎮 原型沙箱
            </Text>
          </Pressable>
        )}
      </View>

      {/* 关联交付产物列表 */}
      {workProducts.length > 0 && (
        <View style={styles.wpSection}>
          <Text style={styles.sectionHeader}>
            关联交付产物 ({workProducts.length})
          </Text>
          {workProducts.map((wp) => {
            const hasPrototype = Boolean(wp.url || wp.type === "prototype" || wp.runtimeServiceId);
            return (
              <Pressable
                key={wp.id}
                style={({ pressed }) => [
                  styles.wpCard,
                  pressed && styles.cardBtnPressed,
                ]}
                onPress={() => {
                  if (hasPrototype && onOpenSandbox) {
                    onOpenSandbox(wp.url || "", null, wp);
                  } else {
                    onOpenDiff(issue, wp);
                  }
                }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.wpTitle} numberOfLines={1}>
                    {wp.title}
                  </Text>
                  <Text style={styles.wpType}>
                    类型: {wp.type} {wp.executionWorkspaceId ? "· 关联工作区" : ""}
                  </Text>
                </View>
                <Text style={styles.wpLink}>
                  {hasPrototype ? "看原型 🎮 ›" : "看 Diff ›"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {loadingWp && (
        <ActivityIndicator color={C.accent} style={{ marginTop: 8 }} />
      )}

      {/* 任务附件列表 */}
      <View style={styles.detailSection}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeader}>
            任务附件 ({attachments.length})
          </Text>
          <Pressable
            hitSlop={8}
            onPress={() => void loadAttachments()}
            disabled={loadingAttachments}
            style={styles.sectionRefreshBtn}
          >
            {loadingAttachments ? (
              <ActivityIndicator size="small" color={C.accent} />
            ) : (
              <Ionicons name="refresh" size={14} color={C.ink3} />
            )}
          </Pressable>
        </View>

        {loadingAttachments && attachments.length === 0 ? (
          <ActivityIndicator color={C.accent} style={{ marginVertical: 12 }} />
        ) : Boolean(attachmentsError) ? (
          <View style={styles.sectionErrorBox}>
            <Text style={styles.sectionErrorText}>⚠️ {attachmentsError}</Text>
            <Pressable
              onPress={() => void loadAttachments()}
              style={styles.sectionRetryBtn}
            >
              <Text style={styles.sectionRetryBtnText}>重试</Text>
            </Pressable>
          </View>
        ) : attachments.length === 0 ? (
          <Text style={styles.sectionEmptyText}>暂无附件</Text>
        ) : (
          attachments.map((att) => {
            const fileName = att.filename || att.originalFilename || "未命名附件";
            const sizeStr =
              typeof att.byteSize === "number"
                ? att.byteSize >= 1048576
                  ? `${(att.byteSize / 1048576).toFixed(1)} MB`
                  : `${(att.byteSize / 1024).toFixed(1)} KB`
                : "未知大小";
            const targetUrl = att.contentPath
              ? (att.contentPath.startsWith("http") ? att.contentPath : `${COOLIE_BASE_URL}${att.contentPath}`)
              : null;

            return (
              <Pressable
                key={att.id}
                style={styles.attachmentItem}
                onPress={() => {
                  if (targetUrl) {
                    void Linking.openURL(targetUrl).catch(() => {
                      Alert.alert("无法打开附件链接", targetUrl);
                    });
                  }
                }}
              >
                <Ionicons name="document-attach-outline" size={18} color={C.accent} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.attachmentName} numberOfLines={1}>
                    {fileName}
                  </Text>
                  <Text style={styles.attachmentSize}>{sizeStr}</Text>
                </View>
                {Boolean(targetUrl) && (
                  <Ionicons name="open-outline" size={16} color={C.ink3} />
                )}
              </Pressable>
            );
          })
        )}
      </View>

      {/* 评论流 */}
      <View style={styles.detailSection}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeader}>
            评论流 ({comments.length})
          </Text>
          <Pressable
            hitSlop={8}
            onPress={() => void loadComments()}
            disabled={loadingComments}
            style={styles.sectionRefreshBtn}
          >
            {loadingComments ? (
              <ActivityIndicator size="small" color={C.accent} />
            ) : (
              <Ionicons name="refresh" size={14} color={C.ink3} />
            )}
          </Pressable>
        </View>

        {loadingComments && comments.length === 0 ? (
          <ActivityIndicator color={C.accent} style={{ marginVertical: 12 }} />
        ) : Boolean(commentsError) ? (
          <View style={styles.sectionErrorBox}>
            <Text style={styles.sectionErrorText}>⚠️ {commentsError}</Text>
            <Pressable
              onPress={() => void loadComments()}
              style={styles.sectionRetryBtn}
            >
              <Text style={styles.sectionRetryBtnText}>重试</Text>
            </Pressable>
          </View>
        ) : comments.length === 0 ? (
          <Text style={styles.sectionEmptyText}>暂无跟进评论</Text>
        ) : (
          <View style={styles.commentsList}>
            {comments.map((comment) => {
              const isUser = Boolean(comment.authorUserId);
              const authorName = isUser
                ? "掌柜"
                : comment.authorAgentId
                ? `员工 ${comment.authorAgentId.slice(0, 8)}`
                : "系统";
              const timeStr = comment.createdAt
                ? new Date(comment.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "";

              return (
                <View
                  key={comment.id}
                  style={[
                    styles.commentBubble,
                    isUser ? styles.commentBubbleUser : styles.commentBubbleAgent,
                  ]}
                >
                  <View style={styles.commentHeader}>
                    <Text style={styles.commentAuthor}>{authorName}</Text>
                    <Text style={styles.commentTime}>{timeStr}</Text>
                  </View>
                  <Text style={styles.commentBody}>{comment.body}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* 评论输入区域 */}
        <View style={styles.commentInputRow}>
          <TextInput
            style={styles.commentTextInput}
            placeholder="添加跟进评论…"
            placeholderTextColor={C.ink3}
            value={commentInput}
            onChangeText={setCommentInput}
            multiline
            editable={!submittingComment}
          />
          <Pressable
            style={[
              styles.commentSubmitBtn,
              (!commentInput.trim() || submittingComment) && styles.btnDisabled,
            ]}
            disabled={!commentInput.trim() || submittingComment}
            onPress={() => void handleAddComment()}
          >
            {submittingComment ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.commentSubmitBtnText}>发送</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Surface>
  );
}

function IssueCostRow({ issueId }: { issueId: string }) {
  const [summary, setSummary] = useState<IssueCostSummary | null>(null);
  useEffect(() => {
    coolie.issueCostSummary(issueId).then(setSummary).catch(() => setSummary(null));
  }, [issueId]);
  if (!summary) return null;
  const fmt = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : String(n);
  return (
    <DetailRow
      label="消耗"
      value={`tokens 入${fmt(summary.inputTokens)} 出${fmt(summary.outputTokens)} · 运行${summary.runCount}次${
        summary.costCents > 0 ? ` · $${(summary.costCents / 100).toFixed(2)}` : ""
      }`}
      valueColor={C.ink3}
    />
  );
}

function DetailRow({
  label,
  value,
  valueColor,
  isMono = false,
}: {
  label: string;
  value: string;
  valueColor?: string;
  isMono?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text
        style={[
          styles.detailValue,
          valueColor ? { color: valueColor } : null,
          isMono ? styles.monoText : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  screen: {
    padding: 16,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 16,
    backgroundColor: C.bg,
  },
  shell: {
    flex: 1,
    backgroundColor: C.bg,
  },
  shellContent: {
    flex: 1,
  },
  boardCol: {
    width: 168,
    backgroundColor: C.panel,
    borderRadius: 12,
    padding: 8,
    alignSelf: "flex-start",
  },
  boardColHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  boardColDot: { width: 8, height: 8, borderRadius: 4 },
  boardColTitle: { color: C.ink2, fontSize: 13, fontWeight: "600", flex: 1 },
  boardColCount: { color: C.ink4, fontSize: 12 },
  boardEmpty: { color: C.ink4, fontSize: 12, paddingHorizontal: 4, paddingVertical: 10 },
  boardCard: {
    backgroundColor: C.surface,
    borderRadius: 10,
    padding: 10,
    gap: 6,
  },
  boardCardTitle: { color: C.ink, fontSize: 13, lineHeight: 18 },
  boardCardMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  boardPrioDot: { width: 6, height: 6, borderRadius: 3 },
  boardCardHint: { color: C.ink4, fontSize: 10 },
  updateBanner: {
    position: "absolute",
    top: 8,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: C.brand,
    zIndex: 90,
  },
  updateTitle: { color: C.ink, fontSize: 14, fontWeight: "700" },
  updateNotes: { color: C.ink3, fontSize: 11, marginTop: 2 },
  updateBtn: {
    backgroundColor: C.brand,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  updateBtnText: { color: C.ink, fontSize: 13, fontWeight: "600" },
  settingsBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
    zIndex: 100,
  },
  settingsSheet: {
    backgroundColor: C.panel,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 18,
    paddingBottom: 34,
    paddingTop: 10,
    gap: 4,
  },
  settingsHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.surfaceHover,
    marginBottom: 10,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 6,
  },
  profileAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: C.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  profileAvatarText: { color: C.ink, fontSize: 18, fontWeight: "700" },
  profileName: { color: C.ink, fontSize: 16, fontWeight: "700" },
  profileMeta: { color: C.ink3, fontSize: 12, marginTop: 2 },
  versionChip: {
    backgroundColor: C.panel,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  versionChipText: { color: C.accent, fontSize: 11, fontWeight: "600" },
  settingsGroup: {
    color: C.ink4,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 14,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  settingsTitle: {
    color: C.ink,
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 10,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 13,
  },
  settingsRowLabel: { color: C.ink2, fontSize: 15, flex: 1 },
  settingsRowValue: { color: C.ink3, fontSize: 13, flexShrink: 1 },
  settingsSignOut: {
    marginTop: 10,
    backgroundColor: C.surface,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  settingsSignOutText: { color: C.err, fontSize: 15, fontWeight: "600" },
  bottomBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: C.lineSubtle,
    backgroundColor: C.panel,
    paddingTop: 6,
    paddingBottom: 8,
    paddingHorizontal: 8,
  },
  bottomTab: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    paddingVertical: 2,
  },
  bottomTabLabel: {
    fontSize: 10,
    color: C.ink3,
    fontWeight: "400",
  },
  bottomTabLabelActive: {
    color: C.accent,
    fontWeight: "500",
  },
  hero: {
    alignItems: "center",
    gap: 8,
    marginVertical: 32,
  },
  h1: {
    fontSize: 20,
    fontWeight: "600",
    color: C.ink,
    letterSpacing: -0.4,
  },
  brandBig: {
    fontSize: 32,
    fontWeight: "600",
    color: C.ink,
    letterSpacing: -0.4,
  },
  tagline: {
    fontSize: 13,
    color: C.ink3,
    fontWeight: "400",
  },
  muted: {
    color: C.ink3,
    fontSize: 13,
    fontWeight: "400",
    lineHeight: 18,
  },
  error: {
    color: C.err,
    fontSize: 13,
    fontWeight: "500",
  },
  linkWrapper: {
    paddingVertical: 8,
    alignItems: "center",
  },
  link: {
    color: C.accent,
    fontWeight: "500",
    fontSize: 13,
  },
  backLinkRow: {
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  // 输入框 (DESIGN.md 第3节: bg 0.02, border line, radius 8, padding 12×14, text ink, placeholder ink3)
  input: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: C.ink,
  },
  inputMultiline: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  // 主按钮 (DESIGN.md 第3节: bg #5E6AD2, text ink, radius 8, padding 12×16, weight 500)
  btnPrimary: {
    backgroundColor: C.brand,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: {
    color: C.ink,
    fontWeight: "500",
    fontSize: 15,
  },
  btnFlex: {
    flex: 1,
  },
  // 幽灵按钮 (DESIGN.md 第3节: bg 0.02, border line, text ink2, radius 8)
  btnGhost: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnGhostText: {
    color: C.ink2,
    fontWeight: "500",
    fontSize: 13,
  },
  // 语音按钮 (幽灵半透明微调)
  btnVoice: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  btnVoiceRecording: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  btnVoiceText: {
    color: C.ink2,
    fontWeight: "500",
    fontSize: 13,
  },
  btnDisabled: {
    opacity: 0.4,
  },
  // 卡片 (DESIGN.md 第3节: bg 0.02, border 1px line, radius 12, 按压 0.05)
  cardBtn: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardBtnPressed: {
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  cardBtnTitle: {
    color: C.ink,
    fontSize: 15,
    fontWeight: "500",
  },
  chevron: {
    color: C.ink4,
    fontSize: 16,
    fontWeight: "400",
  },
  composer: {
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
  },
  rowGap: {
    flexDirection: "row",
    gap: 8,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  rowAlignCenterGap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  companyCapsule: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginTop: 6,
    gap: 6,
  },
  companyCapsuleText: {
    fontSize: 11,
    color: C.ink2,
    fontWeight: "500",
    maxWidth: 160,
  },
  companyCapsuleSubText: {
    fontSize: 11,
    color: C.ink4,
    fontWeight: "400",
  },
  tabSwitcher: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.02)",
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 6,
  },
  tabBtnActive: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: C.line,
  },
  tabBtnText: {
    fontSize: 12,
    color: C.ink3,
    fontWeight: "400",
  },
  tabBtnTextActive: {
    color: C.ink,
    fontWeight: "500",
  },
  chips: {
    flexGrow: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  priorityChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  priorityChipActive: {
    backgroundColor: "rgba(94, 106, 210, 0.18)",
    borderColor: C.brand,
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  chipText: {
    color: C.ink2,
    fontSize: 11,
    fontWeight: "500",
  },
  chipTextActive: {
    color: C.ink,
    fontSize: 11,
    fontWeight: "500",
  },
  statRow: {
    flexDirection: "row",
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.line,
    gap: 4,
  },
  statNum: {
    color: C.ink,
    fontSize: 24,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  statLabel: {
    color: C.ink3,
    fontSize: 11,
    fontWeight: "500",
  },
  // 列表 (DESIGN.md 第4节: 行高 56, 右侧 chevron ink4)
  taskCard: {
    minHeight: 56,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    gap: 10,
  },
  taskCardPressed: {
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  taskCardMain: {
    flex: 1,
    gap: 6,
  },
  taskTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  taskTitle: {
    color: C.ink,
    fontSize: 15,
    fontWeight: "500",
    flex: 1,
  },
  taskMeta: {
    flexDirection: "row",
    gap: 8,
    marginLeft: 16,
  },
  capsuleBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: "rgba(255,255,255,0.05)",
    gap: 4,
  },
  capsuleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  capsuleText: {
    color: C.ink2,
    fontSize: 11,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
  emptyCard: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderRadius: 12,
    padding: 32,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  emptyIcon: {
    fontSize: 28,
  },
  emptyTitle: {
    color: C.ink,
    fontSize: 15,
    fontWeight: "600",
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: C.ink,
    letterSpacing: -0.4,
  },
  detailCard: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    padding: 16,
    gap: 12,
  },
  detailRow: {
    gap: 2,
  },
  detailLabel: {
    color: C.ink3,
    fontSize: 11,
    fontWeight: "400",
  },
  detailValue: {
    fontSize: 15,
    color: C.ink,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
  monoText: {
    fontVariant: ["tabular-nums"],
    color: C.ink3,
    fontSize: 13,
  },
  btnDiffAction: {
    backgroundColor: "rgba(94, 106, 210, 0.12)",
    borderWidth: 1,
    borderColor: C.brand,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    marginTop: 4,
  },
  btnDiffActionText: {
    color: C.accent,
    fontSize: 14,
    fontWeight: "500",
  },
  wpSection: {
    marginTop: 8,
    gap: 8,
  },
  sectionHeader: {
    color: C.ink3,
    fontSize: 13,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
  wpCard: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  wpTitle: {
    color: C.ink,
    fontSize: 13,
    fontWeight: "500",
  },
  wpType: {
    color: C.ink4,
    fontSize: 11,
  },
  wpLink: {
    color: C.accent,
    fontSize: 12,
    fontWeight: "500",
    marginLeft: 8,
  },
  detailSection: {
    marginTop: 16,
    gap: 8,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionRefreshBtn: {
    padding: 4,
  },
  sectionErrorBox: {
    padding: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.err,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionErrorText: {
    color: C.err,
    fontSize: 12,
    flex: 1,
  },
  sectionRetryBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: C.surfaceHover,
    borderRadius: 4,
  },
  sectionRetryBtnText: {
    color: C.ink,
    fontSize: 12,
  },
  sectionEmptyText: {
    color: C.ink4,
    fontSize: 12,
    paddingVertical: 8,
  },
  attachmentItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
    padding: 10,
  },
  attachmentName: {
    color: C.ink,
    fontSize: 13,
    fontWeight: "500",
  },
  attachmentSize: {
    color: C.ink4,
    fontSize: 11,
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
  commentsList: {
    gap: 8,
  },
  commentBubble: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.line,
    gap: 4,
  },
  commentBubbleUser: {
    backgroundColor: C.surface,
    borderLeftWidth: 3,
    borderLeftColor: C.accent,
  },
  commentBubbleAgent: {
    backgroundColor: C.panel,
    borderLeftWidth: 3,
    borderLeftColor: C.ok,
  },
  commentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  commentAuthor: {
    color: C.ink2,
    fontSize: 12,
    fontWeight: "600",
  },
  commentTime: {
    color: C.ink4,
    fontSize: 10,
    fontVariant: ["tabular-nums"],
  },
  commentBody: {
    color: C.ink,
    fontSize: 13,
    lineHeight: 18,
  },
  commentInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  commentTextInput: {
    flex: 1,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: C.ink,
    fontSize: 13,
    maxHeight: 80,
  },
  commentSubmitBtn: {
    backgroundColor: C.brand,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  commentSubmitBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
});
