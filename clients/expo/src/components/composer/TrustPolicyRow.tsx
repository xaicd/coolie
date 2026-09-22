import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  TRUST_PRESET_DESCRIPTION,
  TRUST_PRESET_LABEL,
  getTrustPreset,
  type AgentPermissions,
} from "@coolie/api-client";
import { C } from "../../coolie";
import { ELEVATION, RADIUS, SPACING } from "../../ui/tokens";

/**
 * 信任策略 —— App 侧的 Coolie Web `NewIssueDialog` 信任级别提示。
 *
 * 上游对话框不把信任级别做成可选项: 它是**被指派人自身的属性**
 * (`agent.permissions.trustPreset`, 见 `ui/src/lib/trust-policy-ui.ts`), 在上游
 * 表现为指派人选项上的盾牌徽标 + 选中低信任复核负责人时的黄色提示条。App 的
 * 胶囊轨放不下徽标, 所以把同一条信息单独成一行: 选中的负责人是谁、他是什么
 * 信任级别 —— 数据同源 (`getTrustPreset`), 不新增可写字段。
 *
 * 没选负责人 (自动派发) 时不显示: 那时没有「谁的信任级别」可言, 编一个默认值
 * 出来只会让人以为已经定了。
 */
export function TrustPolicyRow({
  assigneeName,
  permissions,
}: {
  /** 已选负责人名字; 未指派传 null。 */
  assigneeName: string | null;
  /** 该负责人的权限文档 (可能读不到 —— 见下)。 */
  permissions?: AgentPermissions | null;
}) {
  if (!assigneeName) {
    return (
      <View style={styles.row}>
        <Text style={styles.label}>信任策略</Text>
        <Text style={styles.empty}>未指派负责人 —— 信任级别随负责人确定</Text>
      </View>
    );
  }

  const preset = getTrustPreset(permissions);
  const lowTrust = preset === "low_trust_review";
  // 接口给了 permissions 才敢说「这是当前值」; 没给就只说默认值, 不假装读到了。
  const known = permissions !== undefined && permissions !== null;

  return (
    <View style={styles.block}>
      <View style={styles.row}>
        <Text style={styles.label}>信任策略</Text>
        <View style={[styles.chip, lowTrust && styles.chipWarn]}>
          <Ionicons
            name={lowTrust ? "shield-half-outline" : "shield-checkmark-outline"}
            size={13}
            color={lowTrust ? C.warn : C.ink3}
          />
          <Text style={[styles.chipText, lowTrust && styles.chipTextWarn]}>
            {TRUST_PRESET_LABEL[preset]}
          </Text>
        </View>
        <Text style={styles.who} numberOfLines={1}>
          {assigneeName}
        </Text>
      </View>
      <Text style={styles.hint}>
        {TRUST_PRESET_DESCRIPTION[preset]}
        {known ? "" : " (实例未回传该负责人的权限文档, 按默认级别显示)"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: SPACING.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  label: {
    color: C.ink4,
    fontSize: 13,
  },
  empty: {
    color: C.ink4,
    fontSize: 12,
    flexShrink: 1,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: ELEVATION.base,
  },
  chipWarn: {
    borderColor: "rgba(245, 158, 11, 0.25)",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
  },
  chipText: {
    color: C.ink3,
    fontSize: 12,
    fontWeight: "500",
  },
  chipTextWarn: {
    color: C.warn,
  },
  who: {
    color: C.ink4,
    fontSize: 12,
    flexShrink: 1,
  },
  hint: {
    color: C.ink4,
    fontSize: 11,
    lineHeight: 16,
  },
});
