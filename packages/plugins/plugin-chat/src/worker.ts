import {
  definePlugin,
  runWorker,
  type PluginApiRequestInput,
  type PluginApiResponse,
  type PluginContext,
} from "@paperclipai/plugin-sdk";
import { ChatStore } from "./store.js";
import type { ChatMode, ConversationStatus, MessageRole } from "./enums.js";

let activeContext: PluginContext | null = null;
let store: ChatStore | null = null;

function requireContext(): PluginContext {
  if (!activeContext) throw new Error("Chat plugin worker context is not initialized");
  return activeContext;
}
function requireStore(): ChatStore {
  if (!store) store = new ChatStore(requireContext().db);
  return store;
}
function queryString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}
function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`Missing required field: ${field}`);
  return value;
}
function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function parseInt10(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

const plugin = definePlugin({
  async setup(ctx) {
    activeContext = ctx;
    store = new ChatStore(ctx.db);
    ctx.data.register("list-conversations", async (params) => {
      const companyId = requireString(params.companyId, "companyId");
      return { conversations: await requireStore().listConversations(companyId) };
    });
    ctx.logger.info("Chat plugin worker started", { namespace: ctx.db.namespace });
  },

  async onHealth() {
    const ctx = activeContext;
    if (!ctx) return { status: "error" as const, message: "worker context not initialized" };
    return { status: "ok" as const, message: "chat worker running", details: { namespace: ctx.db.namespace } };
  },

  async onApiRequest(input: PluginApiRequestInput): Promise<PluginApiResponse> {
    const ctx = requireContext();
    const s = requireStore();
    const companyId = input.companyId;

    switch (input.routeKey) {
      case "list-conversations":
        return {
          body: {
            conversations: await s.listConversations(
              companyId,
              queryString(input.query.mode),
              parseInt10(queryString(input.query.limit)),
            ),
          },
        };

      case "get-conversation": {
        const c = await s.getConversation(companyId, requireString(input.params.conversationId, "conversationId"));
        if (!c) return { status: 404, body: { error: "Conversation not found" } };
        return { body: { conversation: c } };
      }

      case "create-conversation": {
        const b = optionalRecord(input.body) ?? {};
        const conversation = await s.createConversation({
          companyId,
          conversationKey: requireString(b.conversationKey, "conversationKey"),
          name: typeof b.name === "string" ? b.name : undefined,
          mode: typeof b.mode === "string" ? (b.mode as ChatMode) : undefined,
          userRef: typeof b.userRef === "string" ? b.userRef : null,
          agentRef: typeof b.agentRef === "string" ? b.agentRef : null,
          systemPrompt: typeof b.systemPrompt === "string" ? b.systemPrompt : undefined,
          maxTurns: typeof b.maxTurns === "number" ? b.maxTurns : undefined,
          tokenBudget: typeof b.tokenBudget === "number" ? b.tokenBudget : undefined,
        });
        await ctx.activity.log({
          companyId,
          message: `Created chat conversation ${conversation.conversation_key} (${conversation.mode})`,
          entityType: "chat_conversation",
          entityId: conversation.id,
        });
        return { status: 201, body: { conversation } };
      }

      case "update-conversation": {
        const b = optionalRecord(input.body) ?? {};
        const conversation = await s.updateConversation(companyId, requireString(input.params.conversationId, "conversationId"), {
          name: typeof b.name === "string" ? b.name : undefined,
          mode: typeof b.mode === "string" ? (b.mode as ChatMode) : undefined,
          systemPrompt: typeof b.systemPrompt === "string" ? b.systemPrompt : undefined,
          maxTurns: typeof b.maxTurns === "number" ? b.maxTurns : undefined,
          tokenBudget: typeof b.tokenBudget === "number" ? b.tokenBudget : undefined,
          agentRef: "agentRef" in b ? (b.agentRef as string | null) : undefined,
          metadata: optionalRecord(b.metadata),
        });
        if (!conversation) return { status: 404, body: { error: "Conversation not found" } };
        return { body: { conversation } };
      }

      case "transition-conversation": {
        const b = optionalRecord(input.body) ?? {};
        try {
          const conversation = await s.transitionConversation(
            companyId,
            requireString(input.params.conversationId, "conversationId"),
            requireString(b.to, "to") as ConversationStatus,
          );
          if (!conversation) return { status: 404, body: { error: "Conversation not found" } };
          return { body: { conversation } };
        } catch (err) {
          return { status: 422, body: { error: String((err as Error)?.message ?? err) } };
        }
      }

      case "list-messages":
        return {
          body: {
            messages: await s.listMessages(
              companyId,
              requireString(input.params.conversationId, "conversationId"),
              parseInt10(queryString(input.query.limit)),
            ),
          },
        };

      case "append-message": {
        const b = optionalRecord(input.body) ?? {};
        const message = await s.appendMessage({
          companyId,
          conversationId: requireString(input.params.conversationId, "conversationId"),
          role: typeof b.role === "string" ? (b.role as MessageRole) : undefined,
          content: requireString(b.content, "content"),
          toolName: typeof b.toolName === "string" ? b.toolName : null,
          tokens: typeof b.tokens === "number" ? b.tokens : undefined,
          metadata: optionalRecord(b.metadata),
        });
        if (!message) return { status: 404, body: { error: "Conversation not found" } };
        return { status: 201, body: { message } };
      }

      case "get-context": {
        const context = await s.getContextWindow(companyId, requireString(input.params.conversationId, "conversationId"));
        if (!context) return { status: 404, body: { error: "Conversation not found" } };
        return { body: { context } };
      }

      default:
        return { status: 404, body: { error: `Unknown chat route: ${input.routeKey}` } };
    }
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
