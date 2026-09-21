/**
 * 预览 Tab —— 就地加载 store 里的预览地址
 *
 * 复用 InlinePreviewPanel (webview + 图片双路), 地址来自 useWorkspaceStore,
 * 初始值 = 生产实例 https://xrobinai.cn。顶部给一个可直接改地址的输入框 +
 * [重置 URL] —— 对齐 ChatHome 预览抽屉里"能换地址重开"的用法。
 */

import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../../coolie";
import { RADIUS, SPACING } from "../../ui/tokens";
import { InlinePreviewPanel } from "../../components/board-inline/InlinePreviewPanel";
import { DEFAULT_PREVIEW_URL, useWorkspaceStore } from "./useWorkspaceStore";

export function PreviewTab() {
  const previewUrl = useWorkspaceStore((s) => s.previewUrl);
  const setUrl = useWorkspaceStore((s) => s.setUrl);
  const reset = useWorkspaceStore((s) => s.reset);
  const [draft, setDraft] = useState(previewUrl);

  // store 里地址被别处改写 (文件树 / 终端 cat) 时, 同步回输入框
  React.useEffect(() => {
    setDraft(previewUrl);
  }, [previewUrl]);

  const apply = useCallback(() => {
    setUrl(draft);
  }, [draft, setUrl]);

  const handleReset = useCallback(() => {
    reset();
    setUrl(DEFAULT_PREVIEW_URL);
    setDraft(DEFAULT_PREVIEW_URL);
  }, [reset, setUrl]);

  const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(previewUrl);

  return (
    <View style={styles.wrap}>
      <View style={styles.addressBar}>
        <Ionicons name="link-outline" size={14} color={C.ink3} />
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="https://…"
          placeholderTextColor={C.ink4}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={apply}
        />
        <Pressable style={styles.applyBtn} onPress={apply}>
          <Text style={styles.applyBtnText}>打开</Text>
        </Pressable>
        <Pressable style={styles.resetBtn} onPress={handleReset}>
          <Text style={styles.resetBtnText}>重置 URL</Text>
        </Pressable>
      </View>

      <View style={styles.panelWrap}>
        {isImage ? (
          <InlinePreviewPanel imageUrl={previewUrl} title="图片预览" compact={false} />
        ) : (
          <InlinePreviewPanel url={previewUrl} title={previewUrl} />
        )}
      </View>

      <Text style={styles.footnote}>
        预览地址会随工作空间一起持久化 (expo-file-system → zustand persist)
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: C.bg,
  },
  addressBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  input: {
    flex: 1,
    color: C.ink,
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderColor: C.lineSubtle,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
  },
  applyBtn: {
    backgroundColor: C.brand,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
  },
  applyBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "500",
  },
  resetBtn: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 7,
  },
  resetBtnText: {
    color: C.ink2,
    fontSize: 12,
  },
  panelWrap: {
    flex: 1,
    padding: SPACING.md,
  },
  footnote: {
    color: C.ink4,
    fontSize: 10,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
});

export default PreviewTab;
