import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../coolie";
import { Pill } from "../ui/Pill";
import { StatusDot } from "./StatusDot";

export interface FleetEmployee {
  id: string;
  name: string;
  title: string;
  stage: string;
  avatar: string;
  roleDescription: string;
  governanceGate: string;
  activeSkill: string;
  toolchain: string;
  status: "ready" | "busy";
  statusText: string;
}

const FLEET_MEMBERS: FleetEmployee[] = [
  {
    id: "hermes",
    name: "Hermes",
    title: "总控副官",
    stage: "G0",
    avatar: "⚡",
    roleDescription: "商业立项总控 · 意图转译 · 8要素派工编排",
    governanceGate: "立项总控",
    activeSkill: "speckit-workflow · ops-task-orchestration",
    toolchain: "hermes-cli · dispatch · context-bus",
    status: "ready",
    statusText: "就绪",
  },
  {
    id: "modou",
    name: "墨斗",
    title: "前线架构 (FDA)",
    stage: "G1-G2",
    avatar: "📐",
    roleDescription: "80/20 开源基座对标 · EARS需求SRS · DAR选型",
    governanceGate: "G1需求 / G2架构",
    activeSkill: "speckit-workflow · cmmi-req-spec · cmmi-tech-solution",
    toolchain: "claude-glm · agy-gemini · --dangerously-skip-permissions",
    status: "ready",
    statusText: "就绪",
  },
  {
    id: "tiejiang",
    name: "铁匠",
    title: "平台研发 (SWE)",
    stage: "G3",
    avatar: "🔨",
    roleDescription: "OpenAPI契约规范 · 0编译报错 · 单向依赖守卫",
    governanceGate: "G3编译门禁",
    activeSkill: "speckit-workflow · core-swe",
    toolchain: "cmd · copilot · --yolo · --tools-all",
    status: "ready",
    statusText: "就绪",
  },
  {
    id: "menshen",
    name: "门神",
    title: "真机验收 (FDSE)",
    stage: "G4",
    avatar: "🛡️",
    roleDescription: "端到端业务旅程 · UI四态快照 · 交互防抖验收",
    governanceGate: "G4验收门禁",
    activeSkill: "cmmi-ver-val · qa-humanlike-e2e",
    toolchain: "agent-device · playwright · adb",
    status: "ready",
    statusText: "就绪",
  },
  {
    id: "doudiyuan",
    name: "兜底渊",
    title: "投产守卫 (SRE)",
    stage: "G5",
    avatar: "⚓",
    roleDescription: "不可变制品指纹 · 7处版本一致 · 秒级回滚SOP",
    governanceGate: "G5投产门禁",
    activeSkill: "cmmi-immutable-release · pre-sre",
    toolchain: "sre-deploy · ota-guard · version-sync",
    status: "ready",
    statusText: "就绪",
  },
];

export interface FleetPipelineStripProps {
  onConsultEmployee?: (employee: FleetEmployee) => void;
}

export function FleetPipelineStrip({ onConsultEmployee }: FleetPipelineStripProps) {
  const [selectedEmployee, setSelectedEmployee] = useState<FleetEmployee | null>(null);

  const handleSelect = (emp: FleetEmployee) => {
    setSelectedEmployee(emp);
  };

  const handleConsult = () => {
    if (!selectedEmployee) return;
    const emp = selectedEmployee;
    setSelectedEmployee(null);
    onConsultEmployee?.(emp);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.headerIcon}>🏭</Text>
          <Text style={styles.headerTitle}>数字员工交付舰队</Text>
          <Pill label="5位全自主" size="sm" style={styles.tagPill} />
        </View>
        <Text style={styles.subHint}>轻点检视职责与工具</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {FLEET_MEMBERS.map((emp, index) => (
          <React.Fragment key={emp.id}>
            <Pressable
              style={styles.card}
              onPress={() => handleSelect(emp)}
              hitSlop={4}
            >
              <View style={styles.avatarRow}>
                <View style={styles.avatarBox}>
                  <Text style={styles.avatarText}>{emp.avatar}</Text>
                </View>
                <StatusDot status="ok" size={6} />
              </View>
              <Text style={styles.name} numberOfLines={1}>
                {emp.name}
              </Text>
              <Text style={styles.roleTitle} numberOfLines={1}>
                {emp.title}
              </Text>
              <View style={styles.gateBadge}>
                <Text style={styles.gateText}>{emp.stage}</Text>
              </View>
            </Pressable>

            {index < FLEET_MEMBERS.length - 1 && (
              <View style={styles.arrowWrap}>
                <Ionicons name="chevron-forward" size={12} color={C.lineSubtle} />
              </View>
            )}
          </React.Fragment>
        ))}
      </ScrollView>

      {/* 员工档案检视抽屉 */}
      <Modal
        visible={Boolean(selectedEmployee)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedEmployee(null)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setSelectedEmployee(null)}
          />
          {selectedEmployee ? (
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <View style={styles.modalAvatarBox}>
                  <Text style={styles.modalAvatarText}>{selectedEmployee.avatar}</Text>
                </View>
                <View style={styles.modalHeaderTextWrap}>
                  <View style={styles.modalNameRow}>
                    <Text style={styles.modalName}>{selectedEmployee.name}</Text>
                    <Pill
                      label={selectedEmployee.stage}
                      size="sm"
                      style={styles.modalStagePill}
                    />
                  </View>
                  <Text style={styles.modalTitle}>{selectedEmployee.title}</Text>
                </View>
              </View>

              <View style={styles.modalInfoSection}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>负责门禁</Text>
                  <Text style={styles.infoValue}>{selectedEmployee.governanceGate}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>职责重心</Text>
                  <Text style={styles.infoValue}>{selectedEmployee.roleDescription}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>挂载技能</Text>
                  <Text style={styles.infoCodeValue}>{selectedEmployee.activeSkill}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>底层工具池</Text>
                  <Text style={styles.infoCodeValue}>{selectedEmployee.toolchain}</Text>
                </View>
              </View>

              <View style={styles.modalActionsRow}>
                <Pressable
                  style={[styles.modalBtn, styles.modalBtnSecondary]}
                  onPress={() => setSelectedEmployee(null)}
                >
                  <Text style={styles.modalBtnSecondaryText}>返回</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalBtn, styles.modalBtnPrimary]}
                  onPress={handleConsult}
                >
                  <Text style={styles.modalBtnPrimaryText}>咨询</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
    paddingTop: 8,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    marginBottom: 6,
  },
  titleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerIcon: {
    fontSize: 13,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: C.ink,
  },
  tagPill: {
    backgroundColor: "rgba(59, 130, 246, 0.12)",
    borderColor: "rgba(59, 130, 246, 0.3)",
    paddingVertical: 0,
    paddingHorizontal: 5,
  },
  subHint: {
    fontSize: 11,
    color: C.ink4,
  },
  scrollContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 4,
  },
  card: {
    width: 66,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    alignItems: "center",
    gap: 2,
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginBottom: 2,
  },
  avatarBox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 12,
  },
  name: {
    fontSize: 11,
    fontWeight: "600",
    color: C.ink,
  },
  roleTitle: {
    fontSize: 9,
    color: C.ink3,
  },
  gateBadge: {
    marginTop: 2,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  gateText: {
    fontSize: 9,
    color: C.accent,
    fontWeight: "500",
  },
  arrowWrap: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  modalSheet: {
    backgroundColor: C.panel,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    width: "100%",
    maxWidth: 360,
    gap: 14,
    borderWidth: 1,
    borderColor: C.line,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  modalAvatarBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: C.surface,
    borderColor: C.line,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modalAvatarText: {
    fontSize: 24,
  },
  modalHeaderTextWrap: {
    flex: 1,
    gap: 2,
  },
  modalNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modalName: {
    fontSize: 16,
    fontWeight: "600",
    color: C.ink,
  },
  modalStagePill: {
    backgroundColor: "rgba(59, 130, 246, 0.15)",
  },
  modalTitle: {
    fontSize: 13,
    color: C.ink2,
  },
  modalInfoSection: {
    backgroundColor: C.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    padding: 10,
    gap: 8,
  },
  infoRow: {
    gap: 2,
  },
  infoLabel: {
    fontSize: 11,
    color: C.ink4,
    fontWeight: "500",
  },
  infoValue: {
    fontSize: 12,
    color: C.ink,
    lineHeight: 17,
  },
  infoCodeValue: {
    fontSize: 11,
    color: C.accent,
    fontFamily: "monospace",
  },
  modalActionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  modalBtn: {
    minWidth: 72,
    minHeight: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  modalBtnSecondary: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
  },
  modalBtnSecondaryText: {
    fontSize: 13,
    fontWeight: "500",
    color: C.ink2,
  },
  modalBtnPrimary: {
    backgroundColor: C.brand,
  },
  modalBtnPrimaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
