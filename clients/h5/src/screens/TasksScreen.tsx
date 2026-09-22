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
import {
  IssuesList,
  ISSUE_PRIORITIES,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
} from "../components/IssuesList";
import { ForRow } from "../components/composer/ForRow";
import { ProjectRow } from "../components/composer/ProjectRow";
import { UploadRow } from "../components/composer/UploadRow";
import { WorkModeChips } from "../components/composer/WorkModeChips";
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

  // For / in / Mode / Upload 四行 (与 App 端 composer 同一份字段语义)
  const fields = useComposerFields(company?.id ?? null);
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
        <div style={styles.dialogInner}>
          <div style={styles.dialogHeader}>
            <span style={styles.breadcrumb}>
              <span style={{ color: C.ink4 }}>XROA</span>
              <span style={{ color: C.ink4 }}>›</span>
              <span style={{ color: C.ink }}>New task</span>
            </span>
            <button type="button" style={styles.iconBtn} onClick={closeCreate} aria-label="关闭">
              ✕
            </button>
          </div>

          <input
            autoFocus
            style={styles.titleInput}
            placeholder="Task title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <ForRow agents={agents} value={fields.assigneeAgentId} onChange={fields.setAssigneeAgentId} />

          <ProjectRow projects={fields.projects} value={fields.projectId} onChange={fields.setProjectId} />

          <textarea
            style={styles.descriptionInput}
            placeholder="Add description..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div style={styles.section}>
            <span style={styles.sectionLabel}>优先级</span>
            <div style={styles.chipRow}>
              {ISSUE_PRIORITIES.map((value) => (
                <button
                  key={value}
                  type="button"
                  style={{ ...styles.chip, ...(priority === value ? styles.chipActive : null) }}
                  onClick={() => setPriority(value)}
                >
                  <span style={{ ...styles.dot, background: PRIORITY_COLOR[value] }} />
                  <span style={{ color: priority === value ? C.ink : C.ink3 }}>{PRIORITY_LABEL[value]}</span>
                </button>
              ))}
            </div>
          </div>

          <WorkModeChips value={fields.workMode} onChange={fields.setWorkMode} />

          <UploadRow files={fields.attachments} onChange={fields.setAttachments} disabled={busy} />

          <div style={styles.dialogFooter}>
            <button type="button" style={styles.discardBtn} onClick={closeCreate} disabled={busy}>
              放弃草稿
            </button>
            <button
              type="button"
              style={{ ...styles.primaryBtn, ...(title.trim() && !busy ? null : styles.disabled) }}
              disabled={!title.trim() || busy}
              onClick={() => void submit()}
            >
              {busy ? "创建中…" : "创建任务"}
            </button>
          </div>
        </div>
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
  disabled: { opacity: 0.4, cursor: "not-allowed" },
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
    width: "min(94vw, 560px)",
    padding: 0,
    border: `1px solid ${C.line}`,
    borderRadius: 14,
    background: C.bg,
    color: C.ink,
  },
  dialogInner: { padding: 20, display: "flex", flexDirection: "column", gap: 16 },
  dialogHeader: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  breadcrumb: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 },
  iconBtn: {
    border: "none",
    background: "transparent",
    color: C.ink3,
    fontSize: 15,
    cursor: "pointer",
  },
  titleInput: {
    border: "none",
    outline: "none",
    background: "transparent",
    color: C.ink,
    fontSize: 20,
    fontWeight: 600,
    letterSpacing: "-0.3px",
  },
  descriptionInput: {
    minHeight: 120,
    border: "none",
    outline: "none",
    background: "transparent",
    color: C.ink2,
    fontSize: 14,
    lineHeight: "20px",
    resize: "vertical",
  },
  section: { display: "flex", flexDirection: "column", gap: 8 },
  sectionLabel: { color: C.ink4, fontSize: 11, fontWeight: 600, letterSpacing: "0.6px", textTransform: "uppercase" },
  chipRow: { display: "flex", flexWrap: "wrap", gap: 8 },
  chip: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 12px",
    borderRadius: 999,
    border: `1px solid ${C.line}`,
    background: "rgba(255,255,255,0.02)",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
  },
  chipActive: { borderColor: C.brand, background: "rgba(94,106,210,0.18)" },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dialogFooter: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  discardBtn: {
    border: "none",
    background: "transparent",
    color: C.ink3,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
};
