import { randomUUID } from "node:crypto";
import type { PluginDatabaseClient } from "@paperclipai/plugin-sdk";
import {
  estimateTokens,
  isValidConversationTransition,
  type ChatMode,
  type ConversationStatus,
  type MessageRole,
} from "./enums.js";

/**
 * ChatStore isolates all chat persistence behind one class. A conversation is a
 * chat session with a lifecycle status and a multi-turn context budget; messages
 * are its ordered turns. Runtime SQL constraints enforced by the host:
 * db.query = single SELECT/WITH; db.execute = single INSERT/UPDATE/DELETE; every
 * reference is schema-qualified with db.namespace.
 */
export interface ChatConversationInput {
  companyId: string;
  conversationKey: string;
  name?: string;
  mode?: ChatMode;
  userRef?: string | null;
  agentRef?: string | null;
  systemPrompt?: string;
  maxTurns?: number;
  tokenBudget?: number;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}

export interface ChatConversationUpdate {
  name?: string;
  mode?: ChatMode;
  systemPrompt?: string;
  maxTurns?: number;
  tokenBudget?: number;
  agentRef?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ChatConversationRow {
  id: string;
  company_id: string;
  conversation_key: string;
  name: string;
  mode: ChatMode;
  status: ConversationStatus;
  message_count: number;
  estimated_tokens: number;
  max_turns: number;
  token_budget: number;
}

export interface ChatMessageInput {
  companyId: string;
  conversationId: string;
  role?: MessageRole;
  content: string;
  toolName?: string | null;
  tokens?: number;
  metadata?: Record<string, unknown>;
}

export interface ChatMessageRow {
  id: string;
  company_id: string;
  conversation_id: string;
  seq: number;
  role: MessageRole;
  content: string;
  tokens: number;
  created_at: string;
}

export interface ChatContextWindow {
  conversationId: string;
  mode: ChatMode;
  systemPrompt: string;
  messages: Array<{ role: MessageRole; content: string; tokens: number; seq: number }>;
  totalTokens: number;
  truncated: boolean;
}

export class ChatStore {
  private readonly db: PluginDatabaseClient;
  private readonly ns: string;

  constructor(db: PluginDatabaseClient) {
    this.db = db;
    this.ns = db.namespace;
  }

  private table(name: string): string {
    return `"${this.ns}".${name}`;
  }

  private static readonly CONVERSATION_COLS =
    "id, company_id, conversation_key, name, mode, status, message_count, estimated_tokens, max_turns, token_budget";

  async createConversation(input: ChatConversationInput): Promise<ChatConversationRow> {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO ${this.table("chat_conversations")}
         (id, company_id, conversation_key, name, mode, user_ref, agent_ref,
          system_prompt, max_turns, token_budget, created_by, updated_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $12::jsonb)`,
      [
        id,
        input.companyId,
        input.conversationKey,
        input.name ?? "New conversation",
        input.mode ?? "chat",
        input.userRef ?? null,
        input.agentRef ?? null,
        input.systemPrompt ?? "",
        input.maxTurns ?? 20,
        input.tokenBudget ?? 16000,
        input.createdBy ?? "system",
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    return (await this.getConversation(input.companyId, id))!;
  }

  async getConversation(companyId: string, conversationId: string): Promise<ChatConversationRow | null> {
    const rows = await this.db.query<ChatConversationRow>(
      `SELECT ${ChatStore.CONVERSATION_COLS} FROM ${this.table("chat_conversations")}
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, conversationId],
    );
    return rows[0] ?? null;
  }

  async listConversations(companyId: string, mode?: string, limit = 100): Promise<ChatConversationRow[]> {
    const capped = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 500)) : 100;
    if (mode) {
      return this.db.query<ChatConversationRow>(
        `SELECT ${ChatStore.CONVERSATION_COLS} FROM ${this.table("chat_conversations")}
          WHERE company_id = $1 AND is_deleted = false AND mode = $2
          ORDER BY last_active_at DESC
          LIMIT $3`,
        [companyId, mode, capped],
      );
    }
    return this.db.query<ChatConversationRow>(
      `SELECT ${ChatStore.CONVERSATION_COLS} FROM ${this.table("chat_conversations")}
        WHERE company_id = $1 AND is_deleted = false
        ORDER BY last_active_at DESC
        LIMIT $2`,
      [companyId, capped],
    );
  }

  async updateConversation(
    companyId: string,
    conversationId: string,
    update: ChatConversationUpdate,
  ): Promise<ChatConversationRow | null> {
    const res = await this.db.execute(
      `UPDATE ${this.table("chat_conversations")}
          SET name          = COALESCE($3, name),
              mode          = COALESCE($4, mode),
              system_prompt = COALESCE($5, system_prompt),
              max_turns     = COALESCE($6, max_turns),
              token_budget  = COALESCE($7, token_budget),
              agent_ref     = CASE WHEN $8::boolean THEN $9 ELSE agent_ref END,
              metadata      = CASE WHEN $10::boolean THEN $11::jsonb ELSE metadata END,
              updated_at    = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [
        companyId,
        conversationId,
        update.name ?? null,
        update.mode ?? null,
        update.systemPrompt ?? null,
        typeof update.maxTurns === "number" ? update.maxTurns : null,
        typeof update.tokenBudget === "number" ? update.tokenBudget : null,
        update.agentRef !== undefined,
        update.agentRef ?? null,
        update.metadata !== undefined,
        JSON.stringify(update.metadata ?? {}),
      ],
    );
    if (res.rowCount === 0) return null;
    return this.getConversation(companyId, conversationId);
  }

  /** Move a conversation to a new lifecycle status, enforcing the transition table. */
  async transitionConversation(
    companyId: string,
    conversationId: string,
    to: ConversationStatus,
  ): Promise<ChatConversationRow | null> {
    const current = await this.getConversation(companyId, conversationId);
    if (!current) return null;
    if (!isValidConversationTransition(current.status, to)) {
      throw new Error(`Illegal conversation transition: ${current.status} -> ${to}`);
    }
    const res = await this.db.execute(
      `UPDATE ${this.table("chat_conversations")}
          SET status = $3, updated_at = now()
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, conversationId, to],
    );
    if (res.rowCount === 0) return null;
    return this.getConversation(companyId, conversationId);
  }

  /**
   * Append a message: allocate the next seq, insert it (with an estimated token
   * count), then bump the conversation message_count / estimated_tokens and
   * touch last_active_at. Returns the inserted message.
   */
  async appendMessage(input: ChatMessageInput): Promise<ChatMessageRow | null> {
    const conversation = await this.getConversation(input.companyId, input.conversationId);
    if (!conversation) return null;

    const seqRows = await this.db.query<{ next_seq: number }>(
      `SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq
         FROM ${this.table("chat_messages")}
        WHERE company_id = $1 AND conversation_id = $2`,
      [input.companyId, input.conversationId],
    );
    const seq = Number(seqRows[0]?.next_seq ?? 1);
    const tokens = input.tokens ?? estimateTokens(input.content);
    const id = randomUUID();

    await this.db.execute(
      `INSERT INTO ${this.table("chat_messages")}
         (id, company_id, conversation_id, seq, role, content, tokens, tool_name, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        id,
        input.companyId,
        input.conversationId,
        seq,
        input.role ?? "user",
        input.content,
        tokens,
        input.toolName ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    await this.db.execute(
      `UPDATE ${this.table("chat_conversations")}
          SET message_count = message_count + 1,
              estimated_tokens = estimated_tokens + $3,
              last_active_at = now(),
              updated_at = now()
        WHERE company_id = $1 AND id = $2`,
      [input.companyId, input.conversationId, tokens],
    );

    const rows = await this.db.query<ChatMessageRow>(
      `SELECT id, company_id, conversation_id, seq, role, content, tokens, created_at
         FROM ${this.table("chat_messages")}
        WHERE company_id = $1 AND id = $2`,
      [input.companyId, id],
    );
    return rows[0] ?? null;
  }

  async listMessages(
    companyId: string,
    conversationId: string,
    limit = 200,
  ): Promise<ChatMessageRow[]> {
    const capped = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 1000)) : 200;
    return this.db.query<ChatMessageRow>(
      `SELECT id, company_id, conversation_id, seq, role, content, tokens, created_at
         FROM ${this.table("chat_messages")}
        WHERE company_id = $1 AND conversation_id = $2
        ORDER BY seq ASC
        LIMIT $3`,
      [companyId, conversationId, capped],
    );
  }

  /**
   * Build the multi-turn context window for the next LLM call: the most recent
   * turns that fit within the conversation max_turns and token_budget, in
   * chronological order, with the system prompt separated out.
   */
  async getContextWindow(companyId: string, conversationId: string): Promise<ChatContextWindow | null> {
    const rows = await this.db.query<ChatConversationRow & { system_prompt: string }>(
      `SELECT ${ChatStore.CONVERSATION_COLS}, system_prompt
         FROM ${this.table("chat_conversations")}
        WHERE company_id = $1 AND id = $2 AND is_deleted = false`,
      [companyId, conversationId],
    );
    const convo = rows[0];
    if (!convo) return null;

    // Pull the most recent turns (bounded by max_turns), newest first.
    const recent = await this.db.query<ChatMessageRow>(
      `SELECT id, company_id, conversation_id, seq, role, content, tokens, created_at
         FROM ${this.table("chat_messages")}
        WHERE company_id = $1 AND conversation_id = $2
        ORDER BY seq DESC
        LIMIT $3`,
      [companyId, conversationId, Math.max(1, Number(convo.max_turns) || 20)],
    );

    // Accumulate within the token budget (still newest-first), then reverse.
    const budget = Math.max(1, Number(convo.token_budget) || 16000);
    const picked: ChatMessageRow[] = [];
    let total = 0;
    let truncated = recent.length >= (Number(convo.max_turns) || 20);
    for (const m of recent) {
      const t = Number(m.tokens) || 0;
      if (total + t > budget && picked.length > 0) {
        truncated = true;
        break;
      }
      picked.push(m);
      total += t;
    }
    picked.reverse();

    return {
      conversationId,
      mode: convo.mode,
      systemPrompt: convo.system_prompt ?? "",
      messages: picked.map((m) => ({ role: m.role, content: m.content, tokens: Number(m.tokens) || 0, seq: m.seq })),
      totalTokens: total,
      truncated,
    };
  }
}
