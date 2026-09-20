import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, COOLIE_BASE_URL, type IssueAttachment } from "../../coolie";
import { formatBytes } from "../../utils/format";

export interface AttachmentRowProps {
  attachment: IssueAttachment;
}

/** 任务附件行: 文件名 + 大小, 点按用系统浏览器打开 */
export function AttachmentRow({ attachment }: AttachmentRowProps) {
  const fileName =
    attachment.filename || attachment.originalFilename || "未命名附件";
  const sizeStr =
    typeof attachment.byteSize === "number"
      ? formatBytes(attachment.byteSize)
      : "未知大小";
  const contentPath = attachment.contentPath;
  const targetUrl = contentPath
    ? contentPath.startsWith("http")
      ? contentPath
      : `${COOLIE_BASE_URL}${contentPath}`
    : null;

  return (
    <Pressable
      style={styles.attachmentItem}
      onPress={() => {
        if (!targetUrl) return;
        void Linking.openURL(targetUrl).catch(() => {
          Alert.alert("无法打开附件链接", targetUrl);
        });
      }}
    >
      <Ionicons
        name="document-attach-outline"
        size={18}
        color={C.accent}
        style={styles.attachmentIcon}
      />
      <View style={styles.attachmentMain}>
        <Text style={styles.attachmentName} numberOfLines={1}>
          {fileName}
        </Text>
        <Text style={styles.attachmentSize}>{sizeStr}</Text>
      </View>
      {targetUrl ? (
        <Ionicons name="open-outline" size={16} color={C.ink3} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  attachmentItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
    padding: 10,
  },
  attachmentIcon: { marginRight: 10 },
  attachmentMain: { flex: 1 },
  attachmentName: {
    color: C.ink,
    fontSize: 13,
    fontWeight: "500",
  },
  attachmentSize: {
    color: C.ink4,
    fontSize: 11,
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
});
