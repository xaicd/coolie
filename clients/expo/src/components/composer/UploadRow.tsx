import { useCallback } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { C } from "../../coolie";
import { ELEVATION, RADIUS, SPACING } from "../../ui/tokens";

/**
 * A file picked in the composer but not yet uploaded.
 *
 * The upload cannot happen at pick time: the Coolie Web composer attaches via
 * `issuesApi.uploadAttachment(companyId, issue.id, file)`, which needs an issue
 * id, so files are staged here and flushed once the create call answers (see
 * `useComposerFields`).
 */
export interface StagedAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  /** Local URI handed straight to `FormData` by the upload call. */
  uri: string;
}

/**
 * The composer's `Upload` control — the App half of the Coolie Web
 * `NewIssueDialog` attachment staging.
 *
 * Upstream stages files from a hidden `<input type="file">` (or a drop), shows
 * them in a removable list, and uploads them after the task exists. Here the
 * picker is `expo-document-picker` (the native equivalent of that file input);
 * the staged list and the remove affordance mirror the web layout.
 */
export function UploadRow({
  files,
  onChange,
  disabled = false,
}: {
  files: StagedAttachment[];
  onChange: (files: StagedAttachment[]) => void;
  disabled?: boolean;
}) {
  const pick = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        multiple: true,
        // Copy into the app cache: a `content://` URI from the system picker is
        // not always still readable by the time the create call returns.
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const picked: StagedAttachment[] = result.assets.map((asset) => ({
        id: `${asset.uri}:${asset.size ?? 0}`,
        name: asset.name,
        mimeType: asset.mimeType ?? "application/octet-stream",
        size: asset.size ?? null,
        uri: asset.uri,
      }));
      const seen = new Set(files.map((file) => file.id));
      onChange([...files, ...picked.filter((file) => !seen.has(file.id))]);
    } catch (e) {
      Alert.alert("选择文件失败", String((e as Error)?.message ?? e));
    }
  }, [files, onChange]);

  return (
    <View style={styles.block}>
      <View style={styles.row}>
        <Text style={styles.label}>Upload</Text>
        <Pressable
          onPress={() => void pick()}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="添加附件"
          style={({ pressed }) => [
            styles.uploadBtn,
            pressed && styles.uploadBtnPressed,
            disabled && styles.disabled,
          ]}
        >
          <Ionicons name="cloud-upload-outline" size={14} color={C.ink3} />
          <Text style={styles.uploadText}>Upload</Text>
        </Pressable>
        {files.length > 0 ? (
          <Text style={styles.count}>{files.length} 个附件</Text>
        ) : null}
      </View>

      {files.length > 0 ? (
        <View style={styles.list}>
          {files.map((file) => (
            <View key={file.id} style={styles.item}>
              <Ionicons name="document-outline" size={14} color={C.ink4} />
              <View style={styles.itemText}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {file.name}
                </Text>
                <Text style={styles.itemMeta} numberOfLines={1}>
                  {file.mimeType}
                  {file.size !== null ? ` · ${formatBytes(file.size)}` : ""}
                </Text>
              </View>
              <Pressable
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`移除 ${file.name}`}
                onPress={() => onChange(files.filter((entry) => entry.id !== file.id))}
              >
                <Ionicons name="close" size={15} color={C.ink3} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Same shape as the web composer's `formatFileSize`. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  block: {
    gap: SPACING.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  label: {
    color: C.ink4,
    fontSize: 13,
  },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: ELEVATION.base,
  },
  uploadBtnPressed: {
    backgroundColor: ELEVATION.active,
  },
  disabled: {
    opacity: 0.4,
  },
  uploadText: {
    color: C.ink3,
    fontSize: 12,
    fontWeight: "500",
  },
  count: {
    color: C.ink4,
    fontSize: 11,
  },
  list: {
    gap: 6,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  itemText: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    color: C.ink2,
    fontSize: 13,
  },
  itemMeta: {
    color: C.ink4,
    fontSize: 11,
  },
});
