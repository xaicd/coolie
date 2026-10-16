#!/usr/bin/env node
/**
 * docker-agy-acp.mjs
 * 
 * Standardized Agent Client Protocol (ACP) adapter for Google Antigravity (agy).
 * Bridges ACP JSON-RPC 2.0 stdio into:
 *   1) Local agy binary (if running inside container or dev environment with agy)
 *   2) Docker agy-ubuntu-container (if running on host with Docker)
 *   3) Fallback host-exec
 */

import { createRequire } from "node:module";
import { Readable, Writable } from "node:stream";
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const req = createRequire(import.meta.url);

// wave381 — 老板拍"看 coolie-dev 员工": 墨斗 (agy_local) 状态 error 真因是这里
// 顶层静态 `import "@agentclientprotocol/sdk"` 在仓库根解析不到该包 (pnpm 未把它
// 提升到根 node_modules), 进程在 initialize 前就 ERR_MODULE_NOT_FOUND 退出。
// 与 cmd-acp.mjs / claude-profile-acp.mjs 保持一致: 懒加载 + 候选路径回退。
let acp;
try {
  acp = await import("@agentclientprotocol/sdk");
} catch {
  const candidatePaths = [
    path.join(repoRoot, "packages/paperclip-runner"),
    path.join(repoRoot, "packages/adapters/claude-local"),
    path.join(repoRoot, "packages/adapters/codex-local"),
    path.join(repoRoot, "node_modules/.pnpm/node_modules"),
    repoRoot,
  ];
  let resolvedPath = null;
  for (const p of candidatePaths) {
    try {
      resolvedPath = req.resolve("@agentclientprotocol/sdk", { paths: [p] });
      if (resolvedPath) break;
    } catch {
      // try next candidate path
    }
  }
  if (!resolvedPath) {
    throw new Error("Cannot find @agentclientprotocol/sdk in candidate paths");
  }
  acp = await import(resolvedPath);
}

const MAX_ARG_BYTES = 100 * 1024; // 100KB safe margin under Linux 128KB (MAX_ARG_STRLEN) limit

function clampPromptForArgv(prompt, adapterName = "agy") {
  if (Buffer.byteLength(prompt, "utf8") <= MAX_ARG_BYTES) {
    return prompt;
  }
  const lines = prompt.split("\n");
  let headLines = [];
  let headBytes = 0;
  let i = 0;
  while (i < lines.length && headBytes < 45 * 1024) {
    headBytes += Buffer.byteLength(lines[i] + "\n", "utf8");
    headLines.push(lines[i]);
    i++;
  }

  let tailLines = [];
  let tailBytes = 0;
  let j = lines.length - 1;
  while (j >= i && tailBytes < 45 * 1024) {
    tailBytes += Buffer.byteLength(lines[j] + "\n", "utf8");
    tailLines.unshift(lines[j]);
    j--;
  }

  const prunedBytes = Buffer.byteLength(prompt, "utf8") - headBytes - tailBytes;
  const notice = `\n[... Note: Historical context/receipts (~${Math.round(prunedBytes / 1024)} KB) pruned by ${adapterName} adapter to adhere to Linux 128KB argv limit ...]\n`;

  return headLines.join("\n") + notice + tailLines.join("\n");
}

class AgyAcpAgent {
  sessions = new Map();

  async initialize(_params) {
    return {
      protocolVersion: acp.PROTOCOL_VERSION,
      agentCapabilities: {
        loadSession: true,
      },
      serverInfo: {
        name: "docker-agy-acp",
        version: "1.0.0",
      },
    };
  }

  async newSession(_params) {
    const sessionId = "agy-" + Math.random().toString(36).slice(2, 10);
    this.sessions.set(sessionId, { activeProcess: null });
    return { sessionId };
  }

  async loadSession(params) {
    const sessionId = params?.sessionId || ("agy-" + Math.random().toString(36).slice(2, 10));
    this.sessions.set(sessionId, { activeProcess: null });
    return { sessionId };
  }

  async resumeSession(params) {
    return this.loadSession(params);
  }

  async authenticate(_params) {
    return {};
  }

  async setSessionMode(_params) {
    return {};
  }

  async prompt(params, cx) {
    let session = this.sessions.get(params.sessionId);
    if (!session) {
      session = { activeProcess: null };
      this.sessions.set(params.sessionId, session);
    }

    let promptText = "";
    if (typeof params.prompt === "string") {
      promptText = params.prompt;
    } else if (Array.isArray(params.prompt)) {
      promptText = params.prompt
        .map((b) => (typeof b === "string" ? b : b.text || ""))
        .filter(Boolean)
        .join("\n");
    }

    if (!promptText.trim()) {
      promptText = "No task prompt provided.";
    }

    // 防御 Linux 内核 MAX_ARG_STRLEN (128KB) 溢出导致 E2BIG (Argument list too long)
    promptText = clampPromptForArgv(promptText, "agy");

    // Determine execution strategy
    let bin = "";
    let args = [];
    let promptFilePath = null;

    if (fs.existsSync("/root/.local/bin/agy")) {
      bin = "/root/.local/bin/agy";
      args = ["-p", promptText, "--dangerously-skip-permissions"];
    } else {
      // Check Docker container
      let dockerRunning = false;
      try {
        const out = execSync("docker inspect -f '{{.State.Running}}' agy-ubuntu-container 2>/dev/null", { encoding: "utf8" }).trim();
        dockerRunning = (out === "true");
      } catch {
        dockerRunning = false;
      }

      if (dockerRunning) {
        bin = "docker";
        const repoTmpDir = path.resolve(repoRoot, ".coolie-local/tmp");
        if (!fs.existsSync(repoTmpDir)) {
          try { fs.mkdirSync(repoTmpDir, { recursive: true }); } catch {}
        }
        promptFilePath = path.join(repoTmpDir, `agy-prompt-${params.sessionId}.md`);
        fs.writeFileSync(promptFilePath, promptText, "utf8");

        // Map Mac host repo path /Users/mac/workspace/... -> /host-workspace/... in container
        const containerRepoRoot = repoRoot.replace(/^\/Users\/mac\/workspace/, "/host-workspace");
        const containerPromptFile = path.join(containerRepoRoot, ".coolie-local/tmp", `agy-prompt-${params.sessionId}.md`);

        // CWD calculation: if host CWD is under /Users/mac/workspace, map it; otherwise fall back to containerRepoRoot
        const hostCwd = process.cwd();
        let containerCwd = containerRepoRoot;
        if (hostCwd.startsWith("/Users/mac/workspace")) {
          containerCwd = hostCwd.replace(/^\/Users\/mac\/workspace/, "/host-workspace");
        }

        const envFlags = [
          "-e", "LANG=C.UTF-8",
          "-e", "LC_ALL=C.UTF-8",
        ];
        for (const [k, v] of Object.entries(process.env)) {
          if (k.startsWith("PAPERCLIP_") || k === "DATABASE_URL") {
            envFlags.push("-e", `${k}=${v}`);
          }
        }

        const timeoutArg = process.env.AGY_TIMEOUT ? `--print-timeout "${process.env.AGY_TIMEOUT}"` : `--print-timeout 0s`;
        const continueFlag = (promptText.includes("【断点接力续跑】") || promptText.includes("【断点续跑】")) ? "-c" : "";

        args = [
          "exec",
          "-i",
          ...envFlags,
          "agy-ubuntu-container",
          "bash",
          "-c",
          `cd "${containerCwd}" 2>/dev/null || cd "${containerRepoRoot}"; exec /root/.local/bin/agy ${continueFlag} ${timeoutArg} -p "$(< "${containerPromptFile}")" --dangerously-skip-permissions`
        ];
      } else {
        bin = "agy";
        const timeoutArg = process.env.AGY_TIMEOUT ? ["--print-timeout", process.env.AGY_TIMEOUT] : ["--print-timeout", "0s"];
        args = ["-p", promptText, ...timeoutArg, "--dangerously-skip-permissions"];
      }
    }

    return new Promise((resolve, reject) => {
      const proc = spawn(bin, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      session.activeProcess = proc;

      let lastOutputTime = Date.now();
      const startTime = Date.now();

      // 长任务心跳保活定时器: 每隔 25 秒静默时向控制面发送轻量进度心跳，防止连接超时假死
      const heartbeatTimer = setInterval(async () => {
        const idleSec = Math.round((Date.now() - lastOutputTime) / 1000);
        const elapsedMin = ((Date.now() - startTime) / 60000).toFixed(1);
        if (idleSec >= 25) {
          try {
            await cx.notify(acp.methods.client.session.update, {
              sessionId: params.sessionId,
              update: {
                sessionUpdate: "agent_message_chunk",
                content: {
                  type: "text",
                  text: `\n[agy-heartbeat] 长任务正在执行中 (已耗时 ${elapsedMin} 分钟，当前容器静默 ${idleSec}s，仍在计算中)...\n`,
                },
              },
            });
          } catch {
            // 忽略通知失败
          }
        }
      }, 15000);

      const cleanup = () => {
        clearInterval(heartbeatTimer);
        if (promptFilePath) {
          try { fs.unlinkSync(promptFilePath); } catch {}
          promptFilePath = null;
        }
      };

      proc.stdout.on("data", async (chunk) => {
        lastOutputTime = Date.now();
        const text = chunk.toString("utf8");
        try {
          await cx.notify(acp.methods.client.session.update, {
            sessionId: params.sessionId,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: {
                type: "text",
                text,
              },
            },
          });
        } catch {
          // ignore notify failure
        }
      });

      proc.stderr.on("data", async (chunk) => {
        lastOutputTime = Date.now();
        const text = chunk.toString("utf8");
        try {
          await cx.notify(acp.methods.client.session.update, {
            sessionId: params.sessionId,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: {
                type: "text",
                text: `[stderr] ${text}`,
              },
            },
          });
        } catch {
          // ignore notify failure
        }
      });

      proc.on("error", (err) => {
        cleanup();
        session.activeProcess = null;
        reject(err);
      });

      proc.on("close", (code) => {
        cleanup();
        session.activeProcess = null;
        resolve({
          stopReason: code === 0 ? "end_turn" : "error",
        });
      });
    });
  }

  async cancel(params) {
    const session = this.sessions.get(params.sessionId);
    if (session?.activeProcess) {
      session.activeProcess.kill("SIGTERM");
    }
  }
}

const input = Writable.toWeb(process.stdout);
const output = Readable.toWeb(process.stdin);
const stream = acp.ndJsonStream(input, output);
const agent = new AgyAcpAgent();

acp
  .agent({ name: "docker-agy-acp" })
  .onRequest("initialize", (ctx) => agent.initialize(ctx.params))
  .onRequest("session/new", (ctx) => agent.newSession(ctx.params))
  .onRequest("session/load", (ctx) => agent.loadSession(ctx.params))
  .onRequest("session/resume", (ctx) => agent.resumeSession(ctx.params))
  .onRequest("authenticate", (ctx) => agent.authenticate(ctx.params))
  .onRequest("session/set_mode", (ctx) => agent.setSessionMode(ctx.params))
  .onRequest("session/prompt", (ctx) => agent.prompt(ctx.params, ctx.client))
  .onNotification("session/cancel", (ctx) => agent.cancel(ctx.params))
  .connect(stream);
