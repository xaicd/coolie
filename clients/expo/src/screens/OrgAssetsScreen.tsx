import { useState } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import type {
  Company,
  Issue,
  IssueWorkProduct,
  Project,
  WorkspaceRuntimeService,
} from "@coolie/api-client";
import { C } from "../coolie";
import { RADIUS } from "../ui/tokens";
import { SegmentedControl } from "../ui/SegmentedControl";
import { OntologyDomainListScreen } from "./OntologyDomainListScreen";
import { ArchitectureGovernanceScreen } from "./ArchitectureGovernanceScreen";
import { ProjectsScreen } from "./ProjectsScreen";
import { AgentsScreen } from "./AgentsScreen";
import { ArtifactsScreen } from "./ArtifactsScreen";
import type { SandboxScope } from "./PrototypeSandboxScreen";
import { PluginOrgSwitcher } from "../components/PluginOrgSwitcher";

export type OrgAssetTab = "ontology" | "architecture" | "projects" | "agents" | "artifacts";

interface OrgAssetsScreenProps {
  company: Company;
  switchableCompanies?: Company[];
  onSwitchCompany?: (next: Company) => void;
  whoami?: string;
  initialTab?: OrgAssetTab;
  initialArtifactsProjectId?: string | null;
  onOpenIssue: (issue: Issue) => void;
  onOpenProjectTasks?: (project: Project) => void;
  onCreateTaskForProject?: (project: Project) => void;
  onOpenWebProjects?: (path?: string, title?: string) => void;
  onOpenWebOntology?: (path?: string, title?: string) => void;
  onOpenWebGovernance?: (path?: string, title?: string) => void;
  onOpenSchemaEditor?: (typeId: string, displayName: string) => void;
  onOpenInstanceGraph?: (typeId: string, displayName: string) => void;
  onOpenWorkbench?: () => void;
  onOpenWebWorkbench?: (path?: string, title?: string) => void;
  onOpenSandbox?: (
    url: string,
    service?: WorkspaceRuntimeService | null,
    wp?: IssueWorkProduct | null,
    scope?: SandboxScope | null,
  ) => void;
  onOpenDiff?: (issue: Issue, wp?: IssueWorkProduct | null) => void;
  onOpenPluginManager?: () => void;
  onOpenPrototypeSandbox?: () => void;
  onOpenOnboarding?: () => void;
}

const TAB_OPTIONS: Array<{ key: OrgAssetTab; label: string }> = [
  { key: "ontology", label: "🧠 本体" },
  { key: "architecture", label: "📐 架构" },
  { key: "projects", label: "📁 项目" },
  { key: "agents", label: "👥 员工" },
  { key: "artifacts", label: "📦 产物" },
];

/**
 * 资产与组织中枢 (OrgAssetsScreen)。
 * 彻底恢复 5 天前经典极简、清爽好看的原生大盘架构：
 * 1. 顶部 Header 极简克制，左侧标题，右侧仅保留高频直达胶囊（🎨 原型沙箱 / 成本核算）。
 * 2. 四大 Tab 齐整齐平（业务本体、项目中心、数字员工、交付产物），拒绝任何二级抽屉遮挡。
 * 3. 彻底消除伪功能和按钮堆砌，能力 100% 具备，零功能缩水。
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
  onOpenWebGovernance,
  onOpenSchemaEditor,
  onOpenInstanceGraph,
  onOpenWorkbench,
  onOpenWebWorkbench,
  onOpenSandbox,
  onOpenDiff,
  onOpenPluginManager,
  onOpenPrototypeSandbox,
  onOpenOnboarding,
}: OrgAssetsScreenProps) {
  const [activeTab, setActiveTab] = useState<OrgAssetTab>(initialTab);
  const [artifactsProjectId, setArtifactsProjectId] = useState<string | null>(
    initialArtifactsProjectId ?? null,
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      {/* 顶部资产切换分段控制器 */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>资产与组织</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {company.name}
            </Text>
          </View>
          <View style={styles.extraPillsRow}>
            {/* 多公司组织切换器 */}
            {onSwitchCompany && switchableCompanies && switchableCompanies.length > 1 ? (
              <PluginOrgSwitcher
                currentCompany={company}
                companies={switchableCompanies}
                onSwitch={onSwitchCompany}
              />
            ) : null}

            {/* 🎨 原型沙箱一级直达通道 */}
            {onOpenPrototypeSandbox ? (
              <Pressable
                style={[styles.extraPill, styles.extraPillSandbox]}
                onPress={() => onOpenPrototypeSandbox()}
                hitSlop={6}
                accessibilityLabel="原型沙箱"
              >
                <Ionicons name="cube-outline" size={12} color="#A78BFA" />
                <Text style={[styles.extraPillText, { color: "#A78BFA", fontWeight: "600" }]}>
                  原型沙箱
                </Text>
              </Pressable>
            ) : null}

            {/* 全景成本分析快捷入口 */}
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
          </View>
        </View>

        {/* 经典四大核心资产一键切换 */}
        <SegmentedControl
          options={TAB_OPTIONS}
          value={activeTab}
          onChange={(val) => setActiveTab(val as OrgAssetTab)}
          style={styles.segmentedControl}
        />
      </View>

      {/* 核心内容区：四大核心资产平滑呈现，零层级遮挡 */}
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

        {activeTab === "architecture" && (
          <ArchitectureGovernanceScreen
            company={company}
            whoami={whoami}
            onOpenProjectTasks={onOpenProjectTasks}
            onOpenWebGovernance={onOpenWebGovernance}
            onOpenWebOntology={onOpenWebOntology}
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
            onOpenPrototypeSandbox={onOpenPrototypeSandbox}
            onOpenDiff={(issue, wp) => onOpenDiff?.(issue, wp)}
          />
        )}
      </View>
    </SafeAreaView>
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
    marginTop: 1,
  },
  extraPillsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
  extraPillSandbox: {
    borderColor: "rgba(167, 139, 250, 0.35)",
    backgroundColor: "rgba(167, 139, 250, 0.12)",
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
});
