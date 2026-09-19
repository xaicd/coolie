import React, { useCallback, useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
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
} from "react-native";
import { StatusBar } from "expo-status-bar";
import type { BoardChatMessage, Company } from "@coolie/api-client";
import { C, coolie } from "../coolie";
import { StatusDot } from "../components/StatusDot";
import { QuickApprovalCard } from "../components/QuickApprovalCard";
import { CodeViewerWebView } from "../components/CodeViewerWebView";

export interface BoardChatScreenProps {
  onOpenSettings?: () => void;
  company: Company;
  whoami?: string;
  onBack?: () => void;
}

const QUICK_PROMPTS = [
  "工坊今日花销与额度？",
  "车间各智能体现状如何？",
  "有哪些待审批任务需要裁决？",
  "总结近期的任务产出与交付",
];

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
 * - 集成快捷审批悬浮卡片
 */
export function BoardChatScreen({
  company,
  whoami: _whoami,
  onBack,
  onOpenSettings,
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
  const [cursorVisible, setCursorVisible] = useState(true);

  const flatListRef = useRef<FlatList<BoardChatMessage>>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const accumulatedRef = useRef("");

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
    }
  }, [company.id]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const scrollToBottom = useCallback((animated = true) => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated });
    }, 80);
  }, []);

  const handleSend = useCallback(
    async (textToSend?: string) => {
      const prompt = (textToSend ?? input).trim();
      if (!prompt || sending) return;

      setInput("");
      setErrorText(null);
      setLastPrompt(prompt);
      setStreamingText("");
      setStatusText("正在连接总办助手…");
      setSending(true);
      accumulatedRef.current = "";

      // 乐观追加用户消息
      const userMsg: BoardChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        text: prompt,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      scrollToBottom();

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
    [input, sending, company.id, boardIssueId, scrollToBottom],
  );

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

    if (isUser) {
      return (
        <View style={styles.userRow}>
          <View style={styles.userBubble}>
            <Text style={styles.userText}>{item.text}</Text>
          </View>
        </View>
      );
    }

    const segments = parseMessageSegments(item.text);

    return (
      <View style={styles.assistantRow}>
        <View style={styles.avatarBox}>
          <Text style={styles.avatarText}>🤖</Text>
        </View>
        <View style={styles.assistantBubble}>
          <View style={styles.assistantHeader}>
            <Text style={styles.assistantName}>数字总办</Text>
            <Text style={styles.timestamp}>
              {new Date(item.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>
          {segments.length === 1 && segments[0].type === "text" ? (
            <Text style={styles.assistantText}>{item.text}</Text>
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
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
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
              <Pressable hitSlop={12} onPress={onBack} style={styles.backBtn}>
                <Text style={styles.backBtnText}>‹ 返回</Text>
              </Pressable>
            )}
            <View>
              <View style={styles.titleRow}>
                <Text style={styles.topTitle}>驾驶舱智能问答</Text>
                <StatusDot
                  status={sending ? "running" : "ok"}
                  size={6}
                  color={sending ? C.accent : C.ok}
                />
              </View>
              <Text style={styles.topSubTitle}>
                {sending ? "Claude Concierge 思考中…" : "全双工双向流式对话"}
              </Text>
            </View>
          </View>

          <View style={styles.topRight}>
            {onOpenSettings ? (
              <Pressable hitSlop={12} onPress={onOpenSettings} style={styles.backBtn}>
                <Ionicons name="settings-outline" size={19} color="#8A8F98" />
              </Pressable>
            ) : null}
            <Pressable
              hitSlop={12}
              onPress={() => void loadHistory()}
              disabled={loadingHistory}
              style={styles.refreshBtn}
            >
              {loadingHistory ? (
                <ActivityIndicator size="small" color={C.ink3} />
              ) : (
                <Text style={styles.refreshBtnText}>刷新</Text>
              )}
            </Pressable>
          </View>
        </View>

        {/* 悬浮快捷审批卡片 (内联嵌入) */}
        <QuickApprovalCard
          companyId={company.id}
          floating={false}
          style={styles.inlineApprovalCard}
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
          ListFooterComponent={
            <>
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
                        <View style={styles.statusPill}>
                          <StatusDot status="running" size={5} color={C.accent} />
                          <Text style={styles.statusPillText}>{statusText}</Text>
                        </View>
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
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerText}>⚠️ {errorText}</Text>
                  <Pressable onPress={handleRetry} style={styles.retryBtn}>
                    <Text style={styles.retryBtnText}>重试</Text>
                  </Pressable>
                </View>
              )}
            </>
          }
        />

        {/* 快捷问答提示词气泡行 */}
        <View style={styles.promptChipsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.promptChipsScroll}
          >
            {QUICK_PROMPTS.map((prompt) => (
              <Pressable
                key={prompt}
                style={styles.chipBtn}
                onPress={() => void handleSend(prompt)}
                disabled={sending}
              >
                <Text style={styles.chipText}>{prompt}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* 底部输入框区域 */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            placeholder="询问工坊运行、额度、员工负荷或审批…"
            placeholderTextColor={C.ink3}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={1000}
            editable={!sending}
          />

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
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  backBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  backBtnText: {
    color: C.ink2,
    fontSize: 13,
    fontWeight: "500",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
  },
  refreshBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  refreshBtnText: {
    color: C.ink3,
    fontSize: 12,
  },
  inlineApprovalCard: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 2,
  },
  messageList: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
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
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(113, 112, 255, 0.12)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusPillText: {
    color: C.accent,
    fontSize: 11,
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderColor: "rgba(239, 68, 68, 0.28)",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginVertical: 6,
  },
  errorBannerText: {
    color: C.err,
    fontSize: 12,
    flex: 1,
  },
  retryBtn: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8,
  },
  retryBtnText: {
    color: C.err,
    fontSize: 12,
    fontWeight: "600",
  },
  promptChipsContainer: {
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: C.lineSubtle,
    backgroundColor: C.bg,
  },
  promptChipsScroll: {
    paddingHorizontal: 14,
    gap: 8,
  },
  chipBtn: {
    backgroundColor: C.panel,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    color: C.ink2,
    fontSize: 12,
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
});
