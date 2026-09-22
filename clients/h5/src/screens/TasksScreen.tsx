/**
 * 任务页 (TasksScreen, h5) —— Coolie工坊 App 任务页的 Web 镜像。
 *
 * 与 expo 端 `clients/expo/src/screens/TasksScreen.tsx` 同一套布局:
 * 「任务」标题 + 搜索框 + [+ 新建任务] + IssuesList (6 视图 / 时间分组)。
 *
 * 公司取 `coolie.listCompanies()` 的第一家 (h5 暂无公司选择器, 与 DashboardScreen /
 * OntologyScreen 同一取法)。接口报错时如实展示, 不静默吞成空列表。
 *
 * 语音派发不在本波 h5 范围: 浏览器 MediaRecorder 默认产出 webm/opus,
 * 与实例的腾讯 ASR 一句话识别容器不匹配, 需要额外转码; App 端已有一条真链路,
 * 这里不塞一条未验证的旁路。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Agent, Company, Issue, IssuePriority } from "@coolie/api-client";
import { coolie } from "../coolie";
import { IssuesList } from "../components/IssuesList";
import { ComposeScreen } from "./ComposeScreen";
import { useComposerFields } from "../components/composer/useComposerFields";

const C = {
  bg: "#08090A",
  panel: "#0F1011",
  surface: "#191A1B",
  ink: "#F7F8F8",
  ink2: "#D0D6E0",
  ink3: "#8A8F98",
  ink4: "#62666D",
  accent: "#7170FF",
  brand: "#5E6AD2",
  line: "rgba(255,255,255,0.08)",
  lineSubtle: "rgba(255,255,255,0.05)",
} as const;

export function TasksScreen({
  style,
  onOpenBuild,
  onOpenPipelines,
  onOpenPlans,
}: {
  style?: CSSProperties;
  /** [🔨 Build 5 步链] → 工坊页 (在对话里输入 "build xxx" 走同一条编排链) */
  onOpenBuild?: () => void;
  onOpenPipelines?: () => void;
  onOpenPlans?: () => void;
}) {
  const [company, setCompany] = useState<Company | null>(null);
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<IssuePriority>("medium");
  const [busy, setBusy] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);

  // 新建任务弹窗的全部字段 (与 App 端 composer 同一份字段语义)。员工列表是入参:
  // 指派人的适配器类型决定「模型选项」面板是否存在, 所以 hook 需要拿到它。
  const fields = useComposerFields(company?.id ?? null, agents);
  const { reset: resetFields } = fields;

  useEffect(() => {
    void (async () => {
      try {
        const companies = await coolie.listCompanies();
        if (companies.length === 0) {
          setCompanyError("这个实例上还没有公司，请先在后台创建。");
          return;
        }
        setCompany(companies[0]);
      } catch (e) {
        setCompanyError(String((e as Error)?.message ?? e));
      }
    })();
  }, []);

  // 指派行的选项: 与 Coolie Web composer 的 agentsApi.list 同一个端点
  useEffect(() => {
    if (!company) return;
    let cancelled = false;
    void coolie
      .listAgents(company.id)
      .then((rows) => {
        if (!cancelled) setAgents(rows);
      })
      .catch(() => {
        if (!cancelled) setAgents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [company]);

  const openCreate = useCallback(() => dialogRef.current?.showModal(), []);
  const closeCreate = useCallback(() => dialogRef.current?.close(), []);

  const resetDraft = useCallback(() => {
    setTitle("");
    setDescription("");
    setPriority("medium");
    resetFields();
  }, [resetFields]);

  const submit = useCallback(async () => {
    if (!company || !title.trim() || busy) return;
    setBusy(true);
    try {
      const { issue, failedUploads } = await fields.createTask({
        title: title.trim(),
        priority,
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      resetDraft();
      dialogRef.current?.close();
      setRefreshSignal((value) => value + 1);
      setToast(
        failedUploads.length > 0
          ? `任务已创建: ${issue.title}（附件未上传: ${failedUploads.join("、")}）`
          : `任务已创建: ${issue.title}`,
      );
    } catch (e) {
      window.alert(`创建失败: ${String((e as Error)?.message ?? e)}`);
    } finally {
      setBusy(false);
    }
  }, [busy, company, description, fields, priority, resetDraft, title]);

  const openIssue = useCallback((issue: Issue) => {
    setToast(`已选任务: ${issue.title}（h5 详情页待后续波次）`);
  }, []);

  return (
    <div style={{ ...styles.screen, ...style }}>
      <div style={styles.header}>
        <h1 style={styles.h1}>任务</h1>
        <button type="button" style={styles.primaryBtn} onClick={openCreate} disabled={!company}>
          + 新建任务
        </button>
      </div>

      {/* 编排按钮组 (wave20, 镜像 App 任务页): 三种编排的直达入口 */}
      <div style={styles.orchestrationRow}>
        <button type="button" style={styles.orchBtn} onClick={onOpenBuild}>
          <span style={styles.orchEmoji}>🔨</span>
          <span style={styles.orchLabel}>Build 5 步链</span>
        </button>
        <button type="button" style={styles.orchBtn} onClick={onOpenPipelines}>
          <span style={styles.orchEmoji}>🛤️</span>
          <span style={styles.orchLabel}>Pipeline</span>
        </button>
        <button type="button" style={styles.orchBtn} onClick={onOpenPlans}>
          <span style={styles.orchEmoji}>📋</span>
          <span style={styles.orchLabel}>Plan</span>
        </button>
      </div>

      <div style={styles.searchBox}>
        <span aria-hidden style={{ color: C.ink3 }}>
          🔍
        </span>
        <input
          style={styles.searchInput}
          placeholder="搜索任务…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {companyError ? (
        <div style={styles.empty}>公司加载失败: {companyError}</div>
      ) : !company ? (
        <div style={styles.empty}>正在加载…</div>
      ) : (
        <IssuesList
          companyId={company.id}
          search={search}
          refreshSignal={refreshSignal}
          onIssuePress={openIssue}
        />
      )}

      {toast ? (
        <div style={styles.toast} onClick={() => setToast(null)}>
          {toast}
        </div>
      ) : null}

      {/* 新建任务弹窗 (对齐 Coolie Web New Task 弹窗) */}
      <dialog
        ref={dialogRef}
        style={styles.dialog}
        onClose={resetDraft}
        onClick={(e) => {
          if (e.target === dialogRef.current) closeCreate();
        }}
      >
        <ComposeScreen
          companyId={company?.id ?? null}
          title={title}
          onTitle={setTitle}
          description={description}
          onDescription={setDescription}
          priority={priority}
          onPriority={setPriority}
          agents={agents}
          fields={fields}
          busy={busy}
          onSubmit={() => void submit()}
          onDiscard={closeCreate}
        />
      </dialog>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  screen: { padding: 20, display: "flex", flexDirection: "column", gap: 16, minHeight: 0 },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  h1: { margin: 0, color: C.ink, fontSize: 20, fontWeight: 600, letterSpacing: "-0.4px" },
  primaryBtn: {
    padding: "9px 16px",
    borderRadius: 8,
    border: "none",
    background: C.brand,
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  orchestrationRow: { display: "flex", gap: 8 },
  orchBtn: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: "12px 8px",
    borderRadius: 8,
    border: `1px solid ${C.accent}`,
    background: "rgba(94,106,210,0.08)",
    cursor: "pointer",
  },
  orchEmoji: { fontSize: 16 },
  orchLabel: { color: C.ink2, fontSize: 12, fontWeight: 500 },
  searchBox: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 8,
    border: `1px solid ${C.line}`,
    background: "rgba(255,255,255,0.02)",
  },
  searchInput: {
    flex: 1,
    border: "none",
    outline: "none",
    background: "transparent",
    color: C.ink,
    fontSize: 14,
  },
  empty: { padding: "28px 0", textAlign: "center", color: C.ink4, fontSize: 13 },
  toast: {
    position: "fixed",
    bottom: 24,
    left: "50%",
    transform: "translateX(-50%)",
    padding: "10px 18px",
    borderRadius: 8,
    background: C.surface,
    border: `1px solid ${C.line}`,
    color: C.ink,
    fontSize: 13,
    cursor: "pointer",
  },
  dialog: {
    width: "min(94vw, 640px)",
    padding: 0,
    border: `1px solid ${C.line}`,
    borderRadius: 14,
    background: C.bg,
    color: C.ink,
    overflow: "hidden",
  },
};
