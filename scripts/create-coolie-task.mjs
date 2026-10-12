#!/usr/bin/env node
/**
 * create-coolie-task.mjs
 * 负责接收 QQ/微信/CLI 的任务并创建为 Coolie 平台工单 (Issue)
 * 强制实施铁律：
 * - 来源为 QQ 时，标题必须加上 "[QQ] " 前缀
 * - 来源为 微信 时，标题必须加上 "[微信] " 前缀
 */

import http from "node:http";

const API_BASE = process.env.COOLIE_API_URL || "http://127.0.0.1:3100/api";

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    source: "qq",
    title: "",
    desc: "",
    priority: "medium",
    assignee: "tiejiang",
    project: "wenlv-next"
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--source" || arg === "-s") {
      result.source = args[++i];
    } else if (arg === "--title" || arg === "-t") {
      result.title = args[++i];
    } else if (arg === "--desc" || arg === "-d") {
      result.desc = args[++i];
    } else if (arg === "--priority" || arg === "-p") {
      result.priority = args[++i];
    } else if (arg === "--assignee" || arg === "-a") {
      result.assignee = args[++i];
    } else if (arg === "--project") {
      result.project = args[++i];
    }
  }
  return result;
}

function normalizeTitle(rawTitle, source) {
  let clean = (rawTitle || "").trim();
  // 剥离可能已有的前缀，防止堆叠重复
  clean = clean.replace(/^\[(QQ|微信|WECHAT|WeChat|qq)\]\s*/i, "");
  clean = clean.replace(/^【(QQ|微信|WECHAT|WeChat|qq)】\s*/i, "");

  const src = (source || "").toLowerCase();
  let prefix = "";
  if (src === "qq" || src === "qqbot") {
    prefix = "[QQ] ";
  } else if (src === "weixin" || src === "wechat" || src === "wx") {
    prefix = "[微信] ";
  } else if (src) {
    prefix = `[${src.toUpperCase()}] `;
  }
  return `${prefix}${clean}`;
}

async function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const fullUrl = `${API_BASE.replace(/\/+$/, "")}${cleanPath}`;
    const url = new URL(fullUrl);
    const req = http.request(url, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    }, (res) => {
      res.setEncoding("utf8");
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        } catch (e) {
          reject(new Error(`JSON 解析失败: ${e.message}, 原始数据: ${data.slice(0, 100)}`));
        }
      });
    });
    req.on("error", reject);
    if (options.body) {
      req.write(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

function ensureArray(val) {
  if (Array.isArray(val)) return val;
  if (val && Array.isArray(val.items)) return val.items;
  if (val && Array.isArray(val.data)) return val.data;
  return [];
}

async function main() {
  const args = parseArgs();
  if (!args.title) {
    console.error("用法: node create-coolie-task.mjs --source <qq|weixin> --title <任务名称> [--desc <详细说明>] [--assignee <tiejiang|menshen|hermes>]");
    process.exit(1);
  }

  // 1. 获取公司
  const rawCompanies = await request("/companies");
  const companies = ensureArray(rawCompanies);
  const company = companies.find(c => (c.name && c.name.includes("wenlv")) || (c.name && c.name.includes("文旅"))) || companies[0];
  if (!company) {
    throw new Error("未找到活跃的 Coolie 公司");
  }

  // 2. 获取项目
  const rawProjects = await request(`/companies/${company.id}/projects`);
  const projects = ensureArray(rawProjects);
  const project = projects.find(p => (p.name && p.name.includes("wenlv")) || p.id === args.project) || projects[0];

  // 3. 获取员工列表
  const rawAgents = await request(`/companies/${company.id}/agents`);
  const agents = ensureArray(rawAgents);
  const assigneeName = (args.assignee || "").toLowerCase();
  let targetAgent = agents.find(a => 
    a.name.toLowerCase().includes(assigneeName) || 
    (assigneeName === "tiejiang" && (a.name.includes("铁匠") || a.title.includes("Core SWE"))) ||
    (assigneeName === "menshen" && (a.name.includes("门神") || a.title.includes("QA"))) ||
    (assigneeName === "hermes" && a.name.includes("Hermes")) ||
    (assigneeName === "moudou" && a.name.includes("墨斗")) ||
    (assigneeName === "baixiaosheng" && a.name.includes("百晓生")) ||
    (assigneeName === "doudiyuan" && a.name.includes("兜底渊"))
  );

  if (!targetAgent) {
    // 默认给铁匠 (主力研发)
    targetAgent = agents.find(a => a.name.includes("铁匠")) || agents[0];
  }

  // 4. 计算规范化标题 (QQ 前缀 / 微信 前缀)
  const finalTitle = normalizeTitle(args.title, args.source);

  // 5. 组装工单 Payload
  const issuePayload = {
    title: finalTitle,
    description: args.desc ? `【来源渠道】：${args.source.toUpperCase()}\n\n${args.desc}` : `【来源渠道】：${args.source.toUpperCase()}`,
    priority: args.priority || "medium",
    status: "todo",
    projectId: project ? project.id : undefined,
    assigneeAgentId: targetAgent ? targetAgent.id : undefined
  };

  const createdIssue = await request(`/companies/${company.id}/issues`, {
    method: "POST",
    body: issuePayload
  });

  const output = {
    success: true,
    issueId: createdIssue.id,
    identifier: createdIssue.identifier,
    title: createdIssue.title,
    status: createdIssue.status,
    assignee: targetAgent ? `${targetAgent.name} (${targetAgent.title})` : "未分配",
    source: args.source,
    url: `http://100.101.22.109:3100/${company.id}/issues/${createdIssue.identifier}`
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch(err => {
  console.error("创建任务失败:", err.message);
  process.exit(1);
});
