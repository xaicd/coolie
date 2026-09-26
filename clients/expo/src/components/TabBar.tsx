import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../theme";

/** 底部 tab bar 的四个落点 + 中央新建 FAB。 */
export type BarTabKey = "dashboard" | "tasks" | "chat" | "assets" | "agents" | "inbox" | "ontology" | "artifacts";

/**
 * 底栏高度。铺满底部的浮层必须让出这一段。
 */
export const TAB_BAR_HEIGHT = 60;

type Slot = {
  key: BarTabKey;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  activeIcon: React.ComponentProps<typeof Ionicons>["name"];
};

const LEFT: Slot[] = [
  { key: "dashboard", label: "汇览", icon: "stats-chart-outline", activeIcon: "stats-chart" },
  { key: "tasks", label: "任务", icon: "list-outline", activeIcon: "list" },
];

const RIGHT: Slot[] = [
  { key: "chat", label: "工坊", icon: "chatbubble-ellipses-outline", activeIcon: "chatbubble-ellipses" },
  { key: "assets", label: "资产", icon: "grid-outline", activeIcon: "grid" },
];

function Tab({
  slot,
  active,
  onPress,
}: {
  slot: Slot;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.tab} onPress={onPress} hitSlop={4}>
      <Ionicons
        name={active ? slot.activeIcon : slot.icon}
        size={22}
        color={active ? C.accent : C.ink3}
      />
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
        {slot.label}
      </Text>
    </Pressable>
  );
}

/**
 * 底部 tab bar — 对齐 Coolie Web 的 Home / Tasks / New / Agents / Inbox:
 * 汇览 · 任务 · [+] · 员工 · 收件箱, 中央 "+" 是新建任务的圆型 FAB。
 *
 * 工坊(对话) / 本体 / 产物 不占底部栏 (wave10 只保留 5 项), 仍从任务页顶部
 * 的图标行进入, 能力不减。
 */
export function TabBar({
  tab,
  onChange,
  onCreate,
}: {
  tab: string;
  onChange: (key: BarTabKey) => void;
  onCreate: () => void;
}) {
  return (
    <View style={styles.bar}>
      {LEFT.map((slot) => (
        <Tab
          key={slot.key}
          slot={slot}
          active={tab === slot.key}
          onPress={() => onChange(slot.key)}
        />
      ))}

      <View style={styles.fabSlot}>
        <Pressable
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          onPress={onCreate}
          hitSlop={8}
          accessibilityLabel="新建任务"
        >
          <Ionicons name="add" size={26} color="#FFFFFF" />
        </Pressable>
      </View>

      {RIGHT.map((slot) => {
        const isActive =
          tab === slot.key ||
          (slot.key === "assets" && (tab === "agents" || tab === "ontology" || tab === "artifacts"));
        return (
          <Tab
            key={slot.key}
            slot={slot}
            active={isActive}
            onPress={() => onChange(slot.key)}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    height: TAB_BAR_HEIGHT,
    borderTopWidth: 1,
    borderTopColor: C.lineSubtle,
    backgroundColor: C.panel,
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  tabLabel: {
    fontSize: 10,
    color: C.ink3,
    fontWeight: "400",
  },
  tabLabelActive: {
    color: C.accent,
    fontWeight: "500",
  },
  fabSlot: {
    width: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  fab: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.accent,
    marginTop: -14,
  },
  fabPressed: {
    backgroundColor: C.accentHover,
  },
});
