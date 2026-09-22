import { useCallback, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import type { Issue, IssuePriority } from "@coolie/api-client";
import { C, type AgentRow } from "../coolie";
import { RADIUS } from "../ui/tokens";
import { ComposeScreen } from "../screens/ComposeScreen";
import { useComposerFields } from "./composer/useComposerFields";

/**
 * 新建任务弹窗 —— 任务页右下角 [+ 新建任务] 的落地浮层。
 *
 * 表单本体是 `ComposeScreen` (与中央「+」浮层同一份实现, 字段与上游
 * `NewIssueDialog` 一一对应), 这里只负责 Modal 外壳: 底部上滑的 sheet、
 * 键盘避让、以及建完之后通知列表刷新。
 */
export function CreateTaskModal({
  visible,
  companyId,
  agents,
  onClose,
  onCreated,
}: {
  visible: boolean;
  companyId: string;
  agents: AgentRow[];
  onClose: () => void;
  onCreated: (issue: Issue) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<IssuePriority>("medium");
  const [busy, setBusy] = useState(false);

  const fields = useComposerFields(companyId, agents);
  const { reset: resetFields } = fields;

  const reset = useCallback(() => {
    setTitle("");
    setDescription("");
    setPriority("medium");
    resetFields();
  }, [resetFields]);

  const discard = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const submit = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const { issue, failedUploads } = await fields.createTask({
        title: trimmed,
        priority,
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      reset();
      onCreated(issue);
      if (failedUploads.length > 0) {
        Alert.alert("附件未上传", `任务已创建, 但这些附件没传成功: ${failedUploads.join("、")}`);
      }
    } catch (e) {
      Alert.alert("创建失败", String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [busy, description, fields, onCreated, priority, reset, title]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={discard}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          style={styles.sheet}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ComposeScreen
            companyId={companyId}
            title={title}
            onTitle={setTitle}
            description={description}
            onDescription={setDescription}
            priority={priority}
            onPriority={setPriority}
            agents={agents}
            fields={fields}
            busy={busy}
            onSubmit={() => void submit()}
            onDiscard={discard}
          />
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    maxHeight: "92%",
    backgroundColor: C.bg,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.line,
  },
});
