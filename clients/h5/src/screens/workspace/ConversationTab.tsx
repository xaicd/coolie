/**
 * 对话 Tab (web) —— 把驾驶舱问答流嵌进工作空间
 *
 * 与 expo 版 `clients/expo/src/screens/workspace/ConversationTab.tsx` 同构: 收掉
 * BoardChatScreen 的整屏外壳, 换成 embedded 模式, 免得在 dialog 里再套一层全屏页头。
 * 不重写对话逻辑 —— h5 简化版 BoardChatScreen 原样复用。
 */

import type { CSSProperties } from "react";
import { BoardChatScreen, type WorkspaceCompany } from "../BoardChatScreen";

export interface ConversationTabProps {
  company: WorkspaceCompany;
  whoami?: string;
}

export function ConversationTab({ company, whoami }: ConversationTabProps) {
  return (
    <div style={styles.wrap}>
      <div style={styles.banner}>
        嵌入模式 · 与「工坊」页共用同一条对话流
      </div>
      <BoardChatScreen company={company} whoami={whoami} embedded />
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    backgroundColor: "#08090A",
  },
  banner: {
    padding: "4px 16px",
    backgroundColor: "#0F1011",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "rgba(255,255,255,0.05)",
    color: "#62666D",
    fontSize: 10,
  },
};

export default ConversationTab;
