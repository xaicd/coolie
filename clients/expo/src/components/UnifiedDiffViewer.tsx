import React, { memo, useMemo } from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
  type ViewStyle,
} from "react-native";
import { C } from "../coolie";

// ── Linear Diff 语法高亮色 (DESIGN.md 第6节) ──────────────────────────
const DIFF_THEME = {
  // 新增行: bg #27A644@8%, 行号/文字偏 #6EE7A0
  addBg: "rgba(39, 166, 68, 0.08)",
  addBorder: "rgba(39, 166, 68, 0.4)",
  addInk: "#6EE7A0",
  // 删除行: bg #EF4444@8%, 文字偏 #FCA5A5
  delBg: "rgba(239, 68, 68, 0.08)",
  delBorder: "rgba(239, 68, 68, 0.4)",
  delInk: "#FCA5A5",
  // Hunk 片段头: @@
  hunkBg: "rgba(94, 106, 210, 0.08)",
  hunkBorder: "rgba(94, 106, 210, 0.4)",
  hunkInk: C.accent,
  // 上下文与行号槽
  contextInk: C.ink2,
  numDim: C.ink4,
  numGutterBg: C.panel,
} as const;

export const MONO_FONT = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});

export const DIFF_LINE_HEIGHT = 22;

export type DiffLineType = "header" | "add" | "delete" | "context" | "meta";

export interface ParsedDiffLine {
  id: string;
  type: DiffLineType;
  oldNum: number | null;
  newNum: number | null;
  sign: string;
  content: string;
}

/**
 * 快速统一 Diff 补丁解析器
 * 将 Git 标准 patch 文本转换为适合 FlatList 虚拟滚动的行数组
 */
export function parsePatchToLines(
  patchText: string | null | undefined,
  fileId = "file",
): ParsedDiffLine[] {
  if (!patchText || !patchText.trim()) return [];

  const rawLines = patchText.split("\n");
  const result: ParsedDiffLine[] = [];

  let oldCounter = 0;
  let newCounter = 0;

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const id = `${fileId}-L${i}`;

    // 处理 hunk 头部: @@ -oldStart,oldLen +newStart,newLen @@
    if (raw.startsWith("@@")) {
      const match = raw.match(/@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
      if (match) {
        oldCounter = parseInt(match[1], 10);
        newCounter = parseInt(match[2], 10);
      }
      result.push({
        id,
        type: "header",
        oldNum: null,
        newNum: null,
        sign: "@@",
        content: raw,
      });
      continue;
    }

    // Git 元数据行 (如 diff --git, index, ---, +++)
    if (
      raw.startsWith("diff --git") ||
      raw.startsWith("index ") ||
      raw.startsWith("--- ") ||
      raw.startsWith("+++ ") ||
      raw.startsWith("\\ No newline")
    ) {
      result.push({
        id,
        type: "meta",
        oldNum: null,
        newNum: null,
        sign: " ",
        content: raw,
      });
      continue;
    }

    // 新增行
    if (raw.startsWith("+")) {
      const lineNum = newCounter++;
      result.push({
        id,
        type: "add",
        oldNum: null,
        newNum: lineNum,
        sign: "+",
        content: raw.slice(1),
      });
      continue;
    }

    // 删除行
    if (raw.startsWith("-")) {
      const lineNum = oldCounter++;
      result.push({
        id,
        type: "delete",
        oldNum: lineNum,
        newNum: null,
        sign: "-",
        content: raw.slice(1),
      });
      continue;
    }

    // 上下文普通行
    const lineOld = oldCounter++;
    const lineNew = newCounter++;
    result.push({
      id,
      type: "context",
      oldNum: lineOld,
      newNum: lineNew,
      sign: " ",
      content: raw.startsWith(" ") ? raw.slice(1) : raw,
    });
  }

  return result;
}

/**
 * 单行 Diff 渲染组件 (使用 React.memo 防止长列表重新渲染时重绘已渲染行)
 */
export const DiffLineRow = memo(function DiffLineRow({
  item,
}: {
  item: ParsedDiffLine;
}) {
  const { type, oldNum, newNum, sign, content } = item;

  let rowBg: string = "transparent";
  let borderLeftColor: string = "transparent";
  let textColor: string = DIFF_THEME.contextInk;
  let numColor: string = DIFF_THEME.numDim;

  if (type === "add") {
    rowBg = DIFF_THEME.addBg;
    borderLeftColor = DIFF_THEME.addBorder;
    textColor = DIFF_THEME.addInk;
    numColor = DIFF_THEME.addInk;
  } else if (type === "delete") {
    rowBg = DIFF_THEME.delBg;
    borderLeftColor = DIFF_THEME.delBorder;
    textColor = DIFF_THEME.delInk;
    numColor = DIFF_THEME.delInk;
  } else if (type === "header") {
    rowBg = DIFF_THEME.hunkBg;
    borderLeftColor = DIFF_THEME.hunkBorder;
    textColor = DIFF_THEME.hunkInk;
    numColor = DIFF_THEME.hunkInk;
  } else if (type === "meta") {
    textColor = C.ink3;
  }

  return (
    <View style={[styles.lineRow, { backgroundColor: rowBg, borderLeftColor }]}>
      {/* 行号槽 (Gutter) */}
      <View style={styles.gutter}>
        <Text style={[styles.lineNum, { color: numColor }]}>
          {oldNum !== null ? String(oldNum) : ""}
        </Text>
        <Text style={[styles.lineNum, { color: numColor }]}>
          {newNum !== null ? String(newNum) : ""}
        </Text>
      </View>

      {/* 符号槽 (+ / - / @@) */}
      <View style={styles.signBox}>
        <Text style={[styles.signText, { color: textColor }]}>{sign}</Text>
      </View>

      {/* 代码内容槽 (等宽、保留缩进) */}
      <View style={styles.codeBox}>
        <Text style={[styles.codeText, { color: textColor }]} numberOfLines={1}>
          {content || " "}
        </Text>
      </View>
    </View>
  );
});

export interface UnifiedDiffViewerProps {
  patch?: string | null;
  lines?: ParsedDiffLine[];
  fileId?: string;
  emptyMessage?: string;
  style?: ViewStyle;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  scrollEnabled?: boolean;
}

/**
 * 移动端单列高对比虚拟滚动 Diff 渲染器 (DESIGN.md 第6节)
 * 针对 2500+ 行大 Diff 优化:采用 FlatList + getItemLayout 虚拟滚动，维持 60fps
 */
export function UnifiedDiffViewer({
  patch,
  lines: customLines,
  fileId = "diff",
  emptyMessage = "此文件没有行级差异",
  style,
  header,
  footer,
  scrollEnabled = true,
}: UnifiedDiffViewerProps) {
  const data = useMemo(() => {
    if (customLines) return customLines;
    return parsePatchToLines(patch, fileId);
  }, [customLines, patch, fileId]);

  const renderItem = ({ item }: ListRenderItemInfo<ParsedDiffLine>) => (
    <DiffLineRow item={item} />
  );

  const getItemLayout = (_: unknown, index: number) => ({
    length: DIFF_LINE_HEIGHT,
    offset: DIFF_LINE_HEIGHT * index,
    index,
  });

  if (data.length === 0) {
    return (
      <View style={[styles.emptyContainer, style]}>
        {header}
        <Text style={styles.emptyText}>{emptyMessage}</Text>
        {footer}
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        initialNumToRender={45}
        maxToRenderPerBatch={45}
        windowSize={11}
        removeClippedSubviews={true}
        scrollEnabled={scrollEnabled}
        ListHeaderComponent={header ? <View>{header}</View> : null}
        ListFooterComponent={footer ? <View>{footer}</View> : null}
        showsVerticalScrollIndicator={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  emptyContainer: {
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: C.ink3,
    fontSize: 13,
    fontFamily: MONO_FONT,
  },
  lineRow: {
    height: DIFF_LINE_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    borderLeftWidth: 2,
  },
  gutter: {
    width: 68,
    height: DIFF_LINE_HEIGHT,
    flexDirection: "row",
    backgroundColor: DIFF_THEME.numGutterBg,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    borderRightWidth: 1,
    borderRightColor: C.line,
  },
  lineNum: {
    width: 28,
    textAlign: "right",
    fontFamily: MONO_FONT,
    fontSize: 10,
    lineHeight: DIFF_LINE_HEIGHT,
    fontVariant: ["tabular-nums"],
  },
  signBox: {
    width: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  signText: {
    fontFamily: MONO_FONT,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: DIFF_LINE_HEIGHT,
  },
  codeBox: {
    flex: 1,
    paddingRight: 8,
    justifyContent: "center",
  },
  codeText: {
    fontFamily: MONO_FONT,
    fontSize: 11,
    lineHeight: DIFF_LINE_HEIGHT,
  },
});
