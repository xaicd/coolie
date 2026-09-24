import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Company, GitCredential, GitProvider } from "@coolie/api-client";
import { C, coolie } from "../coolie";
import { RADIUS, SPACING } from "../ui/tokens";
import { AppCard } from "../ui/AppCard";
import { EmptyState } from "../ui/EmptyState";
import { ErrorRetry } from "../ui/ErrorRetry";
import { LoadingState } from "../ui/LoadingState";
import { ScreenHeader } from "../ui/ScreenHeader";
import { Pill } from "../ui/Pill";

/**
 * Coolie fork — wave70: git-ops App 端 UI 4 屏之「凭证管理」屏.
 *
 * 镜像 server/src/routes/git-credentials.ts 的 GET / POST / DELETE.
 * 创建表单为内嵌弹层, 避免新增 4 个路由占位符; token 字段只在内存存活,
 * POST 成功后只存 server 的 metadata 行.
 */
const PROVIDER_OPTIONS: { key: GitProvider; label: string; help: string }[] = [
  { key: "github", label: "GitHub", help: "Personal access token (PAT)" },
  { key: "gitlab", label: "GitLab", help: "Project / personal access token" },
  { key: "gitee", label: "Gitee", help: "私人令牌" },
  { key: "codeup", label: "Codeup (阿里云)", help: "Access token" },
  { key: "cnb", label: "CNB", help: "Access token" },
];

export function GitCredentialsScreen({
  company,
  onBack,
}: {
  company: Company;
  onBack: () => void;
}) {
  const [items, setItems] = useState<GitCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await coolie.listGitCredentials());
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreated = useCallback(
    (saved: GitCredential) => {
      setCreateOpen(false);
      setItems((prev) => {
        const idx = prev.findIndex(
          (row) => row.provider === saved.provider && row.userId === saved.userId,
        );
        if (idx === -1) return [saved, ...prev];
        const next = prev.slice();
        next[idx] = saved;
        return next;
      });
    },
    [],
  );

  const handleDelete = useCallback(
    (row: GitCredential) => {
      Alert.alert(
        "删除凭证",
        `确定删除 ${PROVIDER_LABEL[row.provider]} 凭证? 已在跑的任务会立刻失去对这个仓库的访问权限。`,
        [
          { text: "取消", style: "cancel" },
          {
            text: "删除",
            style: "destructive",
            onPress: () => {
              void (async () => {
                try {
                  await coolie.deleteGitCredential(row.id);
                  setItems((prev) => prev.filter((item) => item.id !== row.id));
                } catch (e) {
                  Alert.alert("删除失败", String((e as Error)?.message ?? e));
                }
              })();
            },
          },
        ],
      );
    },
    [],
  );

  let body: React.ReactNode;
  if (loading) {
    body = <LoadingState text="加载凭证…" />;
  } else if (error) {
    body = <ErrorRetry message={error} onRetry={() => void load()} />;
  } else if (items.length === 0) {
    body = (
      <EmptyState
        title="还没有凭证"
        subtitle="新建一个凭证后, 任务跑出来的 PR 就能推送到对应仓库。"
        action={
          <Pressable
            style={styles.emptyAction}
            onPress={() => setCreateOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="新建凭证"
          >
            <Text style={styles.emptyActionText}>新建凭证</Text>
          </Pressable>
        }
      />
    );
  } else {
    body = (
      <View style={{ gap: SPACING.sm }}>
        {items.map((row) => (
          <AppCard key={row.id} padding={14}>
            <View style={styles.rowHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{PROVIDER_LABEL[row.provider]}</Text>
                {row.repoUrl ? (
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {row.repoUrl}
                  </Text>
                ) : (
                  <Text style={styles.rowSubMuted}>未绑定仓库</Text>
                )}
              </View>
              <Pressable
                onPress={() => handleDelete(row)}
                hitSlop={8}
                accessibilityLabel="删除凭证"
              >
                <Ionicons name="trash-outline" size={18} color={C.err} />
              </Pressable>
            </View>
            <View style={styles.metaRow}>
              <Pill label="可用" dotColor={C.ok} mono />
              <Text style={styles.metaText}>
                创建于 {new Date(row.createdAt).toLocaleString()}
              </Text>
            </View>
          </AppCard>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Git 凭证"
        subtitle={
          <Text style={styles.subtitle} numberOfLines={1}>
            {company.name} · 让 Coolie 智能体推到你的仓库
          </Text>
        }
        onBack={onBack}
        backLabel="设置"
        right={
          <Pressable
            onPress={() => setCreateOpen(true)}
            hitSlop={8}
            style={styles.addBtn}
            accessibilityLabel="新建凭证"
          >
            <Ionicons name="add" size={16} color={C.accent} />
            <Text style={styles.addText}>新建</Text>
          </Pressable>
        }
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {body}
      </ScrollView>

      <CreateCredentialSheet
        visible={createOpen}
        companyId={company.id}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
    </View>
  );
}

const PROVIDER_LABEL: Record<GitProvider, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  gitee: "Gitee",
  codeup: "Codeup",
  cnb: "CNB",
};

function CreateCredentialSheet({
  visible,
  companyId,
  onClose,
  onCreated,
}: {
  visible: boolean;
  companyId: string;
  onClose: () => void;
  onCreated: (saved: GitCredential) => void;
}) {
  const [provider, setProvider] = useState<GitProvider>("github");
  const [token, setToken] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setProvider("github");
    setToken("");
    setRepoUrl("");
    setSubmitting(false);
    setError(null);
  }, []);

  useEffect(() => {
    if (!visible) reset();
  }, [visible, reset]);

  const submit = useCallback(async () => {
    if (!token.trim()) {
      setError("token 不能为空");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const saved = await coolie.saveGitCredential({
        provider,
        token: token.trim(),
        repoUrl: repoUrl.trim() ? repoUrl.trim() : null,
        companyId,
      });
      onCreated(saved);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  }, [provider, token, repoUrl, companyId, onCreated]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropDismiss} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>新建 Git 凭证</Text>

          <Text style={styles.fieldLabel}>Provider</Text>
          <View style={styles.providerRow}>
            {PROVIDER_OPTIONS.map((opt) => {
              const active = opt.key === provider;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setProvider(opt.key)}
                  style={[styles.providerChip, active && styles.providerChipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text
                    style={[
                      styles.providerChipText,
                      active && styles.providerChipTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.fieldHint}>
            {PROVIDER_OPTIONS.find((o) => o.key === provider)?.help}
          </Text>

          <Text style={styles.fieldLabel}>Access Token</Text>
          <TextInput
            style={styles.input}
            placeholder="ghp_… / glpat-…"
            placeholderTextColor={C.ink3}
            secureTextEntry
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.fieldLabel}>默认仓库 URL (可选)</Text>
          <TextInput
            style={styles.input}
            placeholder="https://github.com/<org>/<repo>.git"
            placeholderTextColor={C.ink3}
            value={repoUrl}
            onChangeText={setRepoUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.sheetActions}>
            <Pressable style={styles.btnGhost} onPress={onClose} disabled={submitting}>
              <Text style={styles.btnGhostText}>取消</Text>
            </Pressable>
            <Pressable
              style={[styles.btnPrimary, submitting && styles.btnPrimaryDisabled]}
              onPress={() => void submit()}
              disabled={submitting}
            >
              <Text style={styles.btnPrimaryText}>
                {submitting ? "保存中…" : "保存"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },
  content: { padding: SPACING.md, paddingBottom: SPACING.xl, gap: SPACING.sm },
  subtitle: { color: C.ink3, fontSize: 12, marginTop: 2 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    backgroundColor: C.surfaceHover,
  },
  addText: { color: C.accent, fontSize: 13, fontWeight: "500" },
  emptyAction: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    backgroundColor: C.accent,
    marginTop: SPACING.sm,
  },
  emptyActionText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  rowTitle: { color: C.ink, fontSize: 15, fontWeight: "600" },
  rowSub: { color: C.ink2, fontSize: 12, marginTop: 2 },
  rowSubMuted: { color: C.ink3, fontSize: 12, marginTop: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginTop: SPACING.sm },
  metaText: { color: C.ink3, fontSize: 11 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  backdropDismiss: { flex: 1 },
  sheet: {
    backgroundColor: C.panel,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: 18,
    paddingBottom: 34,
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
  sheetTitle: { color: C.ink, fontSize: 17, fontWeight: "600", marginBottom: SPACING.sm },
  fieldLabel: { color: C.ink3, fontSize: 12, marginTop: 8 },
  fieldHint: { color: C.ink3, fontSize: 11, marginTop: 2 },
  input: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: C.ink,
    fontSize: 14,
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  providerRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  providerChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  providerChipActive: {
    backgroundColor: C.surfaceHover,
    borderColor: C.accent,
  },
  providerChipText: { color: C.ink2, fontSize: 12 },
  providerChipTextActive: { color: C.accent, fontWeight: "600" },
  errorText: { color: "#E5484D", fontSize: 12, marginTop: SPACING.sm },
  sheetActions: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md },
  btnGhost: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    backgroundColor: C.surface,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.lineSubtle,
  },
  btnGhostText: { color: C.ink2, fontSize: 14, fontWeight: "500" },
  btnPrimary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    backgroundColor: C.accent,
    alignItems: "center",
  },
  btnPrimaryDisabled: { opacity: 0.6 },
  btnPrimaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
});