import { useCallback, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { BoardChatScreen, type WorkspaceCompany } from "./screens/BoardChatScreen";
import { WorkspaceScreen } from "./screens/workspace/WorkspaceScreen";

/**
 * Coolie H5 (PC web) shell — ChatHome 预览 + 工作空间 (spec 2026-09-21-h5-web-parity).
 *
 * 布局对齐 app 端:
 * - 默认页 = BoardChatScreen (对话流 + 内嵌预览)
 * - 右上角 [工作空间] → 一个原生 `<dialog>` (本文件渲染), 内放 WorkspaceScreen,
 *   WorkspaceScreen 拿到 dialogRef 后调用 `showModal()` 打开 (见 §3.4)。
 *
 * spec §5: 本波不做登录鉴权 —— 默认已登录, 用一个本地 stub company, 不接后端 SSE。
 */

/** 本地 stub: 本波不接登录/公司选择, 先固定一个占位主体 */
const STUB_COMPANY: WorkspaceCompany = { id: "local-stub", name: "Coolie (local stub)" };

export function App() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);

  const openWorkspace = useCallback(() => setWorkspaceOpen(true), []);
  const closeWorkspace = useCallback(() => setWorkspaceOpen(false), []);

  return (
    <div style={styles.app}>
      <style>{GLOBAL_CSS}</style>

      <BoardChatScreen
        company={STUB_COMPANY}
        whoami="掌柜"
        onOpenWorkspace={openWorkspace}
      />

      <dialog
        ref={dialogRef}
        style={styles.dialog}
        // Esc / dialog.close() 都会触发 close, 把 state 同步回来
        onClose={closeWorkspace}
      >
        <WorkspaceScreen
          dialogRef={dialogRef}
          open={workspaceOpen}
          onClose={closeWorkspace}
          company={STUB_COMPANY}
          whoami="掌柜"
        />
      </dialog>
    </div>
  );
}

/** 让 #root 撑满视口 (index.html 只给了一个裸 div), 并给 dialog 兜住暗色背景 */
const GLOBAL_CSS = `
html, body, #root { height: 100%; }
body { margin: 0; background: #08090A; }
dialog.coolie-workspace::backdrop { background: rgba(0,0,0,0.6); }
`;

const styles: Record<string, CSSProperties> = {
  app: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
    fontFamily: "system-ui, -apple-system, sans-serif",
    background: "#08090A",
  },
  dialog: {
    width: "min(94vw, 1080px)",
    height: "min(90vh, 820px)",
    padding: 0,
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    background: "#08090A",
    color: "#F7F8F8",
    overflow: "hidden",
  },
};
