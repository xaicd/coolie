#!/bin/sh
// 2>/dev/null; exec /usr/bin/env node "$0" "$@"
/**
 * scripts/hermes-wechat-monitor.mjs
 * 
 * 宿主机 Hermes 微信会话与截图实时监控探针 (WeChat Session & Screenshot Monitor)
 * 
 * 核心能力:
 * 1. 穿透宿主机直接读取 ~/.hermes/state.db 微信活跃会话 (agent:main:weixin:dm:...)
 * 2. 毫秒级提取老板最新微信原话、Hermes 回复与工具调用链
 * 3. 自动嗅探消息中包含的图片/截图附件 ([Image attached at: /Users/mac/.hermes/cache/images/...])
 * 4. 自动增量同步高清晰度截图至工作区 .coolie-local/wechat-monitor/images/
 * 5. 支持单次快速审计 (--limit)、结构化输出 (--json) 与实时看门狗监听 (--watch)
 */

import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = process.cwd();
const LOCAL_IMAGE_DIR = path.join(REPO_ROOT, ".coolie-local/wechat-monitor/images");
fs.mkdirSync(LOCAL_IMAGE_DIR, { recursive: true });

function hostExec(cmd) {
  try {
    return execSync(`host-exec ${JSON.stringify(cmd)}`, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    if (err.stdout) return err.stdout.toString().trim();
    throw new Error(`host-exec failed: ${err.message}`);
  }
}

// 1. 查询活跃微信会话
export function getActiveWeChatSession() {
  const sql = `SELECT id, session_key, chat_id, title, started_at, message_count FROM sessions WHERE session_key LIKE '%weixin%' OR chat_id LIKE '%wechat%' ORDER BY started_at DESC LIMIT 1;`;
  const raw = hostExec(`sqlite3 -json ~/.hermes/state.db ${JSON.stringify(sql)}`);
  if (!raw) return null;
  try {
    const list = JSON.parse(raw);
    return list.length > 0 ? list[0] : null;
  } catch (e) {
    return null;
  }
}

// 2. 提取微信会话最近消息
export function getRecentWeChatMessages(sessionId, limit = 5) {
  const sql = `SELECT rowid as id, role, content, timestamp, tool_calls, tool_name FROM messages WHERE session_id = '${sessionId}' ORDER BY rowid DESC LIMIT ${limit};`;
  const raw = hostExec(`sqlite3 -json ~/.hermes/state.db ${JSON.stringify(sql)}`);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return list.reverse(); // 按时间正序
  } catch (e) {
    return [];
  }
}

// 3. 嗅探图片路径并同步到本地
export function extractAndSyncImages(messages) {
  const imageRegex = /(?:\[Image attached at:\s*([^\s\]]+)\]|\/Users\/mac\/\.hermes\/(?:cache\/images|images)\/([a-zA-Z0-9_\-\.]+))/g;
  const foundImages = new Set();

  for (const msg of messages) {
    if (!msg.content) continue;
    let match;
    while ((match = imageRegex.exec(msg.content)) !== null) {
      const fullPath = match[1] || match[0];
      if (fullPath.endsWith(".jpg") || fullPath.endsWith(".png") || fullPath.endsWith(".jpeg") || fullPath.endsWith(".webp")) {
        foundImages.add(fullPath);
      }
    }
  }

  const syncedList = [];
  for (const imgPath of foundImages) {
    const baseName = path.basename(imgPath);
    const localTarget = path.join(LOCAL_IMAGE_DIR, baseName);

    // 检查宿主机上文件是否存在
    const existsCheck = hostExec(`[ -f "${imgPath}" ] && echo "EXISTS" || echo "MISSING"`);
    if (existsCheck.includes("EXISTS")) {
      // 复制到本地工作区映射目录
      hostExec(`cp "${imgPath}" "/Users/mac/workspace/xaicd/coolie/.coolie-local/wechat-monitor/images/${baseName}"`);
      const statOut = hostExec(`ls -lh "${imgPath}" | awk '{print $5}'`);
      syncedList.push({
        name: baseName,
        hostPath: imgPath,
        localPath: `.coolie-local/wechat-monitor/images/${baseName}`,
        absoluteLocalPath: localTarget,
        size: statOut || "unknown",
        exists: fs.existsSync(localTarget),
      });
    }
  }

  return syncedList;
}

// 4. 格式化打印大盘
export function printWeChatDashboard(session, messages, images) {
  const line = "═".repeat(80);
  const subline = "─".repeat(80);

  console.log(line);
  console.log(`📱 【Hermes 宿主机微信会话与截图感知大盘】`);
  console.log(`📡 会话 ID: ${session ? session.id : "未知"} | Key: ${session ? session.session_key : "无"}`);
  console.log(`👤 目标用户: ${session ? session.chat_id : "无"} | 累计消息: ${session ? session.message_count : 0}`);
  console.log(line);

  if (images.length > 0) {
    console.log(`🖼️ 【检测到会话截图 / 视觉凭证 (${images.length} 张)】:`);
    for (const img of images) {
      console.log(`   • 文件: ${img.name} (${img.size})`);
      console.log(`     宿主路径: ${img.hostPath}`);
      console.log(`     本地路径: ${img.localPath}`);
    }
    console.log(subline);
  }

  console.log(`💬 【最近会话上下文流 (最新 ${messages.length} 条)】:`);
  for (const msg of messages) {
    const timeStr = msg.timestamp
      ? new Date(msg.timestamp * 1000).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })
      : "未知时间";
    
    let roleLabel = "🤖 助手 (Hermes)";
    if (msg.role === "user") {
      roleLabel = "👤 掌柜 (老板微信)";
    } else if (msg.role === "tool") {
      roleLabel = `🛠️ 工具调用 [${msg.tool_name || "kernel"}]`;
    }

    console.log(`\n[${timeStr}] ${roleLabel} (msg#${msg.id}):`);
    
    // 内容换行规整
    const cleanContent = (msg.content || "").trim();
    if (cleanContent.length > 500) {
      console.log(cleanContent.substring(0, 500) + "\n   ... (余下内容截断) ...");
    } else {
      console.log(cleanContent);
    }
  }

  console.log("\n" + line);
}

// 5. 持续监听模式 (Watch Mode)
async function startWatchMode(pollIntervalMs = 3000) {
  console.log(`🔍 [WeChat Monitor] 启动持续监听守护 (轮询间隔: ${pollIntervalMs}ms)... 按 Ctrl+C 退出`);
  
  let lastSeenId = 0;
  const session = getActiveWeChatSession();
  if (!session) {
    console.error("❌ 未找到活跃的微信会话");
    process.exit(1);
  }

  const initialMsgs = getRecentWeChatMessages(session.id, 1);
  if (initialMsgs.length > 0) {
    lastSeenId = initialMsgs[0].id;
  }

  console.log(`📡 初始定位会话 ${session.id}, 基线 Message ID: ${lastSeenId}`);

  while (true) {
    try {
      const activeSession = getActiveWeChatSession();
      if (activeSession) {
        const msgs = getRecentWeChatMessages(activeSession.id, 5);
        const newMsgs = msgs.filter(m => m.id > lastSeenId);

        if (newMsgs.length > 0) {
          console.log(`\n🔔 [${new Date().toLocaleTimeString()}] 检测到 ${newMsgs.length} 条新微信消息:`);
          const images = extractAndSyncImages(newMsgs);
          printWeChatDashboard(activeSession, newMsgs, images);
          lastSeenId = Math.max(...newMsgs.map(m => m.id));
        }
      }
    } catch (err) {
      console.error(`⚠️ 轮询异常: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, pollIntervalMs));
  }
}

// CLI 执行入口
async function main() {
  const args = process.argv.slice(2);
  const isJson = args.includes("--json");
  const isWatch = args.includes("--watch");
  
  let limit = 5;
  const limitIdx = args.indexOf("--limit");
  if (limitIdx !== -1 && args[limitIdx + 1]) {
    limit = parseInt(args[limitIdx + 1], 10) || 5;
  }

  const session = getActiveWeChatSession();
  if (!session) {
    if (isJson) {
      console.log(JSON.stringify({ error: "no_wechat_session_found" }));
    } else {
      console.error("❌ 未在 ~/.hermes/state.db 找到活跃的微信会话");
    }
    process.exit(1);
  }

  if (isWatch) {
    await startWatchMode();
    return;
  }

  const messages = getRecentWeChatMessages(session.id, limit);
  const images = extractAndSyncImages(messages);

  if (isJson) {
    console.log(JSON.stringify({
      session,
      images,
      messages,
      timestamp: new Date().toISOString(),
    }, null, 2));
  } else {
    printWeChatDashboard(session, messages, images);
  }
}

main().catch(err => {
  console.error("❌ 执行失败:", err);
  process.exit(1);
});
