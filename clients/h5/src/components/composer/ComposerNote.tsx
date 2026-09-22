import type { CSSProperties, ReactNode } from "react";
import { C } from "../../theme";

/**
 * h5 建单提示条 —— Coolie Web NewIssueDialog 属性条与页脚之间那几条 note 的镜像,
 * 与 expo 端 `ComposerNote.tsx` 同一语义。
 *
 * 上游的四种: **指派 + backlog** (「Assigning implies executable intent...」,
 * Flag)、**负责人已暂停** (InlineBanner, PauseCircle)、**低信任复核负责人**
 * (ShieldAlert)、以及 **MissingUserSecretsBanner**。前三种只差图标与文案, 共用一个
 * 组件; secrets 那条需要客户端的 secrets API, 这里不复刻。
 */
export function ComposerNote({ glyph, children }: { glyph: string; children: ReactNode }) {
  return (
    <div style={noteStyle}>
      <span aria-hidden>{glyph}</span>
      <span style={textStyle}>{children}</span>
    </div>
  );
}

const noteStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  borderRadius: 8,
  border: "1px solid rgba(245,158,11,0.25)",
  background: "rgba(255,255,255,0.02)",
  padding: "8px 12px",
};

const textStyle: CSSProperties = { color: C.ink2, fontSize: 12, lineHeight: "17px" };
