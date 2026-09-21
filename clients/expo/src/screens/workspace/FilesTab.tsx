/**
 * 文件 Tab —— workspace 文件树 (FlatList + 折叠/展开)
 *
 * spec §10: "文件树先 mock (第二波铁匠接 API)"。这里把结构跑通:
 * - FlatList 渲染 flattenTree() 的结果, 用 depth 控制缩进
 * - 目录 Pressable 切换展开态 (本地 state, 不进 store —— 这是临时 UI 细节)
 * - 点文件 → 在预览 Tab 打开 (拼 ?file=<path> 的 mock URL) 并切 Tab
 */

import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../../coolie";
import { RADIUS, SPACING } from "../../ui/tokens";
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

  const nodes = useMemo(() => flattenTree(MOCK_FILE_TREE, expanded), [expanded]);

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

  const renderNode = useCallback(
    ({ item }: { item: FlatFileNode }) => {
      const isDir = item.kind === "directory";
      const isOpen = Boolean(item.expanded);
      const isSelected = selected === item.path;
      return (
        <Pressable
          style={[
            styles.row,
            { paddingLeft: SPACING.md + item.depth * 16 },
            isSelected && styles.rowSelected,
          ]}
          onPress={() => (isDir ? toggleDir(item.path) : openFile(item))}
        >
          {isDir ? (
            <Ionicons
              name={isOpen ? "chevron-down" : "chevron-forward"}
              size={13}
              color={C.ink4}
              style={styles.caret}
            />
          ) : (
            <View style={styles.caretSpacer} />
          )}
          <Ionicons
            name={
              isDir
                ? isOpen
                  ? "folder-open-outline"
                  : "folder-outline"
                : "document-text-outline"
            }
            size={15}
            color={isDir ? C.accent : C.ink3}
            style={styles.icon}
          />
          <Text
            style={[styles.name, isDir && styles.nameDir, isSelected && styles.nameSelected]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          {!isDir && item.language ? (
            <Text style={styles.lang}>{item.language}</Text>
          ) : null}
        </Pressable>
      );
    },
    [openFile, selected, toggleDir],
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Ionicons name="git-branch-outline" size={14} color={C.ink2} />
          <Text style={styles.headerTitle}>workspace /</Text>
        </View>
        <Text style={styles.headerMeta}>{nodes.length} 项 · mock 数据</Text>
      </View>

      <FlatList
        data={nodes}
        keyExtractor={(item) => item.path}
        renderItem={renderNode}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.empty}>workspace 为空</Text>
        }
      />

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          点文件 → 在「预览」Tab 打开 (第二波铁匠接 /workspace/files)
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
    gap: 2,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerTitle: {
    color: C.ink,
    fontSize: 13,
    fontWeight: "600",
  },
  headerMeta: {
    color: C.ink4,
    fontSize: 10,
  },
  listContent: {
    paddingVertical: SPACING.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 38,
    paddingRight: SPACING.md,
    gap: 6,
  },
  rowSelected: {
    backgroundColor: "rgba(94,106,210,0.12)",
  },
  caret: {
    width: 13,
  },
  caretSpacer: {
    width: 13,
  },
  icon: {
    marginRight: 2,
  },
  name: {
    flex: 1,
    color: C.ink2,
    fontSize: 13,
  },
  nameDir: {
    color: C.ink,
    fontWeight: "500",
  },
  nameSelected: {
    color: C.accent,
  },
  lang: {
    color: C.ink4,
    fontSize: 10,
    fontVariant: ["tabular-nums"],
  },
  empty: {
    color: C.ink4,
    fontSize: 12,
    textAlign: "center",
    paddingVertical: SPACING.xl,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: C.lineSubtle,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  footerText: {
    color: C.ink4,
    fontSize: 10,
    lineHeight: 14,
  },
});

export default FilesTab;
