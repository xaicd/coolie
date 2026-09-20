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
 * "建域 xxx" 触发词。与 server/src/services/build-orchestrator.ts 的
 * DOMAIN_TRIGGER_PATTERN 必须保持一致 —— 客户端决定何时打出这张卡,
 * 服务端决定是否接受这次请求, 两边都按同一个正则判定。
 *
 * 与 BUILD_TRIGGER_PATTERN 并列但不重叠: 「建域」产出的是一份要被审批的
 * 本体规范, 「build/开发/做」产出的是代码构建链。两条链的卡也不同。
 */
export const DOMAIN_TRIGGER_PATTERN = /^(?:建域|建模|domain)\s+/i;

export function isDomainPrompt(text: string): boolean {
  return DOMAIN_TRIGGER_PATTERN.test(text.trim());
}

/** 逐字段预览里每类最多列几条属性, 超出折叠成一行计数 */
const MAX_PROPERTIES_PER_TYPE = 8;

export interface SpecDiffProperty {
  name: string;
  type?: string;
  description?: string;
}

export interface SpecDiffObjectType {
  key: string;
  displayName?: string;
  description?: string;
  properties?: SpecDiffProperty[];
}

export interface SpecDiffRelationType {
  key: string;
  displayName?: string;
  sourceNodeTypeKey?: string;
  targetNodeTypeKey?: string;
  cardinality?: string;
}

export interface SpecProblemPayload {
  severity: string;
  code: string;
  subject: string;
  message: string;
}

/**
 * 与服务端 `OntologyBuildSpec` 对应的展示用子集。
 *
 * 只声明这张卡真正读到的字段, 且**不含任何取值联合** —— 允许哪些属性类型、
 * 哪些基数是本体插件（`ontology-core` 的 `validateDocument`）的判断, 客户端
 * 若在这里再写一份白名单, 就会多出一份会漂移的真相。
 */
export interface DomainSpecPayload {
  specVersion?: string;
  document?: {
    name?: string;
    objectTypes?: SpecDiffObjectType[];
    relationTypes?: SpecDiffRelationType[];
  };
}

export interface SpecDiffCardProps {
  prompt: string;
  loading?: boolean;
  error?: string | null;
  /**
   * `hermes` = 有可审的规范; `rejected` = 没有 —— 规划器不可用、输出不合格式,
   * 或本体插件拒了这份文档。三者对用户是同一件事: 没有东西可以批准。
   */
  planSource?: "hermes" | "rejected" | null;
  document?: DomainSpecPayload["document"] | null;
  problems?: SpecProblemPayload[];
  /** 审批状态 (pending / approved / rejected)。 */
  approvalStatus?: string | null;
  /** 已落地的域 id, 有值时说明这一步已经完成。 */
  domainId?: string | null;
  /** 打开这条规范对应的审批。 */
  onOpenApproval?: () => void;
  onOpenDomain?: (domainId: string) => void;
}

/** 属性类型显示: 无类型时给一个明确的占位, 而不是留空让人以为丢了。 */
function propertyTypeLabel(property: SpecDiffProperty): string {
  return property.type && property.type.trim() ? property.type : "未定类型";
}

function approvalVisual(status: string | null | undefined): {
  label: string;
  tone: ToneName;
  dot: StatusDotKind;
} {
  switch (status) {
    case "approved":
      return { label: "已批准", tone: "ok", dot: "ok" };
    case "rejected":
      return { label: "已驳回", tone: "err", dot: "idle" };
    case "revision_requested":
      return { label: "待修改", tone: "warn", dot: "idle" };
    case "pending":
      return { label: "待审批", tone: "warn", dot: "idle" };
    default:
      return { label: "未提交审批", tone: "muted", dot: "idle" };
  }
}

/**
 * 本体规范预览卡: 聊天流内展示一份待审批的本体规范, 逐对象类型列出
 * `字段名: 类型`, 形态对齐参考实现的「Schema 模型实时 Diff 预览」。
 *
 * 数据来自 POST /api/build/spec/start 的响应。这张卡只展示, 不写库 ——
 * 落库由服务端在审批通过后调本体插件完成, 因此这里没有「应用」按钮。
 */
export function SpecDiffCard({
  prompt,
  loading = false,
  error = null,
  planSource = null,
  document: specDocument = null,
  problems = [],
  approvalStatus = null,
  domainId = null,
  onOpenApproval,
  onOpenDomain,
}: SpecDiffCardProps) {
  const subject = prompt.trim().replace(DOMAIN_TRIGGER_PATTERN, "").trim();
  const objectTypes = specDocument?.objectTypes ?? [];
  const relationTypes = specDocument?.relationTypes ?? [];
  const errors = problems.filter((problem) => problem.severity === "error");
  const approval = approvalVisual(approvalStatus);

  return (
    <AppCard style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="git-network-outline" size={15} color={C.accent} />
          <Text style={styles.headerTitle}>本体规范</Text>
        </View>
        {planSource === "hermes" ? (
          <StatusBadge
            label={approval.label}
            tone={approval.tone}
            dotStatus={approval.dot}
            size={5}
          />
        ) : planSource === "rejected" ? (
          <Pill size="sm" tone="err" label="未产出规范" />
        ) : null}
      </View>

      <Text style={styles.subject} numberOfLines={2}>
        {subject || prompt}
      </Text>

      {loading ? (
        <View style={styles.stateRow}>
          <ActivityIndicator size="small" color={C.accent} />
          <Text style={styles.stateText}>正在梳理领域模型…</Text>
        </View>
      ) : error ? (
        <View style={styles.stateRow}>
          <Ionicons name="alert-circle-outline" size={15} color={C.err} />
          <Text style={[styles.stateText, styles.stateTextError]}>{error}</Text>
        </View>
      ) : planSource === "rejected" ? (
        <View style={styles.stateBlock}>
          <Text style={styles.stateText}>
            这次没能产出可审批的规范, 因此本体里没有写入任何东西。
          </Text>
          {errors.slice(0, 3).map((problem) => (
            <Text key={`${problem.code}-${problem.subject}`} style={styles.problemText}>
              · {problem.subject}: {problem.message}
            </Text>
          ))}
        </View>
      ) : (
        <>
          {specDocument?.name ? (
            <Text style={styles.domainName} numberOfLines={1}>
              {specDocument.name}
              <Text style={styles.domainCounts}>
                {"  "}
                {objectTypes.length} 对象类型 / {relationTypes.length} 关系类型
              </Text>
            </Text>
          ) : null}

          <View style={styles.schemaBlock}>
            {objectTypes.map((type) => {
              const properties = type.properties ?? [];
              const shown = properties.slice(0, MAX_PROPERTIES_PER_TYPE);
              const hidden = properties.length - shown.length;
              return (
                <View key={type.key} style={styles.typeBlock}>
                  <View style={styles.typeHeader}>
                    <Text style={styles.typeName} numberOfLines={1}>
                      {type.displayName ?? type.key}
                    </Text>
                    <Text style={styles.typeKey} numberOfLines={1}>
                      {type.key}
                    </Text>
                  </View>
                  {shown.map((property) => (
                    <View key={property.name} style={styles.propertyRow}>
                      <Text style={styles.propertyName} numberOfLines={1}>
                        {property.name}
                      </Text>
                      <Text style={styles.propertyType} numberOfLines={1}>
                        {propertyTypeLabel(property)}
                      </Text>
                    </View>
                  ))}
                  {hidden > 0 ? (
                    <Text style={styles.moreText}>+{hidden} 个属性</Text>
                  ) : null}
                </View>
              );
            })}
          </View>

          {relationTypes.length > 0 ? (
            <View style={styles.relationBlock}>
              <Text style={styles.sectionLabel}>关系</Text>
              {relationTypes.slice(0, MAX_PROPERTIES_PER_TYPE).map((relation) => (
                <Text key={relation.key} style={styles.relationLine} numberOfLines={1}>
                  {relation.sourceNodeTypeKey ?? "?"} → {relation.targetNodeTypeKey ?? "?"}
                  {"  "}
                  <Text style={styles.relationName}>{relation.displayName ?? relation.key}</Text>
                  {relation.cardinality ? ` (${relation.cardinality})` : ""}
                </Text>
              ))}
            </View>
          ) : null}

          {problems.length > 0 ? (
            <View style={styles.lintBlock}>
              <Text style={styles.sectionLabel}>建模建议</Text>
              {problems.slice(0, 4).map((problem) => (
                <Text
                  key={`${problem.severity}-${problem.code}-${problem.subject}`}
                  style={styles.problemText}
                >
                  · {problem.subject}: {problem.message}
                </Text>
              ))}
            </View>
          ) : null}

          {domainId ? (
            onOpenDomain ? (
              <Pressable style={styles.actionRow} onPress={() => onOpenDomain(domainId)}>
                <Ionicons name="checkmark-circle-outline" size={14} color={C.ok} />
                <Text style={styles.actionText}>已落地本体域 · 查看</Text>
              </Pressable>
            ) : (
              // No domain-navigation channel on this screen. Stated plainly
              // rather than shown as a button that does nothing.
              <View style={styles.actionRow}>
                <Ionicons name="checkmark-circle-outline" size={14} color={C.ok} />
                <Text style={styles.actionText}>已落地本体域</Text>
              </View>
            )
          ) : approvalStatus ? (
            <Pressable style={styles.actionRow} onPress={() => onOpenApproval?.()}>
              <Ionicons name="lock-closed-outline" size={14} color={C.warn} />
              <Text style={styles.actionText}>审批通过后才会写入本体</Text>
            </Pressable>
          ) : null}
        </>
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
  stateBlock: {
    marginTop: SPACING.md,
    gap: SPACING.xs,
  },
  stateText: {
    color: C.ink3,
    fontSize: FONT_SIZE.meta,
    flexShrink: 1,
  },
  stateTextError: {
    color: C.err,
  },
  domainName: {
    color: C.ink,
    fontSize: FONT_SIZE.meta,
    fontWeight: "600",
    marginTop: SPACING.sm,
  },
  domainCounts: {
    color: C.ink3,
    fontWeight: "400",
  },
  schemaBlock: {
    marginTop: SPACING.sm,
    gap: SPACING.sm,
  },
  typeBlock: {
    backgroundColor: TONE.muted.bg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: TONE.muted.border,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  typeHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: SPACING.xs,
  },
  typeName: {
    color: C.ink,
    fontSize: FONT_SIZE.meta,
    fontWeight: "600",
    flexShrink: 1,
  },
  typeKey: {
    color: C.ink3,
    fontSize: FONT_SIZE.meta,
  },
  propertyRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingVertical: 1,
  },
  propertyName: {
    color: C.ink2,
    fontSize: FONT_SIZE.meta,
    flexShrink: 1,
  },
  propertyType: {
    color: C.accent,
    fontSize: FONT_SIZE.meta,
  },
  moreText: {
    color: C.ink3,
    fontSize: FONT_SIZE.meta,
    marginTop: 2,
  },
  relationBlock: {
    marginTop: SPACING.sm,
    gap: 2,
  },
  sectionLabel: {
    color: C.ink3,
    fontSize: FONT_SIZE.meta,
    fontWeight: "600",
  },
  relationLine: {
    color: C.ink2,
    fontSize: FONT_SIZE.meta,
  },
  relationName: {
    color: C.accent,
  },
  lintBlock: {
    marginTop: SPACING.sm,
    gap: 2,
  },
  problemText: {
    color: C.warn,
    fontSize: FONT_SIZE.meta,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  actionText: {
    color: C.ink3,
    fontSize: FONT_SIZE.meta,
  },
});
