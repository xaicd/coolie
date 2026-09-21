import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { C, coolie } from "../coolie";
import { RADIUS, SPACING } from "../ui/tokens";
import { BuildProgressCard, type BuildProgressStep } from "./BuildProgressCard";

/** POST /api/build/start 响应 (见 server/src/routes/build.ts) */
interface BuildStartResponse {
  buildId: string;
  plan: BuildProgressStep[];
  planSource: "hermes" | "template";
  unassignedAgentTypes: string[];
}

export interface BuildModeModalProps {
  visible: boolean;
  companyId: string;
  onClose: () => void;
  /** 进度卡点某个环节 → 打开该环节的任务详情, 由外层压详情页 */
  onOpenIssue?: (issueId: string) => void;
}

/**
 * Build 5 步链弹窗 —— 任务页顶部 [🔨 Build 5 步链] 的落地入口。
 *
 * 与工坊对话里的 "build xxx" 走同一条链路: POST /api/build/start 建一条构建计划,
 * 就地渲染 BuildProgressCard 五步链。计划建好后即使关掉弹窗也还在, 可在工坊继续看。
 */
export function BuildModeModal({
  visible,
  companyId,
  onClose,
  onOpenIssue,
}: BuildModeModalProps) {
  const [prompt, setPrompt] = useState("build ");
  const [submitting, setSubmitting] = useState(false);
  const [steps, setSteps] = useState<BuildProgressStep[] | null>(null);
  const [planSource, setPlanSource] = useState<"hermes" | "template" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 每次重新打开都回到初始态, 不残留上一轮的进度卡
  useEffect(() => {
    if (!visible) return;
    setPrompt("build ");
    setSubmitting(false);
    setSteps(null);
    setPlanSource(null);
    setError(null);
  }, [visible]);

  const submit = useCallback(async () => {
    const text = prompt.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await coolie.request<BuildStartResponse>("POST", "/api/build/start", {
        companyId,
        prompt: text,
      });
      setSteps(result.plan);
      setPlanSource(result.planSource);
    } catch (e) {
      setError(String((e as Error)?.message ?? e ?? "构建计划创建失败"));
    } finally {
      setSubmitting(false);
    }
  }, [companyId, prompt, submitting]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.backdrop}
      >
        <Pressable style={styles.dismiss} onPress={onClose} />
        <View style={styles.panel}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerEmoji}>🔨</Text>
              <Text style={styles.headerTitle}>Build 5 步链</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          <Text style={styles.hint}>
            写一句要做的活 (以 build 开头), 例: build 登录页。会按需求 → 设计 → 编码 →
            测试 → 发布五步派发。
          </Text>
          <TextInput
            style={styles.input}
            value={prompt}
            onChangeText={setPrompt}
            placeholder="build 一个…"
            placeholderTextColor={C.ink3}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!submitting}
            multiline
          />

          <Pressable
            style={[styles.submit, (submitting || !prompt.trim()) && styles.disabled]}
            onPress={() => void submit()}
            disabled={submitting || !prompt.trim()}
            accessibilityLabel="启动构建计划"
          >
            {submitting ? (
              <ActivityIndicator size="small" color={C.ink} />
            ) : (
              <Text style={styles.submitText}>启动构建计划</Text>
            )}
          </Pressable>

          {submitting || steps || error ? (
            <ScrollView
              style={styles.cardScroll}
              contentContainerStyle={styles.cardScrollBody}
              keyboardShouldPersistTaps="handled"
            >
              <BuildProgressCard
                prompt={prompt}
                steps={steps ?? []}
                loading={submitting}
                error={error}
                planSource={planSource}
                onOpenIssue={onOpenIssue}
              />
            </ScrollView>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  dismiss: {
    flex: 1,
  },
  panel: {
    backgroundColor: C.panel,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 28,
    gap: SPACING.sm,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  headerEmoji: {
    fontSize: 16,
  },
  headerTitle: {
    color: C.ink,
    fontSize: 17,
    fontWeight: "600",
  },
  close: {
    color: C.ink3,
    fontSize: 16,
  },
  hint: {
    color: C.ink3,
    fontSize: 12,
    lineHeight: 17,
  },
  input: {
    minHeight: 64,
    textAlignVertical: "top",
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    color: C.ink,
    fontSize: 15,
  },
  submit: {
    backgroundColor: C.brand,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  submitText: {
    color: C.ink,
    fontSize: 15,
    fontWeight: "500",
  },
  disabled: {
    opacity: 0.4,
  },
  cardScroll: {
    marginTop: SPACING.xs,
  },
  cardScrollBody: {
    paddingBottom: SPACING.xs,
  },
});
