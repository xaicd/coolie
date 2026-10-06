import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
  Platform,
  StatusBar as RNStatusBar,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import {
  type Approval,
  type Company,
  type Issue,
  type IssueWorkProduct,
  type WorkspaceRuntimeService,
} from "@coolie/api-client";
import {
  C,
  COOLIE_BASE_URL,
  classifyToken,
  coolie,
  credentialCompanies,
  getLastEmail,
  markOnboardingDone,
  refreshSessionToken,
  restoreCredential,
  saveAuthToken,
  shouldShowOnboarding,
  signInWithEmail,
  signOutEverywhere,
  type AgentRow,
  type Credential,
  type SearchAgentResult,
} from "./src/coolie";
import { AppBar } from "./src/components/AppBar";
import { EdgeSwipeBack } from "./src/components/EdgeSwipeBack";
import { TabBar, TAB_BAR_HEIGHT } from "./src/components/TabBar";
import { StatusDot } from "./src/components/StatusDot";
import { CreateTaskModal } from "./src/components/CreateTaskModal";
import { AppCard } from "./src/ui/AppCard";
import { ErrorRetry } from "./src/ui/ErrorRetry";
import { LoadingState } from "./src/ui/LoadingState";
import { ScreenHeader } from "./src/ui/ScreenHeader";
import { Sheet } from "./src/ui/Sheet";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { InboxScreen } from "./src/screens/InboxScreen";
import { CodeDiffScreen } from "./src/screens/CodeDiffScreen";
import { OntologyDomainListScreen } from "./src/screens/OntologyDomainListScreen";
import { OntologySchemaEditorScreen } from "./src/screens/OntologySchemaEditorScreen";
// wave352 — 恢复 v0.6.22 全屏图谱工作台 (wave315 删, 老板拍砍回 v0.6.22 极简度)
import { OntologyGraphWorkbenchScreen } from "./src/screens/OntologyGraphWorkbenchScreen";
import { ArtifactsScreen } from "./src/screens/ArtifactsScreen";
import { OrgAssetsScreen } from "./src/screens/OrgAssetsScreen";
import { PluginManagerScreen } from "./src/screens/PluginManagerScreen";
import { PluginSettingsScreen } from "./src/screens/PluginSettingsScreen";
import {
  PrototypeSandboxScreen,
  type SandboxScope,
} from "./src/screens/PrototypeSandboxScreen";
import { NotificationsScreen } from "./src/screens/NotificationsScreen";
import { NativeModulesScreen } from "./src/screens/NativeModulesScreen";
import { SearchScreen } from "./src/screens/SearchScreen";
import { RegisterScreen } from "./src/screens/RegisterScreen";
import { AgentDetailScreen } from "./src/screens/AgentDetailScreen";
import { TaskDetailScreen } from "./src/screens/TaskDetailScreen";
import { SpecEditorScreen } from "./src/screens/SpecEditorScreen";
import { TasksScreen } from "./src/screens/TasksScreen";
import { TaskKanbanScreen } from "./src/screens/TaskKanbanScreen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { PipelinesScreen } from "./src/screens/PipelinesScreen";
import { PlansScreen } from "./src/screens/PlansScreen";
import { GitCredentialsScreen } from "./src/screens/GitCredentialsScreen";
import { ProjectsScreen } from "./src/screens/ProjectsScreen";
import { WebContainerScreen } from "./src/screens/WebContainerScreen";
import { WebLoginScreen } from "./src/screens/WebLoginScreen";
import { WorkspaceGitToggle } from "./src/components/WorkspaceGitToggle";
import { CoolieLogo } from "./src/components/CoolieLogo";
import { useNotificationsStore } from "./src/stores/notifications";
import { BoardChatScreen, exportBoardEcho, exportBoardPrompt } from "./src/screens/BoardChatScreen";
import { AgentsScreen } from "./src/screens/AgentsScreen";
import { useOTA } from "./src/OTA";
import {
  checkAppVersion,
  downloadApk,
  fetchVersionJson,
  localVersion,
  type RemoteVersionInfo,
} from "./src/AppVersion";
import {
  WhatsNewScreen,
  markWhatsNewSeen,
  shouldShowWhatsNew,
} from "./src/screens/WhatsNewScreen";

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

type TabKey = "dashboard" | "agents" | "chat" | "tasks" | "artifacts" | "ontology" | "assets" | "inbox";

/**
 * 底部栏只有 5 项 (汇览 / 任务 / [+] / 员工 / 收件箱, 见 src/components/TabBar.tsx)。
 * 工坊(chat) / 本体(ontology) / 产物(artifacts) 不再占底部栏, 仍从任务页顶部的
 * 图标行进入 —— 入口换了位置, 能力没减。
 *
 * 任务页本体 (列表 / 看板 / 分组) 已迁到 src/screens/TasksScreen.tsx +
 * src/components/IssuesList.tsx (wave18, 对齐 Coolie Web Tasks 页)。
 */

/**
 * 应用升级卡片：新版本提示 + 一键下载。
 *
 * Android 维持 OTA 口径 —— 拉 APK 直链升级 (downloadUrl)。
 * iOS 无 APK/OTA 直装能力，改走三条路径 (version.json 顶层扁平字段):
 *   区块1 App Store —— 尚未上架, 只提示「即将上架」;
 *   区块2 TestFlight 内测 (iosTestFlightUrl, 优先);
 *   区块3 开发期直装 .ipa (iosDownloadUrl)。
 * 注意: 直装 .ipa 需 Ad Hoc/企业签; 本波 ipa 是 App Store 签名, 仅供 TestFlight。
 */
function AppUpdateCard({ info, onClose }: { info: RemoteVersionInfo; onClose: () => void }) {
  const [downloading, setDownloading] = useState(false);
  const isIOS = Platform.OS === "ios";

  const openLink = async (url: string | null | undefined, label: string) => {
    if (!url) return;
    const ok = await Linking.openURL(url).then(() => true).catch(() => false);
    if (!ok) Alert.alert("打开失败", `无法打开${label}，请稍后重试`);
  };

  // iOS：无 APK/OTA 直装能力，按 v6 任务书分三块 (数据全取自 version.json 顶层扁平字段)。
  if (isIOS) {
    return (
      <View style={[styles.updateBanner, styles.updateBannerIos]}>
        <View style={styles.updateIosHeader}>
          <Text style={styles.updateTitle}>📦 新版本 v{info.version}</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={18} color={C.ink4} />
          </Pressable>
        </View>
        {info.releaseNotes ? (
          <Text style={styles.updateNotes} numberOfLines={2}>
            {info.releaseNotes}
          </Text>
        ) : null}
        {/* 区块1: App Store —— 尚未上架, 只提示 */}
        <Text style={styles.updateNotes}>App Store：即将上架</Text>
        <View style={styles.updateIosActions}>
          {/* 区块2: TestFlight 内测 (优先) */}
          {info.iosTestFlightUrl ? (
            <Pressable
              style={styles.updateBtn}
              onPress={() => void openLink(info.iosTestFlightUrl, "TestFlight")}
            >
              <Text style={styles.updateBtnText}>TestFlight 内测</Text>
            </Pressable>
          ) : null}
          {/* 区块3: 开发期直装 .ipa (App Store 签名 ipa 需 Ad Hoc 重签才能真机安装) */}
          {info.iosDownloadUrl ? (
            <Pressable
              style={[styles.updateBtn, styles.updateBtnGhost]}
              onPress={() => void openLink(info.iosDownloadUrl, "下载页")}
            >
              <Text style={styles.updateBtnText}>直接下载 .ipa</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

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
  workspaceGitEnabled,
  onToggleWorkspaceGit,
  onOpenGitCredentials,
  onOpenNativeModules,
}: {
  whoami: string;
  ota: ReturnType<typeof useOTA>;
  onClose: () => void;
  onSignOut: () => void;
  workspaceGitEnabled: boolean;
  onToggleWorkspaceGit: (next: boolean) => void;
  onOpenGitCredentials: () => void;
  onOpenNativeModules: () => void;
}) {
  const [cacheSize, setCacheSize] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const appVer = localVersion();

  useEffect(() => {
    void measureCache().then(setCacheSize);
  }, []);

  return (
    <Sheet onClose={onClose} modal={false} title="设置" style={styles.settingsBackdrop}>
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

      {/* wave70 — git-ops App 端 UI 4 屏之 Workspace Git Toggle. */}
      <Text style={styles.settingsGroup}>开发者</Text>
      <WorkspaceGitToggle
        enabled={workspaceGitEnabled}
        onToggle={onToggleWorkspaceGit}
        onOpenCredentials={onOpenGitCredentials}
      />

      {/* wave188 — 6 个 expo-* 原生模块最小集成 demo 入口。 */}
      <Pressable style={styles.settingsRow} onPress={onOpenNativeModules}>
        <Ionicons name="hardware-chip-outline" size={20} color={C.ink3} />
        <Text style={styles.settingsRowLabel}>原生模块 (6 expo-*)</Text>
        <Text style={styles.settingsRowValue}>demo</Text>
      </Pressable>

      <Pressable style={styles.settingsSignOut} onPress={onSignOut}>
        <Text style={styles.settingsSignOutText}>退出登录</Text>
      </Pressable>
    </Sheet>
  );
}

export default function App() {
  const [credential, setCredential] = useState<Credential | null | undefined>(undefined);
  const [registering, setRegistering] = useState(false);
  // wave112: 默认登录改回原生表单。Web 登录页是 ES2020+ 的 SPA bundle (大量 ?? / ?. /
  // 私有字段), Chromium <80 的老 WebView 直接解析失败 → 整页空白, 老板真机 0.5.76 的
  // 「选完公司白屏」就是凭证一失效就落在这块白布上。原生表单在任何设备都能用;
  // Web 登录保留为显式入口 (SignInScreen 的 🌐 横幅), 且 WebLoginScreen 自带
  // 空白兜底 (15s 无渲染自动切回原生)。
  const [loginMode, setLoginMode] = useState<"web" | "native">("native");

  // 装机自检 (What's New) 必须挂在 App 顶层：HomeScreen 只在登录后才渲染，
  // 首次装机 (未登录) 时它永远不会跑，老板实测「装了啥也没变」就是这个原因。
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [whatsNewChecked, setWhatsNewChecked] = useState(false);
  // 「查看演示」要落到工作空间 (登录后才有)，所以顶层只登记意图，交给 HomeScreen 消费。
  const [pendingDemo, setPendingDemo] = useState(false);

  useEffect(() => {
    void restoreCredential().then(setCredential);
    const unsub = setupOTAListener();
    // 启动即预热 version.json 缓存：登录前 WhatsNew / 登录后 HomeScreen 的升级
    // 检查共用同一次网络请求（fetchVersionJson 进程内缓存, wave89）。
    void fetchVersionJson();
    return () => {
      unsub();
    };
  }, []);

  // wave153 — session keep-alive. Better Auth's cookie carries a 7-day
  // `Max-Age`; a long-lived install would otherwise hit an expired session with
  // no way back. Re-mint the stored signed token whenever the app returns to
  // the foreground (and on cold start via `restoreCredential`). This is an
  // in-process refresh, not `expo-background-fetch` — that needs a native
  // module and a rebuilt binary, so the refresh only runs while the app is
  // alive. It is a no-op for bearer-key logins (no stored session token).
  useEffect(() => {
    if (!credential || credential.kind !== "session") return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshSessionToken();
    });
    return () => subscription.remove();
  }, [credential]);

  useEffect(() => {
    void shouldShowWhatsNew().then((show) => {
      setWhatsNewOpen(show);
      setWhatsNewChecked(true);
    });
  }, []);

  const signOut = useCallback(() => {
    void signOutEverywhere().then(() => {
      setCredential(null);
      // wave112: 退出后回原生表单, 不回 Web 登录页 — 老 WebView (Chromium <80)
      // 解析不了 ES2020 SPA, 退回落上去就是整页白布 (老板真机复现点)。
      setLoginMode("native");
    });
  }, []);

  const dismissWhatsNew = useCallback(() => {
    setWhatsNewOpen(false);
    void markWhatsNewSeen();
  }, []);

  const viewWhatsNewDemo = useCallback(() => {
    setWhatsNewOpen(false);
    void markWhatsNewSeen();
    setPendingDemo(true);
  }, []);

  const handleDemoHandled = useCallback(() => setPendingDemo(false), []);

  let screen: React.ReactNode;
  if (credential === undefined || !whatsNewChecked) {
    screen = (
      <SafeAreaView style={[styles.center, { backgroundColor: C.bg, paddingTop: Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 24) : 0 }]}>
        <LoadingState size="small" />
      </SafeAreaView>
    );
  } else if (credential) {
    screen = (
      <CompanyGate
        credential={credential}
        onSignOut={signOut}
        demoRequested={pendingDemo}
        onDemoHandled={handleDemoHandled}
      />
    );
  } else if (registering) {
    screen = (
      <RegisterScreen
        onRegistered={(user) => setCredential({ kind: "session", user })}
        onBack={() => setRegistering(false)}
      />
    );
  } else if (loginMode === "native") {
    screen = (
      <SignInScreen
        onSignedIn={setCredential}
        onRegister={() => setRegistering(true)}
      />
    );
  } else {
    screen = (
      <WebLoginScreen
        onSignedIn={setCredential}
        onFallbackNative={() => setLoginMode("native")}
      />
    );
  }

  return (
    <>
      {screen}
      {/* 装机自检：登录前也能弹（onViewDemo 只在已登录时可点，因为演示要进工坊） */}
      <WhatsNewScreen
        visible={whatsNewOpen}
        onClose={dismissWhatsNew}
        onViewDemo={credential ? viewWhatsNewDemo : undefined}
      />
    </>
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
  demoRequested,
  onDemoHandled,
}: {
  credential: Credential;
  onSignOut: () => void;
  demoRequested?: boolean;
  onDemoHandled?: () => void;
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
        demoRequested={demoRequested}
        onDemoHandled={onDemoHandled}
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
            <AppCard
              key={company.id}
              onPress={() => setChosen(company)}
              row
              padding={16}
              style={styles.cardBetween}
            >
              <View style={styles.rowAlignCenterGap}>
                <StatusDot status="ok" size={6} />
                <Text style={styles.cardBtnTitle}>{company.name}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </AppCard>
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
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

function SignInScreen({
  onSignedIn,
  onRegister,
}: {
  onSignedIn: (credential: Credential) => void;
  onRegister?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [useToken, setUseToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // wave172 — 客户端校验邮箱格式 + 密码长度, 错就不让提交。比让服务端把 "abc" 当邮箱
  // 打回来再弹错少一次往返, 也避免用户反复点「按了没反应」的按钮 (wave153 的同源痛点)。
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // wave153 — prefill the last email so a returning user only types the password.
  useEffect(() => {
    void getLastEmail().then((last) => {
      if (last) setEmail((current) => (current ? current : last));
    });
  }, []);

  // 实时校验邮箱格式: 用户改一格就重算, 错误消失就立刻清掉提示, 不要一直红。
  useEffect(() => {
    if (useToken) {
      setEmailError(null);
      return;
    }
    const trimmed = email.trim();
    if (trimmed.length === 0) {
      setEmailError(null);
      return;
    }
    // 与 Web /api/auth/sign-in/email 的服务端校验同源: 一个合法邮箱的形状。
    // 不强求顶级域名完整 (公司内网常是 user@corp 这种), 只卡 @ 与左右两侧非空。
    setEmailError(
      /^[^\s@]+@[^\s@]+$/.test(trimmed) ? null : "请输入有效的邮箱地址",
    );
  }, [email, useToken]);

  // 实时校验密码长度: < 8 字符不让提交。
  useEffect(() => {
    if (useToken) {
      setPasswordError(null);
      return;
    }
    setPasswordError(
      password.length === 0 || password.length >= 8
        ? null
        : "密码至少需要 8 个字符",
    );
  }, [password, useToken]);

  const submit = useCallback(async () => {
    if (useToken) {
      const candidate = token.trim();
      if (!candidate) return;
    } else {
      const trimmedEmail = email.trim();
      if (!trimmedEmail || !password) return;
      if (emailError || passwordError) return;
    }
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
  }, [useToken, token, email, password, emailError, passwordError, onSignedIn]);

  // 切换登录方式时清空所有输入：否则从邮箱模式切到 Key 模式，界面上还留着
  // 邮箱/密码，但校验只看 token（空）→ 按钮变灰、看起来「点了没反应」。
  const toggleMode = useCallback(() => {
    setUseToken((v) => !v);
    setEmail("");
    setPassword("");
    setToken("");
    setError(null);
    setEmailError(null);
    setPasswordError(null);
  }, []);

  const ready = useToken
    ? token.trim().length > 0
    : email.trim().length > 0 &&
      password.length > 0 &&
      emailError === null &&
      passwordError === null;

  return (
    <Surface>
      <View style={styles.hero}>
        <CoolieLogo size={52} style={{ marginBottom: 12 }} />
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
          {emailError ? <Text style={styles.inputError}>{emailError}</Text> : null}
          <TextInput
            style={styles.input}
            placeholder="密码"
            placeholderTextColor={C.ink3}
            secureTextEntry
            textContentType="password"
            value={password}
            onChangeText={setPassword}
          />
          {passwordError ? (
            <Text style={styles.inputError}>{passwordError}</Text>
          ) : null}
        </>
      )}

      {error !== null && <Text style={styles.error}>{error}</Text>}

      {/* ready 提示：按钮为什么变灰，这里直说，不让用户猜（老板实测「按了没反应」） */}
      {!ready ? (
        <Text style={styles.readyHint}>
          {useToken ? "请输入 API Key 后再连接" : "请输入邮箱和密码后再登录"}
        </Text>
      ) : null}

      <Pressable
        style={[styles.btnPrimary, (!ready || busy) && styles.btnDisabled]}
        disabled={!ready || busy}
        onPress={submit}
      >
        <Text style={styles.btnPrimaryText}>
          {busy ? "验证中…" : useToken ? "连接" : "登录"}
        </Text>
      </Pressable>

      {!useToken && onRegister ? (
        <Pressable style={styles.btnOutline} onPress={onRegister}>
          <Text style={styles.btnOutlineText}>注册新账号</Text>
        </Pressable>
      ) : null}

      <Pressable
        onPress={toggleMode}
        hitSlop={8}
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
  demoRequested,
  onDemoHandled,
}: {
  company: Company;
  whoami: string;
  onSignOut: () => void;
  demoRequested?: boolean;
  onDemoHandled?: () => void;
}) {
  const [tab, setTab] = useState<TabKey>("dashboard");
  /** 中央 "+" 打开的新建任务浮层 */
  const [composeOpen, setComposeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [boardView, setBoardView] = useState(false);
  const [appUpdate, setAppUpdate] = useState<RemoteVersionInfo | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [agentDetail, setAgentDetail] = useState<AgentRow | null>(null);
  // 任务页顶部编排按钮组 (wave20) 的落地屏: Pipeline 列表 / Plan 列表 / 项目中心
  const [pipelinesOpen, setPipelinesOpen] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  /** 项目卡「创建任务」带过来的项目 id —— 非空即打开建单弹窗并预选该项目。 */
  const [createTaskProjectId, setCreateTaskProjectId] = useState<string | null>(null);
  /** 项目卡「查看任务」带过来的项目 id —— 任务页落地时套用为项目筛选。 */
  const [tasksFilterProjectId, setTasksFilterProjectId] = useState<string | null>(null);
  // 全功能 Web 容器 (Hybrid WebContainer): 零重复开发复用 Web 端能力
  const [webContainerTarget, setWebContainerTarget] = useState<{
    path?: string;
    url?: string;
    title: string;
  } | null>(null);
  // wave70 — git-ops App 端 UI 4 屏之「凭证管理」落地屏
  const [gitCredentialsOpen, setGitCredentialsOpen] = useState(false);
  // wave70 — Workspace Git Toggle 的状态 (本地开关, 后端未消费, 但 UI 反馈要有)
  const [workspaceGitEnabled, setWorkspaceGitEnabled] = useState(false);
  // wave235 — 插件管理 + 单插件设置 (App 内模态屏, 复用 Shell 模式)
  const [pluginManagerOpen, setPluginManagerOpen] = useState(false);
  const [pluginSettingsId, setPluginSettingsId] = useState<string | null>(null);
  // wave239 — 本体插件集成 (屏 3 SchemaEditor 入口):
  //   * schemaEditorType: schema editor 屏. typeId 是 OntologyDomain.id.
  //   * ontologyWorkbenchOpen: 屏 4 workbench. 全图视图.
  //     (wave315 曾删, wave352 老板拍砍回 v0.6.22 极简度后恢复)
  const [schemaEditorType, setSchemaEditorType] = useState<
    { typeId: string; displayName: string } | null
  >(null);
  const [ontologyWorkbenchOpen, setOntologyWorkbenchOpen] = useState(false);
  // wave188 — 6 个 expo-* 原生模块最小集成 demo 入口 (设置 → 原生模块)
  const [nativeModulesOpen, setNativeModulesOpen] = useState(false);
  const ota = useOTA();
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const loadNotifications = useNotificationsStore((s) => s.load);

  useEffect(() => {
    void checkAppVersion().then((r) => {
      if (r.updateAvailable && r.info) setAppUpdate(r.info);
    });
  }, []);

  // 顶部铃铛红点：进主界面先静默拉一次通知，之后由通知屏自身刷新。
  useEffect(() => {
    void loadNotifications(company.id, { silent: true });
  }, [company.id, loadNotifications]);

  // wave153 — 客户首接触。公司还没有员工 (全新账号) 且本机未完成过引导时, 自动
  // 打开 web 端既有 onboarding 向导 (`/<issuePrefix>/onboarding`), 让客户先建好
  // 组织与首个员工, 而不是直接落到空看板。判定与完成态都在 coolie.ts, 失败即
  // 不打扰 (shouldShowOnboarding 从不抛)。
  useEffect(() => {
    let cancelled = false;
    void shouldShowOnboarding(company.id).then((needs) => {
      if (!cancelled && needs) setOnboardingOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, [company.id]);

  // ── 装机自检 (What's New) + 深链 ──────────────────────────────────────
  // WhatsNew 本体挂在 App 顶层 (登录前也要弹)。这里只消费它的「查看演示」意图：
  // 把用户送到工坊 (BoardChatScreen) 并投一条示例 prompt。
  useEffect(() => {
    // 老板/客服排查用：确认 App 载入的是 Coolie fork 自带的 ChatHome，而非 plugin-chat。
    console.log("[chat] ChatHome active");
  }, []);

  useEffect(() => {
    if (!demoRequested) return;
    navigateTab("chat");
    exportBoardPrompt("build 一个演示项目：Coolie 工坊看板");
    onDemoHandled?.();
  }, [demoRequested, onDemoHandled]);

  // 深链: coolie://chat/build[/<标题>] → 工坊并投构建 prompt。
  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url) return;
      const path = url.replace(/^coolie:\/\//i, "").replace(/^\/+/, "");
      const [route, ...rest] = path.split("/");
      if (route === "chat") {
        navigateTab("chat");
        if (rest[0] === "build") {
          const title = decodeURIComponent(rest.slice(1).join("/")).trim();
          exportBoardPrompt(title ? `build ${title}` : "build 一个演示项目");
        }
      }
    };
    void Linking.getInitialURL().then(handleUrl).catch(() => {});
    const subscription = Linking.addEventListener("url", (event) => handleUrl(event.url));
    return () => subscription.remove();
  }, []);

  const [selected, setSelected] = useState<Issue | null>(null);
  const [focusedApprovalId, setFocusedApprovalId] = useState<string | null>(null);
  // wave153 — App 端 spec 编辑器 (3 步: 需求/缺陷 → 设计 → 任务)
  const [specIssue, setSpecIssue] = useState<Issue | null>(null);
  // wave153 — 首接触引导: 新公司 (无员工) 首次进入时打开 web /onboarding 向导
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [diffContext, setDiffContext] = useState<{
    issue?: Issue | null;
    workProduct?: IssueWorkProduct | null;
  } | null>(null);
  const [sandboxContext, setSandboxContext] = useState<{
    url?: string | null;
    service?: WorkspaceRuntimeService | null;
    workProduct?: IssueWorkProduct | null;
    /** wave138c — 列表视图的数据范围(任务/项目)。 */
    scope?: SandboxScope | null;
    /** wave138c — 入口任务快照(空态「查看任务」需要完整 Issue 才能落到任务详情)。 */
    issue?: Issue | null;
  } | null>(null);
  /** 递增后让 TasksScreen 重新拉列表 (中央 "+" 浮层建了任务)。 */
  const [tasksRefreshToken, setTasksRefreshToken] = useState(0);

  const companyId = company.id;

  /** 新建弹窗打开时才需要的员工列表 (CreateTaskModal 的「负责人」下拉要用)。 */
  const [composerAgents, setComposerAgents] = useState<AgentRow[]>([]);

  useEffect(() => {
    if (!composeOpen && !createTaskProjectId) return;
    let cancelled = false;
    void coolie
      .listAgents(companyId)
      .then((rows) => {
        if (!cancelled) setComposerAgents(rows);
      })
      .catch(() => {
        if (!cancelled) setComposerAgents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, composeOpen, createTaskProjectId]);

  /**
   * Tab 级「上一页」—— 底栏 5 项之间也记一层历史, 这样在非 root 的 tab
   * (任务/员工/收件箱) 上左缘右滑是**回到上一个看过的 tab**, 而不是退出 App。
   * 用 ref 承载栈 (不是 state): 手势命中的是「此刻」, 不需要为它重渲染。
   */
  const tabRef = useRef<TabKey>(tab);
  tabRef.current = tab;
  const tabHistoryRef = useRef<TabKey[]>([]);
  const navigateTab = useCallback((key: TabKey) => {
    const current = tabRef.current;
    if (key === current) return;
    tabHistoryRef.current.push(current);
    tabRef.current = key;
    setTab(key);
  }, []);
  /** 退到上一个 tab; 历史为空时什么都不做 —— 绝不退出 App。 */
  const goBackTab = useCallback(() => {
    const previous = tabHistoryRef.current.pop();
    if (previous !== undefined) {
      tabRef.current = previous;
      setTab(previous);
    }
  }, []);

  /**
   * 左缘右滑 / 系统返回键 的落点: 从最上层的浮层/详情开始逐层退, 退到最后才回上一个 tab。
   * 顺序 = 堆叠顺序 (composeOverlay zIndex 110 > 设置抽屉 100 > 详情页整屏)。
   *
   * 返回 true = 事件已被 App 消化 (确实退了一层); false = 已经在最外层 (汇览 root),
   * 没有可退的层。调用方据此决定是「吃掉事件」还是「交回系统」—— 见 backHandler。
   */
  const swipeBack = (): boolean => {
    if (onboardingOpen) return setOnboardingOpen(false), true;
    if (createTaskProjectId) return setCreateTaskProjectId(null), true;
    if (webContainerTarget) return setWebContainerTarget(null), true;
    if (sandboxContext) return setSandboxContext(null), true;
    if (specIssue) return setSpecIssue(null), true;
    if (diffContext) return setDiffContext(null), true;
    if (focusedApprovalId) return setFocusedApprovalId(null), true;
    if (searchOpen) return setSearchOpen(false), true;
    if (notificationsOpen) return setNotificationsOpen(false), true;
    if (agentDetail) return setAgentDetail(null), true;
    if (pipelinesOpen) return setPipelinesOpen(false), true;
    if (plansOpen) return setPlansOpen(false), true;
    if (projectsOpen) return setProjectsOpen(false), true;
    if (gitCredentialsOpen) return setGitCredentialsOpen(false), true;
    if (pluginManagerOpen) return setPluginManagerOpen(false), true;
    if (pluginSettingsId) return setPluginSettingsId(null), true;
    // 本体子屏倒序退栈 (最深的先退; wave352 恢复 workbench 全屏图谱)
    if (ontologyWorkbenchOpen) return setOntologyWorkbenchOpen(false), true;
    if (schemaEditorType) return setSchemaEditorType(null), true;
    if (selected) return setSelected(null), true;
    if (createTaskProjectId) return setCreateTaskProjectId(null), true;
    if (composeOpen) return setComposeOpen(false), true;
    if (settingsOpen) return setSettingsOpen(false), true;
    if (nativeModulesOpen) return setNativeModulesOpen(false), true;
    if (tabHistoryRef.current.length > 0) return goBackTab(), true;
    return false;
  };

  // 系统返回键 (三键导航的返回键, 以及**手势导航下从屏幕左/右缘向内滑**触发的返回)
  // 也走同一套落点。这是老板「手机左边长按右滑不能直接退出 app」在**手势导航**机器上
  // 的真正修法: 手势导航时左缘内滑是系统手势, 会被 Android 的 EdgeBackGestureHandler
  // 先吃掉, JS 层的 PanResponder 根本收不到 (实测: 直接退回桌面)。所以必须同时由
  // BackHandler 接住系统返回, 把它映射成 App 内返回。
  //
  // 到了最外层 (汇览 root) 不直接退出: 第一次只给 toast, 2s 内再按一次才真的退出
  // (Android 常规的「再按一次退出」手势)。既满足「滑一下不会掉出 App」, 也不把用户关在
  // App 里出不来。
  const swipeBackRef = useRef(swipeBack);
  swipeBackRef.current = swipeBack;
  const lastRootBackAtRef = useRef(0);
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (swipeBackRef.current()) return true;
      const now = Date.now();
      if (now - lastRootBackAtRef.current < 2000) return false;
      lastRootBackAtRef.current = now;
      if (Platform.OS === "android") {
        ToastAndroid.show("再按一次返回键退出 Coolie工坊", ToastAndroid.SHORT);
      }
      return true;
    });
    return () => subscription.remove();
  }, []);

  /**
   * 任务详情在当前 tab 内渲染 (wave51, boss 09-22 24:27 「又是没底部导航了」):
   * 不再整屏覆盖内容区, 底栏 5 个 tab 始终可见。由 tab 决定是否显示 ——
   * 任务/收件箱两个 tab 选中 issue 时用它替换列表, 其余早退浮层 (搜索/通知/沙箱等)
   * 仍是整屏。返回统一走 setSelected(null): 顶部 [← 返回] / 左缘右滑 / 系统 back 三种。
   */
  const taskDetail = selected ? (
    <TaskDetailScreen
      issue={selected}
      company={company}
      onBack={() => setSelected(null)}
      onOpenSpec={(issue) => setSpecIssue(issue)}
      onOpenSandbox={(issueItem) => {
        void (async () => {
          const workProducts = await coolie
            .listWorkProducts(issueItem.id)
            .catch(() => [] as IssueWorkProduct[]);
          const prototype = workProducts.find(
            (wp) => wp.url || wp.type === "prototype" || wp.runtimeServiceId,
          );
          setSandboxContext({
            url: prototype?.url ?? null,
            service: null,
            workProduct: prototype ?? null,
            // wave138c — 即使没有原型交付物也进沙箱: 列表视图会列出该任务的全部
            // 交付物与附件; 真的空则给可操作空态, 不再是「预览未就绪」空屏。
            scope: {
              issueId: issueItem.id,
              issueTitle: issueItem.title,
              projectId: issueItem.projectId ?? null,
            },
            issue: issueItem,
          });
        })();
      }}
    />
  ) : null;

  let content: React.ReactNode;
  {
    // 固化外层 Shell：固定顶部状态栏 + 固定底部 TabBar (boss: APP 底部导航要固定起来的)
    //
    // wave138c — 全屏巡检硬规矩: 所有页面/功能都必须渲染在这个壳里(顶部状态栏与底部
    // TabBar 之间)。沙箱 / 代码 Diff / Web 容器 也从「整屏覆盖」收回壳内 —— 它们各自的
    // ScreenHeader 承载返回, hasSubHeader 抑制全局 AppBar, 底部 5 个 tab 始终可见可点。
    const hasSubHeader = Boolean(
      onboardingOpen ||
      sandboxContext ||
      specIssue ||
      diffContext ||
      webContainerTarget ||
      focusedApprovalId ||
      searchOpen ||
      notificationsOpen ||
      agentDetail ||
      pipelinesOpen ||
      plansOpen ||
      projectsOpen ||
      gitCredentialsOpen ||
      pluginManagerOpen ||
      // 本体子屏占位时不显示全局顶栏 (wave352 恢复 ontologyWorkbench 全屏图谱)
      schemaEditorType ||
      ontologyWorkbenchOpen,
    );

    content = (
      <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={[styles.shell, { paddingTop: Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 24) : 0 }]}>
        <StatusBar style="light" />
        {/* 未进入子屏时显示全局顶栏；进入项目中心/流水线/计划/员工详情等子屏时由子屏自身的 ScreenHeader 承载返回 */}
        {!hasSubHeader && (
          <AppBar
            unreadCount={unreadCount}
            onOpenNotifications={() => setNotificationsOpen(true)}
            onOpenSearch={() => setSearchOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}
        <View style={styles.shellContent}>
          {onboardingOpen ? (
            <WebContainerScreen
              initialPath={
                company.issuePrefix ? `/${company.issuePrefix}/onboarding` : "/onboarding"
              }
              title="新手引导"
              onBack={() => {
                setOnboardingOpen(false);
                void markOnboardingDone(companyId);
              }}
            />
          ) : sandboxContext ? (
            <PrototypeSandboxScreen
              company={company}
              initialUrl={sandboxContext.url}
              service={sandboxContext.service}
              workProduct={sandboxContext.workProduct}
              scope={sandboxContext.scope}
              onBack={() => setSandboxContext(null)}
              onCreateTask={() => {
                setSandboxContext(null);
                setComposeOpen(true);
              }}
              onOpenTask={
                sandboxContext.issue
                  ? () => {
                      const entryIssue = sandboxContext.issue;
                      if (!entryIssue) return;
                      setSandboxContext(null);
                      navigateTab("tasks");
                      setSelected(entryIssue);
                    }
                  : undefined
              }
              onOpenArtifacts={() => {
                setSandboxContext(null);
                navigateTab("artifacts");
              }}
            />
          ) : diffContext ? (
            <CodeDiffScreen
              company={company}
              issue={diffContext.issue}
              workProduct={diffContext.workProduct}
              onBack={() => setDiffContext(null)}
            />
          ) : specIssue ? (
            <SpecEditorScreen
              issue={specIssue}
              company={company}
              onBack={() => setSpecIssue(null)}
            />
          ) : webContainerTarget ? (
            <WebContainerScreen
              initialPath={webContainerTarget.path}
              initialUrl={webContainerTarget.url}
              title={webContainerTarget.title}
              onBack={() => setWebContainerTarget(null)}
            />
          ) : focusedApprovalId ? (
            <ApprovalFocusDetail
              companyId={companyId}
              approvalId={focusedApprovalId}
              onBack={() => setFocusedApprovalId(null)}
            />
          ) : searchOpen ? (
            <SearchScreen
              company={company}
              onBack={() => setSearchOpen(false)}
              onOpenIssue={(issueItem) => {
                setSearchOpen(false);
                navigateTab("tasks");
                setSelected(issueItem);
              }}
              onOpenAgent={(agent: SearchAgentResult) => {
                setSearchOpen(false);
                setAgentDetail(agent);
              }}
            />
          ) : notificationsOpen ? (
            <InboxScreen
              company={company}
              onBack={() => setNotificationsOpen(false)}
              onOpenIssue={(issueItem) => {
                setNotificationsOpen(false);
                navigateTab("tasks");
                setSelected(issueItem);
              }}
              onOpenApproval={(approvalId) => {
                setNotificationsOpen(false);
                setFocusedApprovalId(approvalId);
              }}
              onOpenWorkshop={() => {
                setNotificationsOpen(false);
                navigateTab("chat");
              }}
            />
          ) : agentDetail ? (
            <AgentDetailScreen
              company={company}
              agent={agentDetail}
              onBack={() => setAgentDetail(null)}
              onOpenIssue={(issueItem) => {
                setAgentDetail(null);
                navigateTab("tasks");
                setSelected(issueItem);
              }}
            />
          ) : pipelinesOpen ? (
            <PipelinesScreen
              company={company}
              onBack={() => setPipelinesOpen(false)}
              onOpenWeb={(path, title) =>
                setWebContainerTarget({ path, title: title ?? "流水线" })
              }
            />
          ) : plansOpen ? (
            <PlansScreen
              company={company}
              onBack={() => setPlansOpen(false)}
              onOpenPlan={(issue) => {
                setPlansOpen(false);
                navigateTab("tasks");
                setSelected(issue);
              }}
            />
          ) : projectsOpen ? (
            <ProjectsScreen
              company={company}
              onBack={() => setProjectsOpen(false)}
              onOpenWebProjects={(subPath?: string, title?: string) =>
                setWebContainerTarget({ path: subPath || "/projects", title: title || "项目中心" })
              }
              onOpenProjectTasks={(project) => {
                setProjectsOpen(false);
                setTasksFilterProjectId(project.id);
                navigateTab("tasks");
              }}
            />
          ) : gitCredentialsOpen ? (
            <GitCredentialsScreen company={company} onBack={() => setGitCredentialsOpen(false)} />
          ) : pluginManagerOpen ? (
            // wave275 (P0-02 插件设置): 独立条件渲染, 不嵌进 tab 三元, 不会被 dashboard 吞.
            <PluginManagerScreen
              company={company}
              onBack={() => setPluginManagerOpen(false)}
              onOpenPluginSettings={(p) => setPluginSettingsId(p.id)}
              onOpenWebPluginManager={() => {
                setWebContainerTarget({ path: "/plugins", title: "插件中心" });
                setPluginManagerOpen(false);
              }}
            />
          ) : pluginSettingsId ? (
            <PluginSettingsScreen
              company={company}
              pluginId={pluginSettingsId}
              onBack={() => setPluginSettingsId(null)}
            />
          ) : schemaEditorType ? (
            // wave239 — 屏 3 (SchemaEditor) 渲染.
            <OntologySchemaEditorScreen
              company={company}
              typeId={schemaEditorType.typeId}
              displayName={schemaEditorType.displayName}
              onBack={() => setSchemaEditorType(null)}
            />
          ) : ontologyWorkbenchOpen ? (
            // wave352 — 屏 4 (workbench 全屏图谱) 恢复 (v0.6.22 原样):
            // 独立条件渲染不嵌进 tab 三元, 入口在 资产→本体 (OrgAssetsScreen 图谱 pill)。
            <OntologyGraphWorkbenchScreen
              company={company}
              onBack={() => setOntologyWorkbenchOpen(false)}
            />
          ) : tab === "dashboard" ? (
            <DashboardScreen
              company={company}
              onOpenWebWorkbench={(path, title) =>
                setWebContainerTarget({ path: path || "/dashboard", title: title || "控制台" })
              }
              onOpenApprovals={() => {
                setSelected(null);
                setDiffContext(null);
                setSandboxContext(null);
                setFocusedApprovalId(null);
                navigateTab("tasks");
              }}
              onOpenApproval={(approvalId) => {
                navigateTab("tasks");
                setFocusedApprovalId(approvalId);
              }}
            />
          ) : tab === "inbox" ? (
            <InboxScreen
              company={company}
              onOpenApproval={(approvalId) => {
                navigateTab("tasks");
                setFocusedApprovalId(approvalId);
              }}
              onOpenIssue={(issue) => {
                navigateTab("tasks");
                setSelected(issue);
              }}
            />
          ) : tab === "chat" ? (
            <BoardChatScreen
              company={company}
              whoami={whoami}
              // COOA-4 走查注 (2026-10-04): 不加 navigateTab 是对的 — focusedApprovalId
              // 的浮层分支在上层三元链里先于 tab 分支求值 (见下方 ApprovalFocusDetail),
              // chat 里点「查看详情」直接盖到当前 tab 上, 返回键回到 chat。补 navigateTab
              // 反而会改变返回落点。
              onOpenApproval={(approvalId) => setFocusedApprovalId(approvalId)}
              onOpenIssue={(issue) => {
                navigateTab("tasks");
                setSelected(issue);
              }}
              onOpenPipeline={(pipelineId) => {
                void Linking.openURL(
                  `${COOLIE_BASE_URL}/pipelines/${encodeURIComponent(pipelineId)}`,
                ).catch(() => {
                  Alert.alert("无法打开 Pipeline", "请在浏览器里打开 Coolie Web 查看该 pipeline。");
                });
              }}
              onOpenPlan={(issue) => {
                navigateTab("tasks");
                setSelected(issue);
              }}
            />
          ) : tab === "assets" ? (
            <OrgAssetsScreen
              company={company}
              whoami={whoami}
              initialTab="ontology"
              onOpenIssue={(issue) => {
                navigateTab("tasks");
                setSelected(issue);
              }}
              onOpenProjectTasks={(project) => {
                setTasksFilterProjectId(project.id);
                navigateTab("tasks");
              }}
              onCreateTaskForProject={(project) => {
                setCreateTaskProjectId(project.id);
              }}
              onOpenWebProjects={(subPath?: string, title?: string) =>
                setWebContainerTarget({ path: subPath || "/projects", title: title || "项目中心" })
              }
              onOpenWebOntology={(subPath?: string, title?: string) =>
                setWebContainerTarget({ path: subPath || "/ontology", title: title || "本体可视化设计器" })
              }
              onOpenWebGovernance={(subPath?: string, title?: string) =>
                setWebContainerTarget({ path: subPath || "/governance", title: title || "架构治理工作台" })
              }
              onOpenSchemaEditor={(typeId, displayName) =>
                setSchemaEditorType({ typeId, displayName })
              }
              onOpenGraphWorkbench={() => setOntologyWorkbenchOpen(true)}
              onOpenWebWorkbench={(subPath?: string, title?: string) =>
                setWebContainerTarget({ path: subPath || "/dashboard", title: title || "控制台" })
              }
              onOpenSandbox={(url, service, wp, scope) =>
                setSandboxContext({ url, service, workProduct: wp, scope })
              }
              onOpenDiff={(issueItem, wp) =>
                setDiffContext({ issue: issueItem, workProduct: wp })
              }
              onOpenPluginManager={() => setPluginManagerOpen(true)}
              onOpenPrototypeSandbox={() => setSandboxContext({
                url: "",
                service: null,
                workProduct: null,
                scope: null,
              })}
            />
          ) : tab === "ontology" ? (
            <OntologyDomainListScreen
              company={company}
              whoami={whoami}
              onOpenWebOntology={() =>
                setWebContainerTarget({ path: "/ontology", title: "本体可视化设计器" })
              }
              onOpenSchemaEditor={(typeId, displayName) =>
                setSchemaEditorType({ typeId, displayName })
              }
            />
          ) : tab === "artifacts" ? (
            <ArtifactsScreen
              company={company}
              whoami={whoami}
              onOpenSandbox={(url, service, wp, scope) =>
                setSandboxContext({ url, service, workProduct: wp, scope })
              }
              onOpenDiff={(issueItem, wp) =>
                setDiffContext({ issue: issueItem, workProduct: wp })
              }
            />
          ) : tab === "agents" ? (
            <AgentsScreen
              company={company}
              onOpenIssue={(issue) => {
                navigateTab("tasks");
                setSelected(issue);
              }}
            />
          ) : tab === "tasks" ? (
            selected ? (
              taskDetail
            ) : (
              <TaskKanbanScreen
                company={company}
                refreshToken={tasksRefreshToken}
                initialProjectId={tasksFilterProjectId}
                onOpenIssue={setSelected}
              />
            )
          ) : null}
        </View>
        {appUpdate ? <AppUpdateCard info={appUpdate} onClose={() => setAppUpdate(null)} /> : null}
        {settingsOpen ? (
          <SettingsSheet
            whoami={whoami}
            ota={ota}
            onClose={() => setSettingsOpen(false)}
            onSignOut={onSignOut}
            workspaceGitEnabled={workspaceGitEnabled}
            onToggleWorkspaceGit={setWorkspaceGitEnabled}
            onOpenGitCredentials={() => {
              setSettingsOpen(false);
              setGitCredentialsOpen(true);
            }}
            onOpenNativeModules={() => {
              setSettingsOpen(false);
              setNativeModulesOpen(true);
            }}
          />
        ) : null}
        {nativeModulesOpen ? (
          <NativeModulesScreen onClose={() => setNativeModulesOpen(false)} />
        ) : null}
        {/* 底部导航 — 汇览 / 任务 / [+] / 员工 / 收件箱 (固定常驻) */}
        <TabBar
          tab={tab}
          onChange={(key) => {
            // 切 tab 时重置子页面，直达所选 tab 根界面 (boss: APP 底部导航要固定起来的)
            setComposeOpen(false);
            setSelected(null);
            setProjectsOpen(false);
            setPipelinesOpen(false);
            setPlansOpen(false);
            setAgentDetail(null);
            setGitCredentialsOpen(false);
            setSearchOpen(false);
            setNotificationsOpen(false);
            setFocusedApprovalId(null);
            setCreateTaskProjectId(null);
            setTasksFilterProjectId(null);
            // wave138c: 壳内的整屏子页(沙箱/Diff/Web 容器)也一并退出 —— 底栏 5 个 tab
            // 在任意页面都必须「可见且可点」, 点了就直达该 tab 根界面。
            setSandboxContext(null);
            setDiffContext(null);
            setWebContainerTarget(null);
            setSpecIssue(null);
            setOnboardingOpen(false);
            setNativeModulesOpen(false);
            navigateTab(key);
          }}
          onCreate={() => setComposeOpen(true)}
        />
      {/* 方案1: 中央 "+" 与项目快捷建单统一呼出极速新建任务弹窗 (两张卡: 主要内容 + 指派) */}
      <CreateTaskModal
        visible={composeOpen || createTaskProjectId !== null}
        companyId={companyId}
        agents={composerAgents}
        initialProjectId={createTaskProjectId}
        onClose={() => {
          setComposeOpen(false);
          setCreateTaskProjectId(null);
        }}
        onCreated={(issue) => {
          setComposeOpen(false);
          setCreateTaskProjectId(null);
          setTasksRefreshToken((value) => value + 1);
          Alert.alert("任务已创建", issue.title);
          navigateTab("tasks");
        }}
      />
    </SafeAreaView>
    </GestureHandlerRootView>
    );
  }

  // 左缘右滑的顶层包裹: 所有路由 (详情/浮层/tab) 都在它里面, 由 swipeBack 决定退到哪。
  return <EdgeSwipeBack onBack={swipeBack}>{content}</EdgeSwipeBack>;
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
      <ScreenHeader onBack={onBack} backLabel="返回驾驶舱" />

      <Text style={styles.detailTitle}>审批裁决</Text>

      {loading && !approval ? (
        <LoadingState style={styles.inlineLoader} />
      ) : error ? (
        <ErrorRetry variant="section" message={`⚠️ ${error}`} onRetry={() => void load()} />
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
  updateBannerIos: { flexDirection: "column", alignItems: "stretch" },
  updateIosHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  updateIosActions: { flexDirection: "row", gap: 8, marginTop: 10 },
  updateBtnGhost: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line },
  settingsBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
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
  composeOverlay: {
    ...StyleSheet.absoluteFillObject,
    // 让出底部 TabBar: absoluteFill 的 bottom:0 会把 5 个 tab 整个盖住, 底栏就点不到了
    // (boss 22:59 OOB)。浮层只铺内容区, 底栏保持可见可点。
    bottom: TAB_BAR_HEIGHT,
    // 绝对定位会忽略 SafeAreaView 的 paddingTop, 不补这一条头部(含关闭 X)会落到
    // Android 状态栏底下 —— 系统吃掉那块触摸, 浮层就关不掉了(实测)。
    paddingTop: Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 24) : 0,
    backgroundColor: C.bg,
    zIndex: 110,
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
  // wave172 — 单字段校验提示, 贴在对应输入框下面 (DESIGN.md: 用 C.err, 不引新色)。
  inputError: {
    color: C.err,
    fontSize: 12,
    fontWeight: "400",
    marginTop: -8,
  },
  readyHint: {
    color: C.ink4,
    fontSize: 12,
    fontWeight: "400",
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
  inlineLoader: {
    flex: 0,
    marginVertical: 24,
    paddingVertical: 0,
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
  // 注册按钮: 与主按钮并列的描边按钮 (DESIGN.md 第3节 ghost 变体)
  btnOutline: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  btnOutlineText: {
    color: C.ink2,
    fontWeight: "500",
    fontSize: 15,
  },
  btnDisabled: {
    opacity: 0.4,
  },
  // 卡片 (DESIGN.md 第3节: 卡片外壳统一由 ui/AppCard 提供)
  cardBetween: {
    justifyContent: "space-between",
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
  detailTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: C.ink,
    letterSpacing: -0.4,
  },
  detailCard: {
    gap: 12,
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
  sectionLoader: {
    flex: 0,
    marginVertical: 12,
    paddingVertical: 0,
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
