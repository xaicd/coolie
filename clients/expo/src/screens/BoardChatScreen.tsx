import React, { useCallback, useEffect, useRef, useState } from "react";
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
  TextInput,
  View,
  StatusBar as RNStatusBar,
  Modal,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { isAsrNotConfigured } from "@coolie/api-client";
import type { BoardChatMessage, Company, Approval, Issue } from "@coolie/api-client";
import { C, coolie } from "../coolie";
import { useRecorder } from "../useRecorder";
import { StatusDot } from "../components/StatusDot";
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
import { ErrorRetry } from "../ui/ErrorRetry";
import { LoadingState } from "../ui/LoadingState";
import { Pill } from "../ui/Pill";
import { ScreenHeader } from "../ui/ScreenHeader";
import { StatusBadge } from "../ui/StatusBadge";
import { formatTime } from "../utils/format";
import { parseInlineTags } from "../components/board-inline/tagParser";
import { InlinePreviewPanel } from "../components/board-inline/InlinePreviewPanel";

export interface BoardChatScreenProps {
  onOpenSettings?: () => void;
  company: Company;
  whoami?: string;
  onBack?: () => void;
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
  /** 顶部右上角 [Workspace] 入口, 由 App.tsx 注入 (拉起工作空间 Modal) */
  onOpenWorkspace?: () => void;
}

const QUICK_PROMPTS = [
  "工坊今日花销",
  "员工都在忙啥",
  "有哪些待审批",
  "本周交付了什么",
];

/** 长按录音的最短时长: 短于此视为误触, 不送 ASR。 */
const MIN_VOICE_HOLD_MS = 500;

type BoardEchoListener = (message: BoardChatMessage) => void;

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
  text: "掌柜您好！我是工坊驾驶舱数字总办 (Board Concierge)。关于智能体派发、额度消耗、交付进度或待办审批，请随时向我吩咐。",
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
  onBack,
  onOpenSettings,
  onOpenApproval,
  onOpenIssue,
  onOpenPipeline,
  onOpenPlan,
  embedded = false,
  onOpenWorkspace,
}: BoardChatScreenProps) {
  const [messages, setMessages] = useState<BoardChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);
  const [boardIssueId, setBoardIssueId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);

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

  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState<Array<{ id: string; title: string }>>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [buildCard, setBuildCard] = useState<BuildCardState | null>(null);
  const [specCard, setSpecCard] = useState<SpecCardState | null>(null);
  const flatListRef = useRef<FlatList<BoardChatMessage>>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const accumulatedRef = useRef("");

  // 会话内语音: 长按 mic 录音 -> 松开自动转文字填入输入框 -> 用户确认后再发送。
  // 只复用 wave14 的 useRecorder + voiceDispatch 链路 (mode=transcribe-only), 不建任务。
  const { recording, start: startRecording, stop: stopRecording } = useRecorder();
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
    setLoadingHistory(true);
    setErrorText(null);
    try {
      const history = await coolie.getBoardChatHistory(company.id);
      if (history.issueId) {
        setBoardIssueId(history.issueId);
      }
      if (history.messages.length > 0) {
        setMessages(history.messages);
      } else {
        setMessages([WELCOME_MESSAGE]);
      }
    } catch {
      // 保持当前显示
    } finally {
      setLoadingHistory(false);
      setHistoryReady(true);
    }
  }, [company.id]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const issues = await coolie.listIssues(company.id, { limit: 30 });
      const mapped = issues.map((i) => ({ id: i.id, title: i.title }));
      setSessions(mapped);
    } catch (e) {
      setSessionsError(String((e as Error)?.message ?? e));
    } finally {
      setSessionsLoading(false);
    }
  }, [company.id]);

  const switchSession = useCallback(
    async (targetTaskId?: string) => {
      setShowHistory(false);
      setLoadingHistory(true);
      setErrorText(null);
      try {
        const history = await coolie.getBoardChatHistory(company.id, targetTaskId);
        setBoardIssueId(history.issueId);
        setMessages(history.messages.length > 0 ? history.messages : [WELCOME_MESSAGE]);
      } catch (e) {
        Alert.alert("切换会话失败", String((e as Error)?.message ?? e));
      } finally {
        setLoadingHistory(false);
      }
    },
    [company.id],
  );

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
  }, [voiceBusy, sending, startRecording]);

  const handleMicPressOut = useCallback(async () => {
    const press = voicePressRef.current;
    if (!press.promise) return;
    voicePressRef.current.promise = null;

    setVoiceBusy(true);
    setVoiceStatus("识别中…");
    try {
      const started = await press.promise;
      if (!started) return;

      const { base64, format } = await stopRecording();
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
  }, [company.id, stopRecording, pushSystemEcho]);

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

  const handleSend = useCallback(
    async (textToSend?: string) => {
      const prompt = (textToSend ?? input).trim();
      if (!prompt || sending) return;

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

      // "build xxx" 追加构建计划卡, "建域 xxx" 追加本体规范卡, 与总办回答并行推进;
      // pipeline / plan / pr 只走各自编排分发 (不再进问答流)。
      if (command.kind === "domain") void startSpec(prompt);
      else if (command.kind === "build") void startBuild(prompt);
      else if (command.kind === "pipeline") void startPipeline(command.subject);
      else if (command.kind === "plan") void startPlan(command.subject);
      else if (command.kind === "pr") void startPr(command.subject);

      if (isOrchestrationCommand) return;

      setStreamingText("");
      setStatusText("正在连接总办助手…");
      setSending(true);
      accumulatedRef.current = "";

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        await coolie.streamBoardChat(
          {
            companyId: company.id,
            message: prompt,
            taskId: boardIssueId ?? undefined,
            signal: controller.signal,
          },
          {
            onStart: (issueId) => {
              setBoardIssueId(issueId);
            },
            onStatus: (status) => {
              setStatusText(status);
            },
            onChunk: (chunk) => {
              accumulatedRef.current += chunk;
              setStreamingText(accumulatedRef.current);
              setStatusText("");
              scrollToBottom(false);
            },
            onDone: (doneEvent) => {
              if (doneEvent.issueId) {
                setBoardIssueId(doneEvent.issueId);
              }
            },
            onError: (err) => {
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
        setSending(false);
        setStreamingText("");
        setStatusText("");
        abortControllerRef.current = null;
        scrollToBottom();
      }
    },
    [
      input,
      sending,
      company.id,
      boardIssueId,
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

  const handleRetry = () => {
    if (lastPrompt) {
      void handleSend(lastPrompt);
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
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
    }
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
            <Text style={styles.assistantName}>数字总办</Text>
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
        {/* 顶部导航栏 */}
        <View style={styles.topBar}>
          <View style={styles.topLeft}>
            {Boolean(onBack) && (
              <ScreenHeader
                onBack={onBack}
                backLabel="返回"
                style={styles.headerBack}
              />
            )}
            <View>
              <Text style={styles.topTitle}>工坊</Text>
              <Text style={styles.topSubTitle}>
                {sending ? "思考中…" : "驱动 5 角色员工"}
              </Text>
            </View>
          </View>

          <View style={styles.topRight}>
            {onOpenWorkspace && !embedded ? (
              <Pressable
                hitSlop={12}
                onPress={onOpenWorkspace}
                style={styles.workspaceBtn}
              >
                <Ionicons name="grid-outline" size={14} color={C.accent} />
                <Text style={styles.workspaceBtnText}>Workspace</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

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
                    <View style={styles.assistantHeader}>
                      <Text style={styles.assistantName}>数字总办</Text>
                      {Boolean(statusText) && (
                        <StatusBadge
                          label={statusText}
                          color={C.accent}
                          bg="rgba(113, 112, 255, 0.12)"
                          border="transparent"
                          dotStatus="running"
                          size={5}
                          style={styles.statusPill}
                        />
                      )}
                    </View>

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
                      <View style={styles.typingIndicatorRow}>
                        <ActivityIndicator size="small" color={C.accent} />
                        <Text style={styles.typingIndicatorText}>
                          {statusText || "总办正在处理并调取工坊数据…"}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* 异常或中断提示条 */}
              {Boolean(errorText) && (
                <ErrorRetry
                  variant="inline"
                  message={`⚠️ ${errorText}`}
                  onRetry={handleRetry}
                  style={styles.errorBanner}
                />
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

        {/* 底部输入框区域: [输入框] [🎤 长按 mic] [发送/停止] */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            placeholder="派个活, 或问点什么"
            placeholderTextColor={C.ink3}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={1000}
            editable={!sending}
          />

          {/* 长按录音, 松开自动转文字填入输入框 (不自动发送) */}
          <Animated.View style={{ opacity: recording ? micPulse : 1 }}>
            <Pressable
              onPressIn={handleMicPressIn}
              onPressOut={() => void handleMicPressOut()}
              disabled={sending || voiceBusy}
              hitSlop={6}
              style={[
                styles.micBtn,
                recording && styles.micBtnRecording,
                (sending || voiceBusy) && styles.micBtnDisabled,
              ]}
            >
              {voiceBusy && !recording ? (
                <ActivityIndicator size="small" color={C.accent} />
              ) : (
                <Ionicons
                  name={recording ? "mic" : "mic-outline"}
                  size={20}
                  color={recording ? C.err : C.ink2}
                />
              )}
            </Pressable>
          </Animated.View>

          {sending ? (
            <Pressable onPress={handleStop} style={styles.stopBtn}>
              <View style={styles.stopIcon} />
            </Pressable>
          ) : (
            <Pressable
              onPress={() => void handleSend()}
              style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
              disabled={!input.trim()}
            >
              <Text style={styles.sendBtnIcon}>↑</Text>
            </Pressable>
          )}
        </View>

        {/* 会话历史侧拉 / 抽屉 Modal */}
        <Modal
          visible={showHistory}
          transparent
          animationType="fade"
          onRequestClose={() => setShowHistory(false)}
        >
          <View style={styles.historyModalBackdrop}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setShowHistory(false)}
            />
            <View style={styles.historyDrawerSheet}>
              <View style={styles.historyDrawerHandle} />
              <View style={styles.historyDrawerHeader}>
                <View style={styles.historyDrawerTitleRow}>
                  <Ionicons name="time-outline" size={18} color={C.ink} style={{ marginRight: 6 }} />
                  <Text style={styles.historyDrawerTitle}>会话历史</Text>
                </View>
                <Pressable
                  hitSlop={10}
                  onPress={() => setShowHistory(false)}
                  style={styles.historyCloseBtn}
                >
                  <Ionicons name="close" size={20} color={C.ink2} />
                </Pressable>
              </View>

              <Pressable
                style={styles.newChatBtn}
                onPress={() => void switchSession(undefined)}
              >
                <Ionicons name="add-circle-outline" size={18} color={C.accent} style={{ marginRight: 6 }} />
                <Text style={styles.newChatBtnText}>开启新总办会话</Text>
              </Pressable>

              {sessionsLoading && (
                <LoadingState
                  size="small"
                  text="加载历史会话…"
                  style={styles.historyLoadingBox}
                />
              )}

              {Boolean(sessionsError) && (
                <ErrorRetry
                  variant="section"
                  message={`⚠️ ${sessionsError}`}
                  onRetry={() => void loadSessions()}
                  style={styles.historyErrorBox}
                />
              )}

              {!sessionsLoading && !sessionsError && (
                <ScrollView
                  style={styles.sessionList}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {sessions.length === 0 ? (
                    <Text style={styles.sessionEmptyText}>暂无历史会话记录</Text>
                  ) : (
                    sessions.map((sess) => {
                      const isActive = sess.id === boardIssueId;
                      return (
                        <AppCard
                          key={sess.id}
                          row
                          radius={8}
                          padding={12}
                          onPress={() => void switchSession(sess.id)}
                          style={[styles.sessionCard, isActive && styles.sessionCardActive]}
                        >
                          <Ionicons
                            name={isActive ? "chatbubble" : "chatbubble-outline"}
                            size={16}
                            color={isActive ? C.accent : C.ink3}
                            style={{ marginRight: 10, marginTop: 2 }}
                          />
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[styles.sessionCardTitle, isActive && styles.sessionCardTitleActive]}
                              numberOfLines={2}
                            >
                              {sess.title}
                            </Text>
                            <Text style={styles.sessionCardId}>ID: {sess.id.slice(0, 8)}</Text>
                          </View>
                          {isActive && (
                            <Pill
                              label="当前"
                              tone="accent"
                              size="sm"
                              textStyle={{ color: C.accent }}
                              style={styles.sessionActiveBadge}
                            />
                          )}
                        </AppCard>
                      );
                    })
                  )}
                </ScrollView>
              )}
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
  topLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerBack: {
    alignSelf: "center",
  },
  topTitle: {
    color: C.ink,
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  topSubTitle: {
    color: C.ink3,
    fontSize: 11,
    marginTop: 1,
  },
  topRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  workspaceBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "rgba(94,106,210,0.14)",
    borderWidth: 1,
    borderColor: C.brand,
  },
  workspaceBtnText: {
    color: C.accent,
    fontSize: 12,
    fontWeight: "500",
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
  assistantName: {
    color: C.ink,
    fontSize: 12,
    fontWeight: "600",
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
  statusPill: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
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
  errorBanner: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderColor: "rgba(239, 68, 68, 0.28)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginVertical: 6,
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
  historyModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "flex-end",
  },
  historyDrawerSheet: {
    backgroundColor: C.panel,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 28,
    maxHeight: "80%",
  },
  historyDrawerHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.line,
    alignSelf: "center",
    marginBottom: 12,
  },
  historyDrawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  historyDrawerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  historyDrawerTitle: {
    color: C.ink,
    fontSize: 16,
    fontWeight: "600",
  },
  historyCloseBtn: {
    padding: 4,
  },
  newChatBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
    paddingVertical: 10,
    marginBottom: 12,
  },
  newChatBtnText: {
    color: C.accent,
    fontSize: 14,
    fontWeight: "600",
  },
  historyLoadingBox: {
    paddingVertical: 24,
    paddingHorizontal: 0,
    alignItems: "center",
    gap: 0,
    flex: 0,
  },
  historyErrorBox: {
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
  },
  sessionList: {
    maxHeight: 360,
  },
  sessionEmptyText: {
    color: C.ink4,
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 24,
  },
  sessionCard: {
    alignItems: "flex-start",
    backgroundColor: C.surface,
    marginBottom: 8,
  },
  sessionCardActive: {
    borderColor: C.accent,
    backgroundColor: C.surfaceHover,
  },
  sessionCardTitle: {
    color: C.ink2,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },
  sessionCardTitleActive: {
    color: C.ink,
    fontWeight: "600",
  },
  sessionCardId: {
    color: C.ink4,
    fontSize: 11,
    marginTop: 4,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  sessionActiveBadge: {
    backgroundColor: "rgba(113, 112, 255, 0.15)",
    borderColor: "transparent",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
});
