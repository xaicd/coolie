import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Project,
  WorkspaceRuntimeService,
} from "@coolie/api-client";
import { C, COOLIE_BASE_URL, coolie, getAuthToken, getSessionCookieHeaderValue } from "../coolie";
import { getLastProjectId } from "../lib/project-context";
import { CodeViewerWebView } from "../components/CodeViewerWebView";
import { openInExternalApp } from "../utils/openExternalApp";
import { downloadAndShareFile } from "../utils/fileDownloader";
import { AppCard } from "../ui/AppCard";
import { Chip } from "../ui/Chip";
import { EmptyState } from "../ui/EmptyState";
import { LoadingState } from "../ui/LoadingState";
import { Pill } from "../ui/Pill";
import { ScreenHeader } from "../ui/ScreenHeader";
import { SegmentedControl } from "../ui/SegmentedControl";
import { RADIUS } from "../ui/tokens";
import { ExternalOpenSheet } from "../components/ExternalOpenSheet";
import { FilterSheet, type FilterOption } from "../components/FilterSheet";
import { ArtifactVersionSheet } from "../components/ArtifactVersionSheet";
import { ProjectDirectoryTree } from "../components/ProjectDirectoryTree";
import type { SandboxScope } from "./PrototypeSandboxScreen";

export interface ArtifactsScreenProps {
  company: Company;
  whoami?: string;
  /** wave153 — 进入时预设的项目筛选 (项目卡「查看产物」直达)。 */
  initialProjectId?: string | null;
  onBack?: () => void;
  onOpenSandbox?: (
    url: string,
    service?: WorkspaceRuntimeService | null,
    workProduct?: IssueWorkProduct | null,
    scope?: SandboxScope | null,
  ) => void;
  onOpenPrototypeSandbox?: () => void;
  onOpenDiff?: (issue: Issue, workProduct?: IssueWorkProduct | null) => void;
}

/** wave138c — 进沙箱时带上任务上下文, 列表视图据此列出该任务的全部交付物与附件。 */
function sandboxScopeFor(artifact: CompanyArtifact): SandboxScope {
  return {
    issueId: artifact.issue.id,
    issueTitle: artifact.issue.title,
    projectId: artifact.project?.id ?? null,
    projectName: artifact.project?.name ?? null,
  };
}

export function isBinaryArtifact(item?: CompanyArtifact | null): boolean {
  if (!item) return false;
  const ct = (item.contentType ?? "").toLowerCase();
  const title = (item.title ?? "").toLowerCase();
  const path = (item.openPath || item.downloadPath || "").toLowerCase();
  return (
    ct.includes("word") ||
    ct.includes("officedocument") ||
    ct.includes("pdf") ||
    ct.includes("excel") ||
    ct.includes("spreadsheet") ||
    ct.includes("powerpoint") ||
    ct.includes("presentation") ||
    ct.includes("zip") ||
    ct.includes("octet-stream") ||
    ct.includes("android.package-archive") ||
    ct.includes("gzip") ||
    title.endsWith(".docx") ||
    title.endsWith(".doc") ||
    title.endsWith(".xlsx") ||
    title.endsWith(".pptx") ||
    title.endsWith(".pdf") ||
    title.endsWith(".zip") ||
    title.endsWith(".apk") ||
    title.endsWith(".tar.gz") ||
    path.endsWith(".apk") ||
    path.endsWith(".tar.gz") ||
    path.endsWith(".pdf") ||
    path.endsWith(".zip")
  );
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
  initialProjectId,
  onBack,
  onOpenSandbox,
  onOpenPrototypeSandbox,
  onOpenDiff,
}: ArtifactsScreenProps) {
  const companyId = company.id;
  const [artifacts, setArtifacts] = useState<CompanyArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKind>("all");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialProjectId ?? null,
  );

  useEffect(() => {
    if (initialProjectId && initialProjectId !== selectedProjectId) {
      setSelectedProjectId(initialProjectId);
    }
  }, [initialProjectId]);

  useEffect(() => {
    if (!selectedProjectId) {
      void getLastProjectId(companyId).then((id) => {
        if (id) setSelectedProjectId(id);
      });
    }
  }, [companyId, selectedProjectId]);

  const [viewMode, setViewMode] = useState<"tree" | "cards">("tree");

  useEffect(() => {
    if (selectedProjectId || filter === "work_product") {
      setViewMode("tree");
    }
  }, [selectedProjectId, filter]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectSheetOpen, setProjectSheetOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [previewArtifact, setPreviewArtifact] = useState<CompanyArtifact | null>(null);
  const [versionArtifact, setVersionArtifact] = useState<CompanyArtifact | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [showExternalSheet, setShowExternalSheet] = useState(false);
  const [externalSheetUrl, setExternalSheetUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fullContent, setFullContent] = useState<string | null>(null);
  const [fetchingContent, setFetchingContent] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  /**
   * wave153 — 请求序号。`projectId`/`q`/`filter` 变化会重发请求, 但响应可能乱序
   * 到达: 例如挂载时的「全部产物」请求慢于用户随后选项目发的请求, 「全部产物」
   * 后到就会覆盖掉已按项目筛选的结果 —— 现象就是「选了项目, 列表却还是全部」。
   * 只接受最新一次请求的响应 (seq === 当前值), 过期响应直接丢弃。
   */
  const reqSeqRef = useRef(0);

  useEffect(() => {
    void getAuthToken().then(setAuthToken);
  }, []);

  useEffect(() => {
    if (!previewArtifact) {
      setFullContent(null);
      setFetchingContent(false);
      return;
    }
    const path = previewArtifact.openPath || previewArtifact.contentPath;
    const isTextDoc =
      previewArtifact.contentType?.includes("markdown") ||
      previewArtifact.contentType?.includes("json") ||
      previewArtifact.contentType?.includes("text") ||
      previewArtifact.source === "document" ||
      previewArtifact.mediaKind === "text";

    if (path && isTextDoc) {
      setFetchingContent(true);
      const url = path.startsWith("/") ? `${COOLIE_BASE_URL}${path}` : path;
      void (async () => {
        try {
          const token = await getAuthToken();
          const cookie = await getSessionCookieHeaderValue();
          const headers: Record<string, string> = {};
          if (token) headers["Authorization"] = `Bearer ${token}`;
          if (cookie) headers["Cookie"] = cookie;
          const res = await fetch(url, { headers });
          if (res.ok) {
            const body = await res.text();
            setFullContent(body);
          } else {
            setFullContent(previewArtifact.previewText || null);
          }
        } catch {
          setFullContent(previewArtifact.previewText || null);
        } finally {
          setFetchingContent(false);
        }
      })();
    } else {
      setFullContent(previewArtifact.previewText || null);
    }
  }, [previewArtifact]);

  useEffect(() => {
    void coolie
      .listProjects(companyId)
      .then((projList) => {
        setProjects(projList);
        setSelectedProjectId((prev) => {
          if (prev) return prev;
          const activeProj = projList.find((p) => p.status === "in_progress") || projList[0];
          return activeProj ? activeProj.id : null;
        });
      })
      .catch(() => setProjects([]));
  }, [companyId]);

  const loadArtifacts = useCallback(async () => {
    const seq = ++reqSeqRef.current;
    try {
      const kindParam: any =
        filter === "work_product"
          ? undefined
          : filter === "all"
          ? "all"
          : filter === "cmmi_baseline"
          ? "cmmi_baseline"
          : (filter as CompanyArtifactMediaKind);

      const res = await coolie.listArtifacts(companyId, {
        kind: kindParam,
        projectId: selectedProjectId ?? undefined,
        q: searchQuery.trim() || undefined,
        limit: 50,
      });

      // 过期响应 (更新的请求已发出) 直接丢弃, 不落库、不动 loading。
      if (seq !== reqSeqRef.current) return;

      let items = res.artifacts;
      if (filter === "work_product") {
        items = items.filter((a) => a.source === "work_product");
      }
      setArtifacts(items);
      setLoadError(null);
    } catch (e) {
      if (seq !== reqSeqRef.current) return;
      // 不再静默回落成空表: 记下错误并显式展示, 让「拉取失败」与「确实没有产物」
      // 可区分。空数组只代表这一次请求的结果, 不代表「全部产物」。
      setLoadError(String((e as Error)?.message ?? e));
      setArtifacts([]);
    } finally {
      if (seq === reqSeqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [companyId, filter, searchQuery, selectedProjectId]);

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

  // wave141 项目筛选
  const projectLabel = useMemo(() => {
    if (!selectedProjectId) return "全部项目";
    return projects.find((p) => p.id === selectedProjectId)?.name ?? "项目";
  }, [selectedProjectId, projects]);

  const projectOptions: FilterOption[] = useMemo(
    () => [
      { value: "", label: "全部项目" },
      ...projects.map((p) => ({
        value: p.id,
        label: p.name,
        dotColor: p.color ?? undefined,
      })),
    ],
    [projects],
  );

  // 统计各分类数量 (严格对齐选定项目，避免历史无项目或跨项目数据污染)
  const counts = useMemo(() => {
    let images = 0;
    let documents = 0;
    let workProducts = 0;
    let cmmiBaselines = 0;
    const isCmmiDoc = (name?: string, desc?: string) => {
      const text = `${name ?? ""} ${desc ?? ""}`.toLowerCase();
      return /srs|hld|lld|atp|cmp|car|decision|需求|概要设计|详细设计|验收|投产|合规|门禁|基线/.test(text);
    };
    const scoped = selectedProjectId
      ? artifacts.filter((a) => a.project?.id === selectedProjectId)
      : artifacts;

    for (const a of scoped) {
      if (a.source === "work_product") workProducts += 1;
      if (a.mediaKind === "image") images += 1;
      if (a.mediaKind === "document" || a.mediaKind === "text") documents += 1;
      if (isCmmiDoc(a.title, a.previewText ?? undefined)) cmmiBaselines += 1;
    }
    return {
      all: scoped.length,
      cmmi_baseline: cmmiBaselines,
      image: images,
      document: documents,
      work_product: workProducts,
    };
  }, [artifacts, selectedProjectId]);

  const filteredList = useMemo(() => {
    let list = artifacts;
    // 严格项目隔离：若选中了项目，则坚决过滤，杜绝历史无项目或跨项目数据污染
    if (selectedProjectId) {
      list = list.filter((a) => a.project?.id === selectedProjectId);
    }
    if (filter === "cmmi_baseline") {
      const pattern = /srs|hld|lld|atp|cmp|car|decision|需求|概要设计|详细设计|验收|投产|合规|门禁|基线/i;
      list = list.filter((a) => pattern.test(`${a.title ?? ""} ${a.previewText ?? ""}`));
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
  }, [artifacts, filter, selectedAgentId, selectedProjectId]);

  const handleCardPress = (artifact: CompanyArtifact) => {
    if (artifact.mediaKind === "image") {
      setPreviewArtifact(artifact);
      return;
    }

    if (isBinaryArtifact(artifact)) {
      const url = resolveMediaUrl(artifact.downloadPath || artifact.contentPath || artifact.openPath);
      if (url) {
        let dlFilename = artifact.title;
        const cleanPath = (artifact.openPath || artifact.downloadPath || "");
        const urlMatch = cleanPath.match(/\/([^\/?#]+\.(apk|tar\.gz|pdf|zip|yml))$/i);
        if (urlMatch && urlMatch[1]) {
          dlFilename = urlMatch[1];
        }
        void downloadAndShareFile({
          url,
          filename: dlFilename,
          title: artifact.title,
          mimeType: artifact.contentType ?? undefined,
        });
        return;
      }
    }

    // 若为代码/原型产物，且包含 URL 或原型特征，可引导前往沙箱或 Diff
    if (artifact.source === "work_product") {
      let targetUrl = artifact.openPath || artifact.contentPath || "";
      if (targetUrl && targetUrl.startsWith("/")) {
        targetUrl = `${COOLIE_BASE_URL}${targetUrl}`;
      }
      if (targetUrl) {
        onOpenSandbox?.(
          targetUrl,
          null,
          {
            id: artifact.id,
            title: artifact.title,
            summary: artifact.previewText || artifact.title,
            url: targetUrl,
          } as any,
          sandboxScopeFor(artifact),
        );
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

      {/* wave153 — 拉取失败显式提示 (不再静默显示空表) */}
      {loadError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText} numberOfLines={2}>
            ⚠️ 产物加载失败：{loadError}
          </Text>
          <Pressable onPress={() => { setLoading(true); void loadArtifacts(); }} hitSlop={8}>
            <Text style={styles.errorBannerRetry}>重试</Text>
          </Pressable>
        </View>
      ) : null}

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

        {/* wave141 项目筛选 —— 与任务页 wave125 chips 同一视觉口径 */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.projectChipRow}
        >
          <Chip
            label={`项目 · ${projectLabel}`}
            active={selectedProjectId !== null}
            chevron
            onPress={() => setProjectSheetOpen(true)}
          />
          {selectedProjectId ? (
            <Chip
              label="清除"
              active={false}
              onPress={() => setSelectedProjectId(null)}
            />
          ) : null}
        </ScrollView>

        {/* wave282 — 视图模式切换 (目录 vs 卡片) */}
        <View style={styles.viewModeRow}>
          <Text style={styles.viewModeTitle} numberOfLines={1} ellipsizeMode="tail">
            {selectedProjectId ? `项目全景 · ${projectLabel}` : "产物形态"}
          </Text>
          <View style={styles.viewModeToggleGroup}>
            <Pressable
              style={[
                styles.viewModeToggleBtn,
                viewMode === "tree" && styles.viewModeToggleBtnActive,
              ]}
              onPress={() => setViewMode("tree")}
            >
              <Ionicons
                name="folder-open"
                size={12}
                color={viewMode === "tree" ? "#FFF" : C.ink3}
              />
              <Text
                style={[
                  styles.viewModeToggleText,
                  viewMode === "tree" && styles.viewModeToggleTextActive,
                ]}
              >
                目录
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.viewModeToggleBtn,
                viewMode === "cards" && styles.viewModeToggleBtnActive,
              ]}
              onPress={() => setViewMode("cards")}
            >
              <Ionicons
                name="grid"
                size={12}
                color={viewMode === "cards" ? "#FFF" : C.ink3}
              />
              <Text
                style={[
                  styles.viewModeToggleText,
                  viewMode === "cards" && styles.viewModeToggleTextActive,
                ]}
              >
                卡片
              </Text>
            </Pressable>
          </View>
        </View>

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
                全员
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

      {/* 产物列表 / 目录树 */}
      {loading ? (
        <LoadingState text="加载交付产物中…" />
      ) : viewMode === "tree" ? (
        <ScrollView
          style={styles.treeScrollView}
          contentContainerStyle={styles.treeScrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={C.accent}
              colors={[C.accent]}
            />
          }
        >
          {selectedProjectId ? (
            <ProjectDirectoryTree
              project={
                projects.find((p) => p.id === selectedProjectId) || {
                  id: selectedProjectId,
                  name: projectLabel,
                }
              }
              artifacts={artifacts.filter(
                (a) => a.project?.id === selectedProjectId
              )}
              onResetProject={() => setSelectedProjectId(null)}
              onOpenFile={({ title, path, content, language, artifact }) => {
                if (artifact) {
                  setPreviewArtifact(artifact);
                } else {
                  setPreviewArtifact({
                    id: path,
                    title,
                    previewText: content || "",
                    contentType: "text/plain",
                    contentPath: null,
                    openPath: null,
                    downloadPath: null,
                    source: "work_product",
                    mediaKind: "text",
                    issue: {
                      id: "tree-view",
                      identifier: "CODE",
                      title: path,
                    },
                    project: {
                      id: selectedProjectId,
                      name: projectLabel,
                    },
                    createdByAgent: null,
                    version: null,
                    updatedAt: new Date().toISOString(),
                    href: "",
                  });
                  setFullContent(content || "");
                }
              }}
              onOpenSandbox={(url, title, artifact) => {
                onOpenSandbox?.(
                  url,
                  null,
                  artifact
                    ? ({
                        id: artifact.id,
                        title: artifact.title,
                        summary: artifact.previewText || artifact.title,
                        url,
                      } as any)
                    : null,
                  artifact ? sandboxScopeFor(artifact) : null
                );
              }}
              onDownload={({ url, filename, title, mimeType, sizeText }) => {
                void downloadAndShareFile({
                  url,
                  filename,
                  title,
                  mimeType,
                  sizeText,
                });
              }}
            />
          ) : (
            <View style={styles.treeSelectContainer}>
              <View style={styles.treePickerHeader}>
                <Text style={styles.treePickerTitle}>📁 请选择交付项目展开工程目录树</Text>
                <Text style={styles.treePickerDesc}>
                  每个在制交付项目拥有完整的物理工程目录结构 (wiki · docs/specs · src · deploy)
                </Text>
              </View>
              {projects.map((p) => {
                const count = artifacts.filter((a) => a.project?.id === p.id).length;
                return (
                  <Pressable
                    key={p.id}
                    style={styles.projectTreePickCard}
                    onPress={() => setSelectedProjectId(p.id)}
                  >
                    <View style={styles.projectTreePickTop}>
                      <View style={styles.projectTreePickLeft}>
                        <Text style={styles.projectTreePickIcon}>📦</Text>
                        <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                          <Text style={styles.projectTreePickName} numberOfLines={1} ellipsizeMode="tail">
                            {p.name}
                          </Text>
                          <Text style={styles.projectTreePickSub} numberOfLines={1} ellipsizeMode="tail">
                            {count > 0 ? `${count} 份交付资产 · ${p.description || "在制商业交付工程项目"}` : (p.description || "在制商业交付工程项目资产总线")}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.projectTreePickBtn}>
                        <Text style={styles.projectTreePickBtnText}>展开</Text>
                        <Ionicons name="chevron-forward" size={13} color="#FFF" />
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={filteredList}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <Pressable
              style={styles.sandboxHeroCard}
              onPress={() => {
                if (onOpenPrototypeSandbox) {
                  onOpenPrototypeSandbox();
                } else {
                  onOpenSandbox?.("", null, null, null);
                }
              }}
              accessibilityRole="button"
              accessibilityLabel="进入原型沙箱"
            >
              <View style={styles.sandboxHeroLeft}>
                <View style={styles.sandboxHeroBadge}>
                  <Ionicons name="cube" size={13} color="#A78BFA" />
                  <Text style={styles.sandboxHeroBadgeText}>墨斗高保真交互</Text>
                </View>
                <Text style={styles.sandboxHeroTitle}>🎨 原型沙箱 · 即刻免安装体验</Text>
                <Text style={styles.sandboxHeroDesc}>
                  在线预览墨斗输出的最新设计原型、Plate 组件调试与真实交互效果
                </Text>
              </View>
              <View style={styles.sandboxHeroBtn}>
                <Text style={styles.sandboxHeroBtnText}>体验</Text>
                <Ionicons name="chevron-forward" size={14} color="#FFF" />
              </View>
            </Pressable>
          }
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
              subtitle={
                selectedProjectId
                  ? "该项目暂无交付产物。可清除项目筛选或切换分类查看。"
                  : "AI 员工执行任务产出的设计图、文档或原型将在此实时展示。"
              }
              action={
                selectedProjectId ? (
                  <Pressable
                    style={styles.emptyActionBtn}
                    onPress={() => setSelectedProjectId(null)}
                  >
                    <Text style={styles.emptyActionText}>清除</Text>
                  </Pressable>
                ) : undefined
              }
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
                    {item.version ? (
                      <Pill
                        label={`v${item.version.number}${
                          item.version.isLatest ? " 最新" : ""
                        } · 共${item.version.count}版`}
                        size="sm"
                        mono
                        style={styles.versionBadge}
                        textStyle={styles.versionBadgeText}
                      />
                    ) : null}
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
                    <View style={styles.actionGroup}>
                      <Pressable
                        style={styles.actionBtnSecondary}
                        onPress={() => setPreviewArtifact(item)}
                      >
                        <Text style={styles.actionBtnTextSecondary}>预览</Text>
                      </Pressable>
                      {Boolean(resolveMediaUrl(item.downloadPath || item.contentPath || item.openPath)) && (
                        <Pressable
                          style={styles.actionBtnSecondary}
                          onPress={() => {
                            const url = resolveMediaUrl(item.downloadPath || item.contentPath || item.openPath);
                            if (url) {
                              let dlFilename = item.title;
                              const cleanPath = (item.openPath || item.downloadPath || "");
                              const urlMatch = cleanPath.match(/\/([^\/?#]+\.(apk|tar\.gz|pdf|zip|yml))$/i);
                              if (urlMatch && urlMatch[1]) {
                                dlFilename = urlMatch[1];
                              }
                              void downloadAndShareFile({ url, filename: dlFilename, title: item.title, mimeType: item.contentType ?? undefined });
                            }
                          }}
                        >
                          <Text style={styles.actionBtnTextSecondary}>下载</Text>
                        </Pressable>
                      )}
                    </View>
                  ) : isWorkProduct ? (
                    <View style={styles.actionGroup}>
                      <Pressable
                        style={styles.actionBtnPrimary}
                        onPress={() => {
                          let targetUrl = item.openPath || item.contentPath || "";
                          if (targetUrl && targetUrl.startsWith("/")) {
                            targetUrl = `${COOLIE_BASE_URL}${targetUrl}`;
                          }
                          onOpenSandbox?.(
                            targetUrl,
                            null,
                            {
                              id: item.id,
                              title: item.title,
                              summary: item.previewText || item.title,
                              url: targetUrl,
                            } as any,
                            sandboxScopeFor(item),
                          );
                        }}
                      >
                        <Text style={styles.actionBtnTextPrimary}>沙箱</Text>
                      </Pressable>
                      {Boolean(resolveMediaUrl(item.downloadPath || item.contentPath || item.openPath)) && (
                        <Pressable
                          style={styles.actionBtnSecondary}
                          onPress={() => {
                            const url = resolveMediaUrl(item.downloadPath || item.contentPath || item.openPath);
                            if (url) {
                              let dlFilename = item.title;
                              const cleanPath = (item.openPath || item.downloadPath || "");
                              const urlMatch = cleanPath.match(/\/([^\/?#]+\.(apk|tar\.gz|pdf|zip|yml))$/i);
                              if (urlMatch && urlMatch[1]) {
                                dlFilename = urlMatch[1];
                              }
                              void downloadAndShareFile({ url, filename: dlFilename, title: item.title, mimeType: item.contentType ?? undefined });
                            }
                          }}
                        >
                          <Text style={styles.actionBtnTextSecondary}>下载</Text>
                        </Pressable>
                      )}
                      {item.version ? (
                        <Pressable
                          style={styles.actionBtnGhost}
                          onPress={() => setVersionArtifact(item)}
                        >
                          <Text style={styles.actionBtnTextGhost}>历史 ({item.version.count})</Text>
                        </Pressable>
                      ) : null}
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
                          <Text style={styles.actionBtnTextGhost}>代码</Text>
                        </Pressable>
                      )}
                    </View>
                  ) : (
                    <View style={styles.actionGroup}>
                      {isBinaryArtifact(item) ? (
                        <Pressable
                          style={styles.actionBtnPrimary}
                          onPress={() => {
                            const url = resolveMediaUrl(item.downloadPath || item.contentPath || item.openPath);
                            if (url) void downloadAndShareFile({ url, filename: item.title, title: item.title, mimeType: item.contentType ?? undefined });
                          }}
                        >
                          <Text style={styles.actionBtnTextPrimary}>打开</Text>
                        </Pressable>
                      ) : (
                        <Pressable
                          style={styles.actionBtnSecondary}
                          onPress={() => setPreviewArtifact(item)}
                        >
                          <Text style={styles.actionBtnTextSecondary}>预览</Text>
                        </Pressable>
                      )}
                      {Boolean(resolveMediaUrl(item.downloadPath || item.contentPath || item.openPath)) && (
                        <Pressable
                          style={styles.actionBtnSecondary}
                          onPress={() => {
                            const url = resolveMediaUrl(item.downloadPath || item.contentPath || item.openPath);
                            if (url) void downloadAndShareFile({ url, filename: item.title, title: item.title, mimeType: item.contentType ?? undefined });
                          }}
                        >
                          <Text style={styles.actionBtnTextSecondary}>下载</Text>
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
                    if (!url || !previewArtifact) return;
                    void downloadAndShareFile({
                      url,
                      filename: previewArtifact.title,
                      title: previewArtifact.title,
                      mimeType: previewArtifact.contentType,
                    });
                  }}
                  hitSlop={8}
                  style={styles.modalDownloadBtn}
                >
                  <Ionicons
                    name="download-outline"
                    size={14}
                    color={C.accent}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.modalDownloadBtnText}>下载</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => setPreviewArtifact(null)}
                hitSlop={12}
                style={styles.modalCloseBtn}
              >
                <Text style={styles.modalCloseText}>关闭</Text>
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
              ) : isBinaryArtifact(previewArtifact) ? (
                <View style={styles.binaryFileContainer}>
                  <Text style={styles.binaryFileIcon}>📄</Text>
                  <Text style={styles.binaryFileTitle}>{previewArtifact.title}</Text>
                  <Text style={styles.binaryFileSubtitle}>
                    {previewArtifact.contentType || "标准工程文档"}
                  </Text>
                  <Pressable
                    style={styles.binaryDownloadBtn}
                    onPress={() => {
                      const url = resolveMediaUrl(
                        previewArtifact?.downloadPath ||
                          previewArtifact?.contentPath ||
                          previewArtifact?.openPath,
                      );
                      if (url) {
                        void downloadAndShareFile({
                          url,
                          filename: previewArtifact.title,
                          title: previewArtifact.title,
                          mimeType: previewArtifact.contentType ?? undefined,
                        });
                      }
                    }}
                  >
                    <Text style={styles.binaryDownloadBtnText}>下载</Text>
                  </Pressable>
                </View>
              ) : (
                <CodeViewerWebView
                  code={
                    fetchingContent
                      ? "// 正在拉取文档全文内容，请稍候...\n"
                      : (fullContent ||
                        previewArtifact.previewText ||
                        `// 交付资产：${previewArtifact.title}\n// 来源：${previewArtifact.source}\n// 路径：${previewArtifact.openPath || previewArtifact.contentPath || "无固定路径"}\n// 类型：${previewArtifact.contentType || "纯文本"}`)
                  }
                  language={
                    previewArtifact.contentType?.includes("json")
                      ? "json"
                      : previewArtifact.contentType?.includes("javascript")
                      ? "javascript"
                      : previewArtifact.contentType?.includes("diff")
                      ? "diff"
                      : previewArtifact.contentType?.includes("markdown")
                      ? "markdown"
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

      {/* wave141 项目筛选抽屉 (wave125 FilterSheet) */}
      <FilterSheet
        visible={projectSheetOpen}
        title="按项目筛选"
        options={projectOptions}
        selected={selectedProjectId ?? ""}
        onSelect={(value) => setSelectedProjectId(value || null)}
        onClose={() => setProjectSheetOpen(false)}
      />

      {/* wave141 版本历史抽屉 */}
      <ArtifactVersionSheet
        visible={!!versionArtifact}
        artifact={versionArtifact}
        onClose={() => setVersionArtifact(null)}
        onChanged={() => void loadArtifacts()}
        onOpenVersion={(version) => {
          const path = version.openPath || version.contentPath;
          if (!path) return;
          const url = path.startsWith("/") ? `${COOLIE_BASE_URL}${path}` : path;
          onOpenSandbox?.(
            url,
            null,
            {
              id: version.id,
              title: version.title,
              summary: version.summary || version.title,
              url,
            } as any,
            versionArtifact ? sandboxScopeFor(versionArtifact) : null,
          );
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
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.35)",
    backgroundColor: "rgba(245, 158, 11, 0.12)",
  },
  errorBannerText: {
    flex: 1,
    color: C.warn,
    fontSize: 12,
  },
  errorBannerRetry: {
    color: C.accent,
    fontSize: 12,
    fontWeight: "600",
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
  emptyActionBtn: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  emptyActionText: {
    color: C.ink2,
    fontSize: 12,
    fontWeight: "500",
  },
  projectChipRow: {
    flexDirection: "row",
    gap: 8,
    paddingTop: 2,
    paddingBottom: 2,
  },
  versionBadge: {
    backgroundColor: "rgba(39, 166, 68, 0.12)",
    borderColor: "rgba(39, 166, 68, 0.3)",
    paddingVertical: 2,
  },
  versionBadgeText: {
    color: C.ok,
    fontSize: 10,
    fontWeight: "600",
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
  sandboxHeroCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(167, 139, 250, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(167, 139, 250, 0.3)",
    borderRadius: RADIUS.lg,
    padding: 14,
    marginBottom: 14,
    gap: 12,
  },
  sandboxHeroLeft: {
    flex: 1,
    gap: 4,
  },
  sandboxHeroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: "rgba(167, 139, 250, 0.16)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    marginBottom: 2,
  },
  sandboxHeroBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#C4B5FD",
  },
  sandboxHeroTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: C.ink,
  },
  sandboxHeroDesc: {
    fontSize: 11,
    color: C.ink3,
    lineHeight: 16,
  },
  sandboxHeroBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#8B5CF6",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.md,
  },
  sandboxHeroBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  binaryFileContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  binaryFileIcon: {
    fontSize: 56,
    marginBottom: 8,
  },
  binaryFileTitle: {
    color: C.ink,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  binaryFileSubtitle: {
    color: C.ink3,
    fontSize: 13,
    textAlign: "center",
    marginBottom: 12,
  },
  binaryDownloadBtn: {
    backgroundColor: C.brand,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  binaryDownloadBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  viewModeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    marginTop: 8,
    marginBottom: 4,
  },
  viewModeTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: C.ink2,
    flex: 1,
    marginRight: 8,
  },
  viewModeToggleGroup: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: RADIUS.sm,
    padding: 2,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    flexShrink: 0,
  },
  viewModeToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  viewModeToggleBtnActive: {
    backgroundColor: C.accent,
  },
  viewModeToggleText: {
    fontSize: 11,
    fontWeight: "600",
    color: C.ink3,
  },
  viewModeToggleTextActive: {
    color: "#FFFFFF",
  },
  treeScrollView: {
    flex: 1,
  },
  treeScrollContent: {
    paddingBottom: 40,
  },
  treeSelectContainer: {
    padding: 16,
    gap: 12,
  },
  treePickerHeader: {
    marginBottom: 8,
  },
  treePickerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: C.ink,
    marginBottom: 4,
  },
  treePickerDesc: {
    fontSize: 12,
    color: C.ink3,
    lineHeight: 18,
  },
  projectTreePickCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.line,
    padding: 14,
    marginBottom: 8,
  },
  projectTreePickTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  projectTreePickLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  projectTreePickIcon: {
    fontSize: 22,
  },
  projectTreePickName: {
    fontSize: 14,
    fontWeight: "700",
    color: C.ink,
    marginBottom: 2,
    flexShrink: 1,
  },
  projectTreePickSub: {
    fontSize: 11,
    color: C.ink3,
    flexShrink: 1,
  },
  projectTreePickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: C.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    flexShrink: 0,
  },
  projectTreePickBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
