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

import * as acp from "@agentclientprotocol/sdk";
import { Readable, Writable } from "node:stream";
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

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

        args = [
          "exec",
          "-i",
          ...envFlags,
          "agy-ubuntu-container",
          "bash",
          "-c",
          `cd "${containerCwd}" 2>/dev/null || cd "${containerRepoRoot}"; exec /root/.local/bin/agy -p "$(< "${containerPromptFile}")" --dangerously-skip-permissions`
        ];
      } else {
        bin = "agy";
        args = ["-p", promptText, "--dangerously-skip-permissions"];
      }
    }

    return new Promise((resolve, reject) => {
      const proc = spawn(bin, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      session.activeProcess = proc;

      const cleanup = () => {
        if (promptFilePath) {
          try { fs.unlinkSync(promptFilePath); } catch {}
          promptFilePath = null;
        }
      };

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
          // ignore notify failure
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
