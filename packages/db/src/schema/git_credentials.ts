import { pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * `git_credentials` — encrypted per-user Git provider credentials.
 *
 *  - `user_id` is an opaque principal id from the auth layer (board user
 *    id). We don't FK to `auth_users` here so the schema can be reused for
 *    agent-owned tokens without churning the migrations later.
 *  - `encrypted_token` is the AES-256-CBC `iv:ciphertext` produced by
 *    `@paperclipai/adapter-git-ops/services/GitCredentialService`. The
 *    encryption key lives in `GIT_CREDENTIAL_ENCRYPTION_KEY` and never
 *    touches this row.
 *  - `provider` is the canonical lowercase provider name (`github`,
 *    `gitlab`, `gitee`, `codeup`, `cnb`).
 *
 * One row per `(user_id, provider)` pair; the route layer is responsible
 * for upsert semantics.
 */
export const gitCredentials = pgTable(
  "git_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    provider: text("provider").notNull(),
    /** Encrypted access token. Never store the plain-text value. */
    encryptedToken: text("encrypted_token").notNull(),
    /** Original remote URL the credential was registered for. */
    repoUrl: text("repo_url"),
    /** OAuth expiry timestamp, when the credential came from an OAuth grant. */
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userProviderUnique: uniqueIndex("git_credentials_user_provider_idx").on(table.userId, table.provider),
  }),
);

export type GitCredentialRow = typeof gitCredentials.$inferSelect;
export type GitCredentialInsert = typeof gitCredentials.$inferInsert;