/**
 * Git 认证服务 (TS-async)
 *
 * Migrated from DigitalStaff `backend/modules/git-ops/services/GitCredentialService.js`
 * under the wave 68 sync. Differences from the JS source:
 *
 *  - require() → import
 *  - module.exports → named exports
 *  - callback → async/await
 *  - mongoose-style `findOneAndUpdate` → caller-side persistence (we don't own
 *    the storage layer; the coolie `git_credentials` table is the canonical
 *    store, see `packages/db/src/schema/git_credentials.ts`).
 *  - axios → Node 24 native `fetch` (with `AbortSignal.timeout`).
 *  - hardcoded provider URLs → env (`GITHUB_API_URL`, `GITLAB_URL`,
 *    `GITEE_API_URL`).
 *
 * Token storage uses AES-256-CBC with a random IV per record; the cipher
 * output is stored as `iv:ciphertext` (hex). The encryption key is derived
 * from `GIT_CREDENTIAL_ENCRYPTION_KEY` via SHA-256 so a shorter configured
 * secret still produces a 32-byte AES key.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, type CipherKey } from "node:crypto";

const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16;

const DEFAULT_GITLAB_URL = "https://gitlab.com";
const DEFAULT_GITHUB_API_URL = "https://api.github.com";
const DEFAULT_GITEE_API_URL = "https://gitee.com/api/v5";

export type GitProvider = "github" | "gitlab" | "gitee" | "codeup" | "cnb";

export interface GitCredential {
  userId: string;
  provider: GitProvider;
  /** Plain-text access token after decrypt. Never persist this field. */
  accessToken: string;
  /** Original remote URL the credential was registered for, if known. */
  remoteUrl: string | null;
  /** OAuth expiry timestamp, when the credential came from an OAuth grant. */
  tokenExpiresAt: Date | null;
  /** Provenance flag — `oauth` for refreshed tokens, `credential` for stored rows. */
  source: "oauth" | "credential";
}

export interface GitCredentialValidationResult {
  valid: boolean;
  user?: unknown;
  error?: string;
}

export interface GitCredentialStore {
  /** Read the encrypted row for the (userId, provider) tuple, if any. */
  read(userId: string, provider: GitProvider): Promise<EncryptedCredentialRow | null>;
  /** Insert/replace the encrypted row for the (userId, provider) tuple. */
  write(row: EncryptedCredentialRow): Promise<void>;
}

export interface EncryptedCredentialRow {
  userId: string;
  provider: GitProvider;
  encryptedToken: string;
  remoteUrl: string | null;
  tokenExpiresAt: Date | null;
}

/**
 * Internal helper exposed so the route layer (or tests) can encrypt without
 * going through `saveCredential` — useful for migration / import flows.
 */
export function encryptToken(plainText: string, env: NodeJS.ProcessEnv = process.env): string {
  const key = encryptionKeyOrThrow(env);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const enc = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${enc.toString("hex")}`;
}

/**
 * Symmetric inverse of `encryptToken`. Throws if the cipher string is
 * malformed; the result is undefined when the key changes between encrypt
 * and decrypt, which is treated as a hard failure rather than a silent
 * garbage round-trip.
 */
export function decryptToken(cipherText: string, env: NodeJS.ProcessEnv = process.env): string {
  const key = encryptionKeyOrThrow(env);
  const [ivHex, encHex] = cipherText.split(":");
  if (!ivHex || !encHex) {
    throw new Error("Encrypted token is malformed (missing iv:ciphertext split)");
  }
  const iv = Buffer.from(ivHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  const dec = Buffer.concat([
    decipher.update(Buffer.from(encHex, "hex")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

export function isEncryptionAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.GIT_CREDENTIAL_ENCRYPTION_KEY && env.GIT_CREDENTIAL_ENCRYPTION_KEY.length > 0);
}

function resolveEncryptionKey(env: NodeJS.ProcessEnv): Buffer | null {
  const raw = env.GIT_CREDENTIAL_ENCRYPTION_KEY;
  if (!raw || raw.length === 0) return null;
  return createHash("sha256").update(raw).digest();
}

function encryptionKeyOrThrow(env: NodeJS.ProcessEnv): CipherKey {
  const key = resolveEncryptionKey(env);
  if (!key) {
    throw new Error("GIT_CREDENTIAL_ENCRYPTION_KEY is not configured");
  }
  return key;
}

function getGitlabUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.GITLAB_URL || DEFAULT_GITLAB_URL;
}

function getGithubApiUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.GITHUB_API_URL || DEFAULT_GITHUB_API_URL;
}

function getGiteeApiUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.GITEE_API_URL || DEFAULT_GITEE_API_URL;
}

/**
 * High-level credential service. Stateless aside from its `store` reference;
 * the coolie route layer passes a Drizzle-backed store so the service does
 * not import from `@paperclipai/db` (which would create a circular
 * workspace dependency for this package).
 */
export class GitCredentialService {
  constructor(
    private readonly store: GitCredentialStore,
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly oauthTokenResolver?: (userId: string) => Promise<{ token: string; expiresAt: Date | null } | null>,
  ) {}

  /** Encrypt and store `{token,provider}` for the user. No-ops if the
   *  encryption key is missing — matches the JS behaviour that simply skips
   *  persistence when the env var is unset, to avoid blocking auth flows. */
  async saveCredential(userId: string, provider: GitProvider, token: string, remoteUrl: string | null): Promise<EncryptedCredentialRow | null> {
    if (!isEncryptionAvailable(this.env)) {
      return null;
    }
    const encryptedToken = encryptToken(token, this.env);
    const row: EncryptedCredentialRow = {
      userId,
      provider,
      encryptedToken,
      remoteUrl,
      tokenExpiresAt: null,
    };
    await this.store.write(row);
    return row;
  }

  /** Fetch the decrypted credential for a user, honouring provider-specific
   *  fallback rules (GitLab OAuth first, GitCredential row as fallback). */
  async getCredential(userId: string, provider: GitProvider): Promise<GitCredential | null> {
    if (provider === "gitlab" && this.oauthTokenResolver) {
      try {
        const oauth = await this.oauthTokenResolver(userId);
        if (oauth) {
          return {
            userId,
            provider: "gitlab",
            accessToken: oauth.token,
            remoteUrl: null,
            tokenExpiresAt: oauth.expiresAt,
            source: "oauth",
          };
        }
      } catch {
        // OAuth unavailable, fall back to stored row.
      }
    }

    const row = await this.store.read(userId, provider);
    if (!row) return null;

    if (row.tokenExpiresAt && row.tokenExpiresAt.getTime() < Date.now()) {
      return null;
    }

    return {
      userId,
      provider: row.provider,
      accessToken: decryptToken(row.encryptedToken, this.env),
      remoteUrl: row.remoteUrl,
      tokenExpiresAt: row.tokenExpiresAt,
      source: "credential",
    };
  }

  /** Build a provider-prefixed authenticated URL that simple-git / git CLI
   *  can consume directly. */
  buildAuthenticatedUrl(repoUrl: string, credential: Pick<GitCredential, "provider" | "accessToken">): string {
    const { provider, accessToken } = credential;
    const url = new URL(repoUrl);

    if (provider === "gitlab" || provider === "gitee") {
      url.username = "oauth2";
      url.password = accessToken;
    } else if (provider === "github") {
      url.username = accessToken;
      url.password = "";
    } else {
      // Unknown provider: leave URL untouched — caller can override.
      return repoUrl;
    }

    return url.toString();
  }

  /** Best-effort provider detection by hostname. Unknown hosts return null. */
  detectProviderFromUrl(repoUrl: string): GitProvider | null {
    try {
      const host = new URL(repoUrl).hostname.toLowerCase();
      if (host === "github.com" || host.endsWith(".github.com")) return "github";
      if (host === "gitee.com" || host.endsWith(".gitee.com")) return "gitee";
      if (host.includes("gitlab")) return "gitlab";
      if (host.includes("codeup")) return "codeup";
      if (host.includes("cnb")) return "cnb";
    } catch {
      // Not a URL; let the caller fall back to a raw remote.
    }
    return null;
  }

  /** Probe the provider API to confirm the token is accepted. */
  async validateCredential(credential: Pick<GitCredential, "provider" | "accessToken">): Promise<GitCredentialValidationResult> {
    const { provider, accessToken } = credential;
    try {
      if (provider === "gitlab") {
        const res = await fetch(`${getGitlabUrl(this.env)}/api/v4/user`, {
          headers: { "PRIVATE-TOKEN": accessToken },
          signal: AbortSignal.timeout(10_000),
        });
        if (res.status === 401 || res.status === 403) {
          return { valid: false, error: `auth_failed:${provider}` };
        }
        if (!res.ok) {
          return { valid: false, error: `http_${res.status}` };
        }
        return { valid: true, user: await res.json() };
      }
      if (provider === "github") {
        const res = await fetch(`${getGithubApiUrl(this.env)}/user`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
          },
          signal: AbortSignal.timeout(10_000),
        });
        if (res.status === 401 || res.status === 403) {
          return { valid: false, error: `auth_failed:${provider}` };
        }
        if (!res.ok) {
          return { valid: false, error: `http_${res.status}` };
        }
        return { valid: true, user: await res.json() };
      }
      if (provider === "gitee") {
        const url = new URL(`${getGiteeApiUrl(this.env)}/user`);
        url.searchParams.set("access_token", accessToken);
        const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (res.status === 401 || res.status === 403) {
          return { valid: false, error: `auth_failed:${provider}` };
        }
        if (!res.ok) {
          return { valid: false, error: `http_${res.status}` };
        }
        return { valid: true, user: await res.json() };
      }
      return { valid: false, error: `unsupported_provider:${provider}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { valid: false, error: message };
    }
  }
}