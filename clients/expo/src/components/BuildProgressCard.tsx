import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../coolie";
import { AppCard } from "../ui/AppCard";
import { Pill } from "../ui/Pill";
import { StatusBadge } from "../ui/StatusBadge";
import { FONT_SIZE, RADIUS, SPACING, TONE, type ToneName } from "../ui/tokens";
import type { StatusDotKind } from "../components/StatusDot";

/**
 * "build xxx" 触发词。与 server/src/services/build-orchestrator.ts 的
 * BUILD_TRIGGER_PATTERN 必须保持一致 —— 客户端决定何时打出这张卡,
 * 服务端决定是否接受这次请求, 两边都按同一个正则判定。
 */
export const BUILD_TRIGGER_PATTERN = /^(?:build|开发|做)\s+/i;

export function isBuildPrompt(text: string): boolean {
  return BUILD_TRIGGER_PATTERN.test(text.trim());
}

/** 环节中文名, 与构建计划的固定五步链一一对应 */
export const BUILD_STEP_LABELS: Record<string, string> = {
  requirements: "需求梳理",
  design: "方案设计",
  impl: "编码实现",
  test: "测试验收",
  release: "发布上线",
};

/** 负责类型中文名 (arch/dev/qa/pm 是构建词汇, 不是公司角色) */
export const BUILD_AGENT_TYPE_LABELS: Record<string, string> = {
  arch: "架构",
  dev: "研发",
  qa: "测试",
  pm: "产品",
};

export interface BuildProgressStep {
  step: number;
  kind: string;
  title: string;
  assignedAgentType: string;
  dependsOn: number[];
  issueId?: string;
  status?: string;
  assigneeAgentId?: string | null;
}

export interface BuildProgressCardProps {
  prompt: string;
  steps: BuildProgressStep[];
  loading?: boolean;
  error?: string | null;
  planSource?: "hermes" | "template" | null;
  onOpenIssue?: (issueId: string) => void;
}

interface StepVisual {
  label: string;
  tone: ToneName;
  dot: StatusDotKind;
  done: boolean;
}

/** 环节状态 -> 徽标外观。未指派时状态点用 warn, 因为该环节不会被唤醒。 */
function stepVisual(step: BuildProgressStep): StepVisual {
  if (!step.assigneeAgentId) {
    return { label: "未指派", tone: "warn", dot: "idle", done: false };
  }
  switch (step.status) {
    case "done":
      return { label: "已完成", tone: "ok", dot: "ok", done: true };
    case "in_progress":
      return { label: "进行中", tone: "accent", dot: "running", done: false };
    case "in_review":
      return { label: "评审中", tone: "brand", dot: "running", done: false };
    case "blocked":
      return { label: "等待上游", tone: "warn", dot: "idle", done: false };
    case "cancelled":
      return { label: "已取消", tone: "muted", dot: "idle", done: false };
    default:
      return { label: "待开始", tone: "muted", dot: "idle", done: false };
  }
}

/**
 * 构建进度卡: 聊天流内展示一条构建计划的五步链 + 各环节状态。
 * 步骤来自 POST /api/build/start 的响应, 状态刷新由外层重新拉取。
 */
export function BuildProgressCard({
  prompt,
  steps,
  loading = false,
  error = null,
  planSource = null,
  onOpenIssue,
}: BuildProgressCardProps) {
  const subject = prompt.trim().replace(BUILD_TRIGGER_PATTERN, "").trim();

  return (
    <AppCard style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="construct-outline" size={15} color={C.accent} />
          <Text style={styles.headerTitle}>构建计划</Text>
        </View>
        {planSource ? (
          <Pill
            size="sm"
            tone={planSource === "hermes" ? "brand" : "muted"}
            label={planSource === "hermes" ? "智能规划" : "默认模板"}
          />
        ) : null}
      </View>

      <Text style={styles.subject} numberOfLines={2}>
        {subject || prompt}
      </Text>

      {loading ? (
        <View style={styles.stateRow}>
          <ActivityIndicator size="small" color={C.accent} />
          <Text style={styles.stateText}>正在拆解构建计划…</Text>
        </View>
      ) : error ? (
        <View style={styles.stateRow}>
          <Ionicons name="alert-circle-outline" size={15} color={C.err} />
          <Text style={[styles.stateText, styles.stateTextError]}>{error}</Text>
        </View>
      ) : (
        <View style={styles.chain}>
          {steps.map((step, index) => {
            const visual = stepVisual(step);
            const last = index === steps.length - 1;
            return (
              <Pressable
                key={step.issueId ?? `${step.kind}-${step.step}`}
                style={styles.stepRow}
                disabled={!onOpenIssue || !step.issueId}
                onPress={() => step.issueId && onOpenIssue?.(step.issueId)}
              >
                <View style={styles.railColumn}>
                  <View
                    style={[
                      styles.marker,
                      visual.done ? styles.markerDone : styles.markerPending,
                    ]}
                  >
                    <Text
                      style={[
                        styles.markerText,
                        visual.done && styles.markerTextDone,
                      ]}
                    >
                      {visual.done ? "✓" : String(index + 1)}
                    </Text>
                  </View>
                  {!last ? <View style={styles.rail} /> : null}
                </View>

                <View style={styles.stepBody}>
                  <View style={styles.stepTitleRow}>
                    <Text style={styles.stepTitle} numberOfLines={1}>
                      {step.title}
                    </Text>
                    <StatusBadge
                      label={visual.label}
                      tone={visual.tone}
                      dotStatus={visual.dot}
                      size={5}
                    />
                  </View>
                  <View style={styles.stepMetaRow}>
                    <Text style={styles.stepKind}>
                      {BUILD_STEP_LABELS[step.kind] ?? step.kind}
                    </Text>
                    <Pill
                      size="sm"
                      tone="neutral"
                      label={
                        BUILD_AGENT_TYPE_LABELS[step.assignedAgentType] ??
                        step.assignedAgentType
                      }
                    />
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: SPACING.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  headerTitle: {
    color: C.ink,
    fontSize: FONT_SIZE.sub,
    fontWeight: "600",
  },
  subject: {
    color: C.ink3,
    fontSize: FONT_SIZE.meta,
    marginTop: SPACING.xs,
  },
  stateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  stateText: {
    color: C.ink3,
    fontSize: FONT_SIZE.meta,
    flexShrink: 1,
  },
  stateTextError: {
    color: C.err,
  },
  chain: {
    marginTop: SPACING.md,
  },
  stepRow: {
    flexDirection: "row",
  },
  railColumn: {
    width: 24,
    alignItems: "center",
  },
  marker: {
    width: 20,
    height: 20,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  markerDone: {
    backgroundColor: TONE.ok.bg,
    borderColor: TONE.ok.border,
  },
  markerPending: {
    backgroundColor: TONE.muted.bg,
    borderColor: TONE.muted.border,
  },
  markerText: {
    color: C.ink3,
    fontSize: FONT_SIZE.meta,
    fontWeight: "600",
  },
  markerTextDone: {
    color: C.ok,
  },
  rail: {
    flex: 1,
    width: 1,
    minHeight: SPACING.lg,
    backgroundColor: C.line,
    marginVertical: SPACING.xs,
  },
  stepBody: {
    flex: 1,
    paddingBottom: SPACING.md,
    paddingLeft: SPACING.sm,
    gap: SPACING.xs,
  },
  stepTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  stepTitle: {
    color: C.ink,
    fontSize: FONT_SIZE.sub,
    flexShrink: 1,
  },
  stepMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  stepKind: {
    color: C.ink4,
    fontSize: FONT_SIZE.meta,
  },
});
