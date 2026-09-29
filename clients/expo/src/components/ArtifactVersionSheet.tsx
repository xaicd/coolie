import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { CompanyArtifact, WorkProductVersion } from "@coolie/api-client";
import { C, COOLIE_BASE_URL, coolie } from "../coolie";
import { Sheet } from "../ui/Sheet";
import { RADIUS, SPACING } from "../ui/tokens";
import { openInExternalApp } from "../utils/openExternalApp";

/**
 * wave141 — 交付物版本历史抽屉。
 *
 * 一个逻辑交付物 (同任务 + 同文件名) 每次修改上传都会追加一个版本; 这里展示
 * 完整版本链 (v1/v2/v3…), 可预览任意版本、下载任意版本, 或把某版标记为最新
 * (回滚/置顶, 服务端留 activity log)。
 */
export function ArtifactVersionSheet({
  visible,
  artifact,
  onClose,
  onOpenVersion,
  onChanged,
}: {
  visible: boolean;
  artifact: CompanyArtifact | null;
  onClose: () => void;
  onOpenVersion?: (version: WorkProductVersion) => void;
  onChanged?: () => void;
}) {
  const [versions, setVersions] = useState<WorkProductVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const workProductId = artifact?.id?.replace(/^work_product:/, "") ?? null;

  const load = useCallback(async () => {
    if (!workProductId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await coolie.listWorkProductVersions(workProductId);
      setVersions(res.versions);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, [workProductId]);

  useEffect(() => {
    if (visible && workProductId) {
      void load();
    } else if (!visible) {
      setVersions([]);
      setError(null);
    }
  }, [visible, workProductId, load]);

  const activate = useCallback(
    async (version: WorkProductVersion) => {
      if (!workProductId || version.isLatest) return;
      setActivatingId(version.id);
      try {
        await coolie.activateWorkProductVersion(workProductId, version.id);
        await load();
        onChanged?.();
      } catch (e) {
        setError(String((e as Error)?.message ?? e));
      } finally {
        setActivatingId(null);
      }
    },
    [workProductId, load, onChanged],
  );

  if (!visible) return null;

  return (
    <Sheet onClose={onClose} title="版本历史" maxHeight={480}>
      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {artifact ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {artifact.title} · 共 {versions.length || artifact.version?.count || 1} 版
          </Text>
        ) : null}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={C.accent} />
          </View>
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : versions.length === 0 ? (
          <Text style={styles.empty}>暂无版本记录</Text>
        ) : (
          versions.map((version) => (
            <View
              key={version.id}
              style={[styles.row, version.isLatest && styles.rowLatest]}
            >
              <View style={styles.rowHead}>
                <Text style={styles.versionTag}>v{version.versionNumber}</Text>
                {version.isLatest ? <Text style={styles.latestTag}>最新</Text> : null}
              </View>
              <View style={styles.rowMeta}>
                <Text style={styles.metaText} numberOfLines={1}>
                  {formatVersionTime(version.createdAt)}
                  {version.byteSize != null ? ` · ${formatBytes(version.byteSize)}` : ""}
                  {version.createdByAgent?.name ? ` · 🤖 ${version.createdByAgent.name}` : ""}
                </Text>
                {version.contentSha256 ? (
                  <Text style={styles.shaText} numberOfLines={1}>
                    sha256 {version.contentSha256.slice(0, 12)}
                  </Text>
                ) : null}
                {version.versionNote ? (
                  <Text style={styles.noteText} numberOfLines={2}>
                    {version.versionNote}
                  </Text>
                ) : null}
              </View>
              <View style={styles.rowActions}>
                {onOpenVersion && (version.openPath || version.contentPath) ? (
                  <Pressable
                    style={styles.actionBtn}
                    onPress={() => {
                      onOpenVersion(version);
                      onClose();
                    }}
                  >
                    <Text style={styles.actionText}>预览</Text>
                  </Pressable>
                ) : null}
                {version.downloadPath || version.contentPath ? (
                  <Pressable
                    style={styles.actionBtn}
                    onPress={() => {
                      const path = version.downloadPath || version.contentPath;
                      if (!path) return;
                      void openInExternalApp(absoluteUrl(path), true).catch(() => {});
                    }}
                  >
                    <Text style={styles.actionText}>下载</Text>
                  </Pressable>
                ) : null}
                {!version.isLatest ? (
                  <Pressable
                    style={styles.actionBtnPrimary}
                    disabled={activatingId === version.id}
                    onPress={() => void activate(version)}
                  >
                    <Text style={styles.actionTextPrimary}>
                      {activatingId === version.id ? "处理中…" : "设为最新"}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </Sheet>
  );
}

function absoluteUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${COOLIE_BASE_URL}${clean}`;
}

function formatVersionTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  list: {
    gap: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  subtitle: {
    color: C.ink4,
    fontSize: 12,
    paddingHorizontal: SPACING.xs,
    paddingBottom: SPACING.xs,
  },
  center: {
    paddingVertical: SPACING.xl,
    alignItems: "center",
  },
  error: {
    color: C.err,
    fontSize: 13,
    padding: SPACING.md,
  },
  empty: {
    color: C.ink3,
    fontSize: 13,
    padding: SPACING.md,
    textAlign: "center",
  },
  row: {
    borderWidth: 1,
    borderColor: C.lineSubtle,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.sm,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  rowLatest: {
    borderColor: C.accent,
    backgroundColor: "rgba(94, 106, 210, 0.08)",
  },
  rowHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  versionTag: {
    color: C.ink,
    fontSize: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  latestTag: {
    color: C.accent,
    fontSize: 11,
    fontWeight: "600",
    borderWidth: 1,
    borderColor: C.accent,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  rowMeta: {
    gap: 2,
  },
  metaText: {
    color: C.ink3,
    fontSize: 12,
  },
  shaText: {
    color: C.ink4,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  noteText: {
    color: C.ink2,
    fontSize: 12,
  },
  rowActions: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: 2,
  },
  actionBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  actionText: {
    color: C.ink2,
    fontSize: 12,
    fontWeight: "500",
  },
  actionBtnPrimary: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    backgroundColor: C.brand,
  },
  actionTextPrimary: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
});
