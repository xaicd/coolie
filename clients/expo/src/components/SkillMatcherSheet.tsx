/**
 * wave258 — 派活精准浮层 (老板原话 "方便后续派活精准").
 *
 * 触发: OrgAssetsScreen 顶部 "🎯 派活精准" 按钮.
 *
 * 功能:
 *   - 输入框: 中文 2 字技能, 用 / 分隔 (e.g. "编码" / "编码/测试" / "部署/运维")
 *   - "匹配" 按钮 → 本地算法 (skills 数组求交集 / 并集评分), 不用远端 (省一次 round-trip).
 *     与 server-side dispatch-skill-matcher.ts 同算法 (口径一致, 见 CMMI-EMPLOYEE-MAPPING.md §6).
 *   - 6 员工列表: 按评分降序, 每行显示名字 + role 徽章 (5 色, 复用 AssetsAgentCard 的 ROLE_TONE) + matched skills
 *   - 点员工: 关闭浮层 + 复制到 clipboard ("派活给 <name> (matched: <skills>)")
 *     后续 Hermes chat 派活时可直接贴; 这次不做端到端派活流程.
 *
 * 不动 Hermes chat 派活逻辑 — 老板说"派活精准"但没说要现在做端到端; 这次只做 UI 给 PM 用.
 * 不动 wave222 派活算法 — 这是辅助, 不替算法层.
 */
import { useMemo, useState } from "react";
import {
  Clipboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../theme";
import { RADIUS, alpha } from "../ui/tokens";
import { showSuccessToast } from "../ui/toast";
import type { AgentRow } from "../coolie";

interface SkillMatcherSheetProps {
  visible: boolean;
  agents: AgentRow[];
  onClose: () => void;
}

interface RoleTone {
  bg: string;
  fg: string;
  border: string;
}

const ROLE_TONE: Record<string, RoleTone> = {
  FDA: { bg: alpha("#EF4444", 0.12), fg: "#F87171", border: alpha("#EF4444", 0.4) },
  "Core SWE": { bg: alpha("#3B82F6", 0.12), fg: "#60A5FA", border: alpha("#3B82F6", 0.4) },
  "PRE-SRE": { bg: alpha("#10B981", 0.12), fg: "#34D399", border: alpha("#10B981", 0.4) },
  FDSE: { bg: alpha("#A78BFA", 0.12), fg: "#C4B5FD", border: alpha("#A78BFA", 0.4) },
  DS: { bg: alpha("#F97316", 0.12), fg: "#FB923C", border: alpha("#F97316", 0.4) },
  PM: { bg: alpha("#FACC15", 0.12), fg: "#FACC15", border: alpha("#FACC15", 0.4) },
};
const FALLBACK_TONE: RoleTone = {
  bg: "rgba(255,255,255,0.04)",
  fg: C.ink2,
  border: C.line,
};

function toneForRoleLabel(label: string | null | undefined): RoleTone {
  if (!label) return FALLBACK_TONE;
  return ROLE_TONE[label] ?? FALLBACK_TONE;
}

interface MatchedAgent {
  agent: AgentRow;
  matchedSkills: string[];
  score: number;
}

/**
 * 输入拆分: 用 / 隔, 容忍空格.
 */
function parseInput(raw: string): string[] {
  return raw
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * 跟 server-side dispatch-skill-matcher.ts 同算法 (本地版本, 省一次 round-trip).
 * 评分: matched / input.length * 100, 平局按名字升序.
 */
function matchAgents(agents: AgentRow[], rawInput: string): MatchedAgent[] {
  const input = parseInput(rawInput);
  if (input.length === 0) return [];
  const matches: MatchedAgent[] = [];
  for (const a of agents) {
    if (a.status === "terminated") continue;
    const agentSkills = a.skills ?? [];
    const matchedSkills = input.filter((s) => agentSkills.includes(s));
    if (matchedSkills.length === 0) continue;
    const score = Math.round((matchedSkills.length / input.length) * 100);
    matches.push({ agent: a, matchedSkills, score });
  }
  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.agent.name.localeCompare(b.agent.name);
  });
  return matches;
}

export function SkillMatcherSheet({
  visible,
  agents,
  onClose,
}: SkillMatcherSheetProps) {
  const [input, setInput] = useState("");
  const matches = useMemo(() => matchAgents(agents, input), [agents, input]);

  const handlePick = (m: MatchedAgent) => {
    const text = `派活给 ${m.agent.name} (matched: ${m.matchedSkills.join("/")}, 评分 ${m.score})`;
    try {
      Clipboard.setString(text);
      showSuccessToast(`已复制派活指令: ${m.agent.name}`);
    } catch {
      showSuccessToast(`已选 ${m.agent.name} (剪贴板不可用, 请手抄)`);
    }
    onClose();
    setInput("");
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>🎯 派活精准</Text>
            <Text style={styles.subtitle}>输入中文 2 字技能, 用 / 分隔 — 老板 Hermes 反讲</Text>
          </View>

          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="e.g. 编码  或  编码/测试  或  部署/运维"
            placeholderTextColor={C.ink4}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            multiline={false}
          />

          {input.length === 0 ? (
            <View style={styles.hint}>
              <Ionicons name="bulb-outline" size={14} color={C.ink4} />
              <Text style={styles.hintText}>中文 2 字技能全集: 调研/画图/选型/编码/重构/测试/部署/运维/...</Text>
            </View>
          ) : matches.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="alert-circle-outline" size={16} color={C.ink4} />
              <Text style={styles.emptyText}>无员工匹配 "{input}" — 改用 2 字中文技能试试</Text>
            </View>
          ) : (
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {matches.map((m) => {
                const tone = toneForRoleLabel(m.agent.roleLabel);
                return (
                  <Pressable
                    key={m.agent.id}
                    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                    onPress={() => handlePick(m)}
                    accessibilityRole="button"
                    accessibilityLabel={`派活给 ${m.agent.name} 评分 ${m.score}`}
                  >
                    <View style={[styles.roleBadge, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                      <Text style={[styles.roleBadgeText, { color: tone.fg }]} numberOfLines={1}>
                        {m.agent.roleLabel ?? "员工"}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name} numberOfLines={1}>
                        {m.agent.name}
                      </Text>
                      <View style={styles.matchedRow}>
                        {m.matchedSkills.map((s) => (
                          <View key={s} style={styles.matchedChip}>
                            <Text style={styles.matchedChipText}>{s}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                    <View style={styles.scoreWrap}>
                      <Text style={styles.scoreNum}>{m.score}</Text>
                      <Text style={styles.scoreUnit}>分</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <Pressable onPress={onClose} style={styles.close} hitSlop={6}>
            <Text style={styles.closeText}>关闭</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: C.panel,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingTop: 16,
    paddingBottom: 24,
    paddingHorizontal: 16,
    maxHeight: "80%",
  },
  header: {
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: C.ink,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 11,
    color: C.ink4,
    textAlign: "center",
    marginTop: 4,
  },
  input: {
    backgroundColor: C.bg,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: C.ink,
    fontSize: 14,
    marginBottom: 8,
  },
  hint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  hintText: {
    color: C.ink4,
    fontSize: 11,
    flex: 1,
  },
  empty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 24,
    paddingHorizontal: 4,
  },
  emptyText: {
    color: C.ink3,
    fontSize: 12,
    flex: 1,
  },
  list: {
    marginTop: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: C.bg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.line,
    marginBottom: 8,
  },
  rowPressed: {
    backgroundColor: C.surfaceHover ?? C.lineSubtle,
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
    fontSize: 14,
    fontWeight: "500",
  },
  matchedRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
  },
  matchedChip: {
    backgroundColor: alpha("#10B981", 0.18),
    borderColor: alpha("#10B981", 0.4),
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  matchedChipText: {
    color: "#34D399",
    fontSize: 10,
  },
  scoreWrap: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 40,
  },
  scoreNum: {
    color: C.accent,
    fontSize: 18,
    fontWeight: "700",
  },
  scoreUnit: {
    color: C.ink4,
    fontSize: 10,
  },
  close: {
    marginTop: 4,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: RADIUS.md,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
  },
  closeText: {
    color: C.ink2,
    fontSize: 13,
  },
});
