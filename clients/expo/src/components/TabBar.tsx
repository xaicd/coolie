import { Pressable, StyleSheet, Text, Vibration, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../theme";

/** 底部 tab bar 的落点 + 中央新建 FAB。 */
export type BarTabKey = "dashboard" | "tasks" | "inbox" | "chat" | "assets" | "agents" | "ontology" | "artifacts";

/**
 * 底栏高度。铺满底部的浮层必须让出这一段。
 */
export const TAB_BAR_HEIGHT = 64;

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
  { key: "inbox", label: "收件箱", icon: "mail-outline", activeIcon: "mail" },
  { key: "chat", label: "工坊", icon: "chatbubble-ellipses-outline", activeIcon: "chatbubble-ellipses" },
  { key: "assets", label: "资产", icon: "layers-outline", activeIcon: "layers" },
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
    <Pressable
      style={styles.tab}
      onPress={() => {
        if (!active) {
          Vibration.vibrate(15);
        }
        onPress();
      }}
      hitSlop={4}
    >
      <Ionicons
        name={active ? slot.activeIcon : slot.icon}
        size={24}
        color={active ? C.accent : C.ink3}
      />
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
        {slot.label}
      </Text>
    </Pressable>
  );
}

/**
 * 底部 tab bar:
 * 汇览 · 任务 · [+] · 工坊 · 资产
 * 中央 "+" 是新建任务的圆型 FAB (极速新建任务表单)。
 * 工坊是 AI 高管中枢与自然语言/语音派单会议室。
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
          onPress={() => {
            Vibration.vibrate(30);
            onCreate();
          }}
          hitSlop={8}
          accessibilityLabel="新建任务"
        >
          <Ionicons name="add" size={26} color="#FFFFFF" />
        </Pressable>
      </View>

      {RIGHT.map((slot) => {
        const isActive =
          tab === slot.key ||
          (slot.key === "ontology" && tab === "assets");
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
    gap: 4,
  },
  tabLabel: {
    fontSize: 13,
    lineHeight: 16,
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
