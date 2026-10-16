#!/usr/bin/env node
/**
 * cmd-acp.mjs
 * 
 * Standardized Agent Client Protocol (ACP) adapter for Command Code (cmd).
 * Bridges ACP JSON-RPC 2.0 stdio into:
 *   1) Local cmd binary (if in PATH or /opt/homebrew/bin/cmd)
 *   2) Host-exec passthrough (scripts/host-exec.sh cmd)
 */

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable, Writable } from "node:stream";
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const req = createRequire(import.meta.url);

let acp;
try {
  acp = await import("@agentclientprotocol/sdk");
} catch {
  const rootDir = path.resolve(__dirname, "../..");
  const candidatePaths = [
    path.join(rootDir, "packages/paperclip-runner"),
    path.join(rootDir, "packages/adapters/claude-local"),
    path.join(rootDir, "packages/adapters/codex-local"),
    path.join(rootDir, "node_modules/.pnpm/node_modules"),
    rootDir,
  ];
  let resolvedPath = null;
  for (const p of candidatePaths) {
    try {
      resolvedPath = req.resolve("@agentclientprotocol/sdk", { paths: [p] });
      if (resolvedPath) break;
    } catch {
      // try next
    }
  }
  if (!resolvedPath) {
    throw new Error("Cannot find @agentclientprotocol/sdk in candidate paths");
  }
  acp = await import(resolvedPath);
}

import { clampPromptForArgv, MAX_ARG_BYTES } from "./prompt-clamp.mjs";


class CmdAcpAgent {
  sessions = new Map();

  async initialize(_params) {
    return {
      protocolVersion: acp.PROTOCOL_VERSION,
      agentCapabilities: {
        loadSession: true,
        sessionCapabilities: {
          resume: true,
        },
      },
      serverInfo: {
        name: "cmd-acp",
        version: "1.0.0",
      },
    };
  }

  async newSession(_params) {
    const sessionId = "cmd-" + Math.random().toString(36).slice(2, 10);
    this.sessions.set(sessionId, { activeProcess: null });
    return { sessionId };
  }

  async loadSession(params) {
    const sessionId = params?.sessionId || ("cmd-" + Math.random().toString(36).slice(2, 10));
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, { activeProcess: null });
    }
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
    promptText = clampPromptForArgv(promptText, "cmd");

    const maxTurns = process.env.COOLIE_MAX_TURNS || null;
    let bin = "cmd";
    let args = ["-p", promptText, "--yolo", "--tools-all", "-t"];
    if (maxTurns) {
      args.push("--max-turns", String(maxTurns));
    }

    // Check if cmd is in PATH or host-exec needed
    let cmdFound = false;
    try {
      execSync("which cmd 2>/dev/null");
      cmdFound = true;
    } catch {
      cmdFound = false;
    }

    // 保证工作目录严格为项目代码库目录，杜绝 /tmp 或悬空空目录
    const repoRootDir = path.resolve(__dirname, "../..");
    let workingDir = params.cwd || process.env.COOLIE_PROJECT_DIR || process.cwd();
    if (!workingDir || workingDir === "/tmp" || workingDir.startsWith("/tmp/") || workingDir === "/private/tmp" || workingDir.startsWith("/private/tmp/")) {
      workingDir = repoRootDir;
    } else if (workingDir.includes(".paperclip/instances") && !fs.existsSync(path.join(workingDir, "package.json"))) {
      workingDir = repoRootDir;
    }

    if (!cmdFound && fs.existsSync("/opt/homebrew/bin/cmd")) {
      bin = "/opt/homebrew/bin/cmd";
    } else if (!cmdFound && fs.existsSync("scripts/host-exec.sh")) {
      bin = "bash";
      const maxTurnsFlag = maxTurns ? ` --max-turns ${maxTurns}` : "";
      args = ["scripts/host-exec.sh", `cd ${JSON.stringify(workingDir)} && cmd -p ${JSON.stringify(promptText)} --yolo --tools-all -t${maxTurnsFlag} < /dev/null`];
    }

    return new Promise((resolve, reject) => {
      const proc = spawn(bin, args, {
        stdio: ["ignore", "pipe", "pipe"],
        cwd: workingDir,
      });

      session.activeProcess = proc;

      proc.stdout.on("data", async (chunk) => {
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
          // ignore
        }
      });

      proc.stderr.on("data", async (chunk) => {
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
          // ignore
        }
      });

      proc.on("error", (err) => {
        session.activeProcess = null;
        reject(err);
      });

      proc.on("close", (code) => {
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
const agent = new CmdAcpAgent();

acp
  .agent({ name: "cmd-acp" })
  .onRequest("initialize", (ctx) => agent.initialize(ctx.params))
  .onRequest("session/new", (ctx) => agent.newSession(ctx.params))
  .onRequest("session/load", (ctx) => agent.loadSession(ctx.params))
  .onRequest("session/resume", (ctx) => agent.resumeSession(ctx.params))
  .onRequest("authenticate", (ctx) => agent.authenticate(ctx.params))
  .onRequest("session/set_mode", (ctx) => agent.setSessionMode(ctx.params))
  .onRequest("session/prompt", (ctx) => agent.prompt(ctx.params, ctx.client))
  .onNotification("session/cancel", (ctx) => agent.cancel(ctx.params))
  .connect(stream);
