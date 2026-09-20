import { useCallback, useEffect, useState } from "react";
import {
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import type { Company } from "@coolie/api-client";
import {
  C,
  restoreCredential,
  signOutEverywhere,
  type Credential,
} from "./src/coolie";
import { LoadingState } from "./src/ui/LoadingState";
import { CompanyGate, SignInScreen } from "./src/screens/AuthGate";
import { AppUpdateCard, SettingsSheet } from "./src/screens/SettingsSheet";
import { TasksScreen } from "./src/screens/tasks/TasksScreen";
import { TaskDetailScreen } from "./src/screens/tasks/TaskDetailScreen";
import { ApprovalFocusScreen } from "./src/screens/tasks/ApprovalFocusScreen";
import { CompanyProvider, useCompany } from "./src/providers/CompanyProvider";
import { IssuesProvider } from "./src/providers/IssuesProvider";
import {
  useAppNavigator,
  usePromptForBack,
  type TabKey,
} from "./src/navigation/appNavigator";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { CodeDiffScreen } from "./src/screens/CodeDiffScreen";
import { OntologyDomainListScreen } from "./src/screens/ontology/OntologyDomainListScreen";
import { ArtifactsScreen } from "./src/screens/ArtifactsScreen";
import { PrototypeSandboxScreen } from "./src/screens/PrototypeSandboxScreen";
import { BoardChatScreen } from "./src/screens/BoardChatScreen";
import { AgentsScreen } from "./src/screens/AgentsScreen";
import { useOTA, setupOTAListener } from "./src/OTA";
import { checkAppVersion, type RemoteVersionInfo } from "./src/AppVersion";

/**
 * Coolie mobile client — Linear 设计系统重构版。
 *
 * App.tsx 只留外壳: 登录 → 选公司 → HomeShell (底部 tab + 浮层栈)。任务页的
 * 列表/创建/详情分别住在 src/screens/tasks/ 与 src/components/tasks/。
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
      <SafeAreaView style={[styles.center, styles.androidTop]}>
        <LoadingState size="small" />
      </SafeAreaView>
    );
  }

  return credential ? (
    <CompanyGate
      credential={credential}
      onSignOut={signOut}
      renderHome={(company, whoami) => (
        <HomeScreen company={company} whoami={whoami} onSignOut={signOut} />
      )}
    />
  ) : (
    <SignInScreen onSignedIn={setCredential} />
  );
}

/** 公司上下文 + 任务数据上下文的边界: 屏幕据此停止逐层透传 company/whoami */
function HomeScreen({
  company,
  whoami,
  onSignOut,
}: {
  company: Company;
  whoami: string;
  onSignOut: () => void;
}) {
  return (
    <CompanyProvider company={company} whoami={whoami} onSignOut={onSignOut}>
      <IssuesProvider>
        <HomeShell />
      </IssuesProvider>
    </CompanyProvider>
  );
}

function HomeShell() {
  const { company, whoami, onSignOut } = useCompany();
  const { tab, top, canGoBack, selectTab, push, back, openTask } =
    useAppNavigator();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appUpdate, setAppUpdate] = useState<RemoteVersionInfo | null>(null);
  const ota = useOTA();

  useEffect(() => {
    void checkAppVersion().then((r) => {
      if (r.updateAvailable && r.info) setAppUpdate(r.info);
    });
  }, []);

  // Android 硬件返回键 = 浮层出栈 (栈空时交回系统)
  usePromptForBack(canGoBack, back);

  // 浮层栈顶优先于 tab, 且只渲染栈顶 —— 这就是审计 bug 1 的根治: 不在栈里的页面
  // 不可能残留, 所以切 tab 一定能看到目标页。
  if (top?.name === "sandbox") {
    return (
      <PrototypeSandboxScreen
        company={company}
        initialUrl={top.url}
        service={top.service}
        workProduct={top.workProduct}
        onBack={back}
      />
    );
  }

  if (top?.name === "codeDiff") {
    return (
      <CodeDiffScreen
        company={company}
        issue={top.issue}
        workProduct={top.workProduct}
        onBack={back}
      />
    );
  }

  if (top?.name === "approvalDetail") {
    return (
      <ApprovalFocusScreen
        companyId={company.id}
        approvalId={top.approvalId}
        onBack={back}
      />
    );
  }

  if (top?.name === "taskDetail") {
    return (
      <TaskDetailScreen
        issue={top.issue}
        onBack={back}
        onOpenDiff={(issue, workProduct) =>
          push({ name: "codeDiff", issue, workProduct })
        }
        onOpenSandbox={(url, service, workProduct) =>
          push({ name: "sandbox", url, service, workProduct })
        }
      />
    );
  }

  return (
    <SafeAreaView style={[styles.shell, styles.androidTop]}>
      <StatusBar style="light" />
      <View style={styles.shellContent}>
        {tab === "dashboard" ? (
          <DashboardScreen
            company={company}
            onOpenSettings={() => setSettingsOpen(true)}
            // 审计 bug 1: 审批卡点击原先只 setTab("tasks"), 只要四个浮层里有一个残留,
            // tab 变了屏幕上仍是原页面。selectTab 一次性清空浮层栈, 任务页必定渲染。
            onOpenApprovals={() => selectTab("tasks")}
            onOpenApproval={(approvalId) => {
              // 审计 bug 1: 审批行自带 Pressable, 会抢占手势响应, 父卡片的 onPress 不会
              // 触发, 所以行内点击原先从不切 tab。与 agents/chat 的 onOpenIssue 一致:
              // 先切 tab 再压入详情。
              selectTab("tasks");
              push({ name: "approvalDetail", approvalId });
            }}
          />
        ) : tab === "agents" ? (
          <AgentsScreen
            company={company}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenIssue={openTask}
          />
        ) : tab === "chat" ? (
          <BoardChatScreen
            company={company}
            whoami={whoami}
            onOpenSettings={() => setSettingsOpen(true)}
            // 工坊不切 tab: 裁决完返回时仍落在工坊
            onOpenApproval={(approvalId) =>
              push({ name: "approvalDetail", approvalId })
            }
            onOpenIssue={openTask}
          />
        ) : tab === "ontology" ? (
          <OntologyDomainListScreen
            company={company}
            whoami={whoami}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        ) : tab === "artifacts" ? (
          <ArtifactsScreen
            company={company}
            whoami={whoami}
            onOpenSandbox={(url, service, workProduct) =>
              push({ name: "sandbox", url, service, workProduct })
            }
            onOpenDiff={(issue, workProduct) =>
              push({ name: "codeDiff", issue, workProduct })
            }
          />
        ) : tab === "tasks" ? (
          <TasksScreen
            onOpenIssue={openTask}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenArtifacts={() => selectTab("artifacts")}
          />
        ) : null}
      </View>
      {appUpdate ? (
        <AppUpdateCard info={appUpdate} onClose={() => setAppUpdate(null)} />
      ) : null}
      {settingsOpen ? (
        <SettingsSheet
          whoami={whoami}
          ota={ota}
          onClose={() => setSettingsOpen(false)}
          onSignOut={onSignOut}
        />
      ) : null}
      <BottomTabBar tab={tab} onChange={selectTab} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.bg,
  },
  androidTop: {
    paddingTop:
      Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 24) : 0,
  },
  shell: {
    flex: 1,
    backgroundColor: C.bg,
  },
  shellContent: {
    flex: 1,
  },
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
});
