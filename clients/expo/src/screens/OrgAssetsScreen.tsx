import { useState } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import type { Company, Issue, IssueWorkProduct, Project, WorkspaceRuntimeService } from "@coolie/api-client";
import { C } from "../theme";
import { RADIUS } from "../ui/tokens";
import { SegmentedControl } from "../ui/SegmentedControl";
import { OntologyDomainListScreen } from "./OntologyDomainListScreen";
import { ProjectsScreen } from "./ProjectsScreen";
import { AgentsScreen } from "./AgentsScreen";
import { ArtifactsScreen } from "./ArtifactsScreen";

export type OrgAssetTab = "ontology" | "projects" | "agents" | "artifacts";

interface OrgAssetsScreenProps {
  company: Company;
  whoami?: string;
  initialTab?: OrgAssetTab;
  onOpenIssue: (issue: Issue) => void;
  onOpenProjectTasks?: (project: Project) => void;
  onCreateTaskForProject?: (project: Project) => void;
  onOpenWebProjects?: (path?: string, title?: string) => void;
  onOpenWebOntology?: (path?: string, title?: string) => void;
  onOpenWebWorkbench?: (path?: string, title?: string) => void;
  onOpenSandbox?: (url: string, service?: WorkspaceRuntimeService | null, wp?: IssueWorkProduct | null) => void;
  onOpenDiff?: (issue: Issue, wp?: IssueWorkProduct | null) => void;
}

const TAB_OPTIONS: Array<{ key: OrgAssetTab; label: string }> = [
  { key: "ontology", label: "🧠 业务本体" },
  { key: "projects", label: "📁 项目中心" },
  { key: "agents", label: "👥 数字员工" },
  { key: "artifacts", label: "📦 交付产物" },
];

/**
 * 资产与组织中枢 (OrgAssetsScreen)。
 * 彻底解决「本体藏太深、员工进不去、项目无治理」的痛点：
 * 将公司核心数字资产（业务本体、微服务项目、数字员工、交付产物、例行计划、成本核算）
 * 全部汇聚于 Tab 5，一键秒级平滑切换，能力 100% 完整具备，零功能缩水。
 */
export function OrgAssetsScreen({
  company,
  whoami,
  initialTab = "ontology",
  onOpenIssue,
  onOpenProjectTasks,
  onCreateTaskForProject,
  onOpenWebProjects,
  onOpenWebOntology,
  onOpenWebWorkbench,
  onOpenSandbox,
  onOpenDiff,
}: OrgAssetsScreenProps) {
  const [activeTab, setActiveTab] = useState<OrgAssetTab>(initialTab);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      {/* 顶部资产切换分段控制器 */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View>
            <Text style={styles.headerTitle}>资产与组织</Text>
            <Text style={styles.headerSubtitle}>{company.name}</Text>
          </View>
          {onOpenWebWorkbench ? (
            <View style={styles.extraPillsRow}>
              <Pressable
                style={styles.extraPill}
                onPress={() => onOpenWebWorkbench("/routines", "例行计划调度")}
                hitSlop={6}
                accessibilityLabel="例行计划调度"
              >
                <Ionicons name="time-outline" size={12} color="#06B6D4" />
                <Text style={styles.extraPillText}>例行计划</Text>
              </Pressable>
              <Pressable
                style={styles.extraPill}
                onPress={() => onOpenWebWorkbench("/costs", "全景成本分析")}
                hitSlop={6}
                accessibilityLabel="全景成本分析"
              >
                <Ionicons name="cash-outline" size={12} color="#10B981" />
                <Text style={styles.extraPillText}>成本核算</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
        <SegmentedControl
          options={TAB_OPTIONS}
          value={activeTab}
          onChange={(val) => setActiveTab(val as OrgAssetTab)}
          style={styles.segmentedControl}
        />
      </View>

      {/* 核心内容区：四大核心资产无缝呈现 */}
      <View style={styles.content}>
        {activeTab === "ontology" && (
          <OntologyDomainListScreen
            company={company}
            whoami={whoami}
            onOpenWebOntology={() => onOpenWebOntology?.("/ontology", "本体可视化设计器")}
          />
        )}

        {activeTab === "projects" && (
          <ProjectsScreen
            company={company}
            onBack={() => setActiveTab("ontology")}
            onOpenProjectTasks={onOpenProjectTasks}
            onCreateTaskForProject={onCreateTaskForProject}
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
            onOpenSandbox={(url, service, wp) => onOpenSandbox?.(url, service, wp)}
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
    fontWeight: "700",
    color: C.ink,
  },
  headerSubtitle: {
    fontSize: 12,
    color: C.ink3,
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
