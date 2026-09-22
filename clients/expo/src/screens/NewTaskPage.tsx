import { useCallback, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import type { Issue } from "@coolie/api-client";
import { C, type AgentRow } from "../coolie";
import { ELEVATION, RADIUS, SPACING } from "../ui/tokens";
import { openCoolieWeb } from "../utils/openCoolieWeb";
import { CreateTaskModal } from "../components/CreateTaskModal";
import { ModeSwitch } from "../components/doubao/ModeSwitch";
import { QuickActionsRow, type QuickAction } from "../components/doubao/QuickActionsRow";
import { HoldToTalkButton } from "../components/doubao/HoldToTalkButton";
import { useVoiceInput } from "../components/doubao/useVoiceInput";
import type { StagedAttachment } from "../components/composer/UploadRow";

/** 丢弃草稿的回执 —— Android 用系统 toast (不打断), iOS 没 toast 才退化为弹窗。 */
function notifyDraftDiscarded(): void {
  if (Platform.OS === "android") {
    ToastAndroid.show("草稿已丢弃", ToastAndroid.SHORT);
    return;
  }
  Alert.alert("草稿已丢弃");
}

/**
 * 「新会话」页 —— 像豆包一样的新建任务入口 (boss 09-22 23:40「要么打字, 要么语音
 * 转文字输入」+ 23:42 两张豆包截图)。
 *
 * 它替代了原先直接把 20 行表单铺开的 `ComposeScreen` / 中央「+」浮层: 空状态只给
 * 一个大字问候、一个「对话/工作」切换、4 个快捷功能 chip, 以及一条**主输入** ——
 * 底部「按住说话」。要么长按说一句 (转写成文字落进标题), 要么点键盘打字, 确认无
 * 误后再点「创建任务」进两卡表单 (CreateTaskModal) 填负责人/项目/优先级。
 *
 * 语音走 wave21 那条 transcribe-only 链路 (`voiceTranscribe`): 只出文字, 服务端
 * **不建任务** —— 建单必须由用户显式点「创建任务」。
 */
export function NewTaskPage({
  companyId,
  agents,
  onClose,
  onOpenChat,
  onOpenAiCreate,
  onCreated,
}: {
  companyId: string;
  agents: AgentRow[];
  onClose: () => void;
  /** 「对话」模式 / 快捷 chip: 去工坊会话。 */
  onOpenChat: () => void;
  /** 「AI 创建」chip: 去工坊并投一条 build prompt。 */
  onOpenAiCreate: () => void;
  onCreated: (issue: Issue) => void;
}) {
  const [title, setTitle] = useState("");
  const [editing, setEditing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
  const titleRef = useRef<TextInput>(null);

  const handleTranscript = useCallback((text: string) => {
    setTitle((current) => (current.trim() ? `${current.trim()} ${text}` : text));
    setEditing(true);
  }, []);

  const voice = useVoiceInput({ companyId, onTranscript: handleTranscript });

  const openKeyboard = useCallback(() => {
    setEditing(true);
    setTimeout(() => titleRef.current?.focus(), 50);
  }, []);

  /** 拍照上传 —— 本机没有相机模块, 用系统文件选择器挑图片 (与 composer 的 Upload 同一实现)。 */
  const pickImage = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "image/*",
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const picked: StagedAttachment[] = result.assets.map((asset) => ({
        id: `${asset.uri}:${asset.size ?? 0}`,
        name: asset.name,
        mimeType: asset.mimeType ?? "image/*",
        size: asset.size ?? null,
        uri: asset.uri,
      }));
      setAttachments((current) => [...current, ...picked]);
      setCreateOpen(true);
    } catch (e) {
      Alert.alert("选择图片失败", String((e as Error)?.message ?? e));
    }
  }, []);

  const discard = useCallback(() => {
    if (title.trim()) notifyDraftDiscarded();
    setTitle("");
    setAttachments([]);
    onClose();
  }, [onClose, title]);

  const quickActions: QuickAction[] = [
    { key: "chat", icon: "💬", label: "对话", onPress: onOpenChat },
    { key: "voice", icon: "🎤", label: "录音转写", onPress: voice.toggle },
    { key: "ai", icon: "🤖", label: "AI 创建", onPress: onOpenAiCreate },
    { key: "photo", icon: "📷", label: "拍照上传", onPress: () => void pickImage() },
  ];

  const showComposer = editing || title.trim().length > 0;

  return (
    <>
      {/* 标题栏: 面包屑 + ↗ (Coolie Web 打开) + ✕ (丢弃草稿) */}
      <View style={styles.header}>
        <View style={styles.breadcrumb}>
          <Text style={styles.breadcrumbMuted}>XROA</Text>
          <Text style={styles.breadcrumbSep}>›</Text>
          <Text style={styles.breadcrumbCurrent}>新会话</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => void openCoolieWeb()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="在 Coolie Web 打开"
            style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
          >
            <Ionicons name="expand-outline" size={17} color={C.ink3} />
          </Pressable>
          <Pressable
            onPress={discard}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="关闭"
            style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
          >
            <Ionicons name="close" size={19} color={C.ink3} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
      >
        {showComposer ? (
          <View style={styles.composer}>
            <TextInput
              ref={titleRef}
              style={styles.titleInput}
              placeholder="要派什么活?"
              placeholderTextColor={C.ink4}
              value={title}
              onChangeText={setTitle}
              multiline
              autoFocus={editing && title.length === 0}
            />
            <Text style={styles.titleHint}>确认或补充后再点「创建任务」</Text>
            {attachments.length > 0 ? (
              <Text style={styles.attachHint}>📎 已选 {attachments.length} 个附件</Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.greeting}>新建什么任务?</Text>
            <ModeSwitch
              value="work"
              onChange={(next) => {
                if (next === "chat") onOpenChat();
              }}
            />
            <QuickActionsRow actions={quickActions} />
          </View>
        )}
      </ScrollView>

      {/* 底部: [创建任务] (有标题才出现) + 主输入「按住说话」+ 辅助 row */}
      <View style={styles.footer}>
        {title.trim() ? (
          <Pressable
            style={({ pressed }) => [styles.createBtn, pressed && styles.createBtnPressed]}
            onPress={() => setCreateOpen(true)}
            accessibilityRole="button"
          >
            <Text style={styles.createText}>创建任务</Text>
          </Pressable>
        ) : null}

        <HoldToTalkButton
          recording={voice.recording}
          busy={voice.busy}
          status={voice.status}
          onPressIn={voice.pressIn}
          onPressOut={voice.pressOut}
        />

        <View style={styles.auxRow}>
          <AuxButton icon="camera-outline" label="相机" onPress={() => void pickImage()} />
          <AuxButton icon="keypad-outline" label="键盘" onPress={openKeyboard} />
          <AuxButton icon="add" label="更多" onPress={() => setCreateOpen(true)} />
        </View>
      </View>

      {createOpen ? (
        <CreateTaskModal
          visible={createOpen}
          companyId={companyId}
          agents={agents}
          initialTitle={title}
          initialAttachments={attachments}
          onClose={() => setCreateOpen(false)}
          onCreated={(issue) => {
            setCreateOpen(false);
            onCreated(issue);
          }}
        />
      ) : null}
    </>
  );
}

function AuxButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.auxBtn, pressed && styles.auxBtnPressed]}
    >
      <Ionicons name={icon} size={18} color={C.ink3} />
      <Text style={styles.auxLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
    backgroundColor: C.panel,
  },
  breadcrumb: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  breadcrumbMuted: {
    color: C.ink4,
    fontSize: 13,
    fontWeight: "500",
  },
  breadcrumbSep: {
    color: C.ink4,
    fontSize: 13,
  },
  breadcrumbCurrent: {
    color: C.ink,
    fontSize: 13,
    fontWeight: "600",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  headerBtn: {
    padding: SPACING.xs,
    borderRadius: RADIUS.sm,
  },
  headerBtnPressed: {
    backgroundColor: ELEVATION.active,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    flexGrow: 1,
    padding: SPACING.lg,
    justifyContent: "center",
    gap: SPACING.xl,
  },
  empty: {
    alignItems: "center",
    gap: SPACING.xl,
  },
  greeting: {
    color: C.ink,
    fontSize: 24,
    fontWeight: "600",
    letterSpacing: -0.4,
    textAlign: "center",
  },
  composer: {
    gap: SPACING.sm,
  },
  titleInput: {
    color: C.ink,
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: -0.3,
    lineHeight: 28,
    minHeight: 56,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: ELEVATION.base,
  },
  titleHint: {
    color: C.ink4,
    fontSize: 12,
  },
  attachHint: {
    color: C.ink3,
    fontSize: 12,
  },
  footer: {
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: C.lineSubtle,
  },
  createBtn: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.brand,
    borderRadius: RADIUS.pill,
    paddingVertical: 13,
  },
  createBtnPressed: {
    backgroundColor: C.accentHover,
  },
  createText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  auxRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xl,
  },
  auxBtn: {
    alignItems: "center",
    gap: 3,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  auxBtnPressed: {
    backgroundColor: ELEVATION.active,
  },
  auxLabel: {
    color: C.ink4,
    fontSize: 11,
  },
});
