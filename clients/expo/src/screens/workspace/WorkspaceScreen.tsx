/**
 * 工作空间 (Workspace) —— ChatHome 左右栏的 RN 版
 *
 * 抄的是 ChatHome 的 **Tab 切换骨架**, 不是它 4928 行整页:
 * - 顶部一排 Tab: 对话 / 预览 / 文件 / 终端 (4 个, 不学它的整套 IDE 抽象)
 * - 当前 Tab 存在 Zustand store 里, 且落盘 —— 退出再进来还是原来那页
 * - 内容区按 activeTab 条件渲染对应 Tab 组件
 *
 * 拉起方式: App.tsx 顶部右上角 [Workspace] → 本组件的 Modal (animationType="slide")。
 */

import React, { useCallback } from "react";
import {
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  Platform,
  StatusBar as RNStatusBar,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import type { Company, Issue } from "@coolie/api-client";
import { C } from "../../coolie";
import { RADIUS, SPACING } from "../../ui/tokens";
import { ConversationTab } from "./ConversationTab";
import { PreviewTab } from "./PreviewTab";
import { FilesTab } from "./FilesTab";
import { TerminalTab } from "./TerminalTab";
import {
  WORKSPACE_TABS,
  useWorkspaceStore,
  type WorkspaceTab,
} from "./useWorkspaceStore";

export interface WorkspaceScreenProps {
  visible: boolean;
  company: Company;
  whoami?: string;
  onClose: () => void;
  onOpenIssue?: (issue: Issue) => void;
  onOpenApproval?: (approvalId: string) => void;
}

export function WorkspaceScreen({
  visible,
  company,
  whoami,
  onClose,
  onOpenIssue,
  onOpenApproval,
}: WorkspaceScreenProps) {
  const activeTab = useWorkspaceStore((s) => s.activeTab);
  const setTab = useWorkspaceStore((s) => s.setTab);
  const reset = useWorkspaceStore((s) => s.reset);

  const activeMeta = WORKSPACE_TABS.find((t) => t.key === activeTab) ?? WORKSPACE_TABS[0];

  const handleSelect = useCallback(
    (key: WorkspaceTab) => {
      setTab(key);
    },
    [setTab],
  );

  const renderContent = () => {
    switch (activeTab) {
      case "conversation":
        return (
          <ConversationTab
            company={company}
            whoami={whoami}
            onOpenIssue={onOpenIssue}
            onOpenApproval={onOpenApproval}
          />
        );
      case "preview":
        return <PreviewTab />;
      case "files":
        return <FilesTab />;
      case "terminal":
        return <TerminalTab />;
      default:
        return null;
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SafeAreaView
        style={[
          styles.safeArea,
          { paddingTop: Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 24) : 0 },
        ]}
      >
        <StatusBar style="light" />

        {/* 页头: 标题 + 作用域 + 关闭 */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="grid-outline" size={18} color={C.accent} />
            <View style={styles.headerTitleStack}>
              <Text style={styles.headerTitle}>工作空间</Text>
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {company.name}
                {whoami ? ` · ${whoami}` : ""}
              </Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <Pressable hitSlop={10} onPress={reset} style={styles.headerBtn}>
              <Ionicons name="refresh-outline" size={17} color={C.ink3} />
            </Pressable>
            <Pressable hitSlop={10} onPress={onClose} style={styles.headerBtn}>
              <Ionicons name="close" size={20} color={C.ink2} />
            </Pressable>
          </View>
        </View>

        {/* Tab 切换条 (对齐 ChatHome 的左右栏切换) */}
        <View style={styles.tabBar}>
          {WORKSPACE_TABS.map((tab) => {
            const active = tab.key === activeTab;
            return (
              <Pressable
                key={tab.key}
                style={[styles.tabBtn, active && styles.tabBtnActive]}
                onPress={() => handleSelect(tab.key)}
              >
                <Ionicons
                  name={tab.icon as React.ComponentProps<typeof Ionicons>["name"]}
                  size={16}
                  color={active ? C.accent : C.ink3}
                />
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* 当前 Tab 说明条 */}
        <View style={styles.metaBar}>
          <View style={styles.metaDot} />
          <Text style={styles.metaText}>{activeMeta.hint}</Text>
        </View>

        {/* 内容区: 条件渲染 */}
        <View style={styles.content}>{renderContent()}</View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  headerTitleStack: {
    flex: 1,
  },
  headerTitle: {
    color: C.ink,
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    color: C.ink4,
    fontSize: 11,
    marginTop: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  headerBtn: {
    padding: 6,
    borderRadius: RADIUS.sm,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    gap: SPACING.xs,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 9,
    borderRadius: RADIUS.md,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1,
    borderColor: C.line,
  },
  tabBtnActive: {
    backgroundColor: "rgba(94,106,210,0.14)",
    borderColor: C.brand,
  },
  tabLabel: {
    color: C.ink3,
    fontSize: 13,
    fontWeight: "500",
  },
  tabLabelActive: {
    color: C.accent,
  },
  metaBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  metaDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.accent,
  },
  metaText: {
    color: C.ink4,
    fontSize: 11,
  },
  content: {
    flex: 1,
  },
});

export default WorkspaceScreen;
