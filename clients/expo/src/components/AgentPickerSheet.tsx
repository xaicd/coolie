import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, type AgentRow } from "../coolie";
import { Sheet } from "../ui/Sheet";
import { RADIUS, SPACING } from "../ui/tokens";
import { StatusDot } from "./StatusDot";

/** 员工状态文案 —— 与 AgentsScreen 同一套口径, 避免两处漂移。 */
const AGENT_STATUS_LABEL: Record<string, string> = {
  active: "在线",
  running: "运行中",
  idle: "空闲",
  paused: "已暂停",
  error: "异常",
  pending_approval: "待审批",
  disabled: "停用",
};

function statusKind(status: string): "ok" | "idle" | "err" {
  if (status === "active" || status === "running") return "ok";
  if (status === "error") return "err";
  return "idle";
}

/**
 * 分配智能体底部选择器 —— 任务详情「改派」与新建任务「指派」共用同一个抽屉。
 *
 * 列出本公司全部员工 (名字 + 当前状态), 首项是清除项: 任务详情里叫「未分配」,
 * 新建任务里叫「自动派发」。选中即回调, 乐观更新与 PATCH 由调用方决定, 所以
 * 这个组件只负责选, 不负责发请求。
 */
export function AgentPickerSheet({
  visible,
  title = "分配智能体",
  agents,
  selectedAgentId,
  emptyLabel = "未分配",
  busy = false,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title?: string;
  agents: AgentRow[];
  selectedAgentId: string | null;
  /** 清除项的文案: 任务详情「未分配」/ 新建任务「自动派发」。 */
  emptyLabel?: string;
  busy?: boolean;
  onSelect: (agentId: string | null) => void;
  onClose: () => void;
}) {
  if (!visible) return null;

  return (
    <Sheet onClose={onClose} title={title} maxHeight={460}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        <PickerRow
          label={emptyLabel}
          selected={selectedAgentId === null}
          disabled={busy}
          onPress={() => onSelect(null)}
        />

        {agents.length === 0 ? (
          <Text style={styles.empty}>该公司暂无智能体</Text>
        ) : (
          agents.map((agent) => (
            <PickerRow
              key={agent.id}
              label={agent.name}
              status={agent.status}
              selected={selectedAgentId === agent.id}
              disabled={busy}
              onPress={() => onSelect(agent.id)}
            />
          ))
        )}
      </ScrollView>
    </Sheet>
  );
}

function PickerRow({
  label,
  status,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  status?: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.item,
        selected && styles.itemActive,
        pressed && styles.itemPressed,
        disabled && styles.itemDisabled,
      ]}
    >
      <View style={styles.lead}>
        {status ? <StatusDot status={statusKind(status)} size={5} /> : null}
      </View>
      <View style={styles.itemText}>
        <Text
          style={[styles.itemLabel, selected && styles.itemLabelActive]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {status ? (
          <Text style={styles.itemHint}>{AGENT_STATUS_LABEL[status] ?? status}</Text>
        ) : null}
      </View>
      {selected ? <Ionicons name="checkmark" size={16} color={C.accent} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 2,
    paddingBottom: SPACING.xs,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
  },
  itemActive: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  itemPressed: {
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  itemDisabled: {
    opacity: 0.5,
  },
  lead: {
    width: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  itemText: {
    flex: 1,
    minWidth: 0,
  },
  itemLabel: {
    color: C.ink2,
    fontSize: 14,
  },
  itemLabelActive: {
    color: C.ink,
    fontWeight: "600",
  },
  itemHint: {
    color: C.ink4,
    fontSize: 11,
    marginTop: 2,
  },
  empty: {
    color: C.ink4,
    fontSize: 12,
    fontStyle: "italic",
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
  },
});
