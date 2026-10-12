#!/usr/bin/env node
/**
 * scripts/acpx-tool-probe.mjs
 * 
 * Coolie 7 工具池 ACPX 全双工协议深度探针 (ACP-Native Tool Health Prober)
 * 核心公理: "怎么调的，就怎么测"
 * 
 * 职责:
 * 1. 协议级极速握手 (L1 ACP Handshake, 默认, <100ms, 0 Token 消耗):
 *    直接与底层 ACP 适配器建立 JSON-RPC 2.0 stdio 双向通道，发送 initialize 握手指令，
 *    检验进程拉起、stdio 管道、ACP 协议规范实现及能力清单 (agentCapabilities / agentInfo)。
 * 2. 活体端到端推理探测 (L2 Live Turn, --deep):
 *    通过 acpx 真实执行 1-turn "ping" 指令，检验上游 API Token 有效性与端到端闭环。
 * 3. 兼容 tool-health-monitor.sh 与 latest.json 架构，支持一键落盘更新。
 * 
 * 用法:
 *   node scripts/acpx-tool-probe.mjs                # 快速输出人类可读探测报告
 *   node scripts/acpx-tool-probe.mjs --json         # 输出结构化 JSON
 *   node scripts/acpx-tool-probe.mjs --deep         # 执行真值推理 ping 探针
 *   node scripts/acpx-tool-probe.mjs --save <path>  # 更新 .coolie-local/tool-health/latest.json
 */

import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

// 优先注入所有可能的环境 PATH (兼容 Mac / aja-pc / cwall / Docker)
const extraPaths = [
  path.join(process.env.HOME || "", ".local/bin"),
  path.join(process.env.HOME || "", ".npm-global/bin"),
  path.join(process.env.HOME || "", ".hermes/node/bin"),
  "/opt/homebrew/bin",
  "/usr/local/bin",
  path.join(process.env.HOME || "", "bin"),
];
process.env.PATH = `${extraPaths.join(":")}:${process.env.PATH || ""}`;

const args = process.argv.slice(2);
const IS_JSON = args.includes("--json");
const IS_DEEP = args.includes("--deep");
const SPECIFIC_TOOL = args.find((a, i) => args[i - 1] === "--tool");
const SAVE_PATH_INDEX = args.indexOf("--save");
const SAVE_PATH = SAVE_PATH_INDEX !== -1 ? args[SAVE_PATH_INDEX + 1] : null;

// 1. 查找 acpx 可执行文件
function findAcpx() {
  const candidates = [
    process.env.COOLIE_DEV_ACPX,
    "/opt/homebrew/bin/acpx",
    path.join(REPO_ROOT, "node_modules/.bin/acpx"),
    path.join(REPO_ROOT, "packages/adapter-utils/node_modules/.bin/acpx"),
    path.join(process.env.HOME || "", ".coolie-dev/node_modules/.bin/acpx"),
    path.join(process.env.HOME || "", ".coolie-dev/lib/server/node_modules/.bin/acpx"),
  ].filter(Boolean);

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        fs.accessSync(c, fs.constants.X_OK);
        return c;
      } catch {}
    }
  }

  try {
    const sys = execSync("command -v acpx 2>/dev/null", { encoding: "utf8" }).trim();
    if (sys) return sys;
  } catch {}

  return null;
}

// 辅助寻找适配器脚本路径 (支持源码仓、独立分发包与工作区)
function resolveAdapterScript(relPath) {
  const baseName = path.basename(relPath);
  const candidates = [
    path.join(REPO_ROOT, relPath),
    path.join(__dirname, "..", relPath),
    path.join(__dirname, "adapters", baseName),
    path.join(__dirname, "../adapters", baseName),
    path.join(process.env.HOME || "", ".coolie-dev", relPath),
    path.join(process.env.HOME || "", ".coolie-dev/bin/adapters", baseName),
    path.join(process.env.HOME || "", ".coolie-dev/adapters", baseName),
    path.join(process.env.HOME || "", "workspace/xaicd/coolie", relPath),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        fs.accessSync(c, fs.constants.X_OK);
        return c;
      } catch {
        return c;
      }
    }
  }
  return null;
}

// 2. L1 协议级极速握手 (JSON-RPC 2.0 initialize over stdio)
function probeAcpHandshake(commandLine, cwd = REPO_ROOT, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const startMs = Date.now();
    const parts = commandLine.trim().split(/\s+/);
    const bin = parts[0];
    const binArgs = parts.slice(1);

    let proc;
    try {
      proc = spawn(bin, binArgs, {
        cwd: fs.existsSync(cwd) ? cwd : process.env.HOME || "/tmp",
        stdio: ["pipe", "pipe", "ignore"],
        env: {
          ...process.env,
          LANG: "C.UTF-8",
          LC_ALL: "C.UTF-8",
        },
      });
    } catch (err) {
      return resolve({
        status: "fail",
        latencyMs: Date.now() - startMs,
        reason: `无法启动进程: ${err.message}`,
      });
    }

    let stdoutBuf = "";
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { proc.kill("SIGKILL"); } catch {}
        resolve({
          status: "fail",
          latencyMs: Date.now() - startMs,
          reason: `ACP 握手超时 (${timeoutMs}ms 未响应 initialize)`,
        });
      }
    }, timeoutMs);

    proc.stdout.on("data", (chunk) => {
      stdoutBuf += chunk.toString("utf8");
      // 只要收到符合 JSON-RPC 规范的回复即可判定协议握手成功
      if (stdoutBuf.includes('"jsonrpc"') && (stdoutBuf.includes('"result"') || stdoutBuf.includes('"protocolVersion"'))) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          const latencyMs = Date.now() - startMs;
          try { proc.kill("SIGTERM"); } catch {}

          let details = "ACP JSON-RPC 握手成功";
          try {
            const firstLine = stdoutBuf.trim().split("\n").find(l => l.includes('"jsonrpc"'));
            if (firstLine) {
              const res = JSON.parse(firstLine);
              const info = res.result?.agentInfo || res.result?.serverInfo;
              if (info?.name) {
                details = `${info.name} v${info.version || "1.0.0"}`;
              }
            }
          } catch {}

          resolve({
            status: "ok",
            latencyMs,
            reason: `ACP 协议就绪 (${details})`,
          });
        }
      }
    });

    proc.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve({
          status: "fail",
          latencyMs: Date.now() - startMs,
          reason: `进程运行错误: ${err.message}`,
        });
      }
    });

    proc.on("close", (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve({
          status: "fail",
          latencyMs: Date.now() - startMs,
          reason: `进程意外退出 (exit code: ${code})`,
        });
      }
    });

    // 发送 ACP 标准 initialize 帧
    const initReq = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: 1,
        clientCapabilities: {},
      },
    }) + "\n";

    try {
      proc.stdin.write(initReq);
    } catch {}
  });
}

// 3. L2 活体端到端推理探测 (acpx exec "ping")
function probeAcpxDeep(acpxBin, agentArg, timeoutSec = 15) {
  return new Promise((resolve) => {
    const startMs = Date.now();
    const args = [
      "--auth-policy", "skip",
      "--timeout", String(timeoutSec),
      "--format", "quiet",
    ];

    if (agentArg.startsWith("built-in:")) {
      args.push(agentArg.replace("built-in:", ""));
    } else {
      args.push("--agent", agentArg);
    }
    args.push("exec", "请直接回复一个字：通");

    let proc;
    try {
      proc = spawn(acpxBin, args, {
        cwd: fs.existsSync(REPO_ROOT) ? REPO_ROOT : process.env.HOME || "/tmp",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      return resolve({
        status: "fail",
        latencyMs: Date.now() - startMs,
        reason: `acpx 启动失败: ${err.message}`,
      });
    }

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });

    proc.on("close", (code) => {
      const latencyMs = Date.now() - startMs;
      if (code === 0) {
        resolve({
          status: "ok",
          latencyMs,
          reason: `ACPX 真值推理响应通过: "${stdout.trim().slice(0, 30)}"`,
        });
      } else {
        const errSnippet = (stderr || stdout).trim().slice(0, 60);
        resolve({
          status: "fail",
          latencyMs,
          reason: `ACPX 推理未闭环 (exit ${code}): ${errSnippet}`,
        });
      }
    });
  });
}

// 4. 定义 7 工具池探针配置与元数据 (兼容 tool-health-monitor)
function getToolDefinitions() {
  const agyAdapter = resolveAdapterScript("scripts/adapters/docker-agy-acp.sh");
  const glmAdapter = resolveAdapterScript("scripts/adapters/claude-glm-acp.sh");
  const mmAdapter = resolveAdapterScript("scripts/adapters/claude-mm-acp.sh");
  const copilotAdapter = resolveAdapterScript("scripts/adapters/copilot-acp.sh");

  return [
    {
      name: "cmd",
      title: "Command Code (门神主力)",
      bestFor: ["命令", "E2E", "单测", "自动化"],
      recommendedEmployees: ["门神", "铁匠贰号"],
      quota: null,
      adapter: "cmd acp",
      deepAgent: "cmd acp",
      checkBinary: "cmd",
    },
    {
      name: "agy-gemini3.8",
      title: "Antigravity (墨斗主力)",
      bestFor: ["原型", "选型", "架构研判", "中文长篇分析"],
      recommendedEmployees: ["墨斗"],
      quota: null,
      adapter: agyAdapter,
      deepAgent: agyAdapter,
      checkBinary: "agy",
    },
    {
      name: "claude-glm",
      title: "Claude Code / GLM (铁匠主力)",
      bestFor: ["代码", "契约", "架构落地"],
      recommendedEmployees: ["铁匠", "百晓生"],
      quota: "良好",
      adapter: glmAdapter,
      deepAgent: glmAdapter,
      checkBinary: "claude",
    },
    {
      name: "claude-mm",
      title: "Claude Code / MiniMax (铁匠贰号)",
      bestFor: ["代码", "长文本", "备用"],
      recommendedEmployees: ["铁匠", "百晓生"],
      quota: "良好",
      adapter: mmAdapter,
      deepAgent: mmAdapter,
      checkBinary: "claude",
    },
    {
      name: "copilot",
      title: "GitHub Copilot (兑底渊主力)",
      bestFor: ["发布", "OTA", "SRE", "监控"],
      recommendedEmployees: ["兑底渊"],
      quota: "可用",
      adapter: copilotAdapter || "copilot --acp --stdio",
      deepAgent: "built-in:copilot",
      checkBinary: "copilot",
    },
    {
      name: "Hermes",
      title: "Hermes Agent (PM调度中枢)",
      bestFor: ["PM", "派工", "验收", "统筹"],
      recommendedEmployees: ["Hermes"],
      quota: null,
      adapter: null,
      deepAgent: null,
      checkBinary: "hermes",
    },
    {
      name: "kiro-cli",
      title: "Kiro CLI (老板保留工具)",
      bestFor: ["架构设计", "Spec驱动", "重构"],
      recommendedEmployees: ["Hermes", "墨斗"],
      quota: null,
      adapter: null,
      deepAgent: null,
      checkBinary: "kiro-cli",
    },
  ];
}

async function main() {
  const acpxBin = findAcpx();
  let acpxVersion = "未知";
  if (acpxBin) {
    try {
      acpxVersion = execSync(`"${acpxBin}" -V 2>/dev/null`, { encoding: "utf8" }).trim();
    } catch {}
  }

  const results = {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    mode: IS_DEEP ? "L2 (Live ACPX Ping)" : "L1 (ACP Handshake)",
    acpx: {
      available: Boolean(acpxBin),
      path: acpxBin,
      version: acpxVersion,
    },
    tools: {},
  };

  const allTools = getToolDefinitions();
  const targets = SPECIFIC_TOOL
    ? allTools.filter(t => t.name === SPECIFIC_TOOL)
    : allTools;

  for (const t of targets) {
    // 检查二进程存在性 (对非必须工具若未安装直接标为 standby)
    if (t.checkBinary) {
      let isPresent = false;
      let binPath = "";
      try {
        binPath = execSync(`command -v ${t.checkBinary} 2>/dev/null`, { encoding: "utf8" }).trim();
        isPresent = Boolean(binPath);
      } catch {}

      if (!isPresent && (t.name === "copilot" || t.name === "kiro-cli")) {
        results.tools[t.name] = {
          status: "standby",
          bestFor: t.bestFor,
          recommendedEmployees: t.recommendedEmployees,
          quota: t.quota,
          resetAt: null,
          expiresAt: null,
          latencyMs: 0,
          protocol: t.adapter ? "Agent Client Protocol (ACP)" : "CLI Subprocess",
          reason: "CLI 未安装 (按需选用)",
        };
        continue;
      }
    }

    // 针对非 ACP 适配器的专用工具 (如 Hermes 调度中枢 / kiro-cli)
    if (!t.adapter) {
      let isPresent = false;
      let binPath = "";
      if (t.checkBinary) {
        try {
          binPath = execSync(`command -v ${t.checkBinary} 2>/dev/null`, { encoding: "utf8" }).trim();
          isPresent = Boolean(binPath);
        } catch {}
      }

      if (t.name === "Hermes") {
        results.tools[t.name] = {
          status: isPresent ? "ok" : "standby",
          bestFor: t.bestFor,
          recommendedEmployees: t.recommendedEmployees,
          quota: t.quota,
          resetAt: null,
          expiresAt: null,
          latencyMs: 1,
          protocol: "Native Agent / PM Dispatcher",
          reason: isPresent ? `PM 调度中枢就绪 (${binPath})` : "本地调度脚本代理",
        };
      } else {
        results.tools[t.name] = {
          status: isPresent ? "ok" : "standby",
          bestFor: t.bestFor,
          recommendedEmployees: t.recommendedEmployees,
          quota: t.quota,
          resetAt: null,
          expiresAt: null,
          latencyMs: 1,
          protocol: "CLI Subprocess",
          reason: isPresent ? `CLI 就绪 (${binPath})` : "老板保留备用 (按需启用)",
        };
      }
      continue;
    }

    // 针对具备标准 ACP 适配器的工具
    let toolResult;
    if (IS_DEEP && acpxBin && t.deepAgent) {
      toolResult = await probeAcpxDeep(acpxBin, t.deepAgent);
    } else {
      toolResult = await probeAcpHandshake(t.adapter);
    }

    results.tools[t.name] = {
      status: toolResult.status,
      bestFor: t.bestFor,
      recommendedEmployees: t.recommendedEmployees,
      quota: t.quota,
      resetAt: null,
      expiresAt: null,
      latencyMs: toolResult.latencyMs,
      protocol: "Agent Client Protocol (ACP)",
      reason: toolResult.reason,
    };
  }

  // 若指定了 --save，直接落盘最新健康状态文件
  if (SAVE_PATH) {
    const parentDir = path.dirname(SAVE_PATH);
    if (!fs.existsSync(parentDir)) {
      try { fs.mkdirSync(parentDir, { recursive: true }); } catch {}
    }
    fs.writeFileSync(SAVE_PATH, JSON.stringify(results, null, 2), "utf8");
    if (!IS_JSON) {
      console.log(`✅ 已通过 ACP 探针落盘写入: ${SAVE_PATH}`);
    }
  }

  if (IS_JSON) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log("==================================================================");
  console.log(`🔌 Coolie 7 工具池 ACPX 全双工协议深度探针 [${results.mode}]`);
  console.log("==================================================================");
  console.log(`  总线引擎: ${acpxBin ? `✅ ${acpxBin} (${acpxVersion})` : "❌ 未找到 acpx"}`);
  console.log("------------------------------------------------------------------");
  printfReport(results.tools);
  console.log("==================================================================");
}

function printfReport(tools) {
  for (const [key, t] of Object.entries(tools)) {
    const icon = t.status === "ok" ? "✅" : t.status === "standby" ? "⏸️ " : "❌";
    const nameStr = `[${key}]`.padEnd(16);
    const latStr = `${t.latencyMs}ms`.padStart(7);
    console.log(`  ${icon} ${nameStr} (${latStr})  ${t.reason}`);
  }
}

main().catch((err) => {
  console.error("Probe error:", err);
  process.exit(1);
});
