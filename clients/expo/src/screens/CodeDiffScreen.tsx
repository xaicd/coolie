import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
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
import { coolie } from "../coolie";
import {
  MONO_FONT,
  UnifiedDiffViewer,
  parsePatchToLines,
  type ParsedDiffLine,
} from "../components/UnifiedDiffViewer";

// ── 品牌色板 (深靛蓝 + 亮青) ──────────────────────────────────────
const C = {
  bg: "#0B1023",        // 页面深底
  card: "#151B36",      // 卡片底色
  cardHi: "#1B2347",    // 卡片高亮
  line: "#27305C",      // 分隔线
  ink: "#EEF2FF",       // 主文字
  inkDim: "#8A93B8",    // 次文字
  accent: "#22D3EE",    // 亮青
  accentDeep: "#0E7490",
  danger: "#F87171",    // 红色
  ok: "#34D399",        // 绿色
  warn: "#FBBF24",      // 琥珀黄
  purple: "#A78BFA",
} as const;

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

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  added: { bg: "rgba(16, 185, 129, 0.15)", text: "#34D399", border: "rgba(16, 185, 129, 0.3)" },
  modified: { bg: "rgba(56, 189, 248, 0.15)", text: "#38BDF8", border: "rgba(56, 189, 248, 0.3)" },
  deleted: { bg: "rgba(239, 68, 68, 0.15)", text: "#F87171", border: "rgba(239, 68, 68, 0.3)" },
  renamed: { bg: "rgba(167, 139, 250, 0.15)", text: "#A78BFA", border: "rgba(167, 139, 250, 0.3)" },
  untracked: { bg: "rgba(251, 191, 36, 0.15)", text: "#FBBF24", border: "rgba(251, 191, 36, 0.3)" },
  unknown: { bg: "rgba(148, 163, 184, 0.15)", text: "#94A3B8", border: "rgba(148, 163, 184, 0.3)" },
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
 * 移动端代码 Diff 查看器 (Top2 方案 / PRD 需求④ 看代码)
 *
 * 核心特性:
 * 1. 上下文穿透: 支持直接从 issue / work product 上下文进入
 * 2. 单列高对比折叠 Diff 视图: 文件名列表展示 + 点击折叠展开该文件差异
 * 3. 语法着色: +绿 -红 行号对齐高可读性
 * 4. 2500行大 Diff: 基于 FlatList 虚拟滚动，稳定保持 60fps
 * 5. 内置 2500 行虚拟滚动基准测试模式，方便就地验收性能
 */
export function CodeDiffScreen({
  company,
  issue,
  workProduct,
  workspaceId: initialWorkspaceId,
  onBack,
}: CodeDiffScreenProps) {
  const [viewMode, setViewMode] = useState<WorkspaceDiffView>("working-tree");
  const [baseRef, setBaseRef] = useState<string>("");
  const [workspaces, setWorkspaces] = useState<ExecutionWorkspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(initialWorkspaceId ?? null);
  const [diffData, setDiffData] = useState<WorkspaceDiffResponse | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [selectedFileForFullView, setSelectedFileForFullView] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBenchmarkMode, setIsBenchmarkMode] = useState(false);

  // 1. 初始化时解析工作区 (优先使用传入的 workspaceId，或由 issue / work product 解析)
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
        // 如果该任务暂无绑定工作区，尝试拉取公司全局最近工作区
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
      // 默认展开前 3 个文件
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
      const benchmark = generate2500LineBenchmarkDiff(selectedWorkspaceId || "ws-bench", company.id);
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

  // 如果选中了某个文件进入全屏独立查看模式
  if (selectedFileForFullView && diffData) {
    const file = diffData.files.find((f) => f.path === selectedFileForFullView);
    if (file) {
      const combinedPatch = file.patches.map((p) => p.patch).filter(Boolean).join("\n");
      const lines = parsePatchToLines(combinedPatch, file.path);
      return (
        <View style={styles.fullScreen}>
          <StatusBar style="light" />
          <View style={styles.fullScreenHeader}>
            <Pressable onPress={() => setSelectedFileForFullView(null)} hitSlop={12} style={styles.backBtn}>
              <Text style={styles.linkText}>‹ 返回列表</Text>
            </Pressable>
            <View style={styles.fullScreenTitleBox}>
              <Text style={styles.fullScreenFileName} numberOfLines={1}>
                {getFileName(file.path)}
              </Text>
              <Text style={styles.fullScreenFilePath} numberOfLines={1}>
                {file.path} ({lines.length} 行)
              </Text>
            </View>
            <View style={styles.pillRow}>
              <Text style={styles.statAdd}>+{file.additions}</Text>
              <Text style={styles.statDel}>-{file.deletions}</Text>
            </View>
          </View>
          <UnifiedDiffViewer
            lines={lines}
            fileId={file.path}
            header={
              <View style={styles.virtualNoticeBar}>
                <Text style={styles.virtualNoticeText}>
                  ⚡ FlatList 虚拟滚动中 · 共 {lines.length} 行 Diff
                </Text>
              </View>
            }
          />
        </View>
      );
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* 顶部主导航栏 */}
      <View style={styles.navBar}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.linkText}>‹ {issue ? "返回工单" : "返回"}</Text>
        </Pressable>
        <Text style={styles.navTitle}>代码 Diff 查看器</Text>
        <Pressable onPress={toggleBenchmark} style={[styles.benchmarkBadge, isBenchmarkMode && styles.benchmarkBadgeActive]}>
          <Text style={[styles.benchmarkText, isBenchmarkMode && styles.benchmarkTextActive]}>
            {isBenchmarkMode ? "退出基准" : "⚡2500行基准"}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
      >
        {/* 上下文卡片 (若从工单或产物进入) */}
        {issue && (
          <View style={styles.contextCard}>
            <View style={styles.contextHeader}>
              <Text style={styles.contextTag}>工单上下文</Text>
              <Text style={styles.contextId}>#{issue.id.slice(0, 8)}</Text>
            </View>
            <Text style={styles.contextTitle} numberOfLines={2}>{issue.title}</Text>
            {workProduct && (
              <Text style={styles.contextSub} numberOfLines={1}>
                关联产物: {workProduct.title} ({workProduct.type})
              </Text>
            )}
          </View>
        )}

        {/* 差异概览与视图切换控制条 */}
        <View style={styles.controlCard}>
          {/* 视图模式切换 */}
          <View style={styles.viewModeSwitcher}>
            <Pressable
              style={[styles.viewModeBtn, viewMode === "working-tree" && styles.viewModeBtnActive]}
              onPress={() => setViewMode("working-tree")}
            >
              <Text style={[styles.viewModeText, viewMode === "working-tree" && styles.viewModeTextActive]}>
                工作树未提交 (Working Tree)
              </Text>
            </Pressable>
            <Pressable
              style={[styles.viewModeBtn, viewMode === "head" && styles.viewModeBtnActive]}
              onPress={() => setViewMode("head")}
            >
              <Text style={[styles.viewModeText, viewMode === "head" && styles.viewModeTextActive]}>
                最新提交 (HEAD)
              </Text>
            </Pressable>
          </View>

          {/* 汇总统计指标 */}
          <View style={styles.statsRow}>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>变动文件</Text>
              <Text style={styles.statValue}>{totalStats.fileCount} 个</Text>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>代码新增</Text>
              <Text style={[styles.statValue, { color: C.ok }]}>+{totalStats.adds}</Text>
            </View>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>代码删除</Text>
              <Text style={[styles.statValue, { color: C.danger }]}>-{totalStats.dels}</Text>
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
        </View>

        {/* 错误提示 */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>获取 Diff 失败: {error}</Text>
            <Pressable style={styles.retryBtn} onPress={loadDiff}>
              <Text style={styles.retryBtnText}>重试</Text>
            </Pressable>
          </View>
        )}

        {/* 加载中状态 */}
        {loading && !refreshing ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={C.accent} size="large" />
            <Text style={styles.loadingText}>正在分析代码仓库 Git Diff…</Text>
          </View>
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
                <View key={file.path} style={styles.fileCard}>
                  {/* 文件项头部 (点击切换折叠) */}
                  <Pressable
                    style={styles.fileHeader}
                    onPress={() => toggleFileExpand(file.path)}
                  >
                    <View style={styles.fileHeaderLeft}>
                      <Text style={styles.collapseArrow}>
                        {isExpanded ? "▼" : "▶"}
                      </Text>
                      <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg, borderColor: statusCfg.border }]}>
                        <Text style={[styles.statusBadgeText, { color: statusCfg.text }]}>
                          {STATUS_LABELS[file.status] ?? file.status}
                        </Text>
                      </View>
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

                  {/* 展开的单列高对比 Diff 内容 (FlatList 虚拟滚动) */}
                  {isExpanded && (
                    <View style={styles.diffContainer}>
                      <UnifiedDiffViewer
                        patch={combinedPatch}
                        fileId={file.path}
                        scrollEnabled={lineCount <= 120} // 短文件支持跟随页面滚动，长文件使用内层虚拟滚动
                        style={{ maxHeight: lineCount > 120 ? 460 : undefined }}
                        emptyMessage="该文件二进制或无文本行差异"
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
                </View>
              );
            })}
          </View>
        ) : !loading ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>暂无代码差异</Text>
            <Text style={styles.emptySub}>
              {viewMode === "working-tree"
                ? "当前工作树干净，没有未提交的代码变动。"
                : "当前 HEAD 与基准分支一致，无提交级差异。"}
            </Text>
            <Pressable style={styles.benchBtn} onPress={toggleBenchmark}>
              <Text style={styles.benchBtnText}>⚡ 运行 2500 行虚拟滚动基准测试</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

/**
 * 生成 2500+ 行的大 Diff 测试数据
 * 用于在移动端验证 FlatList 虚拟滚动流畅度、无白屏与 60fps 帧率
 */
function generate2500LineBenchmarkDiff(workspaceId: string, companyId: string): WorkspaceDiffResponse {
  const files: WorkspaceDiffFile[] = [];

  // 文件 1: 超大代码文件 (1800 行变更)
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

  // 文件 2: 700 行新增文件
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
    flex: 1,
    backgroundColor: C.bg,
  },
  fullScreen: {
    flex: 1,
    backgroundColor: C.bg,
  },
  fullScreenHeader: {
    paddingTop: 56,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: C.card,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  fullScreenTitleBox: {
    flex: 1,
  },
  fullScreenFileName: {
    color: C.ink,
    fontSize: 14,
    fontWeight: "700",
  },
  fullScreenFilePath: {
    color: C.inkDim,
    fontSize: 11,
    fontFamily: MONO_FONT,
  },
  virtualNoticeBar: {
    backgroundColor: C.cardHi,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  virtualNoticeText: {
    color: C.accent,
    fontSize: 11,
    fontFamily: MONO_FONT,
    textAlign: "center",
  },
  navBar: {
    paddingTop: 56,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: C.card,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navTitle: {
    color: C.ink,
    fontSize: 16,
    fontWeight: "700",
  },
  backBtn: {
    paddingVertical: 4,
  },
  linkText: {
    color: C.accent,
    fontSize: 14,
    fontWeight: "600",
  },
  benchmarkBadge: {
    backgroundColor: C.cardHi,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.line,
  },
  benchmarkBadgeActive: {
    backgroundColor: "rgba(34, 211, 238, 0.15)",
    borderColor: C.accent,
  },
  benchmarkText: {
    color: C.inkDim,
    fontSize: 11,
    fontWeight: "600",
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
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: C.line,
    gap: 4,
  },
  contextHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  contextTag: {
    color: C.accent,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  contextId: {
    color: C.inkDim,
    fontSize: 11,
    fontFamily: MONO_FONT,
  },
  contextTitle: {
    color: C.ink,
    fontSize: 14,
    fontWeight: "600",
  },
  contextSub: {
    color: C.inkDim,
    fontSize: 12,
  },
  controlCard: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: C.line,
    gap: 12,
  },
  viewModeSwitcher: {
    flexDirection: "row",
    backgroundColor: C.cardHi,
    borderRadius: 8,
    padding: 2,
  },
  viewModeBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 6,
  },
  viewModeBtnActive: {
    backgroundColor: C.accent,
  },
  viewModeText: {
    color: C.inkDim,
    fontSize: 12,
    fontWeight: "600",
  },
  viewModeTextActive: {
    color: "#0B1023",
    fontWeight: "700",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 10,
  },
  statCol: {
    gap: 2,
  },
  statColActions: {
    gap: 4,
  },
  statLabel: {
    color: C.inkDim,
    fontSize: 11,
  },
  statValue: {
    color: C.ink,
    fontSize: 15,
    fontWeight: "700",
  },
  actionBtn: {
    backgroundColor: C.cardHi,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  actionBtnText: {
    color: C.inkDim,
    fontSize: 10,
    fontWeight: "600",
  },
  workspaceHint: {
    color: C.inkDim,
    fontSize: 11,
    fontFamily: MONO_FONT,
  },
  errorBox: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderWidth: 1,
    borderColor: C.danger,
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  errorText: {
    color: C.danger,
    fontSize: 12,
    flex: 1,
  },
  retryBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: C.danger,
    borderRadius: 4,
  },
  retryBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
  },
  loadingBox: {
    paddingVertical: 32,
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    color: C.inkDim,
    fontSize: 13,
  },
  fileList: {
    gap: 12,
  },
  fileCard: {
    backgroundColor: C.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
    overflow: "hidden",
  },
  fileHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    backgroundColor: C.card,
  },
  fileHeaderLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  collapseArrow: {
    color: C.inkDim,
    fontSize: 12,
    width: 14,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  fileNameBox: {
    flex: 1,
  },
  fileNameText: {
    color: C.ink,
    fontSize: 13,
    fontWeight: "600",
  },
  filePathText: {
    color: C.inkDim,
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
    color: C.ok,
    fontFamily: MONO_FONT,
    fontSize: 12,
    fontWeight: "700",
  },
  statDel: {
    color: C.danger,
    fontFamily: MONO_FONT,
    fontSize: 12,
    fontWeight: "700",
  },
  fullViewBtn: {
    backgroundColor: C.cardHi,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: C.line,
  },
  fullViewBtnText: {
    color: C.accent,
    fontSize: 10,
    fontWeight: "600",
  },
  diffContainer: {
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  fileSubHeader: {
    backgroundColor: C.cardHi,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  fileSubHeaderText: {
    color: C.inkDim,
    fontSize: 10,
    fontFamily: MONO_FONT,
  },
  emptyBox: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: C.line,
  },
  emptyTitle: {
    color: C.ink,
    fontSize: 15,
    fontWeight: "700",
  },
  emptySub: {
    color: C.inkDim,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  benchBtn: {
    marginTop: 8,
    backgroundColor: "rgba(34, 211, 238, 0.15)",
    borderColor: C.accent,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  benchBtnText: {
    color: C.accent,
    fontSize: 12,
    fontWeight: "700",
  },
});
