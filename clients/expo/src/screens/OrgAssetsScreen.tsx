import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import type {
  Company,
  Issue,
  IssueWorkProduct,
  Project,
  WorkspaceRuntimeService,
} from "@coolie/api-client";
import { C } from "../theme";
import { RADIUS } from "../ui/tokens";
import { SegmentedControl } from "../ui/SegmentedControl";
import { OntologyDomainListScreen } from "./OntologyDomainListScreen";
import { ProjectsScreen } from "./ProjectsScreen";
import { AgentsScreen } from "./AgentsScreen";
import { ArtifactsScreen } from "./ArtifactsScreen";
import type { SandboxScope } from "./PrototypeSandboxScreen";
import { PluginOrgSwitcher } from "../components/PluginOrgSwitcher";

export type OrgAssetTab = "ontology" | "projects" | "agents" | "artifacts";

interface OrgAssetsScreenProps {
  company: Company;
  /** wave235 — 同一凭证下可见的其它 companies, 用来顶部切换. 单公司时为 [company] 或空数组. */
  switchableCompanies?: Company[];
  /** wave235 — 用户选了另一个 company, App 层负责重置所有屏缓存. */
  onSwitchCompany?: (next: Company) => void;
  whoami?: string;
  initialTab?: OrgAssetTab;
  /** wave153 — 进入时预设的产物项目筛选 (项目卡「查看产物」直达). */
  initialArtifactsProjectId?: string | null;
  onOpenIssue: (issue: Issue) => void;
  onOpenProjectTasks?: (project: Project) => void;
  onCreateTaskForProject?: (project: Project) => void;
  onOpenWebProjects?: (path?: string, title?: string) => void;
  onOpenWebOntology?: (path?: string, title?: string) => void;
  // wave239 — 屏 3 (schema editor) 入口. typeId 是 OntologyDomain.id.
  onOpenSchemaEditor?: (typeId: string, displayName: string) => void;
  // wave239 — 屏 2 (instance graph) 入口.
  onOpenInstanceGraph?: (typeId: string, displayName: string) => void;
  onOpenWebWorkbench?: (path?: string, title?: string) => void;
  onOpenSandbox?: (
    url: string,
    service?: WorkspaceRuntimeService | null,
    wp?: IssueWorkProduct | null,
    scope?: SandboxScope | null,
  ) => void;
  onOpenDiff?: (issue: Issue, wp?: IssueWorkProduct | null) => void;
  /** wave235 — 跳到 App 内 PluginManagerScreen (不离开当前 tab). */
  onOpenPluginManager?: () => void;
  /** wave235 — 跳到原型沙箱 (Plate / 画图) 入口. */
  onOpenPrototypeSandbox?: () => void;
  /** wave235 — 跳到新员工入职引导入口. */
  onOpenOnboarding?: () => void;
}

const TAB_OPTIONS: Array<{ key: OrgAssetTab; label: string }> = [
  { key: "ontology", label: "🧠 业务本体" },
  { key: "projects", label: "📁 项目中心" },
  { key: "agents", label: "👥 数字员工" },
  { key: "artifacts", label: "📦 交付产物" },
];

/**
 * 资产与组织中枢 (OrgAssetsScreen)。
 * 彻底解决「本体藏太深、员工进不去、项目无治理」的痛点:
 * 将公司核心数字资产(业务本体、微服务项目、数字员工、交付产物、例行计划、成本核算)
 * 全部汇聚于 Tab 5, 一键秒级平滑切换, 能力 100% 完整具备, 零功能缩水。
 *
 * wave235 新增: 顶部"组织切换器" (单公司场景下隐), 4 个新 pill 入口
 * (插件 / 画图 / 入职 / 完整市场) 收进"更多"下拉, 不抢 segmented control 的位置。
 */
export function OrgAssetsScreen({
  company,
  switchableCompanies,
  onSwitchCompany,
  whoami,
  initialTab = "ontology",
  initialArtifactsProjectId,
  onOpenIssue,
  onOpenProjectTasks,
  onCreateTaskForProject,
  onOpenWebProjects,
  onOpenWebOntology,
  onOpenSchemaEditor,
  onOpenInstanceGraph,
  onOpenWebWorkbench,
  onOpenSandbox,
  onOpenDiff,
  onOpenPluginManager,
  onOpenPrototypeSandbox,
  onOpenOnboarding,
}: OrgAssetsScreenProps) {
  const [activeTab, setActiveTab] = useState<OrgAssetTab>(initialTab);
  // wave153 — 项目卡「查看产物」把项目 id 带进来, 切到产物 Tab 并按该项目筛选。
  const [artifactsProjectId, setArtifactsProjectId] = useState<string | null>(
    initialArtifactsProjectId ?? null,
  );
  // wave235 — "更多"下拉.
  const [moreOpen, setMoreOpen] = useState(false);

  const switchable = useMemo<Company[]>(
    () => switchableCompanies ?? [company],
    [switchableCompanies, company],
  );

  const handleSwitch = (next: Company) => {
    setMoreOpen(false);
    onSwitchCompany?.(next);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      {/* 顶部资产切换分段控制器 */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.headerTitle}>资产与组织</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {company.name}
            </Text>
          </View>
          <View style={styles.extraPillsRow}>
            {/* wave235 — 组织切换器 (多公司时才有意义) */}
            {onSwitchCompany ? (
              <PluginOrgSwitcher
                currentCompany={company}
                companies={switchable}
                onSwitch={handleSwitch}
              />
            ) : null}
            {onOpenWebWorkbench ? (
              <Pressable
                style={styles.extraPill}
                onPress={() => onOpenWebWorkbench("/routines", "例行计划调度")}
                hitSlop={6}
                accessibilityLabel="例行计划调度"
              >
                <Ionicons name="time-outline" size={12} color="#06B6D4" />
                <Text style={styles.extraPillText}>例行计划</Text>
              </Pressable>
            ) : null}
            {onOpenWebWorkbench ? (
              <Pressable
                style={styles.extraPill}
                onPress={() => onOpenWebWorkbench("/costs", "全景成本分析")}
                hitSlop={6}
                accessibilityLabel="全景成本分析"
              >
                <Ionicons name="cash-outline" size={12} color="#10B981" />
                <Text style={styles.extraPillText}>成本核算</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={styles.extraPill}
              onPress={() => setMoreOpen(true)}
              hitSlop={6}
              accessibilityLabel="更多"
            >
              <Ionicons name="ellipsis-horizontal" size={12} color={C.accent} />
              <Text style={[styles.extraPillText, { color: C.accent }]}>更多</Text>
            </Pressable>
          </View>
        </View>
        <SegmentedControl
          options={TAB_OPTIONS}
          value={activeTab}
          onChange={(val) => setActiveTab(val as OrgAssetTab)}
          style={styles.segmentedControl}
        />
      </View>

      {/* 核心内容区: 四大核心资产无缝呈现 */}
      <View style={styles.content}>
        {activeTab === "ontology" && (
          <OntologyDomainListScreen
            company={company}
            whoami={whoami}
            onOpenWebOntology={() => onOpenWebOntology?.("/ontology", "本体可视化设计器")}
            onOpenSchemaEditor={onOpenSchemaEditor}
            onOpenInstanceGraph={onOpenInstanceGraph}
          />
        )}

        {activeTab === "projects" && (
          <ProjectsScreen
            company={company}
            onBack={() => setActiveTab("ontology")}
            onOpenProjectTasks={onOpenProjectTasks}
            onCreateTaskForProject={onCreateTaskForProject}
            onOpenProjectArtifacts={(project) => {
              setArtifactsProjectId(project.id);
              setActiveTab("artifacts");
            }}
            onOpenWebProjects={onOpenWebProjects}
          />
        )}

        {activeTab === "agents" && (
          <AgentsScreen
            company={company}
            onOpenIssue={onOpenIssue}
          />
        )}

        {activeTab === "artifacts" && (
          <ArtifactsScreen
            company={company}
            whoami={whoami}
            initialProjectId={artifactsProjectId}
            onOpenSandbox={(url, service, wp, scope) => onOpenSandbox?.(url, service, wp, scope)}
            onOpenDiff={(issue, wp) => onOpenDiff?.(issue, wp)}
          />
        )}
      </View>

      {/* wave235 — "更多" 下拉, 4 个新入口 */}
      <MoreSheet
        visible={moreOpen}
        onClose={() => setMoreOpen(false)}
        onOpenPluginManager={onOpenPluginManager}
        onOpenPrototypeSandbox={onOpenPrototypeSandbox}
        onOpenOnboarding={onOpenOnboarding}
        onOpenWebWorkbench={onOpenWebWorkbench}
      />
    </SafeAreaView>
  );
}

interface MoreSheetProps {
  visible: boolean;
  onClose: () => void;
  onOpenPluginManager?: () => void;
  onOpenPrototypeSandbox?: () => void;
  onOpenOnboarding?: () => void;
  onOpenWebWorkbench?: (path?: string, title?: string) => void;
}

function MoreSheet({
  visible,
  onClose,
  onOpenPluginManager,
  onOpenPrototypeSandbox,
  onOpenOnboarding,
  onOpenWebWorkbench,
}: MoreSheetProps) {
  const items: Array<{
    key: string;
    icon: React.ComponentProps<typeof Ionicons>["name"];
    color: string;
    label: string;
    sub: string;
    onPress: () => void;
    enabled: boolean;
  }> = [
    {
      key: "plugins",
      icon: "apps-outline",
      color: "#A78BFA",
      label: "插件管理",
      sub: "App 端启停 / 配置已装插件",
      onPress: () => {
        onClose();
        onOpenPluginManager?.();
      },
      enabled: Boolean(onOpenPluginManager),
    },
    {
      key: "prototype",
      icon: "color-palette-outline",
      color: "#F472B6",
      label: "画图 / 原型",
      sub: "打开原型沙箱 (PlateOrgAssets 入口)",
      onPress: () => {
        onClose();
        onOpenPrototypeSandbox?.();
      },
      enabled: Boolean(onOpenPrototypeSandbox),
    },
    {
      key: "onboard",
      icon: "person-add-outline",
      color: "#22D3EE",
      label: "新增实例",
      sub: "入职流程 (OnboardFlowEntry 入口)",
      onPress: () => {
        onClose();
        onOpenOnboarding?.();
      },
      enabled: Boolean(onOpenOnboarding),
    },
    {
      key: "showcase",
      icon: "sparkles-outline",
      color: "#FACC15",
      label: "插件产物展示",
      sub: "Web 端查看已装插件产出的工件",
      onPress: () => {
        onClose();
        onOpenWebWorkbench?.("/plugins", "插件中心");
      },
      enabled: Boolean(onOpenWebWorkbench),
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.moreBackdrop} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={styles.moreSheet}
        >
          <Text style={styles.moreTitle}>更多入口</Text>
          <Text style={styles.moreSubtitle}>从 web 端抄过来的 4 个组织/插件视图</Text>
          <ScrollView style={{ maxHeight: 360 }}>
            {items.map((item) => (
              <Pressable
                key={item.key}
                onPress={item.enabled ? item.onPress : undefined}
                disabled={!item.enabled}
                style={({ pressed }) => [
                  styles.moreItem,
                  pressed && item.enabled && styles.moreItemPressed,
                  !item.enabled && styles.moreItemDisabled,
                ]}
                hitSlop={4}
              >
                <View style={[styles.moreIcon, { backgroundColor: `${item.color}22` }]}>
                  <Ionicons name={item.icon} size={18} color={item.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.moreItemLabel}>{item.label}</Text>
                  <Text style={styles.moreItemSub}>{item.sub}</Text>
                </View>
                {item.enabled ? (
                  <Ionicons name="chevron-forward" size={14} color={C.ink3} />
                ) : (
                  <Text style={styles.moreItemMuted}>未启用</Text>
                )}
              </Pressable>
            ))}
          </ScrollView>
          <Pressable onPress={onClose} style={styles.moreClose} hitSlop={4}>
            <Text style={styles.moreCloseText}>关闭</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: C.panel,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: C.ink,
  },
  headerSubtitle: {
    fontSize: 12,
    color: C.ink3,
  },
  extraPillsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  extraPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
  },
  extraPillText: {
    fontSize: 11,
    color: C.ink2,
    fontWeight: "500",
  },
  segmentedControl: {
    marginBottom: 2,
  },
  content: {
    flex: 1,
  },
  moreBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  moreSheet: {
    backgroundColor: C.panel,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingTop: 16,
    paddingBottom: 24,
    paddingHorizontal: 16,
  },
  moreTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: C.ink,
    textAlign: "center",
  },
  moreSubtitle: {
    fontSize: 11,
    color: C.ink4,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 12,
  },
  moreItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.line,
    marginBottom: 8,
    backgroundColor: C.bg,
  },
  moreItemPressed: {
    backgroundColor: C.lineSubtle,
  },
  moreItemDisabled: {
    opacity: 0.45,
  },
  moreIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  moreItemLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: C.ink,
  },
  moreItemSub: {
    fontSize: 11,
    color: C.ink4,
    marginTop: 1,
  },
  moreItemMuted: {
    fontSize: 10,
    color: C.ink4,
  },
  moreClose: {
    marginTop: 4,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: RADIUS.md,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
  },
  moreCloseText: {
    fontSize: 13,
    color: C.ink2,
  },
});
