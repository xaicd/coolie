#!/usr/bin/env node
/**
 * cmd-acp.mjs
 * 
 * Standardized Agent Client Protocol (ACP) adapter for Command Code (cmd).
 * Bridges ACP JSON-RPC 2.0 stdio into:
 *   1) Local cmd binary (if in PATH or /opt/homebrew/bin/cmd)
 *   2) Host-exec passthrough (scripts/host-exec.sh cmd)
 */

import * as acp from "@agentclientprotocol/sdk";
import { Readable, Writable } from "node:stream";
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";

class CmdAcpAgent {
  sessions = new Map();

  async initialize(_params) {
    return {
      protocolVersion: acp.PROTOCOL_VERSION,
      agentCapabilities: {
        loadSession: false,
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

    let bin = "cmd";
    let args = ["-p", promptText, "--yolo", "--tools-all", "-t"];

    // Check if cmd is in PATH or host-exec needed
    let cmdFound = false;
    try {
      execSync("which cmd 2>/dev/null");
      cmdFound = true;
    } catch {
      cmdFound = false;
    }

    if (!cmdFound && fs.existsSync("/opt/homebrew/bin/cmd")) {
      bin = "/opt/homebrew/bin/cmd";
    } else if (!cmdFound && fs.existsSync("scripts/host-exec.sh")) {
      bin = "bash";
      args = ["scripts/host-exec.sh", `cmd -p ${JSON.stringify(promptText)} --yolo --tools-all -t < /dev/null`];
    }

    return new Promise((resolve, reject) => {
      const proc = spawn(bin, args, {
        stdio: ["ignore", "pipe", "pipe"],
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
  .onRequest("authenticate", (ctx) => agent.authenticate(ctx.params))
  .onRequest("session/set_mode", (ctx) => agent.setSessionMode(ctx.params))
  .onRequest("session/prompt", (ctx) => agent.prompt(ctx.params, ctx.client))
  .onNotification("session/cancel", (ctx) => agent.cancel(ctx.params))
  .connect(stream);
