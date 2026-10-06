#!/usr/bin/env node
// scripts/inject-wave358-dev-tasks.mjs
// 注入前序会话未结待办到 Coolie Dev Server (da2e705c-c80a-411b-b2ae-e39372b1251f)

import http from "node:http";

const COMPANY_ID = "da2e705c-c80a-411b-b2ae-e39372b1251f"; // Coolie 本地施工总社

function fetchJson(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1",
      port: 3100,
      path,
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
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

async function main() {
  console.log("🚀 开始录入 wave358 会话待办到 Coolie Dev Server 看板...");

  // 1. 获取现有 issues & agents
  const issues = await fetchJson(`/api/companies/${COMPANY_ID}/issues`);
  const agents = await fetchJson(`/api/companies/${COMPANY_ID}/agents`);

  const agentMap = {};
  if (Array.isArray(agents)) {
    agents.forEach(a => agentMap[a.name] = a.id);
  }

  const tasksToInject = [
    {
      title: "[wave358] 多宿主 Hermes 动态改名与角色标识 (Palantir Echo/Delta/Dev 作战矩阵)",
      description: "根据老板指示：这套系统安装到各个电脑，根据项目名称与职责属性支持 Hermes 动态改名，能一眼识别是 Palantir 体系下的 Echo (业务战略与价值中枢)、Delta (前线全栈工程攻坚)、Dev (平台底座抽象演进)，并将作战属性与正交物理部署宿主 (prod/staging/local) 在工坊会话、微信与派单 Header 中自适应透出。",
      priority: "high",
      status: "todo",
      assigneeAgentId: agentMap["铁匠"] || null,
    },
    {
      title: "[wave358] 工具健康度探测精准识别 agy 过期凭据与调度自动降级保护",
      description: "根据微信聊天记录中频繁出现的 agy 过期报错：完善 tool-health-monitor.mjs 与调度总线，针对 agy 容器返回的 401 / Session expired / Unauthorized 实施正则精准捕获；一旦发现凭据失效自动标记该工具进入冷却态，并无缝降级切换至备用工具 (claude/cmd)，杜绝微信交互中断。",
      priority: "critical",
      status: "todo",
      assigneeAgentId: agentMap["兑底渊"] || null,
    },
    {
      title: "[wave358] 腾讯云生产环境 Docker agy 镜像标准化构建与跨机分发脚本",
      description: "标准化腾讯云 Linux amd64 生产宿主机上的 Docker agy 容器镜像构建与同步流程，固化自动化打包与远程加载脚本 (docker-build-agy.sh / sync-agy-image.sh)，确保跨机新部署节点具备完整 agy CLI 运行能力与权限配置。",
      priority: "medium",
      status: "todo",
      assigneeAgentId: agentMap["兑底渊"] || null,
    },
    {
      title: "[wave358] 原生 APP 点击「工坊」Tab 闪退 BUG 根治与 ErrorBoundary 容错保护",
      description: "全面排查并根除原生 APP 点击底部导航「工坊」闪退的致命缺陷：\n1. 在 BoardChatScreen 中增加对 conversations、projects、approvalFeed、messages 的 Array.isArray 防御性收敛与 null 安全防线；\n2. 修复 latestAssistantTimestamp 对 non-string/non-Date 类型 createdAt 调用 toISOString 的未捕获异常；\n3. 封装 ScreenErrorBoundary 并在 App.tsx 中对工坊 Tab 全面包裹，捕获任何渲染期未捕获异常并展示优雅重试卡片，永不崩溃退出。",
      priority: "critical",
      status: "done",
      assigneeAgentId: agentMap["门神"] || null,
    },
  ];

  for (const task of tasksToInject) {
    const existing = issues.find(i => i.title === task.title);
    if (existing) {
      console.log(`ℹ️ 工单已存在: [${existing.identifier}] ${existing.title} (当前状态: ${existing.status})`);
      if (task.status === "done" && existing.status !== "done") {
        await fetchJson(`/api/companies/${COMPANY_ID}/issues/${existing.id}/status`, {
          method: "PATCH",
          body: { status: "done" }
        });
        console.log(`✅ 已更新工单状态为 done: [${existing.identifier}]`);
      }
    } else {
      console.log(`➕ 正在创建新工单: ${task.title}...`);
      const created = await fetchJson(`/api/companies/${COMPANY_ID}/issues`, {
        method: "POST",
        body: task
      });
      console.log(`✅ 创建成功: [${created.identifier || created.id}] ${created.title}`);
    }
  }

  console.log("🎉 全部 wave358 会话待办任务已成功注入并同步！");
}

main().catch(err => {
  console.error("执行注入失败:", err);
  process.exit(1);
});
