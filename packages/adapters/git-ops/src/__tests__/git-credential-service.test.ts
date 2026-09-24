import { describe, expect, it, beforeEach } from "vitest";
import {
  GitCredentialService,
  decryptToken,
  encryptToken,
  isEncryptionAvailable,
  type EncryptedCredentialRow,
  type GitCredentialStore,
} from "../services/GitCredentialService.js";

const ENV_WITH_KEY = { GIT_CREDENTIAL_ENCRYPTION_KEY: "test-secret-for-credential-routing" };

class InMemoryStore implements GitCredentialStore {
  rows = new Map<string, EncryptedCredentialRow>();
  key(userId: string, provider: string): string {
    return `${userId}::${provider}`;
  }
  async read(userId: string, provider: "github" | "gitlab" | "gitee" | "codeup" | "cnb"): Promise<EncryptedCredentialRow | null> {
    return this.rows.get(this.key(userId, provider)) ?? null;
  }
  async write(row: EncryptedCredentialRow): Promise<void> {
    this.rows.set(this.key(row.userId, row.provider), row);
  }
}

describe("GitCredentialService.encrypt / decrypt roundtrip", () => {
  beforeEach(() => {
    // ensure each test sees the env we expect; vitest runs serially here.
  });

  it("roundtrips a token through encrypt/decrypt", () => {
    const plain = "ghp_superSecretToken_42";
    const cipher = encryptToken(plain, ENV_WITH_KEY);
    expect(cipher).not.toContain(plain);
    expect(cipher.split(":")).toHaveLength(2);
    expect(decryptToken(cipher, ENV_WITH_KEY)).toBe(plain);
  });

  it("produces a different IV per encrypt", () => {
    const plain = "ghp_superSecretToken_42";
    const a = encryptToken(plain, ENV_WITH_KEY);
    const b = encryptToken(plain, ENV_WITH_KEY);
    expect(a).not.toBe(b);
    expect(a.split(":")[0]).not.toBe(b.split(":")[0]);
  });

  it("isEncryptionAvailable matches the env key", () => {
    expect(isEncryptionAvailable({})).toBe(false);
    expect(isEncryptionAvailable(ENV_WITH_KEY)).toBe(true);
  });

  it("encrypt throws when key missing", () => {
    expect(() => encryptToken("x", {})).toThrow(/GIT_CREDENTIAL_ENCRYPTION_KEY/);
  });
});

describe("GitCredentialService.saveCredential / getCredential", () => {
  it("persists an encrypted token and returns the decrypted form on read", async () => {
    const store = new InMemoryStore();
    const svc = new GitCredentialService(store, ENV_WITH_KEY);
    const saved = await svc.saveCredential("u1", "github", "ghp_abc", "git@github.com:foo/bar.git");
    expect(saved).not.toBeNull();
    expect(saved?.encryptedToken).not.toContain("ghp_abc");

    const credential = await svc.getCredential("u1", "github");
    expect(credential).not.toBeNull();
    expect(credential?.source).toBe("credential");
    expect(credential?.accessToken).toBe("ghp_abc");
    expect(credential?.remoteUrl).toBe("git@github.com:foo/bar.git");
  });

  it("returns null when encryption is not configured", async () => {
    const store = new InMemoryStore();
    const svc = new GitCredentialService(store, {});
    const saved = await svc.saveCredential("u1", "github", "ghp_abc", null);
    expect(saved).toBeNull();
    const credential = await svc.getCredential("u1", "github");
    expect(credential).toBeNull();
  });

  it("falls back to GitLab OAuth when resolver returns a token", async () => {
    const store = new InMemoryStore();
    const svc = new GitCredentialService(
      store,
      ENV_WITH_KEY,
      async (_userId: string) => ({ token: "oauth-gl-token", expiresAt: null }),
    );
    const credential = await svc.getCredential("u1", "gitlab");
    expect(credential?.source).toBe("oauth");
    expect(credential?.accessToken).toBe("oauth-gl-token");
  });

  it("returns null when stored row is missing and no oauth", async () => {
    const store = new InMemoryStore();
    const svc = new GitCredentialService(store, ENV_WITH_KEY);
    expect(await svc.getCredential("u1", "github")).toBeNull();
  });

  it("returns null when stored row has expired token", async () => {
    const store = new InMemoryStore();
    const svc = new GitCredentialService(store, ENV_WITH_KEY);
    await store.write({
      userId: "u1",
      provider: "github",
      encryptedToken: encryptToken("any", ENV_WITH_KEY),
      remoteUrl: null,
      tokenExpiresAt: new Date(Date.now() - 1000),
    });
    expect(await svc.getCredential("u1", "github")).toBeNull();
  });
});

describe("GitCredentialService.buildAuthenticatedUrl", () => {
  it("prefixes oauth2 for GitLab and Gitee", () => {
    const svc = new GitCredentialService(new InMemoryStore(), ENV_WITH_KEY);
    expect(svc.buildAuthenticatedUrl("https://gitlab.com/foo/bar.git", { provider: "gitlab", accessToken: "tok" })).toBe(
      "https://oauth2:tok@gitlab.com/foo/bar.git",
    );
    expect(svc.buildAuthenticatedUrl("https://gitee.com/foo/bar.git", { provider: "gitee", accessToken: "tok" })).toBe(
      "https://oauth2:tok@gitee.com/foo/bar.git",
    );
  });

  it("prefixes bare token for GitHub", () => {
    const svc = new GitCredentialService(new InMemoryStore(), ENV_WITH_KEY);
    expect(svc.buildAuthenticatedUrl("https://github.com/foo/bar.git", { provider: "github", accessToken: "tok" })).toBe(
      "https://tok@github.com/foo/bar.git",
    );
  });

  it("returns the original URL for unknown providers", () => {
    const svc = new GitCredentialService(new InMemoryStore(), ENV_WITH_KEY);
    const url = "https://codeup.aliyun.com/foo/bar.git";
    expect(svc.buildAuthenticatedUrl(url, { provider: "codeup", accessToken: "tok" })).toBe(url);
  });
});

describe("GitCredentialService.detectProviderFromUrl", () => {
  const svc = new GitCredentialService(new InMemoryStore(), ENV_WITH_KEY);
  it.each([
    ["https://github.com/foo/bar.git", "github"],
    ["https://api.github.com/foo/bar", "github"],
    ["https://gitlab.example.com/foo/bar.git", "gitlab"],
    ["https://gitee.com/foo/bar.git", "gitee"],
    ["https://codeup.aliyun.com/foo/bar", "codeup"],
    ["https://cnb.coolie.cn/foo/bar", "cnb"],
  ])("returns %s -> %s", (input, expected) => {
    expect(svc.detectProviderFromUrl(input)).toBe(expected);
  });

  it("returns null for malformed URLs", () => {
    expect(svc.detectProviderFromUrl("not-a-url")).toBeNull();
    expect(svc.detectProviderFromUrl("https://unknown.example.com/foo/bar.git")).toBeNull();
  });
});