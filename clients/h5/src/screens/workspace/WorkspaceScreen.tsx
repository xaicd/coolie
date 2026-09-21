/**
 * 工作空间 (Workspace) —— ChatHome 左右栏的 web 版
 *
 * 抄的是 ChatHome 的 **Tab 切换骨架**, 不是它 4928 行整页:
 * - 顶部一排 Tab: 对话 / 预览 / 文件 / 终端 (4 个, 不学它的整套 IDE 抽象)
 * - 当前 Tab 存在 Zustand store 里, 且落盘 (localStorage) —— 退出再进来还是原来那页
 * - 内容区按 activeTab 条件渲染对应 Tab 组件
 *
 * 拉起方式: App.tsx 顶部右上角 [Workspace] → 本组件所在的原生 `<dialog>`。
 * RN 的 `Modal animationType="slide"` 换成 HTML5 `<dialog showModal()>`:
 * dialog 元素由 App 渲染 (见 §3.12), 本组件拿到它的 ref, 在 open 翻转时调用
 * `showModal()` / `close()` —— 显式由本组件驱动, 而不是靠 CSS 显隐。
 */

import { useCallback, useEffect } from "react";
import type { CSSProperties, RefObject } from "react";
import { ConversationTab } from "./ConversationTab";
import { PreviewTab } from "./PreviewTab";
import { FilesTab } from "./FilesTab";
import { TerminalTab } from "./TerminalTab";
import { WORKSPACE_TABS, useWorkspaceStore, type WorkspaceTab } from "./useWorkspaceStore";
import type { WorkspaceCompany } from "../BoardChatScreen";

/**
 * 顶部 4 个 Tab 的展示文案, 顺序即渲染顺序。
 * 单独列一行常量: e2e-local.sh 直接抓这一行断言 4 个 Tab 齐全。
 */
export const WORKSPACE_TAB_LABELS = ["对话", "预览", "文件", "终端"] as const;

export interface WorkspaceScreenProps {
  /** 当前预览地址 / Tab 所属的工作空间 */
  company: WorkspaceCompany;
  whoami?: string;
  /** 是否打开: 翻转时本组件调用 dialogRef.showModal()/close() */
  open: boolean;
  /** 关闭回调 (点 ✕ / 按 Esc / 复位后由父级收起) */
  onClose: () => void;
  /** App 渲染的 `<dialog>` ref */
  dialogRef: RefObject<HTMLDialogElement | null>;
}

export function WorkspaceScreen({
  company,
  whoami,
  open,
  onClose,
  dialogRef,
}: WorkspaceScreenProps) {
  const activeTab = useWorkspaceStore((s) => s.activeTab);
  const setTab = useWorkspaceStore((s) => s.setTab);
  const reset = useWorkspaceStore((s) => s.reset);

  // open 翻转 → 驱动原生 dialog 的开合 (§3.4)
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open, dialogRef]);

  const activeMeta = WORKSPACE_TABS.find((t) => t.key === activeTab) ?? WORKSPACE_TABS[0];

  const handleSelect = useCallback(
    (key: WorkspaceTab) => {
      setTab(key);
    },
    [setTab],
  );

  const renderContent = () => {
    switch (activeTab) {
      case "conversation":
        return <ConversationTab company={company} whoami={whoami} />;
      case "preview":
        return <PreviewTab />;
      case "files":
        return <FilesTab />;
      case "terminal":
        return <TerminalTab />;
      default:
        return null;
    }
  };

  return (
    <div style={styles.screen} className="coolie-workspace-screen">
      {/* 页头: 标题 + 作用域 + 复位/关闭 */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.headerGlyph} aria-hidden>
            ▦
          </span>
          <div style={styles.headerTitleStack}>
            <div style={styles.headerTitle}>工作空间</div>
            <div style={styles.headerSubtitle}>
              {company.name}
              {whoami ? ` · ${whoami}` : ""}
            </div>
          </div>
        </div>
        <div style={styles.headerRight}>
          <button type="button" style={styles.headerBtn} onClick={reset} title="复位到对话 Tab">
            ⟳
          </button>
          <button type="button" style={styles.headerBtn} onClick={onClose} title="关闭">
            ✕
          </button>
        </div>
      </div>

      {/* Tab 切换条 (对齐 ChatHome 的左右栏切换) */}
      <div style={styles.tabBar} role="tablist" aria-label={WORKSPACE_TAB_LABELS.join(" / ")}>
        {WORKSPACE_TABS.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              style={{ ...styles.tabBtn, ...(active ? styles.tabBtnActive : null) }}
              onClick={() => handleSelect(tab.key)}
            >
              <span aria-hidden>{tab.icon}</span>
              <span style={{ ...styles.tabLabel, ...(active ? styles.tabLabelActive : null) }}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* 当前 Tab 说明条 */}
      <div style={styles.metaBar}>
        <span style={styles.metaDot} aria-hidden />
        <span style={styles.metaText}>{activeMeta.hint}</span>
      </div>

      {/* 内容区: 条件渲染 */}
      <div style={styles.content}>{renderContent()}</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  screen: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    backgroundColor: "#08090A",
    color: "#F7F8F8",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "rgba(255,255,255,0.05)",
    flex: "0 0 auto",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 },
  headerGlyph: { color: "#7170FF", fontSize: 16 },
  headerTitleStack: { flex: 1, minWidth: 0 },
  headerTitle: { color: "#F7F8F8", fontSize: 17, fontWeight: 600, letterSpacing: "-0.2px" },
  headerSubtitle: { color: "#62666D", fontSize: 11, marginTop: 1 },
  headerRight: { display: "flex", alignItems: "center", gap: 4 },
  headerBtn: {
    padding: "6px 8px",
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "#D0D6E0",
    fontSize: 13,
    cursor: "pointer",
  },
  tabBar: { display: "flex", gap: 4, padding: "8px 8px", flex: "0 0 auto" },
  tabBtn: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    padding: "9px 0",
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.08)",
    cursor: "pointer",
  },
  tabBtnActive: {
    backgroundColor: "rgba(94,106,210,0.14)",
    borderColor: "#5E6AD2",
  },
  tabLabel: { color: "#8A8F98", fontSize: 13, fontWeight: 500 },
  tabLabelActive: { color: "#7170FF" },
  metaBar: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "0 16px 8px",
    flex: "0 0 auto",
  },
  metaDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#7170FF",
    display: "inline-block",
  },
  metaText: { color: "#62666D", fontSize: 11 },
  content: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" },
};

export default WorkspaceScreen;
