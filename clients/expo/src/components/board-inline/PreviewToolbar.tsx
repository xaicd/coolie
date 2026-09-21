/**
 * 预览工具条
 *
 * 抄 DigitalStaff PreviewPanel.tsx 顶部那排按钮的设计意图 —— 全屏 / 外链 / 刷新
 * 三件套, 外加加载转圈与错误红字。RN 版把 viewport 切换 (desktop/tablet/mobile)
 * 省掉: 手机上换视口宽度没有意义, 真正的兜底是"外部浏览器打开"。
 */

import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { C } from "../../coolie";
import { RADIUS, SPACING } from "../../ui/tokens";

export interface PreviewToolbarProps {
  /** [全屏] —— 父组件决定是全屏 Modal 还是切到别的 Tab */
  onFullscreen?: () => void;
  /** [外部浏览器打开] —— 兜底通道, WebView 跑不动时的逃生口 */
  onExternal?: () => void;
  /** [重试] —— 仅在 error 非空时出现 */
  onRetry?: () => void;
  /** 加载中: 转圈 + 禁用按钮 */
  loading?: boolean;
  /** 错误文案: 非空时展示红字并露出重试 */
  error?: string | null;
  /** 左侧标题/地址栏文案 */
  title?: string;
  style?: StyleProp<ViewStyle>;
}

export function PreviewToolbar({
  onFullscreen,
  onExternal,
  onRetry,
  loading = false,
  error = null,
  title,
  style,
}: PreviewToolbarProps) {
  return (
    <View style={[styles.bar, style]}>
      <View style={styles.left}>
        {loading ? (
          <ActivityIndicator size="small" color={C.accent} style={styles.spinner} />
        ) : null}
        <View style={styles.titleStack}>
          <Text style={styles.title} numberOfLines={1}>
            {title || "预览"}
          </Text>
          {error ? (
            <Text style={styles.error} numberOfLines={2}>
              ⚠️ {error}
            </Text>
          ) : (
            <Text style={styles.subtitle} numberOfLines={1}>
              {loading ? "加载中…" : "就绪"}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.actions}>
        {error && onRetry ? (
          <Pressable
            hitSlop={8}
            onPress={onRetry}
            disabled={loading}
            style={[styles.btn, loading && styles.btnDisabled]}
          >
            <Text style={styles.btnText}>重试</Text>
          </Pressable>
        ) : null}

        {onFullscreen ? (
          <Pressable
            hitSlop={8}
            onPress={onFullscreen}
            disabled={loading}
            style={[styles.btn, loading && styles.btnDisabled]}
          >
            <Text style={styles.btnText}>⤢ 全屏</Text>
          </Pressable>
        ) : null}

        {onExternal ? (
          <Pressable
            hitSlop={8}
            onPress={onExternal}
            style={styles.btn}
          >
            <Text style={styles.btnText}>↗ 外链</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: C.panel,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  left: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  spinner: {
    marginRight: 2,
  },
  titleStack: {
    flex: 1,
  },
  title: {
    color: C.ink,
    fontSize: 13,
    fontWeight: "500",
  },
  subtitle: {
    color: C.ink4,
    fontSize: 10,
    marginTop: 1,
  },
  error: {
    color: C.err,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 1,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  btn: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
  },
  btnDisabled: {
    opacity: 0.4,
  },
  btnText: {
    color: C.ink2,
    fontSize: 12,
    fontWeight: "500",
  },
});
