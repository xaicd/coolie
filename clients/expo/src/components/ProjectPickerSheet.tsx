import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../coolie";
import { Sheet } from "../ui/Sheet";
import { RADIUS, SPACING } from "../ui/tokens";
import { StatusDot } from "./StatusDot";
import type { ProjectLike } from "../lib/project-context";

/**
 * wave383 — 工坊顶栏「切换项目」抽屉。
 *
 * 列出本公司全部未归档项目 (名称 + 状态), 选中即回调 —— 由 BoardChatScreen 负责把
 * 选中项目落到它专属的工坊会话 (无则服务端幂等新建)。组件只负责选, 不发请求。
 *
 * 老板拍: 生产 coolie 工坊是对外项目建设, 不是建设自己 —— 列表里本体项目照常可见,
 * 但默认落地由 BoardChatScreen 的启发式排除 (see lib/project-context.ts)。
 */
export function ProjectPickerSheet({
  visible,
  projects,
  selectedProjectId,
  busy = false,
  onSelect,
  onClose,
}: {
  visible: boolean;
  projects: ProjectLike[];
  selectedProjectId: string | null;
  busy?: boolean;
  onSelect: (projectId: string) => void;
  onClose: () => void;
}) {
  if (!visible) return null;

  const list = Array.isArray(projects)
    ? projects.filter((p) => p && p.id && p.name && !(p as { archivedAt?: string | null }).archivedAt)
    : [];

  return (
    <Sheet onClose={onClose} title="切换项目" maxHeight={460}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {list.length === 0 ? (
          <Text style={styles.empty}>该公司暂无项目</Text>
        ) : (
          list.map((project) => (
            <PickerRow
              key={project.id}
              label={project.name}
              status={project.status ?? "in_progress"}
              selected={selectedProjectId === project.id}
              disabled={busy}
              onPress={() => onSelect(project.id)}
            />
          ))
        )}
      </ScrollView>
    </Sheet>
  );
}

const PROJECT_STATUS_LABEL: Record<string, string> = {
  in_progress: "进行中",
  planned: "计划中",
  completed: "已完成",
  paused: "已暂停",
  backlog: "待规划",
  cancelled: "已取消",
};

function statusColor(status: string): string {
  switch (status) {
    case "in_progress":
      return C.accent;
    case "completed":
      return C.ok;
    case "paused":
      return C.warn;
    case "backlog":
      return C.ink4;
    default:
      return C.ink3;
  }
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
        <StatusDot status="idle" color={statusColor(status ?? "")} size={6} />
      </View>
      <View style={styles.itemText}>
        <Text style={[styles.itemLabel, selected && styles.itemLabelActive]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.itemHint}>{PROJECT_STATUS_LABEL[status ?? ""] ?? status ?? "未知"}</Text>
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
