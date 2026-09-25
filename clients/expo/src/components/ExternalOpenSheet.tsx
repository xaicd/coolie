import React, { useCallback } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../coolie";
import { Sheet } from "../ui/Sheet";
import { RADIUS, SPACING } from "../ui/tokens";
import { copyUrlToClipboard, openInQQBrowser } from "../utils/openExternalApp";

export interface ExternalOpenSheetProps {
  visible: boolean;
  url: string | null;
  title?: string;
  subtitle?: string;
  onClose: () => void;
}

/**
 * 外部应用与浏览器打开选择底栏。
 * 支持用户一键拉起 QQ 浏览器、系统浏览器或复制链接。
 */
export function ExternalOpenSheet({
  visible,
  url,
  title = "选择打开方式",
  subtitle,
  onClose,
}: ExternalOpenSheetProps) {
  const handleOpenQQ = useCallback(async () => {
    if (!url) return;
    onClose();
    const success = await openInQQBrowser(url);
    if (!success) {
      Alert.alert(
        "未检测到 QQ 浏览器",
        "本机可能未安装 QQ 浏览器，是否直接调用系统默认浏览器打开？",
        [
          { text: "取消", style: "cancel" },
          {
            text: "使用系统浏览器",
            onPress: () => void Linking.openURL(url),
          },
        ],
      );
    }
  }, [url, onClose]);

  const handleOpenSystem = useCallback(() => {
    if (!url) return;
    onClose();
    void Linking.openURL(url).catch(() => {
      Alert.alert("打开失败", "无法呼起系统外部应用，请检查链接有效性。");
    });
  }, [url, onClose]);

  const handleCopy = useCallback(() => {
    if (!url) return;
    onClose();
    copyUrlToClipboard(url);
  }, [url, onClose]);

  if (!visible || !url) return null;

  return (
    <Sheet onClose={onClose} title={title}>
      <View style={styles.container}>
        {/* 推荐提示条 */}
        <View style={styles.noticeBox}>
          <Text style={styles.noticeIcon}>💡</Text>
          <Text style={styles.noticeText}>
            {subtitle ||
              "针对 MVP 原型演示与各类工程文档（Word / Excel / PPT / PDF / H5），推荐使用 QQ 浏览器，内置腾讯 TBS 内核支持免装 Office 高保真秒开。"}
          </Text>
        </View>

        {/* 选项 1: QQ 浏览器 */}
        <Pressable
          style={({ pressed }) => [styles.optionRow, styles.optionPrimary, pressed && styles.optionPressed]}
          onPress={handleOpenQQ}
        >
          <View style={styles.iconWrapQQ}>
            <Text style={styles.qqIconText}>🐧</Text>
          </View>
          <View style={styles.optionContent}>
            <View style={styles.optionTitleRow}>
              <Text style={styles.optionTitlePrimary}>QQ 浏览器打开</Text>
              <View style={styles.recommendBadge}>
                <Text style={styles.recommendBadgeText}>推荐 (TBS秒开)</Text>
              </View>
            </View>
            <Text style={styles.optionSub}>免 Office 插件高保真渲染，极速交互体验</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.accent} />
        </Pressable>

        {/* 选项 2: 系统浏览器 */}
        <Pressable
          style={({ pressed }) => [styles.optionRow, pressed && styles.optionPressed]}
          onPress={handleOpenSystem}
        >
          <View style={styles.iconWrapSystem}>
            <Ionicons name="globe-outline" size={20} color={C.ink2} />
          </View>
          <View style={styles.optionContent}>
            <Text style={styles.optionTitle}>系统默认浏览器 / 应用</Text>
            <Text style={styles.optionSub}>调用手机系统自带应用选择器打开</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.ink4} />
        </Pressable>

        {/* 选项 3: 复制链接 */}
        <Pressable
          style={({ pressed }) => [styles.optionRow, pressed && styles.optionPressed]}
          onPress={handleCopy}
        >
          <View style={styles.iconWrapCopy}>
            <Ionicons name="copy-outline" size={20} color={C.ink2} />
          </View>
          <View style={styles.optionContent}>
            <Text style={styles.optionTitle}>复制链接地址</Text>
            <Text style={styles.optionSub} numberOfLines={1}>
              {url}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.ink4} />
        </Pressable>

        {/* 取消按钮 */}
        <Pressable style={styles.cancelBtn} onPress={onClose}>
          <Text style={styles.cancelText}>取消</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.lg,
    paddingTop: SPACING.xs,
  },
  noticeBox: {
    flexDirection: "row",
    backgroundColor: "rgba(113, 112, 255, 0.08)",
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: "rgba(113, 112, 255, 0.2)",
    alignItems: "flex-start",
  },
  noticeIcon: {
    fontSize: 14,
    marginRight: 6,
    marginTop: 1,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: C.ink2,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  optionPrimary: {
    borderColor: "rgba(113, 112, 255, 0.4)",
    backgroundColor: "rgba(113, 112, 255, 0.04)",
  },
  optionPressed: {
    opacity: 0.8,
  },
  iconWrapQQ: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0, 164, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.sm,
  },
  qqIconText: {
    fontSize: 18,
  },
  iconWrapSystem: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.sm,
  },
  iconWrapCopy: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.sm,
  },
  optionContent: {
    flex: 1,
  },
  optionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  optionTitlePrimary: {
    fontSize: 14,
    fontWeight: "600",
    color: C.ink,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: C.ink,
  },
  recommendBadge: {
    backgroundColor: C.accent,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 6,
  },
  recommendBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: C.ink,
  },
  optionSub: {
    fontSize: 11,
    color: C.ink3,
    marginTop: 2,
  },
  cancelBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.md,
    marginTop: SPACING.xs,
  },
  cancelText: {
    fontSize: 14,
    color: C.ink3,
    fontWeight: "500",
  },
});
