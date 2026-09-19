import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from "react-native";
import type { Approval } from "@coolie/api-client";
import { C, coolie } from "../coolie";
import { StatusDot } from "./StatusDot";

export interface QuickApprovalCardProps {
  companyId: string;
  /** 可选：外部显式传入的单个审批单，不传则自动轮询 pending 列表 */
  approval?: Approval | null;
  /** 裁决完成后的回调 */
  onResolved?: (approvalId: string, decision: "approve" | "reject") => void;
  /** 关闭/最小化卡片的回调 */
  onDismiss?: () => void;
  /** 自定义外层样式 */
  style?: StyleProp<ViewStyle>;
  /** 是否固定悬浮于底部 (默认 true) */
  floating?: boolean;
}

const TYPE_CONFIG: Record<
  string,
  { label: string; badgeColor: string; badgeBg: string; badgeBorder: string }
> = {
  hire_agent: {
    label: "雇佣智能体",
    badgeColor: C.accent,
    badgeBg: "rgba(113, 112, 255, 0.12)",
    badgeBorder: "rgba(113, 112, 255, 0.3)",
  },
  spend_money: {
    label: "经费额度",
    badgeColor: C.warn,
    badgeBg: "rgba(245, 158, 11, 0.12)",
    badgeBorder: "rgba(245, 158, 11, 0.3)",
  },
  execute_command: {
    label: "高危指令",
    badgeColor: C.err,
    badgeBg: "rgba(239, 68, 68, 0.12)",
    badgeBorder: "rgba(239, 68, 68, 0.3)",
  },
  ontology_action: {
    label: "业务本体变更",
    badgeColor: C.accent,
    badgeBg: "rgba(94, 106, 210, 0.12)",
    badgeBorder: "rgba(94, 106, 210, 0.3)",
  },
};

function formatApprovalTitle(approval: Approval): string {
  if (approval.title) return approval.title;
  const payload = approval.payload ?? {};
  if (typeof payload.title === "string" && payload.title) return payload.title;
  if (typeof payload.name === "string" && payload.name) return `申请: ${payload.name}`;
  if (typeof payload.agentName === "string" && payload.agentName) {
    return `申请录用 ${payload.agentName}`;
  }
  if (typeof payload.amountCents === "number") {
    const amount = (payload.amountCents / 100).toFixed(2);
    return `申请追加额度 $${amount}`;
  }
  if (typeof payload.command === "string" && payload.command) {
    return `请求执行: ${payload.command.slice(0, 40)}`;
  }
  const typeLabel = TYPE_CONFIG[approval.type]?.label ?? approval.type;
  return `${typeLabel} 审批申请`;
}

function formatApprovalSummary(approval: Approval): string {
  if (approval.description) return approval.description;
  const payload = approval.payload ?? {};
  if (typeof payload.reason === "string" && payload.reason) return payload.reason;
  if (typeof payload.description === "string" && payload.description) {
    return payload.description;
  }
  if (typeof payload.summary === "string" && payload.summary) return payload.summary;

  if (approval.type === "hire_agent") {
    const role = (payload.role as string) || "助理智能体";
    const model = (payload.model as string) || "默认模型";
    return `岗位角色: ${role} · 模型: ${model}`;
  }
  if (approval.type === "spend_money" && typeof payload.amountCents === "number") {
    return `额度金额: $${(payload.amountCents / 100).toFixed(2)} · 用于智能体推理支出`;
  }
  if (approval.type === "execute_command" && typeof payload.command === "string") {
    return `工作目录: ${(payload.cwd as string) || "默认工作区"}`;
  }

  // 兜底摘要
  const keys = Object.keys(payload);
  if (keys.length > 0) {
    const pairs = keys
      .slice(0, 2)
      .map((k) => `${k}: ${String(payload[k]).slice(0, 30)}`);
    return pairs.join(" · ");
  }
  return "暂无补充说明，等待掌柜审定放行。";
}

/**
 * 快捷审批悬浮卡片 (Linear 设计系统风格)
 * 底部悬浮提醒、一键同意/驳回、驳回需填写理由、审批完成即消。
 */
export function QuickApprovalCard({
  companyId,
  approval: explicitApproval,
  onResolved,
  onDismiss,
  style,
  floating = true,
}: QuickApprovalCardProps) {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<"approve" | "reject" | null>(null);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [dismissed, setDismissed] = useState(false);

  // 轮询待办审批
  const fetchPendingApprovals = useCallback(async () => {
    if (explicitApproval !== undefined) return;
    try {
      const list = await coolie.listApprovals(companyId, { status: "pending" });
      setApprovals(list.filter((a) => a.status === "pending"));
    } catch {
      // 忽略未登录或网络临时抖动报错
    }
  }, [companyId, explicitApproval]);

  useEffect(() => {
    void fetchPendingApprovals();
    const timer = setInterval(() => {
      void fetchPendingApprovals();
    }, 6000);
    return () => clearInterval(timer);
  }, [fetchPendingApprovals]);

  // 如果父级传入显式审批单，以它为主
  const activeApproval: Approval | null =
    explicitApproval !== undefined
      ? explicitApproval
      : approvals[currentIndex] ?? null;

  const totalCount =
    explicitApproval !== undefined
      ? explicitApproval
        ? 1
        : 0
      : approvals.length;

  const handleResolve = useCallback(
    async (decision: "approve" | "reject") => {
      if (!activeApproval || busyAction) return;

      if (decision === "reject" && !showRejectInput) {
        setShowRejectInput(true);
        return;
      }

      if (decision === "reject" && !rejectReason.trim()) {
        Alert.alert("请填写理由", "驳回申请必须输入驳回理由。");
        return;
      }

      setBusyAction(decision);
      try {
        await coolie.resolveApproval(
          activeApproval.id,
          decision,
          decision === "reject" ? rejectReason.trim() : undefined,
        );

        onResolved?.(activeApproval.id, decision);

        // 从本地状态移除已完成项
        if (explicitApproval === undefined) {
          setApprovals((prev) => {
            const next = prev.filter((item) => item.id !== activeApproval.id);
            if (currentIndex >= next.length && next.length > 0) {
              setCurrentIndex(next.length - 1);
            }
            return next;
          });
        }
        setShowRejectInput(false);
        setRejectReason("");
      } catch (e) {
        Alert.alert(
          "审批操作失败",
          String((e as Error)?.message ?? "请稍后重试"),
        );
      } finally {
        setBusyAction(null);
      }
    },
    [
      activeApproval,
      busyAction,
      showRejectInput,
      rejectReason,
      onResolved,
      explicitApproval,
      currentIndex,
    ],
  );

  const handleNext = () => {
    if (currentIndex < approvals.length - 1) {
      setCurrentIndex((i) => i + 1);
      setShowRejectInput(false);
      setRejectReason("");
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setShowRejectInput(false);
      setRejectReason("");
    }
  };

  if (dismissed || !activeApproval || activeApproval.status !== "pending") {
    return null;
  }

  const typeConfig = TYPE_CONFIG[activeApproval.type] ?? {
    label: activeApproval.type,
    badgeColor: C.ink2,
    badgeBg: "rgba(255, 255, 255, 0.06)",
    badgeBorder: "rgba(255, 255, 255, 0.12)",
  };

  return (
    <View
      style={[
        styles.container,
        floating ? styles.floatingContainer : styles.dockedContainer,
        style,
      ]}
    >
      {/* 顶部指示条与操作栏 */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <StatusDot status="running" color={C.warn} size={7} />
          <Text style={styles.headerTitle}>待办审批</Text>
          {totalCount > 1 && (
            <View style={styles.counterBadge}>
              <Text style={styles.counterText}>
                {currentIndex + 1} / {totalCount}
              </Text>
            </View>
          )}
          <View
            style={[
              styles.typeBadge,
              {
                backgroundColor: typeConfig.badgeBg,
                borderColor: typeConfig.badgeBorder,
              },
            ]}
          >
            <Text style={[styles.typeBadgeText, { color: typeConfig.badgeColor }]}>
              {typeConfig.label}
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {totalCount > 1 && (
            <View style={styles.navButtons}>
              <Pressable
                disabled={currentIndex === 0}
                onPress={handlePrev}
                style={[
                  styles.navBtn,
                  currentIndex === 0 && styles.navBtnDisabled,
                ]}
              >
                <Text style={styles.navBtnText}>‹</Text>
              </Pressable>
              <Pressable
                disabled={currentIndex >= totalCount - 1}
                onPress={handleNext}
                style={[
                  styles.navBtn,
                  currentIndex >= totalCount - 1 && styles.navBtnDisabled,
                ]}
              >
                <Text style={styles.navBtnText}>›</Text>
              </Pressable>
            </View>
          )}
          <Pressable
            hitSlop={12}
            onPress={() => {
              setDismissed(true);
              onDismiss?.();
            }}
            style={styles.closeBtn}
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
        </View>
      </View>

      {/* 标题与摘要详情 */}
      <View style={styles.bodySection}>
        <Text style={styles.titleText} numberOfLines={2}>
          {formatApprovalTitle(activeApproval)}
        </Text>
        <Text style={styles.summaryText} numberOfLines={3}>
          {formatApprovalSummary(activeApproval)}
        </Text>
        {Boolean(activeApproval.requestedByAgentId) && (
          <Text style={styles.requesterText}>
            申请发起: 智能体 · {activeApproval.requestedByAgentId?.slice(0, 8)}…
          </Text>
        )}
      </View>

      {/* 驳回理由输入区域 (展开态) */}
      {showRejectInput && (
        <View style={styles.rejectReasonBox}>
          <TextInput
            style={styles.rejectInput}
            placeholder="输入驳回理由（必填）…"
            placeholderTextColor={C.ink3}
            value={rejectReason}
            onChangeText={setRejectReason}
            autoFocus
            multiline
          />
          <View style={styles.rejectActionRow}>
            <Pressable
              onPress={() => {
                setShowRejectInput(false);
                setRejectReason("");
              }}
              style={styles.btnCancel}
            >
              <Text style={styles.btnCancelText}>取消</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleResolve("reject")}
              style={[
                styles.btnConfirmReject,
                busyAction === "reject" && styles.btnDisabled,
              ]}
              disabled={busyAction === "reject"}
            >
              {busyAction === "reject" ? (
                <ActivityIndicator size="small" color={C.err} />
              ) : (
                <Text style={styles.btnConfirmRejectText}>确认驳回</Text>
              )}
            </Pressable>
          </View>
        </View>
      )}

      {/* 快捷按钮条 (未展开驳回理由时显示) */}
      {!showRejectInput && (
        <View style={styles.actionsRow}>
          <Pressable
            onPress={() => void handleResolve("approve")}
            style={[styles.btnApprove, busyAction === "approve" && styles.btnDisabled]}
            disabled={Boolean(busyAction)}
          >
            {busyAction === "approve" ? (
              <ActivityIndicator size="small" color={C.ok} />
            ) : (
              <Text style={styles.btnApproveText}>一键批准</Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => setShowRejectInput(true)}
            style={[styles.btnReject, busyAction === "reject" && styles.btnDisabled]}
            disabled={Boolean(busyAction)}
          >
            <Text style={styles.btnRejectText}>驳回</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: C.surface,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    overflow: "hidden",
  },
  floatingContainer: {
    position: "absolute",
    bottom: 20,
    left: 14,
    right: 14,
    zIndex: 999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  dockedContainer: {
    marginVertical: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flexShrink: 1,
  },
  headerTitle: {
    color: C.ink,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  counterBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  counterText: {
    color: C.ink3,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  typeBadge: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: "500",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  navButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  navBtn: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  navBtnDisabled: {
    opacity: 0.3,
  },
  navBtnText: {
    color: C.ink2,
    fontSize: 14,
    lineHeight: 18,
  },
  closeBtn: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    color: C.ink4,
    fontSize: 12,
  },
  bodySection: {
    marginBottom: 10,
  },
  titleText: {
    color: C.ink,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    marginBottom: 4,
  },
  summaryText: {
    color: C.ink2,
    fontSize: 12,
    lineHeight: 17,
  },
  requesterText: {
    color: C.ink4,
    fontSize: 11,
    marginTop: 4,
    fontVariant: ["tabular-nums"],
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  btnApprove: {
    flex: 1,
    backgroundColor: "rgba(39, 166, 68, 0.16)",
    borderColor: "rgba(39, 166, 68, 0.38)",
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  btnApproveText: {
    color: C.ok,
    fontSize: 13,
    fontWeight: "600",
  },
  btnReject: {
    paddingHorizontal: 16,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderColor: "rgba(239, 68, 68, 0.3)",
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  btnRejectText: {
    color: C.err,
    fontSize: 13,
    fontWeight: "500",
  },
  btnDisabled: {
    opacity: 0.5,
  },
  rejectReasonBox: {
    marginTop: 6,
    backgroundColor: C.panel,
    borderRadius: 8,
    borderColor: C.lineSubtle,
    borderWidth: 1,
    padding: 8,
  },
  rejectInput: {
    color: C.ink,
    fontSize: 12,
    lineHeight: 16,
    minHeight: 44,
    textAlignVertical: "top",
    marginBottom: 8,
  },
  rejectActionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  btnCancel: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  btnCancelText: {
    color: C.ink3,
    fontSize: 12,
  },
  btnConfirmReject: {
    backgroundColor: "rgba(239, 68, 68, 0.18)",
    borderColor: "rgba(239, 68, 68, 0.4)",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    minWidth: 70,
    alignItems: "center",
    justifyContent: "center",
  },
  btnConfirmRejectText: {
    color: C.err,
    fontSize: 12,
    fontWeight: "600",
  },
});
