import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
  StatusBar as RNStatusBar,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import type {
  Company,
  ExecutionWorkspace,
  Issue,
  IssueWorkProduct,
  WorkspaceDiffFile,
  WorkspaceDiffResponse,
  WorkspaceDiffView,
} from "@coolie/api-client";
import { C, coolie } from "../coolie";
import {
  MONO_FONT,
  UnifiedDiffViewer,
  parsePatchToLines,
} from "../components/UnifiedDiffViewer";
import { CodeViewerWebView } from "../components/CodeViewerWebView";
import { AppCard } from "../ui/AppCard";
import { EmptyState } from "../ui/EmptyState";
import { ErrorRetry } from "../ui/ErrorRetry";
import { LoadingState } from "../ui/LoadingState";
import { Pill } from "../ui/Pill";
import { ScreenHeader } from "../ui/ScreenHeader";

const STATUS_LABELS: Record<string, string> = {
  added: "新增",
  modified: "修改",
  deleted: "删除",
  renamed: "重命名",
  copied: "复制",
  type_changed: "类型变更",
  untracked: "未跟踪",
  unknown: "变更",
};

// Linear 徽标配色 (DESIGN.md 第1节、第6节)
const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  added: {
    bg: "rgba(39, 166, 68, 0.1)",
    text: "#6EE7A0",
    border: "rgba(39, 166, 68, 0.25)",
  },
  modified: {
    bg: "rgba(94, 106, 210, 0.1)",
    text: C.accent,
    border: "rgba(94, 106, 210, 0.25)",
  },
  deleted: {
    bg: "rgba(239, 68, 68, 0.1)",
    text: "#FCA5A5",
    border: "rgba(239, 68, 68, 0.25)",
  },
  renamed: {
    bg: "rgba(255, 255, 255, 0.05)",
    text: C.ink2,
    border: C.line,
  },
  untracked: {
    bg: "rgba(245, 158, 11, 0.1)",
    text: C.warn,
    border: "rgba(245, 158, 11, 0.25)",
  },
  unknown: {
    bg: "rgba(255, 255, 255, 0.05)",
    text: C.ink3,
    border: C.line,
  },
};

function getFileName(filePath: string): string {
  return filePath.split("/").filter(Boolean).pop() ?? filePath;
}

export interface CodeDiffScreenProps {
  company: Company;
  issue?: Issue | null;
  workProduct?: IssueWorkProduct | null;
  workspaceId?: string;
  onBack?: () => void;
}

/**
 * 移动端代码 Diff 查看器 (DESIGN.md 第6节 Linear 配色)
 * - 新增行: bg #27A644@8%, 行号/文字偏 #6EE7A0
 * - 删除行: bg #EF4444@8%, 文字偏 #FCA5A5
 * - 文件头: 等宽字重 "500", 折叠 chevron
 * - 数字 tabularNum 对齐
 * - 半透明卡片与微光白边
 */
export function CodeDiffScreen({
  company,
  issue,
  workProduct,
  workspaceId: initialWorkspaceId,
  onBack,
}: CodeDiffScreenProps) {
  const [viewMode, setViewMode] = useState<WorkspaceDiffView>("working-tree");
  const [baseRef] = useState<string>("");
  const [, setWorkspaces] = useState<ExecutionWorkspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    initialWorkspaceId ?? null,
  );
  const [diffData, setDiffData] = useState<WorkspaceDiffResponse | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [selectedFileForFullView, setSelectedFileForFullView] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBenchmarkMode, setIsBenchmarkMode] = useState(false);

  // 1. 初始化时解析工作区
  const resolveWorkspace = useCallback(async () => {
    if (initialWorkspaceId) {
      setSelectedWorkspaceId(initialWorkspaceId);
      return;
    }

    try {
      if (workProduct?.executionWorkspaceId) {
        setSelectedWorkspaceId(workProduct.executionWorkspaceId);
        return;
      }

      const list = await coolie.listExecutionWorkspaces(company.id, {
        issueId: issue?.id,
      });
      setWorkspaces(list);

      if (list.length > 0) {
        setSelectedWorkspaceId(list[0].id);
      } else {
        const allList = await coolie.listExecutionWorkspaces(company.id);
        setWorkspaces(allList);
        if (allList.length > 0) {
          setSelectedWorkspaceId(allList[0].id);
        }
      }
    } catch (e) {
      console.warn("Failed to list execution workspaces:", e);
    }
  }, [company.id, issue?.id, workProduct?.executionWorkspaceId, initialWorkspaceId]);

  useEffect(() => {
    void resolveWorkspace();
  }, [resolveWorkspace]);

  // 2. 加载工作区 Diff
  const loadDiff = useCallback(async () => {
    if (isBenchmarkMode) return;
    if (!selectedWorkspaceId) return;

    setLoading(true);
    setError(null);
    try {
      const resp = await coolie.getWorkspaceDiff({
        workspaceId: selectedWorkspaceId,
        companyId: company.id,
        view: viewMode,
        baseRef: baseRef.trim() || undefined,
        includeUntracked: true,
      });
      setDiffData(resp);
      const initialSet = new Set<string>();
      (resp.files ?? []).slice(0, 3).forEach((f) => initialSet.add(f.path));
      setExpandedFiles(initialSet);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedWorkspaceId, company.id, viewMode, baseRef, isBenchmarkMode]);

  useEffect(() => {
    if (selectedWorkspaceId && !isBenchmarkMode) {
      void loadDiff();
    }
  }, [selectedWorkspaceId, viewMode, loadDiff, isBenchmarkMode]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    if (isBenchmarkMode) {
      setRefreshing(false);
      return;
    }
    void loadDiff();
  }, [loadDiff, isBenchmarkMode]);

  // 切换单个文件折叠展开
  const toggleFileExpand = useCallback((filePath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  }, []);

  // 全部展开 / 折叠
  const expandAll = useCallback(() => {
    if (!diffData?.files) return;
    setExpandedFiles(new Set(diffData.files.map((f) => f.path)));
  }, [diffData]);

  const collapseAll = useCallback(() => {
    setExpandedFiles(new Set());
  }, []);

  // 触发 2500 行虚拟滚动基准测试
  const toggleBenchmark = useCallback(() => {
    if (isBenchmarkMode) {
      setIsBenchmarkMode(false);
      void loadDiff();
    } else {
      setIsBenchmarkMode(true);
      const benchmark = generate2500LineBenchmarkDiff(
        selectedWorkspaceId || "ws-bench",
        company.id,
      );
      setDiffData(benchmark);
      setExpandedFiles(new Set(benchmark.files.map((f) => f.path)));
      setSelectedFileForFullView(benchmark.files[0].path);
    }
  }, [isBenchmarkMode, loadDiff, selectedWorkspaceId, company.id]);

  // 计算当前总增删统计
  const totalStats = useMemo(() => {
    const files = diffData?.files ?? [];
    const adds = diffData?.stats?.additions ?? files.reduce((s, f) => s + f.additions, 0);
    const dels = diffData?.stats?.deletions ?? files.reduce((s, f) => s + f.deletions, 0);
    const fileCount = diffData?.stats?.fileCount ?? files.length;
    return { adds, dels, fileCount };
  }, [diffData]);

  // 全屏独立查看模式 (文件详情页: CodeMirror 6 驱动)
  if (selectedFileForFullView && diffData) {
    const file = diffData.files.find((f) => f.path === selectedFileForFullView);
    if (file) {
      const combinedPatch = file.patches.map((p) => p.patch).filter(Boolean).join("\n");
      const lines = parsePatchToLines(combinedPatch, file.path);
      const lineCount = lines.length;
      return (
        <SafeAreaView style={styles.fullScreen}>
          <StatusBar style="light" />
          <ScreenHeader
            onBack={() => setSelectedFileForFullView(null)}
            backLabel="返回列表"
            title={getFileName(file.path)}
            subtitle={
              <Text style={styles.fullScreenFilePath} numberOfLines={1}>
                {file.path} ({lineCount} 行)
              </Text>
            }
            right={
              <View style={styles.pillRow}>
                <Text style={styles.statAdd}>+{file.additions}</Text>
                <Text style={styles.statDel}>-{file.deletions}</Text>
              </View>
            }
            style={styles.fullScreenHeader}
          />
          <View style={styles.virtualNoticeBar}>
            <Text style={styles.virtualNoticeText}>
              ⚡ CodeMirror 6 渲染 · Linear 暗色 (#0F1011) · 共 {lineCount} 行 Diff
            </Text>
          </View>
          <CodeViewerWebView
            code={combinedPatch}
            diff={combinedPatch}
            isDiff={true}
            language="diff"
            lineNumbers={true}
            readOnly={true}
            style={styles.fullScreenWebView}
          />
        </SafeAreaView>
      );
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* 顶部主导航栏 */}
      <ScreenHeader
        title="代码审查"
        onBack={onBack}
        backLabel={issue ? "返回工单" : "返回"}
        right={
          <Pressable
            onPress={toggleBenchmark}
            style={[styles.benchmarkBadge, isBenchmarkMode && styles.benchmarkBadgeActive]}
          >
            <Text style={[styles.benchmarkText, isBenchmarkMode && styles.benchmarkTextActive]}>
              {isBenchmarkMode ? "退出基准" : "⚡ 2500行基准"}
            </Text>
          </Pressable>
        }
        style={styles.navBar}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.accent}
          />
        }
      >
        {/* 工单上下文胶囊卡片 */}
        {issue && (
          <AppCard style={styles.contextCard}>
            <View style={styles.contextHeader}>
              <Pill label="工单上下文" size="sm" textStyle={styles.contextTag} />
              <Text style={styles.contextId}>#{issue.id.slice(0, 8)}</Text>
            </View>
            <Text style={styles.contextTitle} numberOfLines={2}>
              {issue.title}
            </Text>
            {workProduct && (
              <Text style={styles.contextSub} numberOfLines={1}>
                关联产物: {workProduct.title} ({workProduct.type})
              </Text>
            )}
          </AppCard>
        )}

        {/* 差异概览与视图切换控制条 */}
        <AppCard style={styles.controlCard}>
          {/* 视图模式分段选择器 */}
          <View style={styles.viewModeSwitcher}>
            <Pressable
              style={[
                styles.viewModeBtn,
                viewMode === "working-tree" && styles.viewModeBtnActive,
              ]}
              onPress={() => setViewMode("working-tree")}
            >
              <Text
                style={[
                  styles.viewModeText,
                  viewMode === "working-tree" && styles.viewModeTextActive,
                ]}
              >
                工作树未提交 (Working Tree)
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.viewModeBtn,
                viewMode === "head" && styles.viewModeBtnActive,
              ]}
              onPress={() => setViewMode("head")}
            >
              <Text
                style={[
                  styles.viewModeText,
                  viewMode === "head" && styles.viewModeTextActive,
                ]}
              >
                最新提交 (HEAD)
              </Text>
            </Pressable>
          </View>

          {/* 汇总统计指标 (tabularNum) */}
          <View style={styles.statsRow}>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>变动文件</Text>
              <Text style={styles.statValue}>{totalStats.fileCount} 个</Text>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>代码新增</Text>
              <Text style={[styles.statValue, { color: "#6EE7A0" }]}>
                +{totalStats.adds}
              </Text>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>代码删除</Text>
              <Text style={[styles.statValue, { color: "#FCA5A5" }]}>
                -{totalStats.dels}
              </Text>
            </View>
            <View style={styles.statColActions}>
              <Pressable onPress={expandAll} hitSlop={8} style={styles.actionBtn}>
                <Text style={styles.actionBtnText}>展开全部</Text>
              </Pressable>
              <Pressable onPress={collapseAll} hitSlop={8} style={styles.actionBtn}>
                <Text style={styles.actionBtnText}>折叠全部</Text>
              </Pressable>
            </View>
          </View>

          {/* 工作区提示 */}
          {selectedWorkspaceId ? (
            <Text style={styles.workspaceHint} numberOfLines={1}>
              工作区: {selectedWorkspaceId}
            </Text>
          ) : (
            <Text style={[styles.workspaceHint, { color: C.warn }]}>
              ⚠️ 暂未检测到活动的执行工作区
            </Text>
          )}
        </AppCard>

        {/* 错误提示 (极简幽灵红，非实色厚边) */}
        {error && (
          <ErrorRetry
            message={`获取 Diff 失败: ${error}`}
            onRetry={loadDiff}
            variant="inline"
            style={styles.errorInline}
          />
        )}

        {/* 加载中状态 */}
        {loading && !refreshing ? (
          <LoadingState text="正在分析代码仓库 Git Diff…" style={styles.loadingBox} />
        ) : null}

        {/* 单列高对比折叠 Diff 文件列表 */}
        {diffData?.files && diffData.files.length > 0 ? (
          <View style={styles.fileList}>
            {diffData.files.map((file) => {
              const isExpanded = expandedFiles.has(file.path);
              const statusCfg = STATUS_COLORS[file.status] ?? STATUS_COLORS.unknown;
              const combinedPatch = file.patches.map((p) => p.patch).filter(Boolean).join("\n");
              const lineCount = combinedPatch ? combinedPatch.split("\n").length : 0;

              return (
                <AppCard key={file.path} padding={0} style={styles.fileCard}>
                  {/* 文件项头部 (DESIGN.md 第6节: 等宽字重 500, 折叠 chevron) */}
                  <Pressable
                    style={styles.fileHeader}
                    onPress={() => toggleFileExpand(file.path)}
                  >
                    <View style={styles.fileHeaderLeft}>
                      <Text style={styles.collapseArrow}>
                        {isExpanded ? "▼" : "▶"}
                      </Text>
                      <Pill
                        label={STATUS_LABELS[file.status] ?? file.status}
                        size="sm"
                        style={{ backgroundColor: statusCfg.bg, borderColor: statusCfg.border }}
                        textStyle={{ color: statusCfg.text }}
                      />
                      <View style={styles.fileNameBox}>
                        <Text style={styles.fileNameText} numberOfLines={1}>
                          {getFileName(file.path)}
                        </Text>
                        <Text style={styles.filePathText} numberOfLines={1}>
                          {file.path}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.fileHeaderRight}>
                      <Text style={styles.statAdd}>+{file.additions}</Text>
                      <Text style={styles.statDel}>-{file.deletions}</Text>
                      <Pressable
                        style={styles.fullViewBtn}
                        onPress={() => setSelectedFileForFullView(file.path)}
                        hitSlop={8}
                      >
                        <Text style={styles.fullViewBtnText}>全屏</Text>
                      </Pressable>
                    </View>
                  </Pressable>

                  {/* 展开的单列高对比 Diff 内容 */}
                  {isExpanded && (
                    <View style={styles.diffContainer}>
                      <UnifiedDiffViewer
                        patch={combinedPatch}
                        fileId={file.path}
                        scrollEnabled={lineCount <= 120}
                        style={{ maxHeight: lineCount > 120 ? 460 : undefined }}
                        emptyMessage="该文件为二进制或无文本行差异"
                        header={
                          lineCount > 100 ? (
                            <View style={styles.fileSubHeader}>
                              <Text style={styles.fileSubHeaderText}>
                                {lineCount} 行变更 · 单列高对比展示 (+绿 -红)
                              </Text>
                            </View>
                          ) : null
                        }
                      />
                    </View>
                  )}
                </AppCard>
              );
            })}
          </View>
        ) : !loading ? (
          <EmptyState
            title="暂无代码差异"
            subtitle={
              viewMode === "working-tree"
                ? "当前工作树干净，没有未提交的代码变动。"
                : "当前 HEAD 与基准分支一致，无提交级差异。"
            }
            action={
              <Pressable style={styles.benchBtn} onPress={toggleBenchmark}>
                <Text style={styles.benchBtnText}>⚡ 运行 2500 行虚拟滚动基准测试</Text>
              </Pressable>
            }
            style={styles.emptyBox}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * 生成 2500+ 行的大 Diff 测试数据
 */
function generate2500LineBenchmarkDiff(
  workspaceId: string,
  companyId: string,
): WorkspaceDiffResponse {
  const files: WorkspaceDiffFile[] = [];

  let patch1 = `@@ -1,50 +1,1800 @@\n// Benchmark: Large Agent Workflow Controller\n`;
  for (let i = 1; i <= 900; i++) {
    patch1 += `-  const deprecatedWorkflowStep${i} = computeLegacyPipeline(${i});\n`;
    patch1 += `+  const modernizedReactiveStep${i} = await dispatchAutonomousAgentWorker(${i}, { priority: "high" });\n`;
  }
  files.push({
    path: "server/src/services/autonomous-orchestrator.ts",
    oldPath: null,
    status: "modified",
    staged: true,
    unstaged: false,
    untracked: false,
    binary: false,
    oversized: false,
    truncated: false,
    additions: 900,
    deletions: 900,
    sizeBytes: 1048576,
    patches: [
      {
        kind: "staged",
        patch: patch1,
        additions: 900,
        deletions: 900,
        binary: false,
        oversized: false,
        truncated: false,
        warnings: [],
      },
    ],
    warnings: [],
  });

  let patch2 = `@@ -0,0 +1,700 @@\n`;
  for (let i = 1; i <= 700; i++) {
    patch2 += `+export interface HighThroughputMetricRecord${i} { id: string; timestamp: number; latencyMs: number; }\n`;
  }
  files.push({
    path: "packages/shared/src/metrics/benchmark-records.ts",
    oldPath: null,
    status: "added",
    staged: true,
    unstaged: false,
    untracked: false,
    binary: false,
    oversized: false,
    truncated: false,
    additions: 700,
    deletions: 0,
    sizeBytes: 512000,
    patches: [
      {
        kind: "staged",
        patch: patch2,
        additions: 700,
        deletions: 0,
        binary: false,
        oversized: false,
        truncated: false,
        warnings: [],
      },
    ],
    warnings: [],
  });

  return {
    workspaceId,
    companyId,
    view: "working-tree",
    baseRef: "origin/main",
    defaultBaseRef: "origin/main",
    headSha: "a1b2c3d4e5f67890",
    includeUntracked: true,
    paths: [],
    files,
    stats: {
      fileCount: files.length,
      stagedFileCount: files.length,
      unstagedFileCount: 0,
      untrackedFileCount: 0,
      binaryFileCount: 0,
      oversizedFileCount: 0,
      truncatedFileCount: 0,
      additions: 1600,
      deletions: 900,
    },
    warnings: [],
    caps: {
      maxFiles: 200,
      maxFileBytes: 1048576,
      maxPatchBytes: 2097152,
      maxTotalPatchBytes: 4194304,
    },
    truncated: false,
  };
}

const styles = StyleSheet.create({
  container: {
    paddingTop: Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 24) : 0,
    flex: 1,
    backgroundColor: C.bg,
  },
  fullScreen: {
    paddingTop: Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 24) : 0,
    flex: 1,
    backgroundColor: C.bg,
  },
  fullScreenWebView: {
    flex: 1,
    backgroundColor: "#0F1011",
  },
  fullScreenHeader: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: C.panel,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  fullScreenFilePath: {
    color: C.ink4,
    fontSize: 10,
    fontFamily: MONO_FONT,
    fontVariant: ["tabular-nums"],
  },
  virtualNoticeBar: {
    backgroundColor: "rgba(255,255,255,0.02)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  virtualNoticeText: {
    color: C.ink3,
    fontSize: 11,
    fontFamily: MONO_FONT,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  navBar: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: C.panel,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  benchmarkBadge: {
    backgroundColor: "rgba(255,255,255,0.02)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.line,
  },
  benchmarkBadgeActive: {
    backgroundColor: "rgba(94, 106, 210, 0.15)",
    borderColor: C.brand,
  },
  benchmarkText: {
    color: C.ink3,
    fontSize: 11,
    fontWeight: "500",
  },
  benchmarkTextActive: {
    color: C.accent,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  contextCard: {
    gap: 6,
  },
  contextHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  contextTag: {
    color: C.accent,
  },
  contextId: {
    color: C.ink4,
    fontSize: 11,
    fontFamily: MONO_FONT,
    fontVariant: ["tabular-nums"],
  },
  contextTitle: {
    color: C.ink,
    fontSize: 15,
    fontWeight: "500",
  },
  contextSub: {
    color: C.ink3,
    fontSize: 11,
  },
  controlCard: {
    gap: 12,
  },
  viewModeSwitcher: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.02)",
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  viewModeBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: "center",
    borderRadius: 6,
  },
  viewModeBtnActive: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: C.line,
  },
  viewModeText: {
    color: C.ink3,
    fontSize: 11,
    fontWeight: "400",
  },
  viewModeTextActive: {
    color: C.ink,
    fontWeight: "500",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: C.lineSubtle,
    paddingTop: 10,
  },
  statCol: {
    gap: 2,
  },
  statColActions: {
    flexDirection: "row",
    gap: 6,
  },
  statLabel: {
    color: C.ink4,
    fontSize: 11,
  },
  statValue: {
    color: C.ink,
    fontSize: 15,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  actionBtn: {
    backgroundColor: "rgba(255,255,255,0.02)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.line,
  },
  actionBtnText: {
    color: C.ink2,
    fontSize: 11,
    fontWeight: "500",
  },
  workspaceHint: {
    color: C.ink4,
    fontSize: 10,
    fontFamily: MONO_FONT,
    fontVariant: ["tabular-nums"],
  },
  errorInline: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  loadingBox: {
    flex: 0,
    paddingVertical: 32,
    paddingHorizontal: 0,
  },
  fileList: {
    gap: 12,
  },
  fileCard: {
    overflow: "hidden",
  },
  fileHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    backgroundColor: "transparent",
  },
  fileHeaderLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  collapseArrow: {
    color: C.ink4,
    fontSize: 11,
    width: 14,
  },
  fileNameBox: {
    flex: 1,
  },
  fileNameText: {
    color: C.ink,
    fontSize: 13,
    fontWeight: "500",
    fontFamily: MONO_FONT,
  },
  filePathText: {
    color: C.ink4,
    fontSize: 10,
    fontFamily: MONO_FONT,
  },
  fileHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statAdd: {
    color: "#6EE7A0",
    fontFamily: MONO_FONT,
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  statDel: {
    color: "#FCA5A5",
    fontFamily: MONO_FONT,
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  fullViewBtn: {
    backgroundColor: "rgba(255,255,255,0.02)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.line,
  },
  fullViewBtnText: {
    color: C.accent,
    fontSize: 11,
    fontWeight: "500",
  },
  diffContainer: {
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  fileSubHeader: {
    backgroundColor: "rgba(255,255,255,0.02)",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  fileSubHeaderText: {
    color: C.ink4,
    fontSize: 10,
    fontFamily: MONO_FONT,
    fontVariant: ["tabular-nums"],
  },
  emptyBox: {
    padding: 24,
    borderColor: C.line,
  },
  benchBtn: {
    marginTop: 8,
    backgroundColor: "rgba(94, 106, 210, 0.12)",
    borderColor: C.brand,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  benchBtnText: {
    color: C.accent,
    fontSize: 12,
    fontWeight: "500",
  },
});
