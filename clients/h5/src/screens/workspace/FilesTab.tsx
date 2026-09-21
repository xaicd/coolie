/**
 * 文件 Tab (web) —— workspace 文件树 (嵌套 <ul>/<li> + 折叠/展开)
 *
 * 与 expo 版同构: FlatList 换成嵌套列表, `depth` 缩进改成 CSS padding。
 * - flattenTree() 把 mock 树按当前展开态摊平
 * - 目录 <button> 切换展开态 (本地 state, 不进 store —— 这是临时 UI 细节)
 * - 点文件 → 在预览 Tab 打开 (拼 /workspace/files/<path> 的 mock URL) 并切 Tab
 *
 * 第二波铁匠接 GET /api/companies/<id>/workspace/files 后, 只需把 MOCK_FILE_TREE
 * 换成远端数据, 本组件的交互不用动。
 */

import { useCallback, useState } from "react";
import type { CSSProperties } from "react";
import {
  MOCK_FILE_TREE,
  defaultExpandedPaths,
  flattenTree,
  type FlatFileNode,
} from "./mock-files";
import { useWorkspaceStore } from "./useWorkspaceStore";

/** 点文件后在预览 Tab 打开的 mock 地址 */
export function filePreviewUrl(path: string): string {
  const base = useWorkspaceStore.getState().previewUrl;
  const origin = /^https?:\/\//i.test(base) ? base.replace(/\/+$/, "") : "https://xrobinai.cn";
  return `${origin}/workspace/files/${encodeURIComponent(path)}`;
}

export function FilesTab() {
  const [expanded, setExpanded] = useState<Set<string>>(() => defaultExpandedPaths());
  const [selected, setSelected] = useState<string | null>(null);
  const setUrl = useWorkspaceStore((s) => s.setUrl);
  const setTab = useWorkspaceStore((s) => s.setTab);

  const nodes = flattenTree(MOCK_FILE_TREE, expanded);

  const toggleDir = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const openFile = useCallback(
    (node: FlatFileNode) => {
      setSelected(node.path);
      setUrl(filePreviewUrl(node.path));
      setTab("preview");
    },
    [setTab, setUrl],
  );

  const renderRow = (node: FlatFileNode) => {
    const isDir = node.kind === "directory";
    const isSelected = selected === node.path;
    return (
      <li key={node.path} style={styles.li}>
        <button
          type="button"
          style={{
            ...styles.row,
            paddingLeft: 12 + node.depth * 16,
            ...(isSelected ? styles.rowSelected : null),
          }}
          onClick={() => (isDir ? toggleDir(node.path) : openFile(node))}
        >
          <span style={styles.caret} aria-hidden>
            {isDir ? (node.expanded ? "▾" : "▸") : ""}
          </span>
          <span style={styles.icon} aria-hidden>
            {isDir ? (node.expanded ? "📂" : "📁") : "📄"}
          </span>
          <span style={{ ...styles.name, ...(isDir ? styles.nameDir : null), ...(isSelected ? styles.nameSelected : null) }}>
            {node.name}
          </span>
          {!isDir && node.language ? <span style={styles.lang}>{node.language}</span> : null}
        </button>
      </li>
    );
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <div style={styles.headerTitleRow}>
          <span aria-hidden>🌿</span>
          <span style={styles.headerTitle}>workspace /</span>
        </div>
        <div style={styles.headerMeta}>{nodes.length} 项 · mock 数据</div>
      </div>

      <ul style={styles.ul}>
        {nodes.length === 0 ? <li style={styles.empty}>workspace 为空</li> : nodes.map(renderRow)}
      </ul>

      <div style={styles.footer}>
        点文件 → 在「预览」Tab 打开 (第二波铁匠接 /workspace/files)
      </div>
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
  header: {
    padding: "12px 16px",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  headerTitleRow: { display: "flex", alignItems: "center", gap: 6 },
  headerTitle: { color: "#F7F8F8", fontSize: 13, fontWeight: 600 },
  headerMeta: { color: "#62666D", fontSize: 10, marginTop: 2 },
  ul: { listStyle: "none", margin: 0, padding: "8px 0", overflow: "auto", flex: 1, minHeight: 0 },
  li: { margin: 0 },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    width: "100%",
    minHeight: 38,
    paddingTop: 0,
    paddingBottom: 0,
    paddingRight: 12,
    background: "none",
    border: "none",
    textAlign: "left",
    cursor: "pointer",
  },
  rowSelected: { backgroundColor: "rgba(94,106,210,0.12)" },
  caret: { width: 12, color: "#62666D", fontSize: 11 },
  icon: { fontSize: 13, marginRight: 2 },
  name: { flex: 1, color: "#D0D6E0", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  nameDir: { color: "#F7F8F8", fontWeight: 500 },
  nameSelected: { color: "#7170FF" },
  lang: { color: "#62666D", fontSize: 10, fontVariantNumeric: "tabular-nums" },
  empty: { color: "#62666D", fontSize: 12, textAlign: "center", padding: "24px 0", listStyle: "none" },
  footer: {
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "rgba(255,255,255,0.05)",
    padding: "8px 16px",
    color: "#62666D",
    fontSize: 10,
    lineHeight: "14px",
  },
};

export default FilesTab;
