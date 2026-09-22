import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../../coolie";
import { ELEVATION, RADIUS, SPACING } from "../../ui/tokens";

/** 一颗工具栏按钮的动作。 */
export interface MarkdownAction {
  key: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  /** 行首前缀 (标题 / 列表), 与 `wrap` 互斥。 */
  prefix?: string;
  /** 把选区包在前后缀里 (粗体 / 斜体 / 代码)。 */
  wrap?: [string, string];
  /** 链接: 包住选中的文字, 光标停在 url 位。 */
  link?: boolean;
}

const ACTIONS: MarkdownAction[] = [
  { key: "h2", icon: "text-outline", label: "标题", prefix: "## " },
  { key: "bold", icon: "browsers-outline", label: "粗体", wrap: ["**", "**"] },
  { key: "italic", icon: "text-outline", label: "斜体", wrap: ["*", "*"] },
  { key: "list", icon: "list-outline", label: "列表", prefix: "- " },
  { key: "code", icon: "code-slash-outline", label: "行内代码", wrap: ["`", "`"] },
  { key: "link", icon: "link-outline", label: "链接", link: true },
];

export interface MarkdownEditResult {
  text: string;
  /** 应用后应当选中的区间 —— 让用户接着打字就是补全占位符。 */
  selection: { start: number; end: number };
}

/**
 * 在 `text` 上应用一个 markdown 动作。
 *
 * 纯函数、无 I/O, 好单独核对: 所有动作都是「拿当前文本 + 当前选区, 算出新文本和
 * 新选区」, 组件层只负责把结果写回 TextInput。
 */
export function applyMarkdownAction(
  text: string,
  selection: { start: number; end: number },
  action: MarkdownAction,
): MarkdownEditResult {
  const start = Math.max(0, Math.min(selection.start, text.length));
  const end = Math.max(start, Math.min(selection.end, text.length));
  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);

  if (action.prefix) {
    // 行首前缀: 落在光标所在行的开头, 本来就带同样前缀则先剥掉 (再点一次取消)。
    const lineStart = before.lastIndexOf("\n") + 1;
    const line = text.slice(lineStart, end);
    if (line.startsWith(action.prefix)) {
      const stripped = text.slice(0, lineStart) + text.slice(lineStart + action.prefix.length);
      return {
        text: stripped,
        selection: { start: start - action.prefix.length, end: end - action.prefix.length },
      };
    }
    const next = text.slice(0, lineStart) + action.prefix + text.slice(lineStart);
    return {
      text: next,
      selection: { start: start + action.prefix.length, end: end + action.prefix.length },
    };
  }

  if (action.link) {
    const label = selected || "链接文字";
    const inserted = `[${label}](url)`;
    return {
      text: before + inserted + after,
      selection: {
        start: start + inserted.length - 4,
        end: start + inserted.length - 1,
      },
    };
  }

  if (action.wrap) {
    const [open, close] = action.wrap;
    const inserted = open + selected + close;
    return {
      text: before + inserted + after,
      selection: {
        start: start + open.length,
        end: start + open.length + selected.length,
      },
    };
  }

  return { text, selection: { start, end } };
}

/**
 * 「Markdown 编辑器」工具栏 —— 上游 `NewIssueDialog` 的描述区是
 * `MarkdownEditor` (带格式工具); App 的 TextInput 没有富文本层, 这一行给出同样的
 * 格式动作, 直接改写描述文本本身 (纯文本 markdown, 与上游存的是同一份 markdown)。
 */
export function MarkdownToolbar({
  value,
  selection,
  onChange,
  disabled = false,
}: {
  value: string;
  selection: { start: number; end: number };
  onChange: (next: MarkdownEditResult) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>Markdown</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.actions}
        keyboardShouldPersistTaps="handled"
      >
        {ACTIONS.map((action) => (
          <Pressable
            key={action.key}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            disabled={disabled}
            onPress={() => onChange(applyMarkdownAction(value, selection, action))}
            style={({ pressed }) => [
              styles.btn,
              pressed && styles.btnPressed,
              disabled && styles.disabled,
            ]}
          >
            <Ionicons name={action.icon} size={13} color={C.ink3} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  label: {
    color: C.ink4,
    fontSize: 12,
  },
  actions: {
    gap: 6,
    paddingRight: SPACING.md,
  },
  btn: {
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 26,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: ELEVATION.base,
  },
  btnPressed: {
    backgroundColor: ELEVATION.active,
  },
  disabled: {
    opacity: 0.4,
  },
});
