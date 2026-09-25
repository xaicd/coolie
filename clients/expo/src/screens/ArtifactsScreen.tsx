import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
  StatusBar as RNStatusBar,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import type {
  Company,
  CompanyArtifact,
  CompanyArtifactMediaKind,
  Issue,
  IssueWorkProduct,
  WorkspaceRuntimeService,
} from "@coolie/api-client";
import { C, COOLIE_BASE_URL, coolie, getAuthToken } from "../coolie";
import { CodeViewerWebView } from "../components/CodeViewerWebView";
import { AppCard } from "../ui/AppCard";
import { EmptyState } from "../ui/EmptyState";
import { LoadingState } from "../ui/LoadingState";
import { Pill } from "../ui/Pill";
import { ScreenHeader } from "../ui/ScreenHeader";
import { SegmentedControl } from "../ui/SegmentedControl";
import { ExternalOpenSheet } from "../components/ExternalOpenSheet";

export interface ArtifactsScreenProps {
  company: Company;
  whoami?: string;
  onBack?: () => void;
  onOpenSandbox?: (
    url: string,
    service?: WorkspaceRuntimeService | null,
    workProduct?: IssueWorkProduct | null,
  ) => void;
  onOpenDiff?: (issue: Issue, workProduct?: IssueWorkProduct | null) => void;
}

type FilterKind = "all" | "cmmi_baseline" | "image" | "document" | "work_product";

const FILTER_TABS: Array<{ key: FilterKind; label: string }> = [
  { key: "all", label: "全部" },
  { key: "cmmi_baseline", label: "5+2黄金文档" },
  { key: "document", label: "文档" },
  { key: "image", label: "图片" },
  { key: "work_product", label: "代码/原型" },
];

function resolveMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${COOLIE_BASE_URL}${cleanPath}`;
}

function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${m}-${day} ${h}:${min}`;
  } catch {
    return isoString;
  }
}

function getMediaKindBadge(kind: CompanyArtifactMediaKind, source: string) {
  if (source === "work_product") {
    return {
      icon: "⚡",
      label: "交付物",
      color: C.accent,
      bg: "rgba(113, 112, 255, 0.12)",
      border: "rgba(113, 112, 255, 0.3)",
    };
  }
  switch (kind) {
    case "image":
      return {
        icon: "🖼️",
        label: "图片",
        color: C.ok,
        bg: "rgba(39, 166, 68, 0.12)",
        border: "rgba(39, 166, 68, 0.3)",
      };
    case "document":
      return {
        icon: "📄",
        label: "文档",
        color: C.warn,
        bg: "rgba(245, 158, 11, 0.12)",
        border: "rgba(245, 158, 11, 0.3)",
      };
    case "text":
      return {
        icon: "📝",
        label: "文本",
        color: C.ink2,
        bg: "rgba(255, 255, 255, 0.05)",
        border: C.line,
      };
    case "video":
      return {
        icon: "🎬",
        label: "视频",
        color: "#38BDF8",
        bg: "rgba(56, 189, 248, 0.12)",
        border: "rgba(56, 189, 248, 0.3)",
      };
    default:
      return {
        icon: "📎",
        label: "文件",
        color: C.ink3,
        bg: "rgba(255, 255, 255, 0.04)",
        border: C.lineSubtle,
      };
  }
}

function getSourceLabel(source: string): string {
  switch (source) {
    case "work_product":
      return "工单产物";
    case "attachment":
      return "任务附件";
    case "document":
      return "文档资产";
    default:
      return "交付资源";
  }
}

export function ArtifactsScreen({
  company,
  onBack,
  onOpenSandbox,
  onOpenDiff,
}: ArtifactsScreenProps) {
  const [artifacts, setArtifacts] = useState<CompanyArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKind>("all");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [previewArtifact, setPreviewArtifact] = useState<CompanyArtifact | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [showExternalSheet, setShowExternalSheet] = useState(false);
  const [externalSheetUrl, setExternalSheetUrl] = useState<string | null>(null);

  const companyId = company.id;

  useEffect(() => {
    void getAuthToken().then(setAuthToken);
  }, []);

  const loadArtifacts = useCallback(async () => {
    try {
      const kindParam: CompanyArtifactMediaKind | "all" | undefined =
        filter === "work_product"
          ? undefined
          : filter === "all"
          ? "all"
          : (filter as CompanyArtifactMediaKind);

      const res = await coolie.listArtifacts(companyId, {
        kind: kindParam,
        q: searchQuery.trim() || undefined,
        limit: 50,
      });

      let items = res.artifacts;
      if (filter === "work_product") {
        items = items.filter((a) => a.source === "work_product");
      }
      setArtifacts(items);
    } catch {
      // 容错: 如果端点暂无数据，保留空数组
      setArtifacts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [companyId, filter, searchQuery]);

  useEffect(() => {
    setLoading(true);
    void loadArtifacts();
  }, [loadArtifacts]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadArtifacts();
  }, [loadArtifacts]);

  // 从产物列表计算去重的 Agent 列表
  const distinctAgents = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const a of artifacts) {
      if (a.createdByAgent?.id) {
        map.set(a.createdByAgent.id, {
          id: a.createdByAgent.id,
          name: a.createdByAgent.name || `智能体 ${a.createdByAgent.id.slice(0, 6)}`,
        });
      }
    }
    return Array.from(map.values());
  }, [artifacts]);

  // 统计各分类数量
  const counts = useMemo(() => {
    let images = 0;
    let documents = 0;
    let workProducts = 0;
    let cmmiBaselines = 0;
    const isCmmiDoc = (name?: string, desc?: string) => {
      const text = `${name ?? ""} ${desc ?? ""}`.toLowerCase();
      return /srs|hld|lld|atp|cmp|car|decision|需求|概要设计|详细设计|验收|投产|合规|门禁|基线/.test(text);
    };
    for (const a of artifacts) {
      if (a.source === "work_product") workProducts += 1;
      if (a.mediaKind === "image") images += 1;
      if (a.mediaKind === "document" || a.mediaKind === "text") documents += 1;
      if (isCmmiDoc(a.name, a.description)) cmmiBaselines += 1;
    }
    return {
      all: artifacts.length,
      cmmi_baseline: cmmiBaselines,
      image: images,
      document: documents,
      work_product: workProducts,
    };
  }, [artifacts]);

  const filteredList = useMemo(() => {
    let list = artifacts;
    if (filter === "cmmi_baseline") {
      const pattern = /srs|hld|lld|atp|cmp|car|decision|需求|概要设计|详细设计|验收|投产|合规|门禁|基线/i;
      list = list.filter((a) => pattern.test(`${a.name ?? ""} ${a.description ?? ""}`));
    } else if (filter === "work_product") {
      list = list.filter((a) => a.source === "work_product");
    } else if (filter === "document") {
      list = list.filter(
        (a) => a.mediaKind === "document" || a.mediaKind === "text",
      );
    } else if (filter !== "all") {
      list = list.filter((a) => a.mediaKind === filter);
    }

    if (selectedAgentId) {
      list = list.filter((a) => a.createdByAgent?.id === selectedAgentId);
    }

    return list;
  }, [artifacts, filter, selectedAgentId]);

  const handleCardPress = (artifact: CompanyArtifact) => {
    if (artifact.mediaKind === "image") {
      setPreviewArtifact(artifact);
      return;
    }

    // 若为代码/原型产物，且包含 URL 或原型特征，可引导前往沙箱或 Diff
    if (artifact.source === "work_product") {
      if (artifact.openPath?.startsWith("http") || artifact.contentPath?.startsWith("http")) {
        const url = artifact.openPath || artifact.contentPath || "";
        onOpenSandbox?.(url, null, null);
        return;
      }
      if (onOpenDiff) {
        onOpenDiff(
          {
            id: artifact.issue.id,
            title: artifact.issue.title,
            status: "done",
            priority: "medium",
            companyId,
          },
          null,
        );
        return;
      }
    }

    // 文档、文本与代码产物：唤起 CodeViewerWebView 弹窗预览
    setPreviewArtifact(artifact);
  };

  const imageSourceHeaders = useMemo(() => {
    return authToken ? { Authorization: `Bearer ${authToken}` } : undefined;
  }, [authToken]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      {/* 顶部导航与操作栏 */}
      <ScreenHeader
        title="产物交付中心"
        subtitle={
          <Text style={styles.headerSubtitle}>
            {company.name} · PRD 需求③看产物、⑤看原型
          </Text>
        }
        onBack={onBack}
        backLabel="返回"
        divider
        style={styles.headerBar}
      />

      {/* 搜索与过滤分段器 */}
      <View style={styles.filterSection}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="搜索产物名称、任务编号或关联..."
            placeholderTextColor={C.ink3}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            onSubmitEditing={loadArtifacts}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
              <Text style={styles.clearText}>✕</Text>
            </Pressable>
          )}
        </View>

        {/* 分类分段筛选器 */}
        <SegmentedControl
          options={FILTER_TABS.map((tab) => {
            const count = counts[tab.key];
            return {
              key: tab.key,
              label: `${tab.label}${count > 0 ? ` (${count})` : ""}`,
            };
          })}
          value={filter}
          onChange={(key) => setFilter(key as FilterKind)}
        />

        {/* 按智能体筛选胶囊行 */}
        {distinctAgents.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.agentFilterRow}
          >
            <Pressable
              style={[
                styles.agentChip,
                selectedAgentId === null && styles.agentChipActive,
              ]}
              onPress={() => setSelectedAgentId(null)}
            >
              <Text
                style={[
                  styles.agentChipText,
                  selectedAgentId === null && styles.agentChipTextActive,
                ]}
              >
                全部员工
              </Text>
            </Pressable>
            {distinctAgents.map((ag) => {
              const isSelected = selectedAgentId === ag.id;
              return (
                <Pressable
                  key={ag.id}
                  style={[styles.agentChip, isSelected && styles.agentChipActive]}
                  onPress={() =>
                    setSelectedAgentId(isSelected ? null : ag.id)
                  }
                >
                  <Text
                    style={[
                      styles.agentChipText,
                      isSelected && styles.agentChipTextActive,
                    ]}
                  >
                    🤖 {ag.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* 产物卡片流列表 */}
      {loading ? (
        <LoadingState text="加载交付产物中…" />
      ) : (
        <FlatList
          data={filteredList}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={C.accent}
              colors={[C.accent]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon={<Text style={styles.emptyIcon}>📦</Text>}
              title="暂无匹配的交付产物"
              subtitle="AI 员工执行任务产出的设计图、文档或原型将在此实时展示。"
              variant="standalone"
              style={styles.emptyContainer}
            />
          }
          renderItem={({ item }) => {
            const badge = getMediaKindBadge(item.mediaKind, item.source);
            const imageUrl = resolveMediaUrl(item.contentPath || item.openPath);
            const isImage = item.mediaKind === "image" && Boolean(imageUrl);
            const isWorkProduct = item.source === "work_product";

            return (
              <AppCard
                style={styles.artifactCard}
                onPress={() => handleCardPress(item)}
              >
                {/* 卡片顶部元数据行 */}
                <View style={styles.cardHeader}>
                  <View style={styles.badgeRow}>
                    <Pill
                      size="sm"
                      style={[
                        styles.kindBadge,
                        {
                          backgroundColor: badge.bg,
                          borderColor: badge.border,
                        },
                      ]}
                    >
                      <Text style={styles.kindIcon}>{badge.icon}</Text>
                      <Text style={[styles.kindLabel, { color: badge.color }]}>
                        {badge.label}
                      </Text>
                    </Pill>
                    <Pill
                      label={getSourceLabel(item.source)}
                      size="sm"
                      style={styles.sourceTag}
                      textStyle={styles.sourceTagText}
                    />
                  </View>

                  <Text style={styles.cardTime}>
                    {formatTime(item.updatedAt)}
                  </Text>
                </View>

                {/* 产物主标题 */}
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {item.title}
                </Text>

                {/* 关联任务与智能体信息 */}
                <View style={styles.metaRow}>
                  <View style={styles.taskTag}>
                    <Text style={styles.taskIdentifier}>
                      #{item.issue.identifier || item.issue.id.slice(0, 6)}
                    </Text>
                    <Text style={styles.taskTitle} numberOfLines={1}>
                      {item.issue.title}
                    </Text>
                  </View>
                  {item.createdByAgent?.name && (
                    <Text style={styles.agentTag} numberOfLines={1}>
                      🤖 {item.createdByAgent.name}
                    </Text>
                  )}
                </View>

                {/* 图片缩略图预览 (expo-image) */}
                {isImage && imageUrl && (
                  <View style={styles.thumbnailContainer}>
                    <Image
                      source={{
                        uri: imageUrl,
                        headers: imageSourceHeaders,
                      }}
                      style={styles.thumbnailImage}
                      contentFit="cover"
                      transition={200}
                    />
                    <View style={styles.thumbnailOverlay}>
                      <Text style={styles.thumbnailHint}>点开全屏预览 ↗</Text>
                    </View>
                  </View>
                )}

                {/* 文本/文档摘要预览 */}
                {!isImage && item.previewText && (
                  <View style={styles.previewTextBox}>
                    <Text style={styles.previewTextContent} numberOfLines={3}>
                      {item.previewText}
                    </Text>
                  </View>
                )}

                {/* 卡片底端快捷交互 */}
                <View style={styles.cardFooter}>
                  {isImage ? (
                    <Pressable
                      style={styles.actionBtnSecondary}
                      onPress={() => setPreviewArtifact(item)}
                    >
                      <Text style={styles.actionBtnTextSecondary}>
                        🔍 预览大图
                      </Text>
                    </Pressable>
                  ) : isWorkProduct ? (
                    <View style={styles.actionGroup}>
                      <Pressable
                        style={styles.actionBtnPrimary}
                        onPress={() => {
                          const targetUrl =
                            item.openPath || item.contentPath || "";
                          onOpenSandbox?.(targetUrl, null, null);
                        }}
                      >
                        <Text style={styles.actionBtnTextPrimary}>
                          🎮 交互原型沙箱 ›
                        </Text>
                      </Pressable>
                      {onOpenDiff && (
                        <Pressable
                          style={styles.actionBtnGhost}
                          onPress={() =>
                            onOpenDiff({
                              id: item.issue.id,
                              title: item.issue.title,
                              status: "done",
                              priority: "medium",
                              companyId,
                            })
                          }
                        >
                          <Text style={styles.actionBtnTextGhost}>
                            审查代码 Diff
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  ) : (
                    <View style={styles.actionGroup}>
                      <View style={styles.fileInfoRow}>
                        <Text style={styles.fileInfoText}>
                          {item.contentType || "标准交付资产"}
                        </Text>
                      </View>
                      {Boolean(
                        resolveMediaUrl(item.downloadPath || item.contentPath || item.openPath),
                      ) && (
                        <Pressable
                          style={styles.actionBtnSecondary}
                          onPress={() => {
                            const url = resolveMediaUrl(
                              item.downloadPath || item.contentPath || item.openPath,
                            );
                            if (url) {
                              setExternalSheetUrl(url);
                              setShowExternalSheet(true);
                            }
                          }}
                        >
                          <Text style={styles.actionBtnTextSecondary}>
                            🚀 外部/QQ打开
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              </AppCard>
            );
          }}
        />
      )}

      {/* 图片/产物大图预览浮层 (expo-image 驱动) */}
      <Modal
        visible={!!previewArtifact}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPreviewArtifact(null)}
      >
        <SafeAreaView style={styles.modalBackdrop}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {previewArtifact?.title}
              </Text>
              <Text style={styles.modalSubtitle} numberOfLines={1}>
                #{previewArtifact?.issue.identifier} · {previewArtifact?.issue.title}
              </Text>
            </View>
            <View style={styles.modalActionsRow}>
              {Boolean(
                previewArtifact &&
                  resolveMediaUrl(
                    previewArtifact.downloadPath ||
                      previewArtifact.contentPath ||
                      previewArtifact.openPath,
                  ),
              ) && (
                <Pressable
                  onPress={() => {
                    const url = resolveMediaUrl(
                      previewArtifact?.downloadPath ||
                        previewArtifact?.contentPath ||
                        previewArtifact?.openPath,
                    );
                    if (url) {
                      setExternalSheetUrl(url);
                      setShowExternalSheet(true);
                    }
                  }}
                  hitSlop={8}
                  style={styles.modalDownloadBtn}
                >
                  <Ionicons
                    name="open-outline"
                    size={14}
                    color={C.accent}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.modalDownloadBtnText}>外部应用 / QQ打开</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => setPreviewArtifact(null)}
                hitSlop={12}
                style={styles.modalCloseBtn}
              >
                <Text style={styles.modalCloseText}>✕ 关闭</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.modalImageWrapper}>
            {previewArtifact && (
              previewArtifact.mediaKind === "image" ? (
                <Image
                  source={{
                    uri: resolveMediaUrl(
                      previewArtifact.contentPath || previewArtifact.openPath,
                    ) || "",
                    headers: imageSourceHeaders,
                  }}
                  style={styles.modalFullImage}
                  contentFit="contain"
                  transition={300}
                />
              ) : (
                <CodeViewerWebView
                  code={
                    previewArtifact.previewText ||
                    `// 交付资产：${previewArtifact.title}\n// 来源：${previewArtifact.source}\n// 路径：${previewArtifact.openPath || previewArtifact.contentPath || "无固定路径"}\n// 类型：${previewArtifact.contentType || "纯文本"}`
                  }
                  language={
                    previewArtifact.contentType?.includes("json")
                      ? "json"
                      : previewArtifact.contentType?.includes("javascript")
                      ? "javascript"
                      : previewArtifact.contentType?.includes("diff")
                      ? "diff"
                      : "typescript"
                  }
                  isDiff={previewArtifact.contentType?.includes("diff")}
                  readOnly={true}
                  lineNumbers={true}
                  style={styles.modalCodeViewer}
                />
              )
            )}
          </View>

          <View style={styles.modalFooter}>
            <Text style={styles.modalFooterText}>
              {previewArtifact?.contentType || (previewArtifact?.mediaKind === "image" ? "image/png" : "text/plain")} · {previewArtifact?.mediaKind === "image" ? "双指捏合缩放" : "CodeMirror 6 嵌入渲染"}
            </Text>
          </View>
        </SafeAreaView>
      </Modal>

      {/* 外部应用与浏览器选择底栏 (支持 QQ 浏览器 / 系统浏览器) */}
      <ExternalOpenSheet
        visible={showExternalSheet}
        url={externalSheetUrl}
        title="打开外部应用 / 浏览器"
        subtitle="针对各类工程文档（Word / Excel / PPT / PDF / H5），推荐使用 QQ 浏览器，内置腾讯 TBS 内核支持高保真秒开。"
        onClose={() => {
          setShowExternalSheet(false);
          setExternalSheetUrl(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
        flex: 1,
    backgroundColor: C.bg,
  },
  headerBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  headerSubtitle: {
    color: C.ink3,
    fontSize: 12,
    marginTop: 2,
  },
  filterSection: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 38,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
    color: C.ink3,
  },
  searchInput: {
    flex: 1,
    color: C.ink,
    fontSize: 13,
    paddingVertical: 0,
  },
  clearText: {
    color: C.ink3,
    fontSize: 14,
    padding: 4,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  emptyContainer: {
    flex: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
    paddingHorizontal: 0,
    gap: 8,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 4,
  },
  artifactCard: {
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  kindBadge: {
    gap: 4,
    paddingVertical: 3,
  },
  kindIcon: {
    fontSize: 11,
  },
  kindLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  sourceTag: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 0,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sourceTagText: {
    color: C.ink4,
    fontSize: 10,
    fontWeight: "400",
  },
  cardTime: {
    color: C.ink4,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  cardTitle: {
    color: C.ink,
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: -0.3,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  taskTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  taskIdentifier: {
    color: C.accent,
    fontSize: 12,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
  taskTitle: {
    color: C.ink3,
    fontSize: 12,
    flex: 1,
  },
  agentTag: {
    color: C.ink3,
    fontSize: 11,
  },
  thumbnailContainer: {
    width: "100%",
    height: 180,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    position: "relative",
  },
  thumbnailImage: {
    width: "100%",
    height: "100%",
  },
  thumbnailOverlay: {
    position: "absolute",
    bottom: 6,
    right: 8,
    backgroundColor: "rgba(8, 9, 10, 0.75)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  thumbnailHint: {
    color: C.ink2,
    fontSize: 11,
    fontWeight: "500",
  },
  previewTextBox: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1,
    borderColor: C.lineSubtle,
    borderRadius: 6,
    padding: 10,
  },
  previewTextContent: {
    color: C.ink2,
    fontSize: 12,
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingTop: 4,
  },
  actionGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionBtnPrimary: {
    backgroundColor: C.brand,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  actionBtnTextPrimary: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "500",
  },
  actionBtnSecondary: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  actionBtnTextSecondary: {
    color: C.ink2,
    fontSize: 12,
    fontWeight: "500",
  },
  actionBtnGhost: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  actionBtnTextGhost: {
    color: C.ink3,
    fontSize: 12,
  },
  fileInfoRow: {
    paddingVertical: 2,
  },
  fileInfoText: {
    color: C.ink4,
    fontSize: 11,
  },
  // Modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: "#050607",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  modalTitle: {
    color: C.ink,
    fontSize: 15,
    fontWeight: "600",
  },
  modalSubtitle: {
    color: C.ink3,
    fontSize: 12,
    marginTop: 2,
  },
  modalCloseBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  modalCloseText: {
    color: C.ink2,
    fontSize: 12,
    fontWeight: "500",
  },
  modalImageWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
  },
  modalFullImage: {
    width: "100%",
    height: "100%",
  },
  modalCodeViewer: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
    overflow: "hidden",
  },
  modalFooter: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: C.lineSubtle,
  },
  modalFooterText: {
    color: C.ink4,
    fontSize: 12,
  },
  agentFilterRow: {
    flexDirection: "row",
    gap: 8,
    paddingTop: 6,
    paddingBottom: 2,
  },
  agentChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  agentChipActive: {
    backgroundColor: "rgba(113, 112, 255, 0.15)",
    borderColor: C.accent,
  },
  agentChipText: {
    color: C.ink3,
    fontSize: 12,
    fontWeight: "500",
  },
  agentChipTextActive: {
    color: C.ink,
    fontWeight: "600",
  },
  modalActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modalDownloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
  },
  modalDownloadBtnText: {
    color: C.ink2,
    fontSize: 12,
    fontWeight: "500",
  },
});
