import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import type {
  Company,
  OntologyPropertyEntry,
  OntologyPropertiesResponse,
} from "@coolie/api-client";
import { coolie } from "../coolie";
import { C } from "../theme";
import { RADIUS, SPACING } from "../ui/tokens";
import { AppCard } from "../ui/AppCard";
import { EmptyState } from "../ui/EmptyState";
import { ErrorRetry } from "../ui/ErrorRetry";
import { LoadingState } from "../ui/LoadingState";
import { ScreenHeader } from "../ui/ScreenHeader";
import { SchemaPropertyRow } from "../components/SchemaPropertyRow";
import { showErrorToast, showSuccessToast } from "../ui/toast";

interface OntologySchemaEditorScreenProps {
  company: Company;
  typeId: string;
  displayName: string;
  onBack?: () => void;
}

/**
 * Wave239 — 屏 3 (property editor).
 *
 * Field-level CRUD over a single type's property list. The page is a
 * SectionList-style stack of `SchemaPropertyRow` cards; an inline edit
 * modal handles add/edit. Save does a single PATCH that replaces the
 * whole list (idempotent server contract — see `OntologyPropertiesUpdate`
 * in `@paperclipai/shared`).
 *
 * Data path:
 *   GET   /api/companies/:id/ontology/types/:typeId/properties
 *   PATCH /api/companies/:id/ontology/types/:typeId/properties
 *   (wave239 server addition, see `ontology-extras-routes.test.ts`)
 *
 * Server-side validation rejects:
 *   * key that does not match `/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/`
 *   * type longer than 32 chars
 *   * sample longer than 200 chars
 *   * more than 64 entries per type
 *
 * The editor surfaces the same limits in the modal (maxLength on inputs),
 * so the user gets immediate feedback instead of a 400 from the server.
 */
export function OntologySchemaEditorScreen({
  company,
  typeId,
  displayName,
  onBack,
}: OntologySchemaEditorScreenProps) {
  const [data, setData] = useState<OntologyPropertiesResponse | null>(null);
  const [draft, setDraft] = useState<OntologyPropertyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editorKey, setEditorKey] = useState("");
  const [editorType, setEditorType] = useState("String");
  const [editorSample, setEditorSample] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await coolie.getOntologyTypeProperties(company.id, typeId);
      setData(res);
      setDraft(res.properties);
      setDirty(false);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
      setData(null);
      setDraft([]);
    }
  }, [company.id, typeId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void load().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const onAdd = useCallback(() => {
    setEditingIdx(null);
    setEditorKey("");
    setEditorType("String");
    setEditorSample("");
    setEditorOpen(true);
  }, []);

  const onEdit = useCallback((idx: number) => {
    const target = draft[idx];
    if (!target) return;
    setEditingIdx(idx);
    setEditorKey(target.key);
    setEditorType(target.type);
    setEditorSample(target.sample ?? "");
    setEditorOpen(true);
  }, [draft]);

  const onRemove = useCallback(
    (idx: number) => {
      const target = draft[idx];
      if (!target) return;
      Alert.alert(
        `删除字段「${target.key}」`,
        "删除后立即生效; 已有实例引用此字段将无法读取。",
        [
          { text: "取消", style: "cancel" },
          {
            text: "删除",
            style: "destructive",
            onPress: () => {
              setDraft((prev) => prev.filter((_, i) => i !== idx));
              setDirty(true);
            },
          },
        ],
      );
    },
    [draft],
  );

  const onSaveEditor = useCallback(() => {
    const key = editorKey.trim();
    if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(key)) {
      showErrorToast(
        "字段名不合法",
        "只能以字母或下划线开头, 由字母/数字/下划线组成 (最多 64 字符)",
      );
      return;
    }
    if (editorType.length === 0 || editorType.length > 32) {
      showErrorToast("类型不合法", "类型长度必须为 1-32 字符");
      return;
    }
    if (editorSample.length > 200) {
      showErrorToast("示例过长", "示例最多 200 字符");
      return;
    }
    // Disallow duplicate keys when adding a new row.
    if (editingIdx === null && draft.some((d) => d.key === key)) {
      showErrorToast("字段重复", `已有字段「${key}」`);
      return;
    }
    const entry: OntologyPropertyEntry = {
      key,
      type: editorType.trim(),
      ...(editorSample.trim() ? { sample: editorSample.trim() } : {}),
    };
    setDraft((prev) => {
      if (editingIdx === null) return [...prev, entry];
      const next = [...prev];
      next[editingIdx] = entry;
      return next;
    });
    setEditorOpen(false);
    setDirty(true);
  }, [draft, editingIdx, editorKey, editorType, editorSample]);

  const onSaveAll = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await coolie.updateOntologyTypeProperties(
        company.id,
        typeId,
        draft,
      );
      setData(res);
      setDraft(res.properties);
      setDirty(false);
      showSuccessToast("字段已保存", `共 ${res.properties.length} 个字段`);
    } catch (e) {
      showErrorToast("保存失败", String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  }, [company.id, typeId, draft, saving]);

  const onDiscard = useCallback(() => {
    if (!data) return;
    setDraft(data.properties);
    setDirty(false);
  }, [data]);

  const headerSubtitle = useMemo(() => {
    if (!data) return "加载中…";
    return `${draft.length} 个字段 · schema v${data.schemaVersion}`;
  }, [data, draft.length]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScreenHeader
        title={`${displayName}·字段定义`}
        subtitle={headerSubtitle}
        onBack={onBack}
        right={
          <View style={styles.headerRight}>
            {dirty ? (
              <Pressable onPress={onDiscard} hitSlop={8} style={styles.headerBtn}>
                <Text style={styles.headerBtnText}>放弃</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onSaveAll}
              disabled={!dirty || saving}
              hitSlop={8}
              style={[
                styles.headerBtn,
                styles.headerBtnPrimary,
                (!dirty || saving) && styles.headerBtnDisabled,
              ]}
            >
              {saving ? (
                <ActivityIndicator size="small" color={C.ink} />
              ) : (
                <Text style={[styles.headerBtnText, styles.headerBtnTextPrimary]}>
                  保存
                </Text>
              )}
            </Pressable>
          </View>
        }
      />

      {loading ? (
        <LoadingState text="加载字段定义…" />
      ) : error ? (
        <ErrorRetry message={error} onRetry={load} />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={C.accent}
            />
          }
        >
          <AppCard variant="surface" padding={SPACING.md} style={styles.metaCard}>
            <Text style={styles.metaTitle}>{displayName}</Text>
            <Text style={styles.metaUuid} numberOfLines={1}>
              UUID · {typeId}
            </Text>
          </AppCard>

          {draft.length === 0 ? (
            <EmptyState
              icon={<Ionicons name="list-outline" size={36} color={C.ink3} />}
              title="暂无字段定义"
              subtitle="点右下「+ 加新」开始定义该类型的字段。"
            />
          ) : (
            draft.map((entry, idx) => (
              <SchemaPropertyRow
                key={`${entry.key}-${idx}`}
                entry={entry}
                onEdit={() => onEdit(idx)}
                onRemove={() => onRemove(idx)}
              />
            ))
          )}

          <Pressable
            onPress={onAdd}
            hitSlop={8}
            style={styles.addFab}
            accessibilityLabel="新增字段"
          >
            <Ionicons name="add" size={16} color={C.ink} />
            <Text style={styles.addFabText}>加新</Text>
          </Pressable>
        </ScrollView>
      )}

      <Modal
        visible={editorOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEditorOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <AppCard variant="surface" padding={SPACING.lg} style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingIdx === null ? "新增字段" : "编辑字段"}
            </Text>

            <Text style={styles.modalLabel}>key (字段名)</Text>
            <TextInput
              value={editorKey}
              onChangeText={setEditorKey}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={64}
              placeholder="displayName"
              placeholderTextColor={C.ink4}
              style={styles.modalInput}
            />

            <Text style={styles.modalLabel}>type (类型)</Text>
            <View style={styles.modalTypeRow}>
              {["String", "Enum", "Ref", "DateTime", "Array", "Number", "Boolean"].map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setEditorType(t)}
                  hitSlop={4}
                  style={[
                    styles.modalTypeChip,
                    editorType === t && styles.modalTypeChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.modalTypeChipText,
                      editorType === t && styles.modalTypeChipTextActive,
                    ]}
                  >
                    {t}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.modalLabel}>sample (示例, 选填)</Text>
            <TextInput
              value={editorSample}
              onChangeText={setEditorSample}
              maxLength={200}
              placeholder="业务本体中文名"
              placeholderTextColor={C.ink4}
              style={styles.modalInput}
              multiline
            />

            <View style={styles.modalBtnRow}>
              <Pressable
                onPress={() => setEditorOpen(false)}
                hitSlop={4}
                style={[styles.modalBtn, styles.modalBtnCancel]}
              >
                <Text style={styles.modalBtnCancelText}>取消</Text>
              </Pressable>
              <Pressable
                onPress={onSaveEditor}
                hitSlop={4}
                style={[styles.modalBtn, styles.modalBtnPrimary]}
              >
                <Text style={styles.modalBtnPrimaryText}>
                  {editingIdx === null ? "添加" : "保存"}
                </Text>
              </Pressable>
            </View>
          </AppCard>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.md, paddingBottom: SPACING.xxl },
  headerRight: { flexDirection: "row", gap: 6, alignItems: "center" },
  headerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.panel,
  },
  headerBtnPrimary: { borderColor: C.accent, backgroundColor: "rgba(94, 106, 210, 0.18)" },
  headerBtnDisabled: { opacity: 0.4 },
  headerBtnText: { color: C.ink2, fontSize: 12, fontWeight: "500" },
  headerBtnTextPrimary: { color: C.accent, fontWeight: "600" },
  metaCard: { marginBottom: SPACING.md },
  metaTitle: { color: C.ink, fontSize: 15, fontWeight: "600" },
  metaUuid: { color: C.ink4, fontSize: 10, fontFamily: "monospace", marginTop: 4 },
  addFab: {
    position: "absolute",
    right: 16,
    bottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: C.accent,
  },
  addFabText: { color: C.ink, fontSize: 13, fontWeight: "600" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },
  modalCard: {
    width: "100%",
    maxWidth: 480,
  },
  modalTitle: { color: C.ink, fontSize: 16, fontWeight: "600", marginBottom: SPACING.md },
  modalLabel: { color: C.ink3, fontSize: 11, marginBottom: 6, marginTop: SPACING.sm },
  modalInput: {
    color: C.ink,
    backgroundColor: C.panel,
    borderRadius: RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    borderWidth: 1,
    borderColor: C.line,
  },
  modalTypeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 4 },
  modalTypeChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    backgroundColor: C.panel,
  },
  modalTypeChipActive: { borderColor: C.accent, backgroundColor: "rgba(94, 106, 210, 0.18)" },
  modalTypeChipText: { color: C.ink3, fontSize: 11, fontFamily: "monospace" },
  modalTypeChipTextActive: { color: C.accent, fontWeight: "600" },
  modalBtnRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: SPACING.md,
    justifyContent: "flex-end",
  },
  modalBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  modalBtnCancel: { borderColor: C.line, backgroundColor: C.panel },
  modalBtnCancelText: { color: C.ink2, fontSize: 13 },
  modalBtnPrimary: { borderColor: C.accent, backgroundColor: C.accent },
  modalBtnPrimaryText: { color: C.ink, fontSize: 13, fontWeight: "600" },
});
