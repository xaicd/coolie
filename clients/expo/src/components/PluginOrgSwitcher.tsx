import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Company } from "@coolie/api-client";
import { C } from "../theme";
import { RADIUS, SPACING } from "../ui/tokens";

export interface PluginOrgSwitcherProps {
  /** 当前选中的 company (与当前凭证下能看到的 companies 比对). */
  currentCompany: Company;
  /** 同一凭证下可见的其他 companies (用来列出切换选项). */
  companies: Company[];
  /** 点选一个 company 后调用, 由 App 层负责切换上下文 (清缓存 + 重新加载). */
  onSwitch: (company: Company) => void;
  /** 切换中的占位提示 (App 重新拉公司数据时显示). */
  switching?: boolean;
}

/**
 * 抄 web 端 `PluginOrganizationSwitcher` 的最小可用集 — 公司切换 pill.
 *
 * 设计取舍 (wave235):
 * - 不抢 App.tsx 的状态管理 (那里是 sign-in 后选 company, 不可动态切).
 *   当前实现是"展示 + 委托": 列出可切选项, 选完把决策交给 onSwitch.
 * - 真正的切换逻辑 (清缓存 + 重新加载所有屏) 由 OrgAssetsScreen 持有.
 * - 仅在 `companies.length > 1` 时显示, 单公司场景下不打扰.
 * - 用 `Modal` 做下拉, 避免引入第三方 popover 库.
 */
export function PluginOrgSwitcher({
  currentCompany,
  companies,
  onSwitch,
  switching,
}: PluginOrgSwitcherProps) {
  const [open, setOpen] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: open ? 1 : 0,
      duration: 120,
      useNativeDriver: true,
    }).start();
  }, [open, fade]);

  // 单公司时静默退场 — 不显示切换器, 也不影响布局
  if (companies.length <= 1) return null;

  const others = companies.filter((c) => c.id !== currentCompany.id);

  return (
    <>
      <Pressable
        onPress={() => !switching && setOpen(true)}
        disabled={switching}
        style={[styles.pill, switching && styles.pillBusy]}
        hitSlop={4}
      >
        <Ionicons name="business-outline" size={12} color={C.accent} />
        <Text style={styles.pillLabel} numberOfLines={1}>
          {currentCompany.name}
        </Text>
        <Ionicons name="chevron-down" size={12} color={C.ink3} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Animated.View style={[styles.sheet, { opacity: fade }]}>
            <Pressable onPress={(e) => e.stopPropagation()} style={styles.sheetInner}>
              <Text style={styles.sheetTitle}>切换公司</Text>
              <Text style={styles.sheetSubtitle}>当前 · {currentCompany.name}</Text>

              <ScrollView style={styles.sheetList}>
                {others.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      setOpen(false);
                      onSwitch(c);
                    }}
                    style={({ pressed }) => [
                      styles.option,
                      pressed && styles.optionPressed,
                    ]}
                    hitSlop={4}
                  >
                    <View style={styles.optionDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.optionName} numberOfLines={1}>
                        {c.name}
                      </Text>
                      {c.issuePrefix ? (
                        <Text style={styles.optionPrefix}>{c.issuePrefix}</Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={C.ink3} />
                  </Pressable>
                ))}
              </ScrollView>

              <Pressable
                onPress={() => setOpen(false)}
                style={styles.cancel}
                hitSlop={4}
              >
                <Text style={styles.cancelText}>取消</Text>
              </Pressable>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: "rgba(0, 200, 255, 0.3)",
    backgroundColor: "rgba(0, 200, 255, 0.08)",
    maxWidth: 180,
  },
  pillBusy: {
    opacity: 0.5,
  },
  pillLabel: {
    fontSize: 12,
    color: C.accent,
    fontWeight: "600",
    flexShrink: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: C.panel,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl,
    paddingHorizontal: SPACING.md,
  },
  sheetInner: {
    gap: SPACING.sm,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: C.ink,
    textAlign: "center",
  },
  sheetSubtitle: {
    fontSize: 11,
    color: C.ink4,
    textAlign: "center",
    marginBottom: SPACING.sm,
  },
  sheetList: {
    maxHeight: 320,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.line,
    marginBottom: SPACING.xs,
    backgroundColor: C.bg,
  },
  optionPressed: {
    backgroundColor: C.lineSubtle,
  },
  optionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.accent,
  },
  optionName: {
    fontSize: 14,
    color: C.ink,
    fontWeight: "500",
  },
  optionPrefix: {
    fontSize: 10,
    color: C.ink4,
    fontFamily: "monospace",
    marginTop: 1,
  },
  cancel: {
    marginTop: SPACING.sm,
    paddingVertical: SPACING.sm,
    alignItems: "center",
    borderRadius: RADIUS.md,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
  },
  cancelText: {
    fontSize: 13,
    color: C.ink2,
  },
});
