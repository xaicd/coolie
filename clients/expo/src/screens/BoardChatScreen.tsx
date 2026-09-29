import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Clipboard,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  StatusBar as RNStatusBar,
  Modal,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { isAsrNotConfigured, isRenderableBoardMessage } from "@coolie/api-client";
import type { BoardChatMessage, Company, Approval, Issue } from "@coolie/api-client";
import { C, coolie } from "../coolie";
import { useRecorder } from "../useRecorder";
import { StatusDot } from "../components/StatusDot";
import { ChatHeader } from "../components/ChatHeader";
import { ChatInput, type StagedAttachment } from "../components/ChatInput";
import { TypingBubbleText } from "../components/TypingDots";
import {
  approvalTypeLabel,
  formatApprovalSummary,
  formatApprovalTitle,
} from "../components/QuickApprovalCard";
import { CodeViewerWebView } from "../components/CodeViewerWebView";
import {
  BuildProgressCard,
  type BuildProgressStep,
} from "../components/BuildProgressCard";
import {
  SpecDiffCard,
  type DomainSpecPayload,
  type SpecProblemPayload,
} from "../components/SpecDiffCard";
import { parseCommand, pipelineKeyFromName, tCommand } from "../components/commandRouter";
import { AppCard } from "../ui/AppCard";
import { Pill } from "../ui/Pill";
import { formatTime } from "../utils/format";
import { parseInlineTags } from "../components/board-inline/tagParser";
import { InlinePreviewPanel } from "../components/board-inline/InlinePreviewPanel";

export interface BoardChatScreenProps {
  company: Company;
  whoami?: string;
  /** 气泡「查看详情」深链: 打开审批裁决页 (companyId + approvalId) */
  onOpenApproval?: (approvalId: string) => void;
  /** 气泡「关联任务」链接: 打开任务详情页 */
  onOpenIssue?: (issue: Issue) => void;
  /** 「建 pipeline xxx」创建成功后跳编辑器, 由 App.tsx 注入 */
  onOpenPipeline?: (pipelineId: string) => void;
  /** 「plan xxx」创建成功后跳计划详情, 由 App.tsx 注入 */
  onOpenPlan?: (issue: Issue) => void;
  /** 嵌入模式: 工作空间「对话」Tab 里复用本屏内容区, 不套整屏页头 */
  embedded?: boolean;
}

const QUICK_PROMPTS = [
  "工坊今日花销",
  "员工都在忙啥",
  "有哪些待审批",
  "本周交付了什么",
];

/** 长按录音的最短时长: 短于此视为误触 (300ms), 不送 ASR。 */
const MIN_VOICE_HOLD_MS = 300;

/**
 * wave144: 首 token 超时。SSE 连上后这么久还没吐出任何 token, 就认为这次发问
 * 卡住了 (服务端子进程 hung, 或被中间层吞掉的连接), 主动 abort 并把状态变成
 * 「可重试」的错误气泡 —— 而不是让老板一直看着转圈。服务端自己的 first-token
 * watchdog 也是 30s 量级, 谁先到都能收场。
 */
const FIRST_TOKEN_TIMEOUT_MS = 30_000;

type BoardEchoListener = (message: BoardChatMessage) => void;

/**
 * wave135: staged 附件 + 远端上传结果。
 *
 * 远端 id 挂在附件对象自己身上 (`remoteId`)，不再单独维护一个按下标对齐的
 * id 数组。两数组靠 `length` 相等来判断「传完了」是 P2-C 的死锁根因：
 * 「即选即传」和「boardIssueId 就绪后补传」两条路径把同一文件各传一遍，
 * 服务端落两条附件 -> 远端 id 数(2) 永远不等于 staged 数(1)，发送时
 * `uploaded.length !== staged.length` 恒成立，永远弹「附件上传中」。
 * 改成按附件身份去重/幂等，重传同一文件不会写第二条，失败也能重试。
 */
type StagedAttachmentLocal = StagedAttachment & {
  /** 服务端附件 id；存在即已上传成功 */
  remoteId?: string;
  /** 上一次上传失败的原因，存在则停在此状态等用户重试 */
  error?: string;
};

const boardEchoListeners = new Set<BoardEchoListener>();
const boardEchoQueue: BoardChatMessage[] = [];

/**
 * 从其它屏幕 (如审批裁决页) 向工坊聊天流追加一条系统提示气泡。
 * 聊天屏未挂载时先入队，等其挂载并完成历史加载后再回灌。
 */
export function exportBoardEcho(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  const message: BoardChatMessage = {
    id: `system-echo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: "system",
    text: trimmed,
    createdAt: new Date().toISOString(),
  };
  if (boardEchoListeners.size > 0) {
    boardEchoListeners.forEach((listener) => listener(message));
  } else {
    boardEchoQueue.push(message);
  }
}

function drainBoardEchoQueue(): BoardChatMessage[] {
  if (boardEchoQueue.length === 0) return [];
  return boardEchoQueue.splice(0, boardEchoQueue.length);
}

/**
 * wave144: 「正在进行的这一次发问」的模块级镜像。
 *
 * App.tsx 按 tab 条件渲染工坊屏 —— 发问期间切到「汇览」会把它卸载, 组件内的
 * sending / streamingText 随之清零, 老板切回工坊时看到一片空白, 以为整个 App
 * 卡死了。把在飞的这一次发问镜像到模块作用域, 重新挂载时据此恢复转圈和已到的
 * 正文; 结束 (publishLiveBoardChat(null)) 后不恢复 —— 服务端已经把回复落成
 * concierge 评论, loadHistory 会拉到, 不会重复渲染。
 *
 * abort controller 也放在这里: 它属于发起它的那次 handleSend 闭包, 重挂载后的
 * 局部 ref 已指向 null, 挂在模块上才能让新的「取消」按钮中止原来那条流。
 */
interface LiveBoardChatState {
  companyId: string;
  accumulated: string;
  status: string;
}
let liveBoardChat: LiveBoardChatState | null = null;
let liveBoardChatAbort: AbortController | null = null;
const liveBoardChatListeners = new Set<
  (state: LiveBoardChatState | null) => void
>();

function publishLiveBoardChat(next: LiveBoardChatState | null): void {
  liveBoardChat = next;
  if (next === null) liveBoardChatAbort = null;
  liveBoardChatListeners.forEach((listener) => listener(next));
}

const boardPromptQueue: string[] = [];

/**
 * 从其它屏幕 (如装机自检页的「查看演示」、`coolie://chat/build` 深链) 向工坊投
 * 一条待发送的 prompt。聊天屏未挂载时先入队，待其挂载并完成历史加载后自动发出。
 */
export function exportBoardPrompt(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  boardPromptQueue.push(trimmed);
}

function drainBoardPromptQueue(): string[] {
  return boardPromptQueue.splice(0, boardPromptQueue.length);
}

interface ApprovalFeedItem {
  approval: Approval;
  decision: "approve" | "reject" | null;
}

/** 构建进度卡状态 —— 一次构建计划在聊天流内的生命周期 */
interface BuildCardState {
  prompt: string;
  steps: BuildProgressStep[];
  loading: boolean;
  error: string | null;
  planSource: "hermes" | "template" | null;
}

/** POST /api/build/start 响应 (见 server/src/routes/build.ts) */
interface BuildStartResponse {
  buildId: string;
  plan: BuildProgressStep[];
  planSource: "hermes" | "template";
  unassignedAgentTypes: string[];
}

/** 本体规范卡状态 —— 一次「建域 xxx」在聊天流内的生命周期 */
interface SpecCardState {
  prompt: string;
  loading: boolean;
  error: string | null;
  planSource: "hermes" | "rejected" | null;
  spec: DomainSpecPayload | null;
  problems: SpecProblemPayload[];
  approvalId: string | null;
  approvalStatus: string | null;
  domainId: string | null;
}

/** POST /api/build/spec/start 响应 */
interface SpecStartResponse {
  specId: string | null;
  planSource: "hermes" | "rejected";
  spec: DomainSpecPayload | null;
  problems?: SpecProblemPayload[];
  approvalId?: string;
  documentId?: string;
}

interface InlineApprovalBubbleProps {
  approval: Approval;
  decision: "approve" | "reject" | null;
  busy: "approve" | "reject" | null;
  linkedIssue: Issue | null;
  onApprove: () => void;
  onReject: () => void;
  onOpenDetail: () => void;
  onOpenIssue: (issue: Issue) => void;
}

/**
 * 审批快照气泡 (默认快批)
 * 内嵌 标题 + 简要原因 + 关联任务链接 + 两个 44pt 内嵌按钮;
 * 长按或「查看详情」深链到审批裁决页弹完整卡。
 * 裁决完成后整条气泡就地替换为终结态。
 */
function InlineApprovalBubble({
  approval,
  decision,
  busy,
  linkedIssue,
  onApprove,
  onReject,
  onOpenDetail,
  onOpenIssue,
}: InlineApprovalBubbleProps) {
  if (decision) {
    return (
      <View style={styles.approvalRow}>
        <View
          style={[
            styles.approvalTerminalBubble,
            decision === "approve"
              ? styles.approvalTerminalOk
              : styles.approvalTerminalErr,
          ]}
        >
          <Text
            style={[
              styles.approvalTerminalText,
              { color: decision === "approve" ? C.ok : C.err },
            ]}
          >
            {decision === "approve" ? "✅ 已批准 " : "❌ 已驳回 "}
            {formatApprovalTitle(approval)}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.approvalRow}>
      <Pressable
        style={styles.approvalBubble}
        onLongPress={onOpenDetail}
        delayLongPress={300}
      >
        <View style={styles.approvalHeader}>
          <StatusDot status="running" color={C.warn} size={7} />
          <Text style={styles.approvalHeaderText}>待办审批</Text>
          <Pill
            label={approvalTypeLabel(approval.type)}
            size="sm"
            textStyle={{ color: C.warn }}
            style={styles.approvalTypeBadge}
          />
        </View>

        <Text style={styles.approvalTitle} numberOfLines={2}>
          {formatApprovalTitle(approval)}
        </Text>
        <Text style={styles.approvalReason} numberOfLines={3}>
          {formatApprovalSummary(approval)}
        </Text>

        {linkedIssue ? (
          <Pressable
            hitSlop={6}
            style={styles.approvalIssueLink}
            onPress={() => onOpenIssue(linkedIssue)}
          >
            <Ionicons name="link-outline" size={12} color={C.accent} />
            <Text style={styles.approvalIssueLinkText} numberOfLines={1}>
              关联任务 #{linkedIssue.id.slice(0, 6)} · {linkedIssue.title}
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.approvalButtonsRow}>
          <Pressable
            style={[
              styles.approvalApproveBtn,
              Boolean(busy) && styles.approvalBtnDisabled,
            ]}
            disabled={Boolean(busy)}
            onPress={onApprove}
          >
            {busy === "approve" ? (
              <ActivityIndicator size="small" color={C.ok} />
            ) : (
              <Text style={styles.approvalApproveText}>批准</Text>
            )}
          </Pressable>

          <Pressable
            style={[
              styles.approvalRejectBtn,
              Boolean(busy) && styles.approvalBtnDisabled,
            ]}
            disabled={Boolean(busy)}
            onPress={onReject}
          >
            {busy === "reject" ? (
              <ActivityIndicator size="small" color={C.err} />
            ) : (
              <Text style={styles.approvalRejectText}>驳回</Text>
            )}
          </Pressable>
        </View>

        <Pressable
          hitSlop={8}
          delayLongPress={300}
          style={styles.approvalDetailLink}
          onPress={onOpenDetail}
          onLongPress={onOpenDetail}
        >
          <Text style={styles.approvalDetailLinkText}>查看详情 ›</Text>
        </Pressable>
      </Pressable>
    </View>
  );
}

const WELCOME_MESSAGE: BoardChatMessage = {
  id: "welcome-init",
  role: "assistant",
  text: "掌柜您好！我是您的董事长助理 (Board Concierge)。关于智能体派发、额度消耗、交付进度或待办审批，请随时向我吩咐。",
  createdAt: new Date().toISOString(),
};

/**
 * 驾驶舱流式问答屏幕 (PRD需求⑫ 驾驶舱问答)
 * 采用 Linear 设计系统规范:
 * - 基于 POST /api/board/chat/stream 的 SSE 流式推流
 * - 打字机逐字渐显效果 + 状态指示条
 * - SSE 断线重连与优雅降级
 * - 历史记录滚动与输入法避让
 * - 集成审批快照气泡 (内嵌快批按钮 + 详情深链)
 */
export function BoardChatScreen({
  company,
  whoami: _whoami,
  onOpenApproval,
  onOpenIssue,
  onOpenPipeline,
  onOpenPlan,
  embedded = false,
}: BoardChatScreenProps) {
  const [messages, setMessages] = useState<BoardChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);
  const [boardIssueId, setBoardIssueId] = useState<string | null>(null);
  const [historyReady, setHistoryReady] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);

  /**
   * wave71: loadingState — 三态机驱动 thinking 三点动画 + streaming 切换。
   *   idle      : 不在等回复, 啥都不闪
   *   thinking  : SSE 已连上但首 token 还没回来 (等待中)
   *   streaming : 已经在收 token
   *
   * 真正的状态机用一段 useEffect 同步 `sending + streamingText` 派生:
   * `sending && !streamingText` → thinking, 否则 → streaming/sending=false → idle。
   * 不让 handleSend 自己去设, 是为了 onStatus / onChunk / onDone / 失败四路都要触发。
   */
  const loadingState: "idle" | "thinking" | "streaming" = sending
    ? streamingText
      ? "streaming"
      : "thinking"
    : "idle";

  /** wave71/wave135: 附件上传队列 (远端 id 挂在每条上, 见 StagedAttachmentLocal) */
  const [stagedAttachments, setStagedAttachments] = useState<StagedAttachmentLocal[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  /**
   * wave135: 在飞上传的 promise 表 (staged.id -> promise)。同一文件被并发触发
   * (即选即传 / boardIssueId 补传 / 发送前重试) 时复用同一个 promise，服务端
   * 只会收到一条附件；promise 结束即移除，失败可再次触发重试。
   */
  const attachmentUploadsRef = useRef<Map<string, Promise<string | null>>>(new Map());
  /** 清空对话确认 modal */
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const [approvalFeed, setApprovalFeed] = useState<ApprovalFeedItem[]>([]);
  const [approvalBusy, setApprovalBusy] = useState<
    Record<string, "approve" | "reject">
  >({});
  const [approvalIssues, setApprovalIssues] = useState<
    Record<string, Issue | null>
  >({});
  const linkedIssueCache = useRef<Record<string, Issue | null>>({});
  /** 构建环节 issueId -> Issue, 点击环节跳详情时补齐 */
  const buildIssueCache = useRef<Record<string, Issue | null>>({});

  const [buildCard, setBuildCard] = useState<BuildCardState | null>(null);
  const [specCard, setSpecCard] = useState<SpecCardState | null>(null);
  const flatListRef = useRef<FlatList<BoardChatMessage>>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const accumulatedRef = useRef("");
  /** wave144: 首 token 看门狗的表 + 是否由它触发 (区别于用户主动取消) */
  const firstTokenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstTokenTimeoutRef = useRef(false);

  // 会话内语音: 长按 mic 录音 -> 松开自动转文字填入输入框 -> 用户确认后再发送。
  // 只复用 wave14 的 useRecorder + voiceDispatch 链路 (mode=transcribe-only), 不建任务。
  const { recording, start: startRecording, stop: stopRecording, forceStop } = useRecorder();
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  /** 一次长按期间的录音启动承诺 + 按下时刻 (用于算长按时长、规避 onPressOut 早于 start 的竞态) */
  const voicePressRef = useRef<{ promise: Promise<boolean> | null; startedAt: number }>({
    promise: null,
    startedAt: 0,
  });
  /** 录音中的 mic 脉冲动画 */
  const micPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!recording) {
      micPulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(micPulse, { toValue: 0.4, duration: 500, useNativeDriver: true }),
        Animated.timing(micPulse, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [recording, micPulse]);

  // 光标闪烁定时器
  useEffect(() => {
    if (!sending) return;
    const interval = setInterval(() => {
      setCursorVisible((v) => !v);
    }, 450);
    return () => clearInterval(interval);
  }, [sending]);

  // 加载持久化历史对话 (基于 "Board Operations" Issue)
  const loadHistory = useCallback(async () => {
    setErrorText(null);
    try {
      const history = await coolie.getBoardChatHistory(company.id);
      if (history.issueId) {
        setBoardIssueId(history.issueId);
      }
      // wave115: 防御性过滤 —— 历史里若有空 content 行或状态提示伪消息
      // (「正在连接会话助手…」类), 一律不渲染; 过滤后为空则回到欢迎语。
      const clean = history.messages.filter(isRenderableBoardMessage);
      setMessages(clean.length > 0 ? clean : [WELCOME_MESSAGE]);
    } catch {
      // 保持当前显示
    } finally {
      setHistoryReady(true);
    }
  }, [company.id]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  /**
   * wave144: 订阅并恢复在飞的这一次发问。挂载时若模块里还留着一条在飞的流
   * (老板发完问切去了别的 tab 又切回来), 立刻恢复转圈 / 已到的正文; 流结束时
   * 会收到 null 并清干净。已结束的不恢复 —— 回复已由服务端落库, loadHistory
   * 会拉到, 避免重复。
   */
  useEffect(() => {
    const listener = (state: LiveBoardChatState | null) => {
      if (state && state.companyId === company.id) {
        setSending(true);
        setStreamingText(state.accumulated);
        setStatusText(state.status);
        return;
      }
      if (!state) {
        setSending(false);
        setStreamingText("");
        setStatusText("");
      }
    };
    liveBoardChatListeners.add(listener);
    listener(liveBoardChat);
    return () => {
      liveBoardChatListeners.delete(listener);
    };
  }, [company.id]);

  const copyToClipboard = useCallback((text: string) => {
    Clipboard.setString(text);
    Alert.alert("已复制", "消息已复制到剪贴板");
  }, []);

  const scrollToBottom = useCallback((animated = true) => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated });
    }, 80);
  }, []);

  // 外部系统提示气泡: 历史加载完成后再回灌队列并订阅实时推送
  const appendEcho = useCallback(
    (message: BoardChatMessage) => {
      setMessages((prev) => [...prev, message]);
      scrollToBottom();
    },
    [scrollToBottom],
  );

  const pushSystemEcho = useCallback(
    (text: string) => {
      appendEcho({
        id: `voice-echo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: "system",
        text,
        createdAt: new Date().toISOString(),
      });
    },
    [appendEcho],
  );

  /**
   * 会话内语音 (长按 mic): 按下开始录音, 松开自动转文字并**填入输入框**,
   * 由用户确认后再走既有发送流程。这里不建任务、不自动派发 —— 转写只产出文本。
   *
   * 竞态: onPressIn 里的 startRecording 是异步的 (要权限 + 起录音机), 用户可能
   * 在它完成前就松手。所以按下时先存一个启动承诺, 松开时先 await 它, 再停止录音,
   * 避免「松手时 recording 还是 false -> 录音机继续空转」。
   */
  const handleMicPressIn = useCallback(() => {
    // 保护: 如果已经在录音中，再次按下代表用户希望强制停止卡死的录音
    if (recording) {
      void forceStop();
      setVoiceBusy(false);
      setVoiceStatus(null);
      return;
    }
    if (voiceBusy || sending) return;
    voicePressRef.current.startedAt = Date.now();
    voicePressRef.current.promise = (async () => {
      try {
        await startRecording();
        setVoiceStatus("🎤 录音中… 松开转文字");
        return true;
      } catch (e) {
        Alert.alert("录音失败", String((e as Error)?.message ?? e));
        return false;
      }
    })();
  }, [recording, forceStop, voiceBusy, sending, startRecording]);

  const handleMicPressOut = useCallback(async () => {
    const press = voicePressRef.current;
    if (!press.promise) {
      // 容错: 如果当前还在录音但 promise 丢了，强制切断
      if (recording) {
        await forceStop();
        setVoiceBusy(false);
        setVoiceStatus(null);
      }
      return;
    }
    voicePressRef.current.promise = null;

    setVoiceBusy(true);
    setVoiceStatus("识别中…");
    try {
      const started = await press.promise;
      if (!started) return;

      const { base64, format } = await stopRecording();
      if (!base64) {
        pushSystemEcho("🎤 未采集到有效声音, 请长按麦克风说话后松开");
        return;
      }
      if (Date.now() - press.startedAt < MIN_VOICE_HOLD_MS) {
        pushSystemEcho("🎤 按太短了, 请长按说话");
        return;
      }

      const res = await coolie.voiceDispatch({
        companyId: company.id,
        audioBase64: base64,
        format,
        mode: "transcribe-only",
      });

      const text = (res.text ?? res.transcription?.text ?? "").trim();
      if (text) {
        setInput((prev) => (prev ? `${prev} ${text}` : text));
        pushSystemEcho(`🎤 已转写: ${text}`);
      } else {
        pushSystemEcho("🎤 没听清, 请再说一次");
      }
    } catch (e) {
      if (isAsrNotConfigured(e)) {
        pushSystemEcho("🎤 语音未配置: 该实例尚未配置腾讯 ASR 凭据, 请改用文字输入");
      } else {
        pushSystemEcho(`🎤 转写失败: ${String((e as Error)?.message ?? e)}`);
      }
    } finally {
      setVoiceBusy(false);
      setVoiceStatus(null);
    }
  }, [recording, forceStop, company.id, stopRecording, pushSystemEcho]);

  /** 向左滑动取消录音 */
  const handleMicCancel = useCallback(async () => {
    voicePressRef.current.promise = null;
    await forceStop();
    setVoiceBusy(false);
    setVoiceStatus(null);
    pushSystemEcho("🎤 录音已取消");
  }, [forceStop, pushSystemEcho]);

  useEffect(() => {
    if (!historyReady) return;
    const queued = drainBoardEchoQueue();
    if (queued.length > 0) {
      setMessages((prev) => [...prev, ...queued]);
      scrollToBottom();
    }
    boardEchoListeners.add(appendEcho);
    return () => {
      boardEchoListeners.delete(appendEcho);
    };
  }, [historyReady, appendEcho, scrollToBottom]);

  // 拉取待办审批快照 + 各自关联任务 (气泡内嵌快批 + 关联任务链接)
  const fetchPendingApprovals = useCallback(async () => {
    try {
      const list = await coolie.listApprovals(company.id, { status: "pending" });
      const pending = list.filter((a) => a.status === "pending");

      setApprovalFeed((prev) => {
        const decided = prev.filter((item) => item.decision !== null);
        const decidedIds = new Set(decided.map((item) => item.approval.id));
        const fresh: ApprovalFeedItem[] = pending
          .filter((a) => !decidedIds.has(a.id))
          .map((a) => ({ approval: a, decision: null }));
        return [...fresh, ...decided].slice(-8);
      });

      const missing = pending.filter((a) => !(a.id in linkedIssueCache.current));
      if (missing.length > 0) {
        const resolved = await Promise.all(
          missing.map(async (a) => {
            try {
              const issues = await coolie.getApprovalIssues(a.id);
              return [a.id, issues[0] ?? null] as const;
            } catch {
              return [a.id, null] as const;
            }
          }),
        );
        resolved.forEach(([id, issue]) => {
          linkedIssueCache.current[id] = issue;
        });
        setApprovalIssues({ ...linkedIssueCache.current });
      }
    } catch {
      // 忽略未登录或网络临时抖动报错
    }
  }, [company.id]);

  useEffect(() => {
    void fetchPendingApprovals();
    const timer = setInterval(() => {
      void fetchPendingApprovals();
    }, 8000);
    return () => clearInterval(timer);
  }, [fetchPendingApprovals]);

  // 气泡内嵌快批: 裁决成功即就地终结 + 向 chat 流追加系统提示气泡
  const handleApprovalDecision = useCallback(
    async (approval: Approval, decision: "approve" | "reject") => {
      if (approvalBusy[approval.id]) return;
      setApprovalBusy((prev) => ({ ...prev, [approval.id]: decision }));
      try {
        await coolie.resolveApproval(approval.id, decision);
        setApprovalFeed((prev) =>
          prev.map((item) =>
            item.approval.id === approval.id ? { ...item, decision } : item,
          ),
        );
        const label = formatApprovalTitle(approval);
        appendEcho({
          id: `system-echo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          role: "system",
          text: decision === "approve" ? `✅ 已批准 ${label}` : `❌ 已驳回 ${label}`,
          createdAt: new Date().toISOString(),
        });
      } catch (e) {
        Alert.alert("审批操作失败", String((e as Error)?.message ?? "请稍后重试"));
      } finally {
        setApprovalBusy((prev) => {
          const next = { ...prev };
          delete next[approval.id];
          return next;
        });
      }
    },
    [approvalBusy, appendEcho],
  );

  /**
   * 构建模式: "build xxx" 触发一张构建计划卡 (五步链) 进聊天流。
   * 计划创建与总办问答相互独立 —— 聊天流照常回答, 这里只追加进度卡。
   */
  const startBuild = useCallback(
    async (prompt: string) => {
      setBuildCard({
        prompt,
        steps: [],
        loading: true,
        error: null,
        planSource: null,
      });
      try {
        const result = await coolie.request<BuildStartResponse>(
          "POST",
          "/api/build/start",
          { companyId: company.id, prompt },
        );
        setBuildCard({
          prompt,
          steps: result.plan,
          loading: false,
          error: null,
          planSource: result.planSource,
        });
      } catch (e) {
        setBuildCard({
          prompt,
          steps: [],
          loading: false,
          error: String((e as Error)?.message ?? e ?? "构建计划创建失败"),
          planSource: null,
        });
      }
    },
    [company.id],
  );

  /**
   * 本体规范: "建域 xxx" 触发一张规范预览卡进聊天流。
   *
   * 与服务端的契约是「规划 + 校验」, 不含写入 —— 这一步只在控制面留下一个
   * issue 和一条待审批, 本体里什么都没有。落库要等审批通过后调
   * `/api/build/spec/:specId/instantiate`, 这里不做, 也不该做。
   */
  const startSpec = useCallback(
    async (prompt: string) => {
      setSpecCard({
        prompt,
        loading: true,
        error: null,
        planSource: null,
        spec: null,
        problems: [],
        approvalId: null,
        approvalStatus: null,
        domainId: null,
      });
      try {
        const result = await coolie.request<SpecStartResponse>(
          "POST",
          "/api/build/spec/start",
          { companyId: company.id, prompt },
        );
        setSpecCard({
          prompt,
          loading: false,
          error: null,
          planSource: result.planSource,
          spec: result.spec,
          problems: result.problems ?? [],
          approvalId: result.approvalId ?? null,
          // 服务端刚建的就是 pending; 不是 pending 才需要重新拉取。
          approvalStatus: result.planSource === "hermes" ? "pending" : null,
          domainId: null,
        });
      } catch (e) {
        setSpecCard({
          prompt,
          loading: false,
          error: String((e as Error)?.message ?? e ?? "本体规范生成失败"),
          planSource: null,
          spec: null,
          problems: [],
          approvalId: null,
          approvalStatus: null,
          domainId: null,
        });
      }
    },
    [company.id],
  );

  /**
   * Pipeline 分发: 「建 pipeline xxx」走 paperclip 上游既有的
   * POST /api/companies/:companyId/pipelines 建一条只带名字的 pipeline,
   * 回执后交给 App.tsx 跳编辑器。
   */
  const startPipeline = useCallback(
    async (subject: string) => {
      pushSystemEcho(`⏳ 正在创建 Pipeline · ${subject}`);
      try {
        const created = await coolie.request<{ id: string; name: string }>(
          "POST",
          `/api/companies/${encodeURIComponent(company.id)}/pipelines`,
          { key: pipelineKeyFromName(subject), name: subject },
        );
        pushSystemEcho(
          `✅ ${tCommand("Pipeline created")} · ${created.name} (#${created.id.slice(0, 8)})`,
        );
        onOpenPipeline?.(created.id);
      } catch (e) {
        pushSystemEcho(`❌ Pipeline 创建失败: ${String((e as Error)?.message ?? e)}`);
      }
    },
    [company.id, pushSystemEcho, onOpenPipeline],
  );

  /**
   * Plan 分发: 服务端没有 plans 端点, 按 brief 用 issue_relations 模拟 ——
   * 建一条 `Plan: xxx` 的 plan 任务承载计划, 回执后跳它的详情。
   */
  const startPlan = useCallback(
    async (subject: string) => {
      pushSystemEcho(`⏳ 正在创建 Plan · ${subject}`);
      try {
        const issue = await coolie.createIssue({
          companyId: company.id,
          title: `Plan: ${subject}`,
          description: `由工坊对话创建的计划任务 (Plan mode)\n\n目标: ${subject}`,
        });
        pushSystemEcho(
          `✅ ${tCommand("Plan created")} · #${issue.id.slice(0, 6)} ${issue.title}`,
        );
        onOpenPlan?.(issue);
      } catch (e) {
        pushSystemEcho(`❌ Plan 创建失败: ${String((e as Error)?.message ?? e)}`);
      }
    },
    [company.id, pushSystemEcho, onOpenPlan],
  );

  /**
   * PR 分发: 建一条带 pr-workflow 意图的任务, 交 heartbeat 走 GitHub 开 PR
   * 链路。issue 创建模型没有 tags 字段, 意图写进标题前缀 + 描述里。
   */
  const startPr = useCallback(
    async (subject: string) => {
      pushSystemEcho(`⏳ 正在触发 PR workflow · ${subject}`);
      try {
        const issue = await coolie.createIssue({
          companyId: company.id,
          title: `PR: ${subject}`,
          description: `由工坊对话触发 GitHub PR workflow (标签意图: pr-workflow)\n\n改动: ${subject}`,
        });
        pushSystemEcho(
          `✅ ${tCommand("PR workflow triggered")} · #${issue.id.slice(0, 6)} ${issue.title}`,
        );
      } catch (e) {
        pushSystemEcho(`❌ PR workflow 触发失败: ${String((e as Error)?.message ?? e)}`);
      }
    },
    [company.id, pushSystemEcho],
  );

  /**
   * wave135: 把一个 staged 附件上传成服务端 attachment.id。
   *
   * 幂等 + 去重，替代旧的「即选即传 + 按下标补传」双路径：
   *  - 已有 remoteId -> 直接返回该 id (同一文件不会重复上传)；
   *  - 已在飞 -> 复用同一个 promise (并发路径不会各传一份，服务端只落一条)；
   *  - 失败 -> 记 error 停在 staged 上，等发送守卫显式重试，不会自动重跑成死循环。
   */
  const uploadStagedAttachment = useCallback(
    (item: StagedAttachmentLocal): Promise<string | null> => {
      if (item.remoteId) return Promise.resolve(item.remoteId);
      const inFlight = attachmentUploadsRef.current.get(item.id);
      if (inFlight) return inFlight;

      const task = (async (): Promise<string | null> => {
        setUploadingAttachments(true);
        setStagedAttachments((prev) =>
          prev.map((entry) =>
            entry.id === item.id ? { ...entry, error: undefined } : entry,
          ),
        );
        try {
          // wave135: 附件必须挂在已存在的 issue 上。boardIssueId 还没就绪时
          // (全新公司尚无常驻 Board Operations issue) 先把它解析/创建出来,
          // 否则新公司「第一次带附件发送」无 issue 可传、被永久挡下。
          let issueId = boardIssueId;
          if (!issueId) {
            issueId = await coolie.ensureBoardIssue(company.id);
            setBoardIssueId(issueId);
          }
          const uploaded = await coolie.uploadAttachment(company.id, issueId, {
            uri: item.uri,
            name: item.name,
            type: item.mimeType,
          });
          setStagedAttachments((prev) =>
            prev.map((entry) =>
              entry.id === item.id
                ? { ...entry, remoteId: uploaded.id, error: undefined }
                : entry,
            ),
          );
          return uploaded.id;
        } catch (e) {
          const message = String((e as Error)?.message ?? e);
          setStagedAttachments((prev) =>
            prev.map((entry) =>
              entry.id === item.id ? { ...entry, error: message } : entry,
            ),
          );
          return null;
        }
      })();

      attachmentUploadsRef.current.set(item.id, task);
      void task.finally(() => {
        attachmentUploadsRef.current.delete(item.id);
        setUploadingAttachments(attachmentUploadsRef.current.size > 0);
      });
      return task;
    },
    [boardIssueId, company.id],
  );

  const handleSend = useCallback(
    async (textToSend?: string) => {
      const prompt = (textToSend ?? input).trim();
      if (!prompt || sending) return;

      // wave71/wave135: 附件 — 发问前把 staged 的本地文件全部上传成 attachment.id,
      // 一起随 message 走 POST /api/board/chat/stream (server 端会反向 link
      // issueCommentId)。守卫改成「按附件身份 (remoteId) 判断是否齐全」而不是
      // 比数组长度：在飞的复用同一个上传 promise 等它落地，之前失败的在这里
      // 就地重试一次 —— 无论哪条路径，都不会出现「永远相等不了」的死锁。
      const staged = stagedAttachments;
      const pendingUploads = staged.filter((entry) => !entry.remoteId);
      if (pendingUploads.length > 0) {
        // 并发触发同一文件时复用同一个 promise (服务端只收一条附件);
        // boardIssueId 缺省时 uploadStagedAttachment 会先解析出常驻 issue。
        // 全新公司的第一次上传也不会被挡下。
        const results = await Promise.all(
          pendingUploads.map((entry) => uploadStagedAttachment(entry)),
        );
        const failed = pendingUploads.filter((_, index) => !results[index]);
        if (failed.length > 0) {
          Alert.alert(
            "附件上传失败",
            `${failed.map((entry) => entry.name).join("、")} 上传失败, 请重试或清空附件`,
          );
          return;
        }
      }
      const activeAttachmentIds = staged
        .map((entry) => entry.remoteId)
        .filter((id): id is string => Boolean(id));

      setInput("");
      setErrorText(null);
      setLastPrompt(prompt);

      // 先判这条消息要触发的编排能力, 再决定是否进总办问答流。
      const command = parseCommand(prompt);
      const isOrchestrationCommand =
        command.kind === "pipeline" || command.kind === "plan" || command.kind === "pr";

      // 乐观追加用户消息
      const userMsg: BoardChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        text: prompt,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      scrollToBottom();

      // 消费完清空附件队列 (无论流是否成功)
      const attachmentIdsForThisSend = activeAttachmentIds;
      setStagedAttachments([]);

      // "build xxx" 追加构建计划卡, "建域 xxx" 追加本体规范卡, 与总办回答并行推进;
      // pipeline / plan / pr 只走各自编排分发 (不再进问答流)。
      if (command.kind === "domain") void startSpec(prompt);
      else if (command.kind === "build") void startBuild(prompt);
      else if (command.kind === "pipeline") void startPipeline(command.subject);
      else if (command.kind === "plan") void startPlan(command.subject);
      else if (command.kind === "pr") void startPr(command.subject);

      if (isOrchestrationCommand) return;

      setStreamingText("");
      setStatusText("正在连接会话助手…");
      setSending(true);
      accumulatedRef.current = "";

      const controller = new AbortController();
      abortControllerRef.current = controller;
      // wave144: 把这次发问镜像到模块, 切 tab 卸载后仍能恢复; 同时起首 token
      // 看门狗 —— 全程没有 token 就主动收场, 不把老板晾在转圈里。
      liveBoardChatAbort = controller;
      firstTokenTimeoutRef.current = false;
      publishLiveBoardChat({
        companyId: company.id,
        accumulated: "",
        status: "正在连接会话助手…",
      });
      if (firstTokenTimerRef.current) clearTimeout(firstTokenTimerRef.current);
      firstTokenTimerRef.current = setTimeout(() => {
        if (accumulatedRef.current.trim()) return;
        firstTokenTimeoutRef.current = true;
        controller.abort();
      }, FIRST_TOKEN_TIMEOUT_MS);

      try {
        await coolie.streamBoardChat(
          {
            companyId: company.id,
            message: prompt,
            taskId: boardIssueId ?? undefined,
            attachmentIds: attachmentIdsForThisSend.length > 0
              ? attachmentIdsForThisSend
              : undefined,
            signal: controller.signal,
          },
          {
            onStart: (issueId) => {
              setBoardIssueId(issueId);
            },
            onStatus: (status) => {
              setStatusText(status);
              publishLiveBoardChat({
                companyId: company.id,
                accumulated: accumulatedRef.current,
                status,
              });
            },
            onChunk: (chunk) => {
              // 首个 token 到了, 看门狗下班。
              if (firstTokenTimerRef.current) {
                clearTimeout(firstTokenTimerRef.current);
                firstTokenTimerRef.current = null;
              }
              accumulatedRef.current += chunk;
              setStreamingText(accumulatedRef.current);
              setStatusText("");
              publishLiveBoardChat({
                companyId: company.id,
                accumulated: accumulatedRef.current,
                status: "",
              });
              scrollToBottom(false);
            },
            onDone: (doneEvent) => {
              if (doneEvent.issueId) {
                setBoardIssueId(doneEvent.issueId);
              }
            },
            onError: (err) => {
              // 服务端已经给了终局错误, 看门狗没有意义了。
              if (firstTokenTimerRef.current) {
                clearTimeout(firstTokenTimerRef.current);
                firstTokenTimerRef.current = null;
              }
              const msg =
                typeof err === "string" ? err : err?.message ?? "问答流中断";
              setErrorText(msg);
            },
          },
        );

        // 完成流式接收，归档为 Assistant 消息
        const finalContent = accumulatedRef.current.trim();
        if (finalContent) {
          const assistantMsg: BoardChatMessage = {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            text: finalContent,
            createdAt: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, assistantMsg]);
        }
      } catch (e: any) {
        // wave144: 看门狗触发的 abort 不是「用户取消」—— 要给出可重试的错误,
        // 不能像主动取消那样静默返回 (那正是老板看不到任何反馈的原因)。
        if (firstTokenTimeoutRef.current) {
          setErrorText(
            `助手 ${Math.round(FIRST_TOKEN_TIMEOUT_MS / 1000)} 秒内没有返回内容, 可能卡住了 — 点「重试」再发一次。`,
          );
          return;
        }
        if (controller.signal.aborted) return;
        const msg = String(e?.message ?? e ?? "连接异常");
        setErrorText(msg);

        // 如果已经流式输出了部分内容，保留下来
        const partial = accumulatedRef.current.trim();
        if (partial) {
          const assistantMsg: BoardChatMessage = {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            text: partial,
            createdAt: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, assistantMsg]);
        }
      } finally {
        if (firstTokenTimerRef.current) {
          clearTimeout(firstTokenTimerRef.current);
          firstTokenTimerRef.current = null;
        }
        setSending(false);
        setStreamingText("");
        setStatusText("");
        abortControllerRef.current = null;
        // 清掉模块镜像: 结束的这一次不再恢复 (回复由 loadHistory 从服务端拉)。
        publishLiveBoardChat(null);
        scrollToBottom();
      }
    },
    [
      input,
      sending,
      company.id,
      boardIssueId,
      stagedAttachments,
      uploadStagedAttachment,
      scrollToBottom,
      startSpec,
      startBuild,
      startPipeline,
      startPlan,
      startPr,
    ],
  );

  // 外部入口 (「查看演示」/ 深链) 投递的待发送 prompt：历史加载完成后自动发出。
  useEffect(() => {
    if (!historyReady) return;
    const queued = drainBoardPromptQueue();
    if (queued.length > 0) void handleSend(queued[0]);
    // handleSend 每次渲染都会变；这里只在历史就绪时消费一次队列，刻意不重跑。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyReady]);

  /**
   * wave71/wave135: 选完附件只 stage 住 (同一文件按 id 幂等, 不重复 stage)。
   * 真正的上传统一走下面的 effect —— 只有一条路径，不会再出现「即选即传」
   * 与「补传」双触发导致同一文件被传两遍。
   */
  const handlePickAttachment = useCallback((picked: StagedAttachment) => {
    setStagedAttachments((prev) =>
      prev.some((entry) => entry.id === picked.id) ? prev : [...prev, picked],
    );
  }, []);

  /**
   * wave71/wave135: boardIssueId 就绪后 (start 事件 / 历史加载) 自动补传所有
   * 还没有 remoteId 的 staged 附件。失败项带着 error 停在队列里不自动重试，
   * 由用户点发送时重试，避免 effect<->state 互相触发成死循环。
   */
  useEffect(() => {
    if (!boardIssueId) return;
    for (const item of stagedAttachments) {
      if (item.remoteId || item.error) continue;
      void uploadStagedAttachment(item);
    }
  }, [boardIssueId, stagedAttachments, uploadStagedAttachment]);

  /**
   * wave71: 清空工坊对话框 — DELETE /api/board/chat/conversation/:issueId,
   * 软删所有评论; 本地 messages 同步置为欢迎语, 让 UI 立即干净。
   */
  const handleClearConversation = useCallback(async () => {
    setConfirmClear(false);
    if (!boardIssueId) {
      // 还没有 board issue: 直接清空本地视图即可
      setMessages([WELCOME_MESSAGE]);
      pushSystemEcho("🧹 对话框已清空 (无历史会话)");
      return;
    }
    setClearing(true);
    try {
      const result = await coolie.clearBoardConversation(company.id, boardIssueId);
      setMessages([WELCOME_MESSAGE]);
      pushSystemEcho(
        `🧹 对话框已清空 (${result.deletedCount} 条历史)${
          result.deletedCount === 0 ? " — 工坊是干净的" : ""
        }`,
      );
    } catch (e) {
      Alert.alert(
        "清空失败",
        String((e as Error)?.message ?? e ?? "未知错误"),
      );
    } finally {
      setClearing(false);
    }
  }, [boardIssueId, company.id, pushSystemEcho]);

  /**
   * wave71: 最近一条 assistant / system 消息的时间戳 — 头部右侧显示。
   * 用户消息不计入, 因为头部的「上一回」始终是工坊的回复时间。
   */
  const latestAssistantTimestamp = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "assistant" || m.role === "system") {
        return typeof m.createdAt === "string"
          ? m.createdAt
          : m.createdAt.toISOString();
      }
    }
    return null;
  }, [messages]);

  const handleRetry = () => {
    if (lastPrompt) {
      void handleSend(lastPrompt);
    }
  };

  const handleStop = () => {
    // wave144: 重挂载后本组件的 ref 里已经没有 controller —— 用模块里那条在飞
    // 的 (liveBoardChatAbort), 这样「切走又切回来」后的取消键仍能中止原来的流。
    const controller = abortControllerRef.current ?? liveBoardChatAbort;
    if (!controller) return;
    if (firstTokenTimerRef.current) {
      clearTimeout(firstTokenTimerRef.current);
      firstTokenTimerRef.current = null;
    }
    controller.abort();
    setSending(false);
    const partial = accumulatedRef.current.trim();
    if (partial) {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-stopped-${Date.now()}`,
          role: "assistant",
          text: `${partial}\n\n*(已手动停止生成)*`,
          createdAt: new Date().toISOString(),
        },
      ]);
    }
    setStreamingText("");
    setStatusText("");
    publishLiveBoardChat(null);
  };

  /**
   * 构建进度卡点击某环节 -> 打开对应任务详情。
   * 卡片只给出 issueId, 这里从任务列表补齐 Issue 再交给上层深链,
   * 与审批卡的「关联任务」走同一条 onOpenIssue 通道。
   */
  const handleOpenBuildIssue = useCallback(
    async (issueId: string) => {
      if (!onOpenIssue) return;
      const cached = buildIssueCache.current[issueId];
      if (cached) {
        onOpenIssue(cached);
        return;
      }
      try {
        const issues = await coolie.listIssues(company.id, { limit: 100 });
        const found = issues.find((issue) => issue.id === issueId) ?? null;
        buildIssueCache.current[issueId] = found;
        if (found) onOpenIssue(found);
      } catch {
        // 打不开就不跳, 与审批卡关联任务的行为一致
      }
    },
    [company.id, onOpenIssue],
  );

  interface MessageSegment {
    type: "text" | "code";
    content: string;
    language?: string;
  }

  function parseMessageSegments(rawText: string): MessageSegment[] {
    const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g;
    const parts: MessageSegment[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(rawText)) !== null) {
      if (match.index > lastIndex) {
        const textChunk = rawText.slice(lastIndex, match.index);
        if (textChunk.trim()) {
          parts.push({ type: "text", content: textChunk });
        }
      }
      const lang = match[1]?.trim() || "typescript";
      const code = match[2]?.trimEnd() || "";
      parts.push({
        type: "code",
        content: code,
        language: lang,
      });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < rawText.length) {
      const trailing = rawText.slice(lastIndex);
      if (trailing.trim() || parts.length === 0) {
        parts.push({ type: "text", content: trailing });
      }
    }

    return parts.length > 0 ? parts : [{ type: "text", content: rawText }];
  }

  const renderMessageItem = ({ item }: { item: BoardChatMessage }) => {
    const isUser = item.role === "user";

    if (item.role === "system") {
      return (
        <View style={styles.systemRow}>
          <View style={styles.systemBubble}>
            <Text style={styles.systemText}>{item.text}</Text>
          </View>
        </View>
      );
    }

    if (isUser) {
      return (
        <View style={styles.userRow}>
          <Pressable
            style={styles.userBubble}
            onLongPress={() => copyToClipboard(item.text)}
            delayLongPress={300}
          >
            <Text style={styles.userText}>{item.text}</Text>
          </Pressable>
        </View>
      );
    }

    // 摘出总办回复里夹带的内嵌预览标签, 正文只留 cleanText
    const { cleanText, previews } = parseInlineTags(item.text, item.id);
    const segments = parseMessageSegments(cleanText);

    return (
      <View style={styles.assistantRow}>
        <View style={styles.avatarBox}>
          <Text style={styles.avatarText}>🤖</Text>
        </View>
        <Pressable
          style={styles.assistantBubble}
          onLongPress={() => copyToClipboard(item.text)}
          delayLongPress={300}
        >
          <View style={styles.assistantHeader}>
            <Text style={styles.timestamp}>{formatTime(item.createdAt)}</Text>
          </View>
          {segments.length === 1 && segments[0].type === "text" ? (
            <Text style={styles.assistantText}>{cleanText}</Text>
          ) : (
            <View style={styles.chatSegmentsBox}>
              {segments.map((seg, idx) => {
                if (seg.type === "text") {
                  return (
                    <Text key={`txt-${idx}`} style={styles.assistantText}>
                      {seg.content}
                    </Text>
                  );
                }
                const lineCount = seg.content.split("\n").length;
                const blockHeight = Math.min(Math.max(lineCount * 21 + 24, 90), 320);
                return (
                  <View key={`code-${idx}`} style={styles.chatCodeCard}>
                    <View style={styles.chatCodeHeader}>
                      <Text style={styles.chatCodeLang}>{seg.language || "code"}</Text>
                      <Text style={styles.chatCodeLines}>{lineCount} 行</Text>
                    </View>
                    <CodeViewerWebView
                      code={seg.content}
                      language={seg.language}
                      readOnly={true}
                      lineNumbers={true}
                      style={{ height: blockHeight }}
                    />
                  </View>
                );
              })}
            </View>
          )}

          {/* 内嵌预览: 就地渲染, 不切屏 (对齐 ChatHome 的对话流内嵌预览) */}
          {previews.length > 0 ? (
            <View style={styles.inlinePreviewStack}>
              {previews.map((p) => (
                <InlinePreviewPanel
                  key={p.id}
                  url={p.url}
                  imageUrl={p.imageUrl}
                  title={p.title ?? (p.kind === "url" ? p.url : "MVP 预览")}
                />
              ))}
            </View>
          ) : null}
        </Pressable>
      </View>
    );
  };

  // 嵌入模式 (工作空间「对话」Tab) 下不套 SafeAreaView, 避免双重安全区留白
  const Root: React.ComponentType<any> = embedded ? View : SafeAreaView;

  return (
    <Root style={styles.safeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
      >
        {/* 顶部导航栏 (wave71 抽出到 <ChatHeader/>) */}
        {/* wave115: 状态提示只保留聊天流内那一处 —— 头部不再重复渲染
            「正在连接会话助手…」(boss 反馈那行黄点+文案看上去像一条被存库的
            消息, 且与气泡内指示同时出现 = loading 双渲染)。 */}
        <ChatHeader
          timestamp={latestAssistantTimestamp}
          embedded={embedded}
          onRequestClear={() => setConfirmClear(true)}
        />

        {/* 问答对话列表 */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessageItem}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => scrollToBottom(false)}
          onLayout={() => scrollToBottom(false)}
          ListHeaderComponent={
            approvalFeed.length > 0 ? (
              <View style={styles.approvalStack}>
                {approvalFeed.map((item) => (
                  <InlineApprovalBubble
                    key={item.approval.id}
                    approval={item.approval}
                    decision={item.decision}
                    busy={approvalBusy[item.approval.id] ?? null}
                    linkedIssue={approvalIssues[item.approval.id] ?? null}
                    onApprove={() =>
                      void handleApprovalDecision(item.approval, "approve")
                    }
                    onReject={() =>
                      void handleApprovalDecision(item.approval, "reject")
                    }
                    onOpenDetail={() => onOpenApproval?.(item.approval.id)}
                    onOpenIssue={(issue) => onOpenIssue?.(issue)}
                  />
                ))}
              </View>
            ) : null
          }
          ListFooterComponent={
            <>
              {/* 空状态快捷提问气泡 (无历史或仅有欢迎消息时展示) */}
              {messages.length <= 1 && !sending && (
                <View style={styles.emptyPromptSection}>
                  <Text style={styles.emptyPromptTitle}>您可以尝试这样提问：</Text>
                  <View style={styles.emptyPromptGrid}>
                    {QUICK_PROMPTS.map((prompt) => (
                      <AppCard
                        key={prompt}
                        row
                        radius={8}
                        padding={8}
                        onPress={() => void handleSend(prompt)}
                        style={styles.emptyPromptCard}
                      >
                        <Ionicons
                          name="sparkles-outline"
                          size={14}
                          color={C.accent}
                          style={{ marginRight: 6 }}
                        />
                        <Text style={styles.emptyPromptCardText}>{prompt}</Text>
                      </AppCard>
                    ))}
                  </View>
                </View>
              )}

              {/* 构建计划进度卡 (由 "build xxx" 触发) */}
              {buildCard && (
                <BuildProgressCard
                  prompt={buildCard.prompt}
                  steps={buildCard.steps}
                  loading={buildCard.loading}
                  error={buildCard.error}
                  planSource={buildCard.planSource}
                  onOpenIssue={(issueId) => void handleOpenBuildIssue(issueId)}
                />
              )}

              {/* 本体规范预览卡 (由 "建域 xxx" 触发) */}
              {specCard && (
                <SpecDiffCard
                  prompt={specCard.prompt}
                  loading={specCard.loading}
                  error={specCard.error}
                  planSource={specCard.planSource}
                  document={specCard.spec?.document ?? null}
                  problems={specCard.problems}
                  approvalStatus={specCard.approvalStatus}
                  domainId={specCard.domainId}
                  onOpenApproval={() => {
                    if (specCard.approvalId) onOpenApproval?.(specCard.approvalId);
                  }}
                />
              )}

              {/* 实时流式打字机气泡 */}
              {sending && (
                <View style={styles.assistantRow}>
                  <View style={styles.avatarBox}>
                    <Text style={styles.avatarText}>🤖</Text>
                  </View>
                  <View style={styles.assistantBubble}>
                    {/* wave115: 单一 loading 指示 —— 只保留三点动画
                        (TypingBubbleText), 去掉并排的蓝点 StatusBadge 行,
                        避免同一时刻渲染两个「正在连接…」指示。 */}
                    {streamingText ? (
                      <Text style={styles.assistantText}>
                        {streamingText}
                        <Text
                          style={[
                            styles.cursorText,
                            !cursorVisible && styles.cursorHidden,
                          ]}
                        >
                          ▊
                        </Text>
                      </Text>
                    ) : (
                      // wave71: thinking 态用三点动画 (TypingBubbleText) 替
                      // 换 ActivityIndicator, 更轻、更像 ChatGPT 风格
                      <TypingBubbleText
                        text={statusText || "会话助手正在处理并调取数据…"}
                        visible={loadingState === "thinking"}
                      />
                    )}
                  </View>
                </View>
              )}

              {/* wave144: 失败不再只是底部闪一条 —— 像助手气泡一样留在流里,
                  带 [重试] [复制], 老板能看清到底发生了什么, 也能一键重来。 */}
              {Boolean(errorText) && (
                <View style={styles.assistantRow}>
                  <View style={[styles.avatarBox, styles.errorAvatarBox]}>
                    <Text style={styles.avatarText}>⚠️</Text>
                  </View>
                  <View style={[styles.assistantBubble, styles.errorBubble]}>
                    <Text style={styles.errorBubbleText}>{errorText}</Text>
                    <View style={styles.errorActionsRow}>
                      <Pressable
                        onPress={handleRetry}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel="重试"
                        style={styles.errorActionBtn}
                      >
                        <Ionicons name="refresh" size={13} color={C.err} />
                        <Text style={styles.errorActionText}>重试</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => copyToClipboard(errorText ?? "")}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel="复制"
                        style={styles.errorActionBtn}
                      >
                        <Ionicons name="copy-outline" size={13} color={C.err} />
                        <Text style={styles.errorActionText}>复制</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              )}
            </>
          }
        />

        {/* 语音派发状态条 */}
        {voiceStatus ? (
          <View style={styles.voiceStatusBar}>
            <StatusDot
              status="running"
              color={recording ? C.err : C.accent}
              size={6}
            />
            <Text style={styles.voiceStatusText}>{voiceStatus}</Text>
          </View>
        ) : null}

        {/* wave71: 附件 stage 区 — 选了附件就在输入区上方显示一行, 允许移除 */}
        {stagedAttachments.length > 0 ? (
          <View style={styles.stagedRow}>
            <Text style={styles.stagedHint}>
              📎 已选 {stagedAttachments.length} 个附件
              {uploadingAttachments ? " · 上传中…" : ""}
              {stagedAttachments.some((entry) => entry.error) &&
              !uploadingAttachments
                ? " · 有附件上传失败, 点发送重试"
                : ""}
            </Text>
            <Pressable
              hitSlop={6}
              onPress={() => {
                setStagedAttachments([]);
              }}
            >
              <Text style={styles.stagedClear}>清空</Text>
            </Pressable>
          </View>
        ) : null}

        {/* 底部输入框区域 (wave71 抽出到 <ChatInput/>) */}
        <ChatInput
          value={input}
          onChangeText={setInput}
          sending={sending}
          recording={recording}
          voiceBusy={voiceBusy}
          onMicPressIn={handleMicPressIn}
          onMicPressOut={() => void handleMicPressOut()}
          onMicCancel={() => void handleMicCancel()}
          onSend={() => void handleSend()}
          onStop={handleStop}
          onPickAttachment={(picked) => void handlePickAttachment(picked)}
          uploading={uploadingAttachments}
        />

        {/* wave71: 清空对话确认 Modal */}
        <Modal
          visible={confirmClear}
          transparent
          animationType="fade"
          onRequestClose={() => setConfirmClear(false)}
        >
          <View style={styles.confirmBackdrop}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => !clearing && setConfirmClear(false)}
            />
            <View style={styles.confirmSheet}>
              <Text style={styles.confirmTitle}>清空对话?</Text>
              <Text style={styles.confirmBody}>
                当前工坊会话的全部对话将被清空, 工坊会回到欢迎状态。此操作不可撤销。
              </Text>
              <View style={styles.confirmRow}>
                <Pressable
                  hitSlop={6}
                  disabled={clearing}
                  onPress={() => setConfirmClear(false)}
                  style={[styles.confirmBtn, styles.confirmBtnCancel]}
                >
                  <Text style={styles.confirmBtnCancelText}>取消</Text>
                </Pressable>
                <Pressable
                  hitSlop={6}
                  disabled={clearing}
                  onPress={() => void handleClearConversation()}
                  style={[styles.confirmBtn, styles.confirmBtnOk]}
                >
                  {clearing ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.confirmBtnOkText}>清空</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </Root>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.bg,
  },
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
    backgroundColor: C.bg,
  },
  /**
   * wave71: 附件 stage 行 — 输入框上方一行提示当前选了几个附件
   */
  stagedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: C.bg,
    borderTopWidth: 1,
    borderTopColor: C.lineSubtle,
  },
  stagedHint: {
    color: C.ink2,
    fontSize: 12,
    flex: 1,
    minWidth: 0,
  },
  stagedClear: {
    color: C.accent,
    fontSize: 12,
    fontWeight: "500",
  },
  /**
   * wave71: 清空对话确认 Modal 样式
   */
  confirmBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  confirmSheet: {
    backgroundColor: C.panel,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    width: "100%",
    maxWidth: 360,
    gap: 10,
    borderWidth: 1,
    borderColor: C.line,
  },
  confirmTitle: {
    color: C.ink,
    fontSize: 16,
    fontWeight: "600",
  },
  confirmBody: {
    color: C.ink2,
    fontSize: 13,
    lineHeight: 18,
  },
  confirmRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 4,
  },
  confirmBtn: {
    minWidth: 84,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnCancel: {
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.surface,
  },
  confirmBtnCancelText: {
    color: C.ink2,
    fontSize: 14,
    fontWeight: "500",
  },
  confirmBtnOk: {
    backgroundColor: C.brand,
  },
  confirmBtnOkText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  approvalStack: {
    gap: 10,
    marginBottom: 12,
  },
  approvalRow: {
    alignItems: "stretch",
  },
  approvalBubble: {
    backgroundColor: C.surface,
    borderColor: "rgba(245, 158, 11, 0.32)",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  approvalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  approvalHeaderText: {
    color: C.ink,
    fontSize: 12,
    fontWeight: "600",
  },
  approvalTypeBadge: {
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderColor: "rgba(245, 158, 11, 0.3)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
    alignSelf: "center",
  },
  approvalTitle: {
    color: C.ink,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  approvalReason: {
    color: C.ink2,
    fontSize: 12,
    lineHeight: 17,
  },
  approvalIssueLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
  },
  approvalIssueLinkText: {
    color: C.accent,
    fontSize: 12,
    flex: 1,
  },
  approvalButtonsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  approvalApproveBtn: {
    flex: 1,
    minHeight: 44,
    backgroundColor: "rgba(39, 166, 68, 0.16)",
    borderColor: "rgba(39, 166, 68, 0.38)",
    borderWidth: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  approvalApproveText: {
    color: C.ok,
    fontSize: 15,
    fontWeight: "600",
  },
  approvalRejectBtn: {
    flex: 1,
    minHeight: 44,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderColor: "rgba(239, 68, 68, 0.3)",
    borderWidth: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  approvalRejectText: {
    color: C.err,
    fontSize: 15,
    fontWeight: "600",
  },
  approvalBtnDisabled: {
    opacity: 0.5,
  },
  approvalDetailLink: {
    alignSelf: "flex-start",
    paddingVertical: 2,
  },
  approvalDetailLinkText: {
    color: C.ink3,
    fontSize: 12,
  },
  approvalTerminalBubble: {
    alignSelf: "center",
    maxWidth: "92%",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  approvalTerminalOk: {
    backgroundColor: "rgba(39, 166, 68, 0.1)",
    borderColor: "rgba(39, 166, 68, 0.28)",
  },
  approvalTerminalErr: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.28)",
  },
  approvalTerminalText: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
  },
  messageList: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  systemRow: {
    alignItems: "center",
    marginVertical: 2,
  },
  systemBubble: {
    maxWidth: "92%",
    backgroundColor: C.panel,
    borderColor: C.lineSubtle,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  systemText: {
    color: C.ink3,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
  },
  userRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 4,
  },
  userBubble: {
    maxWidth: "82%",
    backgroundColor: C.brand,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderBottomRightRadius: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  userText: {
    color: "#FFFFFF",
    fontSize: 14,
    lineHeight: 20,
  },
  assistantRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 4,
  },
  avatarBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: C.surface,
    borderColor: C.line,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  avatarText: {
    fontSize: 16,
  },
  assistantBubble: {
    flex: 1,
    backgroundColor: C.surface,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 14,
    borderTopLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  assistantHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  timestamp: {
    color: C.ink4,
    fontSize: 10,
    fontVariant: ["tabular-nums"],
  },
  assistantText: {
    color: C.ink,
    fontSize: 14,
    lineHeight: 21,
  },
  cursorText: {
    color: C.accent,
    fontSize: 14,
    fontWeight: "bold",
  },
  cursorHidden: {
    opacity: 0,
  },
  typingIndicatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  typingIndicatorText: {
    color: C.ink3,
    fontSize: 12,
  },
  errorAvatarBox: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  errorBubble: {
    borderColor: "rgba(239, 68, 68, 0.3)",
    backgroundColor: "rgba(239, 68, 68, 0.08)",
  },
  errorBubbleText: {
    color: C.err,
    fontSize: 13,
    lineHeight: 19,
  },
  errorActionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  errorActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    backgroundColor: "rgba(239, 68, 68, 0.12)",
  },
  errorActionText: {
    color: C.err,
    fontSize: 12,
    fontWeight: "600",
  },
  voiceStatusBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: C.panel,
    borderTopWidth: 1,
    borderTopColor: C.lineSubtle,
  },
  voiceStatusText: {
    color: C.ink2,
    fontSize: 12,
  },
  micBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surface,
    borderColor: C.line,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  micBtnRecording: {
    backgroundColor: "rgba(239, 68, 68, 0.16)",
    borderColor: "rgba(239, 68, 68, 0.4)",
  },
  micBtnDisabled: {
    opacity: 0.4,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: C.panel,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  textInput: {
    flex: 1,
    backgroundColor: C.surface,
    borderColor: C.lineSubtle,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    minHeight: 38,
    maxHeight: 100,
    color: C.ink,
    fontSize: 14,
    lineHeight: 18,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: C.surface,
    opacity: 0.4,
  },
  sendBtnIcon: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
    marginTop: -2,
  },
  stopBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    borderColor: "rgba(239, 68, 68, 0.4)",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stopIcon: {
    width: 12,
    height: 12,
    backgroundColor: C.err,
    borderRadius: 2,
  },
  chatSegmentsBox: {
    gap: 8,
    width: "100%",
  },
  inlinePreviewStack: {
    gap: 10,
    marginTop: 10,
  },
  chatCodeCard: {
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: "#0F1011",
    marginVertical: 4,
  },
  chatCodeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
  },
  chatCodeLang: {
    color: C.accent,
    fontSize: 11,
    fontWeight: "500",
  },
  chatCodeLines: {
    color: C.ink4,
    fontSize: 10,
    fontVariant: ["tabular-nums"],
  },
  emptyPromptSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 8,
  },
  emptyPromptTitle: {
    color: C.ink3,
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 8,
  },
  emptyPromptGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  emptyPromptCard: {
    backgroundColor: C.panel,
    paddingHorizontal: 10,
    maxWidth: "48%",
    flexGrow: 1,
  },
  emptyPromptCardText: {
    color: C.ink2,
    fontSize: 12,
    fontWeight: "500",
  },
});
