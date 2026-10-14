import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { C } from "../coolie";
import { RADIUS, SPACING } from "./tokens";

export interface SheetProps {
  onClose: () => void;
  children: ReactNode;
  title?: string;
  modal?: boolean;
  maxHeight?: number;
  contentStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  /**
   * 内容超高时局部滚动 (把手 + 标题保持固定, 正文独立滚动)。
   * 用于实体 360/动词抽屉等正文可能超出视口的场景, 避免底部动词按钮被推出屏幕不可达。
   */
  scrollable?: boolean;
}

/** 底部抽屉骨架: 遮罩 + 把手 + panel 圆角 18 (DESIGN.md 第3节) */
export function Sheet({
  onClose,
  children,
  title,
  modal = true,
  maxHeight,
  contentStyle,
  style,
  scrollable = false,
}: SheetProps) {
  const body = (
    <View style={[styles.backdrop, modal ? styles.backdropFill : null, style]}>
      <Pressable style={styles.dismiss} onPress={onClose} />
      <View style={[styles.sheet, maxHeight ? { maxHeight } : null, contentStyle]}>
        <View style={styles.handle} />
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {scrollable ? (
          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            {children}
          </ScrollView>
        ) : (
          children
        )}
      </View>
    </View>
  );

  if (!modal) return body;

  return (
    <Modal
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal={true}
    >
      {body}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  backdropFill: {
    flex: 1,
  },
  dismiss: {
    flex: 1,
  },
  sheet: {
    backgroundColor: C.panel,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: 18,
    paddingBottom: 34,
    paddingTop: 10,
    gap: SPACING.xs,
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.surfaceHover,
    marginBottom: 10,
  },
  title: {
    color: C.ink,
    fontSize: 17,
    fontWeight: "600",
    marginBottom: SPACING.sm,
  },
  scrollView: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: SPACING.sm,
  },
});
