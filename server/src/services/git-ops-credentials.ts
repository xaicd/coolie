/**
 * `git-ops-credentials` — Drizzle-backed wrapper for
 * `@paperclipai/adapter-git-ops/services/GitCredentialService`.
 *
 * The route layer in `routes/git-credentials.ts` calls into the helper
 * service exposed by `gitOpsCredentialsService(db)`. The helper owns the
 * mapping between the schema row (`git_credentials`) and the
 * `GitCredentialStore` interface that the adapter package expects.
 *
 * This file lives alongside `services/git-credentials.ts` (the upstream
 * managed GitHub-auth helper that we intentionally don't replace) so the
 * wave 68 sync can ship its AES-encrypted user-credential flow without
 * disturbing the existing company-secret / managed-connection surfaces.
 */

import { and, eq } from "drizzle-orm";
import { gitCredentials, type Db } from "@paperclipai/db";
import {
  GitCredentialService,
  type EncryptedCredentialRow,
  type GitCredentialStore,
  type GitProvider,
} from "@paperclipai/adapter-git-ops/services";
import { persistActivity, publishActivity } from "./activity-log.js";

export interface SaveCredentialInput {
  userId: string;
  provider: GitProvider;
  token: string;
  repoUrl: string | null;
  companyId: string | null;
}

export interface CredentialView {
  id: string;
  userId: string;
  provider: GitProvider;
  repoUrl: string | null;
  tokenExpiresAt: string | null;
  createdAt: string;
}

class DrizzleCredentialStore implements GitCredentialStore {
  constructor(private readonly db: Db) {}

  async read(userId: string, provider: GitProvider): Promise<EncryptedCredentialRow | null> {
    const row = await this.db.query.gitCredentials.findFirst({
      where: and(eq(gitCredentials.userId, userId), eq(gitCredentials.provider, provider)),
    });
    if (!row) return null;
    return {
      userId: row.userId,
      provider: row.provider as GitProvider,
      encryptedToken: row.encryptedToken,
      remoteUrl: row.repoUrl,
      tokenExpiresAt: row.tokenExpiresAt,
    };
  }

  async write(row: EncryptedCredentialRow): Promise<void> {
    await this.db
      .insert(gitCredentials)
      .values({
        userId: row.userId,
        provider: row.provider,
        encryptedToken: row.encryptedToken,
        repoUrl: row.remoteUrl,
        tokenExpiresAt: row.tokenExpiresAt,
      })
      .onConflictDoUpdate({
        target: [gitCredentials.userId, gitCredentials.provider],
        set: {
          encryptedToken: row.encryptedToken,
          repoUrl: row.remoteUrl,
          tokenExpiresAt: row.tokenExpiresAt,
        },
      });
  }
}

export function gitOpsCredentialsService(db: Db) {
  const store = new DrizzleCredentialStore(db);

  return {
    /** Persist a credential. Returns null when
     *  `GIT_CREDENTIAL_ENCRYPTION_KEY` is unset — matches the DS source so
     *  auth flows are not blocked in dev. */
    async save(input: SaveCredentialInput): Promise<CredentialView | null> {
      const adapter = new GitCredentialService(store);
      const row = await adapter.saveCredential(input.userId, input.provider, input.token, input.repoUrl);
      if (!row) return null;

      const inserted = await db.query.gitCredentials.findFirst({
        where: and(eq(gitCredentials.userId, input.userId), eq(gitCredentials.provider, input.provider)),
      });
      if (!inserted) return null;

      if (input.companyId) {
        const { publication } = await persistActivity(db, {
          companyId: input.companyId,
          actorType: "user",
          actorId: input.userId,
          action: "git_credentials.saved",
          entityType: "git_credential",
          entityId: inserted.id,
          details: { provider: input.provider, repoUrl: input.repoUrl },
        });
        try {
          publishActivity(publication);
        } catch {
          // Activity publication failures must not block credential writes.
        }
      }

      return toView(inserted);
    },

    /** Look up the decrypted credential for the given provider. */
    async decrypt(userId: string, provider: GitProvider) {
      const adapter = new GitCredentialService(store);
      return adapter.getCredential(userId, provider);
    },

    /** List all stored credentials for the user (metadata only). */
    async list(userId: string): Promise<CredentialView[]> {
      const rows = await db.query.gitCredentials.findMany({
        where: eq(gitCredentials.userId, userId),
      });
      return rows.map(toView);
    },

    async findById(id: string): Promise<CredentialView | null> {
      const row = await db.query.gitCredentials.findFirst({ where: eq(gitCredentials.id, id) });
      return row ? toView(row) : null;
    },

    async findByUserAndProvider(userId: string, provider: GitProvider): Promise<CredentialView | null> {
      const row = await db.query.gitCredentials.findFirst({
        where: and(eq(gitCredentials.userId, userId), eq(gitCredentials.provider, provider)),
      });
      return row ? toView(row) : null;
    },
  };
}

function toView(row: typeof gitCredentials.$inferSelect): CredentialView {
  return {
    id: row.id,
    userId: row.userId,
    provider: row.provider as GitProvider,
    repoUrl: row.repoUrl,
    tokenExpiresAt: row.tokenExpiresAt ? row.tokenExpiresAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}