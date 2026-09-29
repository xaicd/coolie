import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import type { Company, Issue } from "@coolie/api-client";
import { C, coolie } from "../coolie";
import { RADIUS, SPACING } from "../ui/tokens";
import { AppCard } from "../ui/AppCard";
import { LoadingState } from "../ui/LoadingState";
import { ScreenHeader } from "../ui/ScreenHeader";

/**
 * App 端 spec 编辑器 (wave153)。
 *
 * 与 Coolie Web 的 `ui/src/components/SpecEditor.tsx` 同一条链、同一份契约:
 * 3 步 stepper (需求/缺陷 → 设计 → 任务) + 4 个 kind 表单 (requirement / bugfix /
 * design / task), 读写都走 wave147 的 `GET/POST /api/issues/:id/spec`。字段名
 * 逐字对齐 `packages/shared/src/validators/issue-spec.ts`, 所以两端存的是同一条
 * 记录, 不会各存一份。
 */

type SpecKind = "requirement" | "bugfix" | "design" | "task";

const SPEC_KINDS: SpecKind[] = ["requirement", "bugfix", "design", "task"];

const KIND_LABEL: Record<SpecKind, string> = {
  requirement: "需求",
  bugfix: "缺陷修复",
  design: "设计",
  task: "任务",
};

/** requirement/bugfix 属第 1 步, design 第 2 步, task 第 3 步 —— 与 web 一致。 */
const KIND_STEP: Record<SpecKind, number> = {
  requirement: 1,
  bugfix: 1,
  design: 2,
  task: 3,
};

const STEPS = ["需求 / 缺陷", "设计", "任务"];

interface SpecDraft {
  kind: SpecKind;
  parentSpecId: string;
  requirement: { body: string; acceptanceCriteria: string };
  bugfix: { reproSteps: string; expectedBehavior: string; actualBehavior: string };
  design: { approach: string; tradeoffs: string; apiSurface: string };
  task: { files: string; steps: string };
}

function emptyDraft(kind: SpecKind, parentSpecId = ""): SpecDraft {
  return {
    kind,
    parentSpecId,
    requirement: { body: "", acceptanceCriteria: "" },
    bugfix: { reproSteps: "", expectedBehavior: "", actualBehavior: "" },
    design: { approach: "", tradeoffs: "", apiSurface: "" },
    task: { files: "", steps: "" },
  };
}

function linesToList(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Payload for one kind, matching the server's strict schema for that kind. */
function payloadFor(draft: SpecDraft): Record<string, unknown> {
  const base: Record<string, unknown> = {
    kind: draft.kind,
    parentSpecId: draft.parentSpecId.trim() || null,
  };
  switch (draft.kind) {
    case "requirement":
      return {
        ...base,
        requirement: {
          body: draft.requirement.body.trim(),
          acceptanceCriteria: linesToList(draft.requirement.acceptanceCriteria),
        },
      };
    case "bugfix":
      return {
        ...base,
        bugfix: {
          reproSteps: draft.bugfix.reproSteps.trim(),
          expectedBehavior: draft.bugfix.expectedBehavior.trim(),
          actualBehavior: draft.bugfix.actualBehavior.trim(),
        },
      };
    case "design":
      return {
        ...base,
        design: {
          approach: draft.design.approach.trim(),
          tradeoffs: linesToList(draft.design.tradeoffs),
          apiSurface: draft.design.apiSurface.trim() || null,
        },
      };
    case "task":
      return {
        ...base,
        task: {
          files: linesToList(draft.task.files),
          steps: linesToList(draft.task.steps),
        },
      };
  }
}

/** Whether the draft satisfies the strict (non-draft) schema for its kind. */
function payloadReady(draft: SpecDraft): boolean {
  switch (draft.kind) {
    case "requirement":
      return draft.requirement.body.trim().length > 0;
    case "bugfix":
      return (
        draft.bugfix.reproSteps.trim().length > 0 &&
        draft.bugfix.expectedBehavior.trim().length > 0 &&
        draft.bugfix.actualBehavior.trim().length > 0
      );
    case "design":
      return draft.design.approach.trim().length > 0;
    case "task":
      return true;
  }
}

function draftFromServer(
  kind: SpecKind,
  spec: Record<string, unknown> | null,
): SpecDraft {
  const base = emptyDraft(kind, typeof spec?.parentSpecId === "string" ? spec.parentSpecId : "");
  if (!spec) return base;
  const join = (v: unknown) => (Array.isArray(v) ? v.join("\n") : typeof v === "string" ? v : "");
  if (kind === "requirement" && spec.requirement && typeof spec.requirement === "object") {
    const r = spec.requirement as Record<string, unknown>;
    base.requirement = {
      body: typeof r.body === "string" ? r.body : "",
      acceptanceCriteria: join(r.acceptanceCriteria),
    };
  } else if (kind === "bugfix" && spec.bugfix && typeof spec.bugfix === "object") {
    const b = spec.bugfix as Record<string, unknown>;
    base.bugfix = {
      reproSteps: typeof b.reproSteps === "string" ? b.reproSteps : "",
      expectedBehavior: typeof b.expectedBehavior === "string" ? b.expectedBehavior : "",
      actualBehavior: typeof b.actualBehavior === "string" ? b.actualBehavior : "",
    };
  } else if (kind === "design" && spec.design && typeof spec.design === "object") {
    const d = spec.design as Record<string, unknown>;
    base.design = {
      approach: typeof d.approach === "string" ? d.approach : "",
      tradeoffs: join(d.tradeoffs),
      apiSurface: typeof d.apiSurface === "string" ? d.apiSurface : "",
    };
  } else if (kind === "task" && spec.task && typeof spec.task === "object") {
    const t = spec.task as Record<string, unknown>;
    base.task = { files: join(t.files), steps: join(t.steps) };
  }
  return base;
}

export function SpecEditorScreen({
  issue,
  company,
  onBack,
}: {
  issue: Issue;
  company?: Company;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState<SpecDraft>(() => emptyDraft("requirement"));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await coolie.getIssueSpec(issue.id);
      const kind = (res.specKind as SpecKind | null) ?? "requirement";
      const normalized: SpecKind = SPEC_KINDS.includes(kind) ? kind : "requirement";
      setDraft(draftFromServer(normalized, res.spec));
    } catch (e) {
      // 404 (尚未写过 spec) 是正常起点, 不是错误。
      const message = String((e as Error)?.message ?? e);
      if (!/404|not found/i.test(message)) setError(message);
      setDraft(emptyDraft("requirement"));
    } finally {
      setLoading(false);
    }
  }, [issue.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectKind = useCallback((next: SpecKind) => {
    setDraft((prev) => {
      // 与 web 一致: 切 kind 保留 parentSpecId, 其余字段重置。
      return { ...emptyDraft(next, prev.parentSpecId) };
    });
    setSavedAt(null);
  }, []);

  const save = useCallback(
    async (asDraft: boolean) => {
      setSaving(true);
      setError(null);
      try {
        await coolie.saveIssueSpec(issue.id, payloadFor(draft), { draft: asDraft });
        setSavedAt(new Date().toLocaleTimeString());
        Alert.alert(asDraft ? "草稿已保存" : "Spec 已保存", `${KIND_LABEL[draft.kind]} · ${issue.title}`);
      } catch (e) {
        setError(String((e as Error)?.message ?? e));
      } finally {
        setSaving(false);
      }
    },
    [draft, issue.id, issue.title],
  );

  const currentStep = KIND_STEP[draft.kind];
  const ready = payloadReady(draft);

  const update = useMemo(
    () => ({
      requirement: (patch: Partial<SpecDraft["requirement"]>) =>
        setDraft((d) => ({ ...d, requirement: { ...d.requirement, ...patch } })),
      bugfix: (patch: Partial<SpecDraft["bugfix"]>) =>
        setDraft((d) => ({ ...d, bugfix: { ...d.bugfix, ...patch } })),
      design: (patch: Partial<SpecDraft["design"]>) =>
        setDraft((d) => ({ ...d, design: { ...d.design, ...patch } })),
      task: (patch: Partial<SpecDraft["task"]>) =>
        setDraft((d) => ({ ...d, task: { ...d.task, ...patch } })),
      parentSpecId: (value: string) => setDraft((d) => ({ ...d, parentSpecId: value })),
    }),
    [],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <ScreenHeader
            title="Spec 编辑器"
            subtitle={
              <Text style={styles.subtitle} numberOfLines={1}>
                {company?.name ? `${company.name} · ` : ""}
                {issue.title}
              </Text>
            }
            onBack={onBack}
            backLabel="返回任务"
          />

          {loading ? (
            <LoadingState size="small" text="正在加载 Spec…" />
          ) : (
            <>
              {/* 3 步 stepper */}
              <View style={styles.stepper} testID="spec-stepper">
                {STEPS.map((label, index) => {
                  const step = index + 1;
                  const done = step < currentStep;
                  const active = step === currentStep;
                  return (
                    <View key={label} style={styles.stepItem}>
                      <View
                        style={[
                          styles.stepDot,
                          active && styles.stepDotActive,
                          done && styles.stepDotDone,
                        ]}
                      >
                        <Text style={[styles.stepDotText, (active || done) && styles.stepDotTextOn]}>
                          {done ? "✓" : step}
                        </Text>
                      </View>
                      <Text style={[styles.stepLabel, active && styles.stepLabelActive]}>
                        {label}
                      </Text>
                      {index < STEPS.length - 1 ? <View style={styles.stepConnector} /> : null}
                    </View>
                  );
                })}
              </View>

              {/* 4 tab — 按 spec_kind 切换 */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tabRow}
              >
                {SPEC_KINDS.map((kind) => {
                  const active = draft.kind === kind;
                  return (
                    <Pressable
                      key={kind}
                      onPress={() => selectKind(kind)}
                      style={[styles.tab, active && styles.tabActive]}
                      testID={`spec-tab-${kind}`}
                    >
                      <Text style={[styles.tabText, active && styles.tabTextActive]}>
                        {KIND_LABEL[kind]}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <AppCard padding={16} style={styles.formCard}>
                {draft.kind === "requirement" ? (
                  <>
                    <FieldLabel>需求正文</FieldLabel>
                    <TextInput
                      style={styles.textArea}
                      multiline
                      value={draft.requirement.body}
                      onChangeText={(v) => update.requirement({ body: v })}
                      placeholder="这条需求要解决什么问题、边界是什么…"
                      placeholderTextColor={C.ink4}
                      testID="spec-requirement-body"
                    />
                    <FieldLabel>验收标准 (每行一条 · WHEN … THEN … SHALL …)</FieldLabel>
                    <TextInput
                      style={styles.textArea}
                      multiline
                      value={draft.requirement.acceptanceCriteria}
                      onChangeText={(v) => update.requirement({ acceptanceCriteria: v })}
                      placeholder={"WHEN 用户点登录\nTHEN 系统 SHALL 进入看板"}
                      placeholderTextColor={C.ink4}
                      testID="spec-requirement-acceptance"
                    />
                  </>
                ) : draft.kind === "bugfix" ? (
                  <>
                    <FieldLabel>复现步骤</FieldLabel>
                    <TextInput
                      style={styles.textArea}
                      multiline
                      value={draft.bugfix.reproSteps}
                      onChangeText={(v) => update.bugfix({ reproSteps: v })}
                      placeholder="1. 打开… 2. 点击…"
                      placeholderTextColor={C.ink4}
                      testID="spec-bugfix-repro"
                    />
                    <FieldLabel>期望行为</FieldLabel>
                    <TextInput
                      style={styles.input}
                      value={draft.bugfix.expectedBehavior}
                      onChangeText={(v) => update.bugfix({ expectedBehavior: v })}
                      placeholderTextColor={C.ink4}
                      testID="spec-bugfix-expected"
                    />
                    <FieldLabel>实际行为</FieldLabel>
                    <TextInput
                      style={styles.input}
                      value={draft.bugfix.actualBehavior}
                      onChangeText={(v) => update.bugfix({ actualBehavior: v })}
                      placeholderTextColor={C.ink4}
                      testID="spec-bugfix-actual"
                    />
                  </>
                ) : draft.kind === "design" ? (
                  <>
                    <FieldLabel>设计方案</FieldLabel>
                    <TextInput
                      style={styles.textArea}
                      multiline
                      value={draft.design.approach}
                      onChangeText={(v) => update.design({ approach: v })}
                      placeholder="怎么做、影响面、数据流…"
                      placeholderTextColor={C.ink4}
                      testID="spec-design-approach"
                    />
                    <FieldLabel>取舍 (每行一条)</FieldLabel>
                    <TextInput
                      style={styles.textArea}
                      multiline
                      value={draft.design.tradeoffs}
                      onChangeText={(v) => update.design({ tradeoffs: v })}
                      placeholderTextColor={C.ink4}
                      testID="spec-design-tradeoffs"
                    />
                    <FieldLabel>接口变化 (可选)</FieldLabel>
                    <TextInput
                      style={styles.textArea}
                      multiline
                      value={draft.design.apiSurface}
                      onChangeText={(v) => update.design({ apiSurface: v })}
                      placeholderTextColor={C.ink4}
                      testID="spec-design-api"
                    />
                  </>
                ) : (
                  <>
                    <FieldLabel>涉及文件 (每行一条)</FieldLabel>
                    <TextInput
                      style={styles.textArea}
                      multiline
                      value={draft.task.files}
                      onChangeText={(v) => update.task({ files: v })}
                      placeholder="server/src/routes/issue-specs.ts"
                      placeholderTextColor={C.ink4}
                      testID="spec-task-files"
                    />
                    <FieldLabel>实施步骤 (每行一条)</FieldLabel>
                    <TextInput
                      style={styles.textArea}
                      multiline
                      value={draft.task.steps}
                      onChangeText={(v) => update.task({ steps: v })}
                      placeholderTextColor={C.ink4}
                      testID="spec-task-steps"
                    />
                  </>
                )}

                <FieldLabel>父 Spec (issue id, 可选)</FieldLabel>
                <TextInput
                  style={styles.input}
                  value={draft.parentSpecId}
                  onChangeText={update.parentSpecId}
                  placeholder="留空表示根节点"
                  placeholderTextColor={C.ink4}
                  autoCapitalize="none"
                  autoCorrect={false}
                  testID="spec-parent"
                />
              </AppCard>

              {error ? <Text style={styles.error}>{error}</Text> : null}
              {savedAt ? <Text style={styles.savedHint}>已保存 · {savedAt}</Text> : null}

              <View style={styles.actions}>
                <Pressable
                  style={[styles.btnDraft, saving && styles.btnDisabled]}
                  disabled={saving}
                  onPress={() => void save(true)}
                  testID="spec-save-draft"
                >
                  <Text style={styles.btnDraftText}>存草稿</Text>
                </Pressable>
                <Pressable
                  style={[styles.btnPrimary, (!ready || saving) && styles.btnDisabled]}
                  disabled={!ready || saving}
                  onPress={() => void save(false)}
                  testID="spec-save"
                >
                  <Ionicons name="save-outline" size={15} color="#FFFFFF" />
                  <Text style={styles.btnPrimaryText}>{saving ? "保存中…" : "保存"}</Text>
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  content: { padding: SPACING.lg, paddingBottom: 48, gap: SPACING.md },
  subtitle: { fontSize: 12, color: C.ink3 },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  stepItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
  },
  stepDotActive: { backgroundColor: "rgba(94, 106, 210, 0.2)", borderColor: C.accent },
  stepDotDone: { backgroundColor: "rgba(39, 166, 68, 0.15)", borderColor: C.ok },
  stepDotText: { color: C.ink3, fontSize: 12, fontWeight: "600" },
  stepDotTextOn: { color: C.ink },
  stepLabel: { color: C.ink3, fontSize: 12 },
  stepLabelActive: { color: C.ink, fontWeight: "600" },
  stepConnector: { width: 18, height: 1, backgroundColor: C.line, marginLeft: 4 },
  tabRow: { flexDirection: "row", gap: 8, paddingVertical: 4 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
  },
  tabActive: { backgroundColor: "rgba(94, 106, 210, 0.15)", borderColor: C.accent },
  tabText: { color: C.ink3, fontSize: 13, fontWeight: "500" },
  tabTextActive: { color: C.accent, fontWeight: "600" },
  formCard: { gap: 8 },
  fieldLabel: { color: C.ink3, fontSize: 12, fontWeight: "500", marginTop: 6 },
  input: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: C.ink,
    fontSize: 14,
  },
  textArea: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: C.ink,
    fontSize: 14,
    minHeight: 88,
    textAlignVertical: "top",
  },
  error: { color: C.err, fontSize: 13 },
  savedHint: { color: C.ok, fontSize: 12 },
  actions: { flexDirection: "row", gap: 10, marginTop: 4 },
  btnDraft: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: RADIUS.sm,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
  },
  btnDraftText: { color: C.ink2, fontSize: 14, fontWeight: "500" },
  btnPrimary: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: RADIUS.sm,
    backgroundColor: C.brand,
  },
  btnPrimaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  btnDisabled: { opacity: 0.4 },
});
