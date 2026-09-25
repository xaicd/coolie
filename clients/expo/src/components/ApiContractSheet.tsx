import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../coolie";
import { Sheet } from "../ui/Sheet";
import { RADIUS, SPACING } from "../ui/tokens";

interface ApiContractItem {
  id: string;
  name: string;
  apiKey: string;
  protocol: "http" | "dubbo" | "grpc" | "mq";
  endpoint: string;
  stage: string;
  ontologyEntity: string;
  reqCount: number;
  respCount: number;
}

const SAMPLE_APIS: ApiContractItem[] = [
  {
    id: "api_001",
    name: "创建商品订单接口",
    apiKey: "order.create",
    protocol: "http",
    endpoint: "/api/v1/mall/orders",
    stage: "verified",
    ontologyEntity: "MallOrder (主订单)",
    reqCount: 4,
    respCount: 4,
  },
  {
    id: "api_002",
    name: "资金原子扣减 RPC",
    apiKey: "payment.balance.deduct",
    protocol: "dubbo",
    endpoint: "AccountBalanceDubboService#deductBalance",
    stage: "verified",
    ontologyEntity: "UserAccount (资金账户)",
    reqCount: 3,
    respCount: 2,
  },
  {
    id: "api_003",
    name: "实时风控反欺诈判定",
    apiKey: "risk.fraud.evaluate",
    protocol: "grpc",
    endpoint: "RiskEvaluationService/EvaluateFraudRisk",
    stage: "implemented",
    ontologyEntity: "SysUser (用户)",
    reqCount: 3,
    respCount: 2,
  },
  {
    id: "api_004",
    name: "订单支付就绪异步事件",
    apiKey: "order.paid.event",
    protocol: "mq",
    endpoint: "ORDER_PAID_TOPIC",
    stage: "mocking",
    ontologyEntity: "MallOrder (支付履约)",
    reqCount: 3,
    respCount: 1,
  },
];

interface ApiContractSheetProps {
  projectId: string;
  projectName: string;
  onClose: () => void;
  onOpenFullWeb?: () => void;
}

/**
 * 移动端原生 API 契约与 DSH 生命周期速览抽屉。
 * 毫秒级展示微服务 API 契约、入出参及本体绑定，避免必须跳入 WebContainer 加载。
 */
export function ApiContractSheet({
  projectName,
  onClose,
  onOpenFullWeb,
}: ApiContractSheetProps) {
  const [selectedId, setSelectedId] = useState<string>("api_001");
  const selectedApi = SAMPLE_APIS.find((a) => a.id === selectedId) ?? SAMPLE_APIS[0];

  const getProtocolBadge = (protocol: string) => {
    switch (protocol) {
      case "http":
        return { label: "HTTP", color: "#38bdf8", bg: "rgba(56, 189, 248, 0.12)" };
      case "dubbo":
        return { label: "DUBBO", color: "#fb923c", bg: "rgba(251, 146, 60, 0.12)" };
      case "grpc":
        return { label: "gRPC", color: "#c084fc", bg: "rgba(192, 132, 252, 0.12)" };
      case "mq":
        return { label: "MQ", color: "#34d399", bg: "rgba(52, 211, 153, 0.12)" };
      default:
        return { label: protocol.toUpperCase(), color: C.ink3, bg: "rgba(255, 255, 255, 0.05)" };
    }
  };

  return (
    <Sheet onClose={onClose} title={`${projectName} · API 契约中心`} maxHeight={580}>
      <View style={styles.container}>
        {/* 顶部简述与全屏 Web 穿透按钮 */}
        <View style={styles.headerRow}>
          <Text style={styles.headerSubtitle}>
            最细粒度业务交付单元 · DSH MCP 工具投影
          </Text>
          {onOpenFullWeb ? (
            <Pressable style={styles.webBtn} onPress={onOpenFullWeb}>
              <Text style={styles.webBtnText}>打开桌面全功能 ↗</Text>
            </Pressable>
          ) : null}
        </View>

        {/* 协议与契约列表快速横向筛选卡片 */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContainer}
        >
          {SAMPLE_APIS.map((item) => {
            const isSelected = item.id === selectedId;
            const badge = getProtocolBadge(item.protocol);

            return (
              <Pressable
                key={item.id}
                onPress={() => setSelectedId(item.id)}
                style={[styles.apiCard, isSelected && styles.apiCardSelected]}
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.badge, { backgroundColor: badge.bg, borderColor: badge.color }]}>
                    <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
                  </View>
                  <Text style={styles.stageText}>{item.stage}</Text>
                </View>

                <Text style={styles.apiName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.apiKey} numberOfLines={1}>
                  {item.apiKey}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* 选中的 API 契约详情卡片 */}
        {selectedApi ? (
          <View style={styles.detailBox}>
            <View style={styles.detailHeader}>
              <View style={styles.detailTitleWrap}>
                <Ionicons name="code-slash" size={14} color={C.accent} />
                <Text style={styles.detailTitle}>{selectedApi.name}</Text>
              </View>
              <Text style={styles.mcpPill}>DSH MCP 自动投影 ✓</Text>
            </View>

            <Text style={styles.endpointText} numberOfLines={1}>
              {selectedApi.endpoint}
            </Text>

            <View style={styles.metaGrid}>
              <View style={styles.metaCell}>
                <Text style={styles.metaLabel}>领域本体映射</Text>
                <Text style={[styles.metaVal, { color: C.accent }]} numberOfLines={1}>
                  {selectedApi.ontologyEntity}
                </Text>
              </View>
              <View style={styles.metaCell}>
                <Text style={styles.metaLabel}>入参契约</Text>
                <Text style={styles.metaVal}>{selectedApi.reqCount} 字段 (强校验)</Text>
              </View>
              <View style={styles.metaCell}>
                <Text style={styles.metaLabel}>出参回包</Text>
                <Text style={[styles.metaVal, { color: C.ok }]}>{selectedApi.respCount} 字段 (业务守恒)</Text>
              </View>
              <View style={styles.metaCell}>
                <Text style={styles.metaLabel}>CMMI 门禁</Text>
                <Text style={[styles.metaVal, { color: selectedApi.stage === "verified" ? C.ok : C.warn }]}>
                  {selectedApi.stage === "verified" ? "G4 验收通过" : "G3 编码实现中"}
                </Text>
              </View>
            </View>

            {/* DSH 智能 Mock 报文快速摘要 */}
            <View style={styles.mockSummary}>
              <View style={styles.mockHeader}>
                <Text style={styles.mockTitle}>DSH Mock 响应摘要 (高保真)</Text>
                <Text style={styles.mockStatus}>code: 200 OK</Text>
              </View>
              <Text style={styles.mockCode} numberOfLines={3}>
                {`{\n  "code": 200,\n  "msg": "success",\n  "data": { "${selectedApi.apiKey}": "mocked_by_dsh" }\n}`}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerSubtitle: {
    fontSize: 11,
    color: C.ink3,
    flex: 1,
  },
  webBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.xs,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: C.line,
  },
  webBtnText: {
    fontSize: 10,
    color: C.ink2,
  },
  listContainer: {
    flexDirection: "row",
    gap: SPACING.sm,
    paddingVertical: 4,
  },
  apiCard: {
    width: 140,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderWidth: 1,
    borderColor: C.line,
  },
  apiCardSelected: {
    borderColor: C.accent,
    backgroundColor: "rgba(94, 106, 210, 0.08)",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  badge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 0.5,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "700",
  },
  stageText: {
    fontSize: 9,
    color: C.ink4,
  },
  apiName: {
    fontSize: 12,
    fontWeight: "600",
    color: C.ink1,
    marginTop: 2,
  },
  apiKey: {
    fontSize: 9,
    color: C.ink4,
    fontFamily: "monospace",
    marginTop: 1,
  },
  detailBox: {
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderWidth: 1,
    borderColor: C.line,
    gap: 8,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  detailTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  detailTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: C.ink1,
  },
  mcpPill: {
    fontSize: 10,
    color: C.accent,
    fontWeight: "500",
  },
  endpointText: {
    fontSize: 10,
    fontFamily: "monospace",
    color: C.ink3,
    backgroundColor: "rgba(0,0,0,0.2)",
    padding: 4,
    borderRadius: 4,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  metaCell: {
    width: "48%",
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    padding: 6,
    borderRadius: RADIUS.xs,
  },
  metaLabel: {
    fontSize: 9,
    color: C.ink4,
  },
  metaVal: {
    fontSize: 10,
    fontWeight: "600",
    color: C.ink2,
    marginTop: 1,
  },
  mockSummary: {
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderRadius: RADIUS.xs,
    padding: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  mockHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  mockTitle: {
    fontSize: 9,
    color: C.ink3,
    fontWeight: "600",
  },
  mockStatus: {
    fontSize: 9,
    color: C.ok,
    fontFamily: "monospace",
  },
  mockCode: {
    fontSize: 9,
    fontFamily: "monospace",
    color: C.ok,
  },
});
