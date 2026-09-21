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
import type { Company, Issue, IssuePriority } from "@coolie/api-client";
import { coolie } from "../coolie";
import {
  IssuesList,
  ISSUE_PRIORITIES,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
} from "../components/IssuesList";

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

export function TasksScreen({ style }: { style?: CSSProperties }) {
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

  const openCreate = useCallback(() => dialogRef.current?.showModal(), []);
  const closeCreate = useCallback(() => dialogRef.current?.close(), []);

  const resetDraft = useCallback(() => {
    setTitle("");
    setDescription("");
    setPriority("medium");
  }, []);

  const submit = useCallback(async () => {
    if (!company || !title.trim() || busy) return;
    setBusy(true);
    try {
      const issue = await coolie.createIssue({
        companyId: company.id,
        title: title.trim(),
        priority,
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      resetDraft();
      dialogRef.current?.close();
      setRefreshSignal((value) => value + 1);
      setToast(`任务已创建: ${issue.title}`);
    } catch (e) {
      window.alert(`创建失败: ${String((e as Error)?.message ?? e)}`);
    } finally {
      setBusy(false);
    }
  }, [busy, company, description, priority, resetDraft, title]);

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
