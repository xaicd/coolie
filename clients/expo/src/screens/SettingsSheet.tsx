import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../coolie";
import { Sheet } from "../ui/Sheet";
import { useOTA } from "../OTA";
import { downloadApk, localVersion, type RemoteVersionInfo } from "../AppVersion";

/** 统计并清理 App 缓存目录，返回可读大小 */
async function clearAppCache(): Promise<string> {
  try {
    const FS = await import("expo-file-system");
    const cacheDir = FS.cacheDirectory;
    if (!cacheDir) return "0 KB";
    await FS.deleteAsync(cacheDir, { idempotent: true });
    return "已全部清理";
  } catch {
    return "清理失败";
  }
}

async function measureCache(): Promise<string> {
  try {
    const FS = await import("expo-file-system");
    const cacheDir = FS.cacheDirectory;
    if (!cacheDir) return "0 KB";
    let total = 0;
    const walk = async (dir: string) => {
      const items = await FS.readDirectoryAsync(dir);
      for (const name of items) {
        const full = dir.endsWith("/") ? dir + name : `${dir}/${name}`;
        const info = await FS.getInfoAsync(full);
        if (info.exists && !info.isDirectory) total += info.size ?? 0;
        else if (info.exists && info.isDirectory) await walk(full + "/");
      }
    };
    await walk(cacheDir);
    return total > 1048576
      ? `${(total / 1048576).toFixed(1)} MB`
      : `${Math.ceil(total / 1024)} KB`;
  } catch {
    return "-";
  }
}

/** 应用升级卡片：新版本提示 + 一键下载 APK */
export function AppUpdateCard({
  info,
  onClose,
}: {
  info: RemoteVersionInfo;
  onClose: () => void;
}) {
  const [downloading, setDownloading] = useState(false);
  return (
    <View style={styles.updateBanner}>
      <View style={styles.updateMain}>
        <Text style={styles.updateTitle}>📦 新版本 v{info.version}</Text>
        {info.releaseNotes ? (
          <Text style={styles.updateNotes} numberOfLines={2}>
            {info.releaseNotes}
          </Text>
        ) : null}
      </View>
      <Pressable
        style={[styles.updateBtn, downloading && styles.btnDisabled]}
        disabled={downloading}
        onPress={async () => {
          setDownloading(true);
          const ok = await downloadApk(info.downloadUrl);
          setDownloading(false);
          if (!ok) Alert.alert("下载失败", "请稍后重试");
        }}
      >
        <Text style={styles.updateBtnText}>{downloading ? "拉起中…" : "升级"}</Text>
      </Pressable>
      <Pressable onPress={onClose} hitSlop={8}>
        <Ionicons name="close" size={18} color={C.ink4} />
      </Pressable>
    </View>
  );
}

export function SettingsSheet({
  whoami,
  ota,
  onClose,
  onSignOut,
}: {
  whoami: string;
  ota: ReturnType<typeof useOTA>;
  onClose: () => void;
  onSignOut: () => void;
}) {
  const [cacheSize, setCacheSize] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const appVer = localVersion();

  useEffect(() => {
    void measureCache().then(setCacheSize);
  }, []);

  return (
    <Sheet
      onClose={onClose}
      modal={false}
      title="设置"
      style={styles.settingsBackdrop}
    >
      {/* 我的名片 */}
      <View style={styles.profileCard}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileAvatarText}>
            {whoami.slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={styles.profileMain}>
          <Text style={styles.profileName} numberOfLines={1}>
            {whoami}
          </Text>
          <Text style={styles.profileMeta}>Coolie工坊 · 管理员</Text>
        </View>
        <View style={styles.versionChip}>
          <Text style={styles.versionChipText}>v{appVer}</Text>
        </View>
      </View>

      {/* App 设置分组 */}
      <Text style={styles.settingsGroup}>应用</Text>
      <Pressable
        style={styles.settingsRow}
        disabled={ota.isChecking}
        onPress={() => void ota.checkUpdate(true)}
      >
        <Ionicons name="cloud-download-outline" size={20} color={C.ink3} />
        <Text style={styles.settingsRowLabel}>版本与更新 (OTA)</Text>
        <Text style={styles.settingsRowValue}>
          {ota.isChecking ? "检查中…" : (ota.runtimeVersion ?? appVer)}
        </Text>
      </Pressable>
      <Pressable
        style={styles.settingsRow}
        disabled={clearing}
        onPress={async () => {
          setClearing(true);
          const size = await clearAppCache();
          setCacheSize(size);
          setClearing(false);
          Alert.alert("缓存已清理", `释放 ${size}`);
        }}
      >
        <Ionicons name="trash-outline" size={20} color={C.ink3} />
        <Text style={styles.settingsRowLabel}>清理缓存</Text>
        <Text style={styles.settingsRowValue}>
          {clearing ? "清理中…" : (cacheSize ?? "计算中…")}
        </Text>
      </Pressable>

      <Pressable style={styles.settingsSignOut} onPress={onSignOut}>
        <Text style={styles.settingsSignOutText}>退出登录</Text>
      </Pressable>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  updateBanner: {
    position: "absolute",
    top: 8,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: C.brand,
    zIndex: 90,
  },
  updateMain: { flex: 1 },
  updateTitle: { color: C.ink, fontSize: 14, fontWeight: "700" },
  updateNotes: { color: C.ink3, fontSize: 11, marginTop: 2 },
  updateBtn: {
    backgroundColor: C.brand,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  updateBtnText: { color: C.ink, fontSize: 13, fontWeight: "600" },
  settingsBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 6,
  },
  profileAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: C.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  profileAvatarText: { color: C.ink, fontSize: 18, fontWeight: "700" },
  profileMain: { flex: 1 },
  profileName: { color: C.ink, fontSize: 16, fontWeight: "700" },
  profileMeta: { color: C.ink3, fontSize: 12, marginTop: 2 },
  versionChip: {
    backgroundColor: C.panel,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  versionChipText: { color: C.accent, fontSize: 11, fontWeight: "600" },
  settingsGroup: {
    color: C.ink4,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 14,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 13,
  },
  settingsRowLabel: { color: C.ink2, fontSize: 15, flex: 1 },
  settingsRowValue: { color: C.ink3, fontSize: 13, flexShrink: 1 },
  settingsSignOut: {
    marginTop: 10,
    backgroundColor: C.surface,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  settingsSignOutText: { color: C.err, fontSize: 15, fontWeight: "600" },
  btnDisabled: { opacity: 0.4 },
});
