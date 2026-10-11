import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../coolie";
import { Pill } from "../ui/Pill";

export interface FoundryMilestone {
  step: number;
  gate: string;
  title: string;
  agentName: string;
  deliverable: string;
}

export interface FoundryProposalData {
  id: string;
  title: string;
  domainSlug: string;
  targetDescription: string;
  openSourceBase: string;
  leverageRatio: string;
  darComparison: string;
  milestones: FoundryMilestone[];
  status: "pending" | "confirmed" | "dismissed";
}

export interface FoundryProposalCardProps {
  proposal: FoundryProposalData;
  onConfirm: (proposal: FoundryProposalData) => void;
  onDismiss: (proposal: FoundryProposalData) => void;
  busy?: boolean;
}

export function FoundryProposalCard({
  proposal,
  onConfirm,
  onDismiss,
  busy = false,
}: FoundryProposalCardProps) {
  const isPending = proposal.status === "pending";
  const isConfirmed = proposal.status === "confirmed";

  return (
    <View style={styles.cardContainer}>
      {/* 头部标题与状态 */}
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <Text style={styles.headerIcon}>🎯</Text>
          <Text style={styles.headerTitle}>商业交付立项提案</Text>
        </View>
        <Pill
          label={
            isConfirmed
              ? "已立项"
              : isPending
              ? "待裁决"
              : "已放弃"
          }
          size="sm"
          style={
            isConfirmed
              ? styles.pillConfirmed
              : isPending
              ? styles.pillPending
              : styles.pillDismissed
          }
          textStyle={{
            color: isConfirmed ? C.ok : isPending ? C.warn : C.ink4,
          }}
        />
      </View>

      {/* 项目与目标 */}
      <View style={styles.projectSection}>
        <Text style={styles.projectTitle}>{proposal.title}</Text>
        <Text style={styles.domainText}>本体域: {proposal.domainSlug}</Text>
        <Text style={styles.targetDesc}>{proposal.targetDescription}</Text>
      </View>

      {/* 80/20 开源基座对标 */}
      <View style={styles.scoutingBox}>
        <View style={styles.scoutingHeader}>
          <Ionicons name="git-branch-outline" size={14} color={C.accent} />
          <Text style={styles.scoutingTitle}>80/20 开源基座对标 (CPO/FDA)</Text>
        </View>
        <Text style={styles.scoutingBaseText}>
          开源底座: <Text style={styles.scoutingBaseHighlight}>{proposal.openSourceBase}</Text>
        </Text>
        <Text style={styles.scoutingRatioText}>{proposal.leverageRatio}</Text>
        <Text style={styles.scoutingDarText}>{proposal.darComparison}</Text>
      </View>

      {/* CMMI 5级流水线 WBS 工序 */}
      <View style={styles.milestonesSection}>
        <Text style={styles.milestonesTitle}>CMMI 5级交付流水线 (WBS 骨干)</Text>
        <View style={styles.milestoneList}>
          {proposal.milestones.map((m) => (
            <View key={m.step} style={styles.milestoneRow}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>{m.gate}</Text>
              </View>
              <View style={styles.milestoneContent}>
                <View style={styles.milestoneMain}>
                  <Text style={styles.milestoneName}>{m.title}</Text>
                  <Text style={styles.milestoneAgent}>· {m.agentName}</Text>
                </View>
                <Text style={styles.milestoneDoc}>{m.deliverable}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* 行动按钮区 (严格保持两字契约: 确认 / 放弃) */}
      {isPending ? (
        <View style={styles.actionsRow}>
          <Pressable
            style={[styles.btn, styles.btnDismiss, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={() => onDismiss(proposal)}
          >
            <Text style={styles.btnDismissText}>放弃</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, styles.btnConfirm, busy && styles.btnDisabled]}
            disabled={busy}
            onPress={() => onConfirm(proposal)}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.btnConfirmText}>确认</Text>
            )}
          </Pressable>
        </View>
      ) : isConfirmed ? (
        <View style={styles.confirmedBanner}>
          <Ionicons name="checkmark-circle" size={16} color={C.ok} />
          <Text style={styles.confirmedBannerText}>
            提案已确认 · 数字员工流水线自主施工中
          </Text>
        </View>
      ) : (
        <View style={styles.dismissedBanner}>
          <Text style={styles.dismissedBannerText}>提案已放弃</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: C.surface,
    borderColor: "rgba(59, 130, 246, 0.35)",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    marginVertical: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerIcon: {
    fontSize: 14,
  },
  headerTitle: {
    color: C.ink,
    fontSize: 13,
    fontWeight: "700",
  },
  pillPending: {
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  pillConfirmed: {
    backgroundColor: "rgba(39, 166, 68, 0.12)",
    borderColor: "rgba(39, 166, 68, 0.3)",
  },
  pillDismissed: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderColor: C.lineSubtle,
  },
  projectSection: {
    gap: 3,
  },
  projectTitle: {
    color: C.ink,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
  },
  domainText: {
    color: C.accent,
    fontSize: 11,
    fontFamily: "monospace",
  },
  targetDesc: {
    color: C.ink2,
    fontSize: 12,
    lineHeight: 17,
  },
  scoutingBox: {
    backgroundColor: C.panel,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    padding: 10,
    gap: 4,
  },
  scoutingHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  scoutingTitle: {
    color: C.ink,
    fontSize: 12,
    fontWeight: "600",
  },
  scoutingBaseText: {
    color: C.ink2,
    fontSize: 12,
  },
  scoutingBaseHighlight: {
    color: C.accent,
    fontWeight: "600",
  },
  scoutingRatioText: {
    color: C.ok,
    fontSize: 11,
    fontWeight: "500",
  },
  scoutingDarText: {
    color: C.ink3,
    fontSize: 11,
  },
  milestonesSection: {
    gap: 6,
  },
  milestonesTitle: {
    color: C.ink3,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  milestoneList: {
    gap: 6,
  },
  milestoneRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  stepBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.3)",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 26,
  },
  stepBadgeText: {
    fontSize: 10,
    color: C.accent,
    fontWeight: "700",
  },
  milestoneContent: {
    flex: 1,
    gap: 1,
  },
  milestoneMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  milestoneName: {
    color: C.ink,
    fontSize: 12,
    fontWeight: "600",
  },
  milestoneAgent: {
    color: C.ink3,
    fontSize: 11,
  },
  milestoneDoc: {
    color: C.ink4,
    fontSize: 11,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  btn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDismiss: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
  },
  btnDismissText: {
    color: C.ink2,
    fontSize: 14,
    fontWeight: "600",
  },
  btnConfirm: {
    backgroundColor: C.brand,
  },
  btnConfirmText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  btnDisabled: {
    opacity: 0.5,
  },
  confirmedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(39, 166, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(39, 166, 68, 0.3)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  confirmedBannerText: {
    color: C.ok,
    fontSize: 12,
    fontWeight: "600",
  },
  dismissedBanner: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: "center",
  },
  dismissedBannerText: {
    color: C.ink4,
    fontSize: 12,
  },
});
