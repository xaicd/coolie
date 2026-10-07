/**
 * scripts/lib/agy-token-state.test.mjs — agy OAuth 凭据状态解析单测 (wave358)
 *
 * 跑法: node --test scripts/lib/agy-token-state.test.mjs
 *
 * 真值表 (避免依赖 docker 容器):
 *   - expiry 字符串解析 (正常 / 过期 / expiring)
 *   - 错误分类 (401 / expired / network / other / none)
 *   - state 判定 (ok / expiring / expired)
 *
 * 不测 agy_runtime_probe / agy_is_callable (需 docker exec, 单测太脆).
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LIB = new URL("./agy-token-state.sh", import.meta.url).pathname;
const BASH = "/bin/bash";

function runCli(args, env = {}) {
  try {
    return execFileSync(BASH, [LIB, ...args], {
      encoding: "utf8",
      env: { ...process.env, ...env },
    });
  } catch (err) {
    // 返回非 0 时, 把 stdout 拼回去 (unreachable 时有意返回 1)
    return (err.stdout?.toString() || "") + (err.stderr?.toString() || "");
  }
}

function makeTokenFile(expiryIso) {
  const tmp = mkdtempSync(join(tmpdir(), "agy-token-"));
  const tokenJson = {
    token: {
      access_token: "ya29.fake",
      token_type: "Bearer",
      refresh_token: "1//05fake",
      expiry: expiryIso,
    },
    auth_method: "consumer",
    id_token: "fake.jwt.token",
  };
  const dir = join(tmp, ".gemini/antigravity-cli");
  // mkdir -p
  execFileSync("mkdir", ["-p", dir]);
  const tokenPath = join(dir, "antigravity-oauth-token");
  writeFileSync(tokenPath, JSON.stringify(tokenJson));
  return { tmp, tokenPath, expiryIso };
}

describe("agy-token-state: extract error class", () => {
  it("returns 'expired' for 401 + session expired", () => {
    assert.equal(
      runCli(["extract", "401 Unauthorized: Session expired"]).trim(),
      "expired"
    );
  });

  it("returns 'expired' for OAuth token invalid", () => {
    assert.equal(
      runCli(["extract", "OAuth token invalid or revoked"]).trim(),
      "expired"
    );
  });

  it("returns 'expired' for credential expired", () => {
    assert.equal(
      runCli(["extract", "credential expired, please reauth"]).trim(),
      "expired"
    );
  });

  it("returns 'unauthorized' for 401 without expiry context", () => {
    assert.equal(
      runCli(["extract", "401 Unauthorized access denied"]).trim(),
      "unauthorized"
    );
  });

  it("returns 'network' for ECONNREFUSED", () => {
    assert.equal(
      runCli(["extract", "ECONNREFUSED 127.0.0.1:443"]).trim(),
      "network"
    );
  });

  it("returns 'network' for timeout", () => {
    assert.equal(
      runCli(["extract", "connection timeout after 30s"]).trim(),
      "network"
    );
  });

  it("returns 'other' for context canceled", () => {
    assert.equal(
      runCli(["extract", "error: context canceled"]).trim(),
      "other"
    );
  });

  it("returns 'none' for empty text", () => {
    assert.equal(runCli(["extract", ""]).trim(), "none");
  });

  it("returns 'none' for whitespace only", () => {
    assert.equal(runCli(["extract", "   \t\n  "]).trim(), "none");
  });

  it("returns 'other' for unrecognized error", () => {
    assert.equal(
      runCli(["extract", "some weird unknown failure"]).trim(),
      "other"
    );
  });
});

describe("agy-token-state: status with synthetic token file", () => {
  it("returns 'ok' when expiry is > threshold hours away", () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { tmp, tokenPath } = makeTokenFile(future);
    try {
      const out = runCli(["status", "2"], {
        AGY_TOKEN_HOST_PATH: tokenPath,
        AGY_DOCKER_CONTAINER: "nonexistent-container-zzz",
      });
      const [state, remaining, expires, source] = out.trim().split("\t");
      assert.equal(state, "ok");
      assert.ok(Number(remaining) > 60 * 60 / 60000, "remaining minutes > 60");
      assert.equal(expires, future);
      assert.equal(source, tokenPath);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("returns 'expiring' when expiry within threshold hours", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h
    const { tmp, tokenPath } = makeTokenFile(future);
    try {
      const out = runCli(["status", "2"], {
        AGY_TOKEN_HOST_PATH: tokenPath,
        AGY_DOCKER_CONTAINER: "nonexistent-container-zzz",
      });
      const [state] = out.trim().split("\t");
      assert.equal(state, "expiring");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("returns 'expired' when expiry is in the past", () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { tmp, tokenPath } = makeTokenFile(past);
    try {
      const out = runCli(["status", "2"], {
        AGY_TOKEN_HOST_PATH: tokenPath,
        AGY_DOCKER_CONTAINER: "nonexistent-container-zzz",
      });
      const [state, remaining] = out.trim().split("\t");
      assert.equal(state, "expired");
      assert.ok(Number(remaining) < 0, "remaining minutes is negative");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("returns 'ok' for 2 hours away when threshold is 1 hour", () => {
    const future = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const { tmp, tokenPath } = makeTokenFile(future);
    try {
      const out = runCli(["status", "1"], {
        AGY_TOKEN_HOST_PATH: tokenPath,
        AGY_DOCKER_CONTAINER: "nonexistent-container-zzz",
      });
      const [state] = out.trim().split("\t");
      assert.equal(state, "ok");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("returns 'unreachable' when token file is missing", () => {
    const out = runCli(["status", "2"], {
      AGY_TOKEN_HOST_PATH: "/tmp/nonexistent-token-path-xyz",
      AGY_DOCKER_CONTAINER: "nonexistent-container-zzz",
    });
    const [state] = out.trim().split("\t");
    assert.equal(state, "unreachable");
  });

  it("returns 'unreachable' for malformed token JSON", () => {
    const tmp = mkdtempSync(join(tmpdir(), "agy-bad-"));
    try {
      const dir = join(tmp, ".gemini/antigravity-cli");
      execFileSync("mkdir", ["-p", dir]);
      const tokenPath = join(dir, "antigravity-oauth-token");
      writeFileSync(tokenPath, "not json at all");
      const out = runCli(["status", "2"], {
        AGY_TOKEN_HOST_PATH: tokenPath,
        AGY_DOCKER_CONTAINER: "nonexistent-container-zzz",
      });
      const [state] = out.trim().split("\t");
      assert.equal(state, "unreachable");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("agy-token-state: callable convenience", () => {
  it("returns 'true' for fresh token", () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { tmp, tokenPath } = makeTokenFile(future);
    try {
      const out = runCli(["callable"], {
        AGY_TOKEN_HOST_PATH: tokenPath,
        AGY_DOCKER_CONTAINER: "nonexistent-container-zzz",
      });
      assert.equal(out.trim(), "true");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("returns 'false' for expired token", () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { tmp, tokenPath } = makeTokenFile(past);
    try {
      const out = runCli(["callable"], {
        AGY_TOKEN_HOST_PATH: tokenPath,
        AGY_DOCKER_CONTAINER: "nonexistent-container-zzz",
      });
      assert.equal(out.trim(), "false");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("returns 'true' for expiring token (still callable, just warn)", () => {
    const future = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { tmp, tokenPath } = makeTokenFile(future);
    try {
      const out = runCli(["callable"], {
        AGY_TOKEN_HOST_PATH: tokenPath,
        AGY_DOCKER_CONTAINER: "nonexistent-container-zzz",
      });
      assert.equal(out.trim(), "true");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
