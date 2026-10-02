/**
 * wave256 — 资产 tab 数字员工卡.
 *
 * Boss 真机 0.6.10 截图: 5 个员工都显示「空闲」+「claude_local」, 老板看不出区别.
 * 本组件把数字员工卡重做:
 *   - 大字真名 (2 行 max, flexShrink 防裁切)
 *   - 角色徽章 (FDA 红 / Core SWE 蓝 / PRE-SRE 绿 / FDSE 紫 / DS 橙 / 通用灰)
 *   - 1 行职责 (responsibilities[0] or 兜底)
 *   - 中文 2 字 skill chip 行 (4-8 个, 末尾 +N 折叠) — wave258 升级
 *   - 英文 cli tool chip 行 (1-3 个) — wave258 新增
 *   - 状态 + 已完成任务数 (taskCount)
 *
 * 颜色全部走 token (`alpha()` 渲染 bg/border/fg), 不裸写 hex.
 */

import { Pressable, StyleSheet, Text, View } from "react-native";
import { C } from "../coolie";
import type { AgentCostRow, AgentRow } from "../coolie";
import { RADIUS, alpha } from "../ui/tokens";
import { StatusDot } from "./StatusDot";

const STATUS_LABEL: Record<string, string> = {
  active: "在线",
  running: "在派",
  idle: "空闲",
  paused: "已暂停",
  error: "异常",
  pending_approval: "待审批",
  disabled: "停用",
};

const STATUS_DOT: Record<string, "ok" | "idle" | "err"> = {
  active: "ok",
  running: "ok",
  idle: "idle",
  paused: "idle",
  disabled: "idle",
  error: "err",
};

interface RoleTone {
  bg: string;
  fg: string;
  border: string;
}

/**
 * 5 CMMI 角色配色 (墨斗/FDA 红 / 铁匠/Core SWE 蓝 / 兑底渊/PRE-SRE 绿 / 门神/FDSE 紫 / 百晓生/DS 橙).
 * 颜色与 web 端 role 过滤器 / PaletteId 体系不冲突 — 这是 fish-only 视觉强化,
 * 上游 wave65 删 title 时已证明数字员工卡 0 信息密度是当前最大问题.
 */
const ROLE_TONE: Record<string, RoleTone> = {
  墨斗: { bg: alpha("#EF4444", 0.12), fg: "#F87171", border: alpha("#EF4444", 0.4) },
  FDA: { bg: alpha("#EF4444", 0.12), fg: "#F87171", border: alpha("#EF4444", 0.4) },
  铁匠: { bg: alpha("#3B82F6", 0.12), fg: "#60A5FA", border: alpha("#3B82F6", 0.4) },
  "Core SWE": { bg: alpha("#3B82F6", 0.12), fg: "#60A5FA", border: alpha("#3B82F6", 0.4) },
  兑底渊: { bg: alpha("#10B981", 0.12), fg: "#34D399", border: alpha("#10B981", 0.4) },
  "PRE-SRE": { bg: alpha("#10B981", 0.12), fg: "#34D399", border: alpha("#10B981", 0.4) },
  门神: { bg: alpha("#A78BFA", 0.12), fg: "#C4B5FD", border: alpha("#A78BFA", 0.4) },
  FDSE: { bg: alpha("#A78BFA", 0.12), fg: "#C4B5FD", border: alpha("#A78BFA", 0.4) },
  百晓生: { bg: alpha("#F97316", 0.12), fg: "#FB923C", border: alpha("#F97316", 0.4) },
  DS: { bg: alpha("#F97316", 0.12), fg: "#FB923C", border: alpha("#F97316", 0.4) },
};

const FALLBACK_ROLE_TONE: RoleTone = {
  bg: "rgba(255,255,255,0.04)",
  fg: C.ink2,
  border: C.line,
};

function toneForRoleLabel(label: string | null | undefined): RoleTone {
  if (!label) return FALLBACK_ROLE_TONE;
  return ROLE_TONE[label] ?? FALLBACK_ROLE_TONE;
}

export interface AssetsAgentCardProps {
  agent: AgentRow;
  cost?: AgentCostRow;
  /** 该 agent 已完成的任务数 (用于卡片底部状态行). */
  taskCount?: number;
  onPress: () => void;
}

const SKILLS_PREVIEW_COUNT = 5;

export function AssetsAgentCard({
  agent,
  cost: _cost,
  taskCount,
  onPress,
}: AssetsAgentCardProps) {
  const tone = toneForRoleLabel(agent.roleLabel);
  const responsibilities = agent.responsibilities ?? [];
  const skills = agent.skills ?? [];
  const tools = agent.tools ?? [];
  const headlineResponsibility = responsibilities[0] ?? "通用执行";
  const skillsPreview = skills.slice(0, SKILLS_PREVIEW_COUNT);
  const skillsHidden = Math.max(0, skills.length - skillsPreview.length);
  const toolsPreview = tools.slice(0, 3);

  const statusLabel = STATUS_LABEL[agent.status] ?? agent.status;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${agent.name} ${tone.fg ? agent.roleLabel ?? "员工" : "员工"} ${statusLabel}`}
    >
      {/* 角色徽章 + 真名行 */}
      <View style={styles.headerRow}>
        <View style={[styles.roleBadge, { backgroundColor: tone.bg, borderColor: tone.border }]}>
          <Text style={[styles.roleBadgeText, { color: tone.fg }]} numberOfLines={1}>
            {agent.roleLabel ?? "员工"}
          </Text>
        </View>
        <Text style={styles.name} numberOfLines={2} ellipsizeMode="tail">
          {agent.name}
        </Text>
      </View>

      {/* 头像 + 状态 (右边) */}
      <View style={styles.avatarRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(agent.name ?? "?").slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={styles.responsibilityWrap}>
          <Text style={styles.responsibility} numberOfLines={1} ellipsizeMode="tail">
            {headlineResponsibility}
          </Text>
          <View style={styles.statusLine}>
            <StatusDot
              status={STATUS_DOT[agent.status] ?? "idle"}
              size={6}
              pulse={agent.status === "active"}
            />
            <Text style={styles.statusText}>{statusLabel}</Text>
            {typeof taskCount === "number" && taskCount > 0 ? (
              <Text style={styles.taskCount}>· 已完成 {taskCount}</Text>
            ) : null}
          </View>
        </View>
      </View>

      {/* 中文 2 字 skill chip 行 (wave258 升级: 中文 2 字, 4-8 个) */}
      {skillsPreview.length > 0 ? (
        <View style={styles.skillsRow}>
          {skillsPreview.map((skill, idx) => (
            <View key={`${skill}-${idx}`} style={styles.skillChip}>
              <Text style={styles.skillChipText} numberOfLines={1}>
                {skill}
              </Text>
            </View>
          ))}
          {skillsHidden > 0 ? (
            <View style={[styles.skillChip, styles.skillChipMore]}>
              <Text style={styles.skillChipText}>+{skillsHidden}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* 英文 cli tool chip 行 (wave258 新增: 跟 skills 拆开, 1-3 个) */}
      {toolsPreview.length > 0 ? (
        <View style={styles.toolsRow}>
          <Text style={styles.toolsLabel}>工具</Text>
          {toolsPreview.map((tool, idx) => (
            <View key={`${tool}-${idx}`} style={styles.toolChip}>
              <Text style={styles.toolChipText} numberOfLines={1}>
                {tool}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  cardPressed: {
    backgroundColor: C.surfaceHover,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  roleBadge: {
    borderRadius: RADIUS.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    flexShrink: 0,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  name: {
    color: C.ink,
    fontSize: 17,
    fontWeight: "600",
    flex: 1,
    flexShrink: 1,
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md,
    backgroundColor: C.panel,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarText: {
    color: C.accent,
    fontSize: 16,
    fontWeight: "600",
  },
  responsibilityWrap: {
    flex: 1,
    gap: 4,
  },
  responsibility: {
    color: C.ink2,
    fontSize: 13,
  },
  statusLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statusText: {
    color: C.ink3,
    fontSize: 11,
  },
  taskCount: {
    color: C.ink4,
    fontSize: 11,
  },
  skillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  skillChip: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: C.lineSubtle,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
  skillChipMore: {
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  skillChipText: {
    color: C.ink2,
    fontSize: 11,
  },
  // wave258 — tools 行样式 (英文 cli 名, 跟 skills 视觉区分: 浅色边框 + 等宽字体)
  toolsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  toolsLabel: {
    color: C.ink4,
    fontSize: 10,
    marginRight: 2,
  },
  toolChip: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
  toolChipText: {
    color: C.ink3,
    fontSize: 11,
    fontFamily: "monospace",
  },
});