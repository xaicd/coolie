#!/usr/bin/env node
/**
 * scripts/adapters/claude-profile-acp.mjs
 * 
 * Standardized Agent Client Protocol (ACP) adapter for Claude Code with explicit
 * profile settings and model specification.
 * Bridges ACP JSON-RPC 2.0 stdio into:
 *   1) Local claude CLI (with --settings and --dangerously-skip-permissions)
 *   2) Host-exec passthrough (scripts/host-exec.sh claude) if running in container
 * 
 * Eliminates "Authentication required / claude login" failures by explicitly
 * injecting profile settings (e.g. GLM or MiniMax endpoints & auth tokens).
 */

import * as acp from "@agentclientprotocol/sdk";
import { Readable, Writable } from "node:stream";
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Parse CLI flags
const cliArgs = process.argv.slice(2);
let settingsPath = process.env.CLAUDE_SETTINGS_PATH || null;
let modelName = process.env.CLAUDE_MODEL || process.env.ANTHROPIC_MODEL || null;

for (let i = 0; i < cliArgs.length; i++) {
  if (cliArgs[i] === "--settings" && cliArgs[i + 1]) {
    settingsPath = cliArgs[++i];
  } else if (cliArgs[i] === "--model" && cliArgs[i + 1]) {
    modelName = cliArgs[++i];
  }
}

// Fallback to default user settings if not specified
if (!settingsPath) {
  const homeDir = process.env.HOME || "/Users/mac";
  const defaultUserPath = path.join(homeDir, ".claude", "settings.json");
  if (fs.existsSync(defaultUserPath)) {
    settingsPath = defaultUserPath;
  }
}

class ClaudeProfileAcpAgent {
  sessions = new Map();

  async initialize(_params) {
    return {
      protocolVersion: acp.PROTOCOL_VERSION,
      agentCapabilities: {
        loadSession: false,
      },
      serverInfo: {
        name: "claude-profile-acp",
        version: "1.0.0",
      },
    };
  }

  async newSession(_params) {
    const sessionId = "claude-" + Math.random().toString(36).slice(2, 10);
    this.sessions.set(sessionId, { activeProcess: null });
    return { sessionId };
  }

  async authenticate(_params) {
    return {};
  }

  async setSessionMode(_params) {
    return {};
  }

  async prompt(params, cx) {
    const session = this.sessions.get(params.sessionId);
    if (!session) {
      throw new Error(`Session ${params.sessionId} not found`);
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

    // Locate claude executable
    let bin = process.env.CLAUDE_BIN || "";
    let claudeArgs = ["-p", promptText, "--dangerously-skip-permissions"];

    if (settingsPath && fs.existsSync(settingsPath)) {
      claudeArgs.push("--settings", settingsPath);
    }
    if (modelName) {
      claudeArgs.push("--model", modelName);
    }

    let claudeFound = false;
    if (bin && fs.existsSync(bin)) {
      claudeFound = true;
    } else {
      try {
        const out = execSync("which claude 2>/dev/null", { encoding: "utf8" }).trim();
        if (out) {
          bin = out;
          claudeFound = true;
        }
      } catch {
        claudeFound = false;
      }

      if (!claudeFound && fs.existsSync("/opt/homebrew/bin/claude")) {
        bin = "/opt/homebrew/bin/claude";
        claudeFound = true;
      } else if (!claudeFound && fs.existsSync("/usr/local/bin/claude")) {
        bin = "/usr/local/bin/claude";
        claudeFound = true;
      }
    }

    // Fallback to host-exec.sh if not found locally
    if (!claudeFound && fs.existsSync("scripts/host-exec.sh")) {
      bin = "bash";
      const escapedArgs = claudeArgs.map((a) => JSON.stringify(a)).join(" ");
      claudeArgs = ["scripts/host-exec.sh", `claude ${escapedArgs} < /dev/null`];
    } else if (!claudeFound) {
      bin = "claude"; // default attempt
    }

    const workingDir = params.cwd || process.cwd();

    return new Promise((resolve, reject) => {
      const proc = spawn(bin, claudeArgs, {
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
          // ignore notification failure
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
          // ignore notification failure
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
const agent = new ClaudeProfileAcpAgent();

acp
  .agent({ name: "claude-profile-acp" })
  .onRequest("initialize", (ctx) => agent.initialize(ctx.params))
  .onRequest("session/new", (ctx) => agent.newSession(ctx.params))
  .onRequest("authenticate", (ctx) => agent.authenticate(ctx.params))
  .onRequest("session/set_mode", (ctx) => agent.setSessionMode(ctx.params))
  .onRequest("session/prompt", (ctx) => agent.prompt(ctx.params, ctx.client))
  .onNotification("session/cancel", (ctx) => agent.cancel(ctx.params))
  .connect(stream);
