import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Company, GitCredential } from "@coolie/api-client";
import { C, coolie, COOLIE_BASE_URL } from "../coolie";
import { ELEVATION, RADIUS, SPACING } from "../ui/tokens";
import { ScreenHeader } from "../ui/ScreenHeader";
import { localVersion } from "../AppVersion";
import type { useOTA } from "../OTA";

export interface SettingsScreenProps {
  company: Company;
  whoami: string;
  ota: ReturnType<typeof useOTA>;
  onBack: () => void;
  onSignOut: () => void;
  workspaceGitEnabled: boolean;
  onToggleWorkspaceGit: (next: boolean) => void;
  onOpenGitCredentials: () => void;
  onOpenPluginManager: () => void;
  onOpenNativeModules: () => void;
  onViewWhatsNew?: () => void;
}

/** 测算缓存目录大小 */
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

/** 清理缓存目录 */
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

/**
 * 原生移动端「设置」页面 (SettingsScreen)
 *
 * 遵循极简人机工程学、Palantir 控制面与 Grouped Inset Card 规范:
 * 1. 彻底根除旧版绝对定位挤压与排版走形;
 * 2. 身份、企业、环境端点透明化透出;
 * 3. 严格遵循纯两字操作按钮铁律 (【管理】、【配置】、【检查】、【清理】、【探测】、【查看】、【退出】);
 * 4. 具备完整 Agent-Native testID 契约与防误触二次确认保护。
 */
export function SettingsScreen({
  company,
  whoami,
  ota,
  onBack,
  onSignOut,
  workspaceGitEnabled,
  onToggleWorkspaceGit,
  onOpenGitCredentials,
  onOpenPluginManager,
  onOpenNativeModules,
  onViewWhatsNew,
}: SettingsScreenProps) {
  const [cacheSize, setCacheSize] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [gitCredentials, setGitCredentials] = useState<GitCredential[] | null>(null);
  const [loadingGit, setLoadingGit] = useState(false);

  const appVer = localVersion();

  // 加载缓存大小
  const refreshCache = useCallback(() => {
    void measureCache().then(setCacheSize);
  }, []);

  // 加载 Git 凭证状态
  const refreshGit = useCallback(async () => {
    setLoadingGit(true);
    try {
      const list = await coolie.listGitCredentials();
      setGitCredentials(list);
    } catch {
      setGitCredentials([]);
    } finally {
      setLoadingGit(false);
    }
  }, []);

  useEffect(() => {
    refreshCache();
    void refreshGit();
  }, [refreshCache, refreshGit]);

  // 计算 Git 摘要
  const gitSummary = (() => {
    if (loadingGit) return "读取中…";
    if (!gitCredentials || gitCredentials.length === 0) return "未绑定凭证";
    const first = gitCredentials[0];
    const label = first.repoUrl ? first.repoUrl : `${first.provider}`;
    return gitCredentials.length === 1 ? label : `${label} (+${gitCredentials.length - 1})`;
  })();

  // 区分端点环境标签
  const isProdEndpoint = COOLIE_BASE_URL.includes("xrobinai.cn");
  const endpointLabel = isProdEndpoint ? "生产·实体交付面" : "Dev·工坊建设面";

  // 清理缓存交互
  const handleClearCache = () => {
    Alert.alert("清理缓存", "确定清理本地临时文件与图片缓存？", [
      { text: "取消", style: "cancel" },
      {
        text: "清理",
        style: "destructive",
        onPress: async () => {
          setClearing(true);
          const size = await clearAppCache();
          setClearing(false);
          refreshCache();
          Alert.alert("缓存已清理", `释放容量: ${size}`);
        },
      },
    ]);
  };

  // 退出登录二次确认交互
  const handleSignOutConfirm = () => {
    Alert.alert("退出登录", "确定要退出当前账号？退出后需重新登录验证身份。", [
      { text: "取消", style: "cancel" },
      {
        text: "退出",
        style: "destructive",
        onPress: onSignOut,
      },
    ]);
  };

  // 检查版本更新交互
  const handleCheckUpdate = async () => {
    try {
      await ota.checkUpdate(true);
    } catch (e) {
      Alert.alert("检查失败", String((e as Error)?.message ?? e));
    }
  };

  return (
    <View style={styles.container} testID="SettingsScreen__Root">
      <ScreenHeader
        title="设置"
        onBack={onBack}
        divider
        style={styles.header}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── 1. 高管身份与名片 ── */}
        <View style={styles.profileCard} testID="Settings__ProfileCard">
          <View style={styles.profileHeaderRow}>
            <View style={styles.profileAvatarBox}>
              <Text style={styles.profileAvatarText}>
                {whoami ? whoami.slice(0, 1).toUpperCase() : "U"}
              </Text>
            </View>
            <View style={styles.profileInfoBox}>
              <Text style={styles.profileName} numberOfLines={1}>
                {whoami || "已登录高管"}
              </Text>
              <View style={styles.profileTagRow}>
                <View style={styles.companyTag}>
                  <Text style={styles.companyTagText} numberOfLines={1}>
                    🏢 {company?.name || "当前企业"}
                  </Text>
                </View>
                <View style={styles.roleTag}>
                  <Text style={styles.roleTagText}>高管中枢</Text>
                </View>
              </View>
            </View>
            <View style={styles.versionBadge}>
              <Text style={styles.versionBadgeText}>v{appVer}</Text>
            </View>
          </View>

          {/* 环境端点态势条 */}
          <View style={styles.endpointBanner}>
            <View style={styles.endpointLeft}>
              <View style={styles.onlineDot} />
              <Ionicons name="server-outline" size={13} color={C.ink3} />
              <Text style={styles.endpointUrl} numberOfLines={1}>
                {COOLIE_BASE_URL}
              </Text>
            </View>
            <View
              style={[
                styles.endpointPill,
                isProdEndpoint ? styles.endpointPillProd : styles.endpointPillDev,
              ]}
            >
              <Text
                style={[
                  styles.endpointPillText,
                  isProdEndpoint ? styles.endpointPillTextProd : styles.endpointPillTextDev,
                ]}
              >
                {endpointLabel}
              </Text>
            </View>
          </View>
        </View>

        {/* ── 2. 研发与协同 (GitOps) ── */}
        <View style={styles.groupSection}>
          <Text style={styles.groupTitle}>研发协同 (GITOPS)</Text>
          <View style={styles.cardGroup}>
            {/* Git 凭证管理 */}
            <Pressable
              style={styles.itemRow}
              onPress={onOpenGitCredentials}
              accessibilityRole="button"
              testID="Settings__GitCredentials__Row"
            >
              <View style={[styles.iconBox, { backgroundColor: "rgba(94, 106, 210, 0.14)" }]}>
                <Ionicons name="git-branch-outline" size={17} color={C.accent} />
              </View>
              <View style={styles.itemContent}>
                <Text style={styles.itemTitle}>Git 仓库凭证</Text>
                <Text style={styles.itemSubtitle} numberOfLines={1}>
                  {gitSummary}
                </Text>
              </View>
              <View style={styles.itemActionArea}>
                <View style={styles.twoCharBtn}>
                  <Text style={styles.twoCharBtnText}>管理</Text>
                </View>
                <Ionicons name="chevron-forward" size={15} color={C.ink4} />
              </View>
            </Pressable>

            <View style={styles.innerDivider} />

            {/* 本地 Workspace 推送 PR 开关 */}
            <View style={styles.itemRow} testID="Settings__WorkspaceGit__Row">
              <View style={[styles.iconBox, { backgroundColor: "rgba(39, 166, 68, 0.14)" }]}>
                <Ionicons name="cloud-upload-outline" size={17} color={C.ok} />
              </View>
              <View style={styles.itemContent}>
                <Text style={styles.itemTitle}>自动提交并推送 PR</Text>
                <Text style={styles.itemSubtitle}>
                  任务跑完后，agent 用凭证自动将分支推向远端
                </Text>
              </View>
              <Switch
                value={workspaceGitEnabled}
                onValueChange={onToggleWorkspaceGit}
                trackColor={{ false: C.line, true: C.accent }}
                thumbColor={workspaceGitEnabled ? C.accentHover : C.ink3}
              />
            </View>

            <View style={styles.innerDivider} />

            {/* 扩展插件中心 */}
            <Pressable
              style={styles.itemRow}
              onPress={onOpenPluginManager}
              accessibilityRole="button"
              testID="Settings__PluginManager__Row"
            >
              <View style={[styles.iconBox, { backgroundColor: "rgba(245, 158, 11, 0.14)" }]}>
                <Ionicons name="extension-puzzle-outline" size={17} color={C.warn} />
              </View>
              <View style={styles.itemContent}>
                <Text style={styles.itemTitle}>扩展插件中心</Text>
                <Text style={styles.itemSubtitle}>管理数字员工扩展工具与第三方增强能力</Text>
              </View>
              <View style={styles.itemActionArea}>
                <View style={styles.twoCharBtn}>
                  <Text style={styles.twoCharBtnText}>配置</Text>
                </View>
                <Ionicons name="chevron-forward" size={15} color={C.ink4} />
              </View>
            </Pressable>
          </View>
        </View>

        {/* ── 3. 应用运行与系统维护 (Runtime) ── */}
        <View style={styles.groupSection}>
          <Text style={styles.groupTitle}>系统运行 (RUNTIME)</Text>
          <View style={styles.cardGroup}>
            {/* 版本与增量更新 (OTA) */}
            <Pressable
              style={styles.itemRow}
              disabled={ota.isChecking}
              onPress={handleCheckUpdate}
              accessibilityRole="button"
              testID="Settings__OTA__Row"
            >
              <View style={[styles.iconBox, { backgroundColor: "rgba(59, 130, 246, 0.14)" }]}>
                <Ionicons name="cloud-download-outline" size={17} color={C.accent} />
              </View>
              <View style={styles.itemContent}>
                <Text style={styles.itemTitle}>版本与增量更新</Text>
                <Text style={styles.itemSubtitle} numberOfLines={1}>
                  原生: v{appVer} · 运行时: {ota.runtimeVersion ?? "默认"}
                </Text>
              </View>
              <View style={styles.itemActionArea}>
                {ota.isChecking ? (
                  <View style={styles.statusInlineBox}>
                    <ActivityIndicator size="small" color={C.accent} />
                    <Text style={styles.statusInlineText}>检查中</Text>
                  </View>
                ) : (
                  <View style={styles.twoCharBtn}>
                    <Text style={styles.twoCharBtnText}>检查</Text>
                  </View>
                )}
              </View>
            </Pressable>

            <View style={styles.innerDivider} />

            {/* 清理缓存 */}
            <Pressable
              style={styles.itemRow}
              disabled={clearing}
              onPress={handleClearCache}
              accessibilityRole="button"
              testID="Settings__Cache__Row"
            >
              <View style={[styles.iconBox, { backgroundColor: "rgba(239, 68, 68, 0.14)" }]}>
                <Ionicons name="trash-outline" size={17} color={C.err} />
              </View>
              <View style={styles.itemContent}>
                <Text style={styles.itemTitle}>清理缓存空间</Text>
                <Text style={styles.itemSubtitle}>
                  已占用存储: {cacheSize ?? "计算中…"}
                </Text>
              </View>
              <View style={styles.itemActionArea}>
                {clearing ? (
                  <View style={styles.statusInlineBox}>
                    <ActivityIndicator size="small" color={C.err} />
                    <Text style={[styles.statusInlineText, { color: C.err }]}>清理中</Text>
                  </View>
                ) : (
                  <View style={[styles.twoCharBtn, styles.twoCharBtnWarn]}>
                    <Text style={[styles.twoCharBtnText, styles.twoCharBtnTextWarn]}>清理</Text>
                  </View>
                )}
              </View>
            </Pressable>

            <View style={styles.innerDivider} />

            {/* 底层原生模块探测 */}
            <Pressable
              style={styles.itemRow}
              onPress={onOpenNativeModules}
              accessibilityRole="button"
              testID="Settings__NativeModules__Row"
            >
              <View style={[styles.iconBox, { backgroundColor: "rgba(148, 163, 184, 0.14)" }]}>
                <Ionicons name="hardware-chip-outline" size={17} color={C.ink3} />
              </View>
              <View style={styles.itemContent}>
                <Text style={styles.itemTitle}>底层原生能力</Text>
                <Text style={styles.itemSubtitle}>
                  文件系统、定位、通知、分享等 6 项硬件探测
                </Text>
              </View>
              <View style={styles.itemActionArea}>
                <View style={styles.twoCharBtn}>
                  <Text style={styles.twoCharBtnText}>探测</Text>
                </View>
                <Ionicons name="chevron-forward" size={15} color={C.ink4} />
              </View>
            </Pressable>

            {onViewWhatsNew ? (
              <>
                <View style={styles.innerDivider} />
                {/* 新特性演进记录 */}
                <Pressable
                  style={styles.itemRow}
                  onPress={onViewWhatsNew}
                  accessibilityRole="button"
                  testID="Settings__WhatsNew__Row"
                >
                  <View style={[styles.iconBox, { backgroundColor: "rgba(234, 179, 8, 0.14)" }]}>
                    <Ionicons name="sparkles-outline" size={17} color={C.warn} />
                  </View>
                  <View style={styles.itemContent}>
                    <Text style={styles.itemTitle}>功能演进记录</Text>
                    <Text style={styles.itemSubtitle}>查看最新版本特性说明与操作导览</Text>
                  </View>
                  <View style={styles.itemActionArea}>
                    <View style={styles.twoCharBtn}>
                      <Text style={styles.twoCharBtnText}>查看</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={15} color={C.ink4} />
                  </View>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>

        {/* ── 4. 账号与会话安全 (Security) ── */}
        <View style={styles.groupSection}>
          <Text style={styles.groupTitle}>账号安全 (SECURITY)</Text>
          <View style={styles.cardGroupDanger}>
            <Pressable
              style={styles.itemRow}
              onPress={handleSignOutConfirm}
              accessibilityRole="button"
              testID="Settings__SignOut__Row"
            >
              <View style={[styles.iconBox, { backgroundColor: "rgba(239, 68, 68, 0.16)" }]}>
                <Ionicons name="log-out-outline" size={18} color={C.err} />
              </View>
              <View style={styles.itemContent}>
                <Text style={[styles.itemTitle, { color: C.err }]}>退出当前账号</Text>
                <Text style={styles.itemSubtitle}>
                  清除当前设备安全密钥与企业会话缓存
                </Text>
              </View>
              <View style={[styles.twoCharBtn, styles.twoCharBtnDanger]}>
                <Text style={styles.twoCharBtnTextDanger}>退出</Text>
              </View>
            </Pressable>
          </View>
        </View>

        {/* ── 5. 底部系统指纹与架构声明 ── */}
        <View style={styles.footerSection}>
          <Text style={styles.footerBrand}>
            Coolie Control Plane · React Native (Fabric) · Hermes Engine
          </Text>
          <Text style={styles.footerSub}>
            业务双核驱动 · 263 物理表闭环 · CMMI-5 过程控制
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    paddingHorizontal: SPACING.md,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xxl * 2,
    gap: SPACING.lg,
  },

  /* 身份与名片卡 */
  profileCard: {
    backgroundColor: ELEVATION.raised,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    padding: SPACING.md,
    gap: SPACING.md,
  },
  profileHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  profileAvatarBox: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.md,
    backgroundColor: "rgba(94, 106, 210, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(94, 106, 210, 0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  profileAvatarText: {
    color: C.ink,
    fontSize: 20,
    fontWeight: "700",
  },
  profileInfoBox: {
    flex: 1,
    gap: 4,
  },
  profileName: {
    color: C.ink,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  profileTagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  companyTag: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
    maxWidth: 160,
  },
  companyTagText: {
    color: C.ink2,
    fontSize: 11,
    fontWeight: "600",
  },
  roleTag: {
    backgroundColor: "rgba(94, 106, 210, 0.12)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  roleTagText: {
    color: C.accent,
    fontSize: 10,
    fontWeight: "600",
  },
  versionBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
  },
  versionBadgeText: {
    color: C.ink3,
    fontSize: 11,
    fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },

  /* 端点条 */
  endpointBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(0, 0, 0, 0.25)",
    borderRadius: RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 8,
  },
  endpointLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.ok,
  },
  endpointUrl: {
    flex: 1,
    color: C.ink3,
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  endpointPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
  },
  endpointPillDev: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
  },
  endpointPillProd: {
    backgroundColor: "rgba(39, 166, 68, 0.15)",
  },
  endpointPillText: {
    fontSize: 10,
    fontWeight: "600",
  },
  endpointPillTextDev: {
    color: C.warn,
  },
  endpointPillTextProd: {
    color: C.ok,
  },

  /* 分组 */
  groupSection: {
    gap: SPACING.xs + 2,
  },
  groupTitle: {
    color: C.ink4,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginLeft: 4,
    marginBottom: 2,
  },
  cardGroup: {
    backgroundColor: ELEVATION.raised,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    overflow: "hidden",
  },
  cardGroupDanger: {
    backgroundColor: "rgba(239, 68, 68, 0.05)",
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.20)",
    overflow: "hidden",
  },

  /* 组内项目 Row */
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  itemContent: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    color: C.ink,
    fontSize: 14,
    fontWeight: "600",
  },
  itemSubtitle: {
    color: C.ink3,
    fontSize: 11,
    lineHeight: 16,
  },
  itemActionArea: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  innerDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    marginLeft: 56,
  },

  /* 纯两字按钮 */
  twoCharBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.md,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  twoCharBtnText: {
    color: C.ink2,
    fontSize: 12,
    fontWeight: "600",
  },
  twoCharBtnWarn: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
  },
  twoCharBtnTextWarn: {
    color: C.err,
  },
  twoCharBtnDanger: {
    backgroundColor: C.err,
    paddingHorizontal: 12,
  },
  twoCharBtnTextDanger: {
    color: "#FFFFFF",
    fontWeight: "600",
  },

  statusInlineBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
  },
  statusInlineText: {
    color: C.ink3,
    fontSize: 12,
  },

  /* 底部指纹声明 */
  footerSection: {
    alignItems: "center",
    gap: 4,
    marginTop: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  footerBrand: {
    color: C.ink4,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  footerSub: {
    color: C.ink4,
    fontSize: 10,
  },
});
