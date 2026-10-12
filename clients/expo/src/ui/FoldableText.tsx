import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from "react-native";
import { C } from "../theme";

/**
 * FoldableText —— 6 寸屏长文本折叠原子组件 (wave376 · 老板 6 寸屏防信息轰炸铁律)。
 *
 * 列表 / 卡片上的描述文本超过 `threshold` 时默认只显示 `maxLines` 行并以省略号
 * 截断, 尾部提供纯两字「展开 / 收起」就地切换, 严禁未经截断直接把数百字
 * Markdown 报告或底层调试 JSON 平铺进卡片。
 */
export function FoldableText({
  text,
  maxLines = 2,
  threshold = 48,
  style,
  toggleStyle,
}: {
  text: string;
  maxLines?: number;
  threshold?: number;
  style?: StyleProp<TextStyle>;
  toggleStyle?: StyleProp<TextStyle>;
}) {
  const [expanded, setExpanded] = useState(false);
  const merged = (text ?? "").toString();
  const needsFold = merged.trim().length > threshold;

  if (!needsFold) {
    return (
      <Text style={style} numberOfLines={maxLines} ellipsizeMode="tail">
        {merged}
      </Text>
    );
  }

  return (
    <View>
      <Text
        style={style}
        numberOfLines={expanded ? undefined : maxLines}
        ellipsizeMode="tail"
      >
        {merged}
      </Text>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={expanded ? "收起" : "展开"}
      >
        <Text style={[styles.toggle, toggleStyle]}>
          {expanded ? "收起" : "展开"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: {
    marginTop: 4,
    color: C.accent,
    fontSize: 12,
    fontWeight: "600",
  },
});
