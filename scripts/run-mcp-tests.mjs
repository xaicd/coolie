#!/usr/bin/env node
/**
 * scripts/run-mcp-tests.mjs
 *
 * 全量 95 项 MCP 自动化测试统筹执行器 (All-in-One MCP Test Orchestrator)
 *
 * 执行步骤:
 * 1. 执行 scripts/mcp-call.test.mjs (原生 Node 测试套件: 95 工具注册完整度断言 + 20 项端到端 live 检查);
 * 2. 执行 scripts/qa-mcp-e2e-suite.mjs (全端 10 项路由四态、几何防遮挡与白屏存证套件);
 * 3. 执行 @paperclipai/mcp-server vitest 测试套件 (96 项单测，100% 覆盖全部 95 个 MCP 工具的 Schema、URL 路由与请求方法);
 *    - 智能自适应环境: 若在 Linux 容器中自动调用 host-exec 穿透至宿主机执行 vitest，免受 rollup 原生二进制架构限制.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

function runStep(title, cmd, args, options = {}) {
  console.log(`\n========================================================================`);
  console.log(` 🚀 [MCP 测试主线] ${title}`);
  console.log(`    $ ${cmd} ${args.join(' ')}`);
  console.log(`========================================================================\n`);

  const res = spawnSync(cmd, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    ...options,
  });

  if (res.status !== 0) {
    console.error(`\n❌ 步骤失败: ${title} (退出码 ${res.status})\n`);
    process.exit(res.status ?? 1);
  }
}

// 1. 运行 mcp-call.test.mjs
runStep('Step 1/4: MCP CLI 契约与端到端回归', 'node', ['--test', 'scripts/mcp-call.test.mjs']);

// 2. 运行 qa-mcp-e2e-suite.mjs (产生测试握手凭据)
runStep('Step 2/4: QA 页面级四态与几何防遮挡存证走查 (产出握手凭据)', 'node', ['scripts/qa-mcp-e2e-suite.mjs']);

// 3. 运行 mcp-server vitest 96 项全量测试
const hasHostExec = fs.existsSync('/usr/local/bin/host-exec') || fs.existsSync('/root/.local/bin/host-exec');
if (hasHostExec) {
  runStep(
    'Step 3/4: @paperclipai/mcp-server 95 项工具 100% 契约单测 (host-exec 穿透)',
    'host-exec',
    ['pnpm --filter @paperclipai/mcp-server test']
  );
} else {
  runStep(
    'Step 3/4: @paperclipai/mcp-server 95 项工具 100% 契约单测 (本地)',
    'pnpm',
    ['--filter', '@paperclipai/mcp-server', 'test']
  );
}

// 4. 运行 ops-autonomous-user-engine.test.mjs (测试向运营真实用户履约)
runStep(
  'Step 4/4: 自动化测试向真实用户自动化运营履约闭环验证',
  'node',
  ['scripts/ops-autonomous-user-engine.test.mjs']
);

console.log(`\n========================================================================`);
console.log(` 🎉 全量 95 项 MCP 工具自动化测试 100% 通过，真实用户自动化运营闭环 100% 成功！`);
console.log(`    (CLI 95契约, E2E 四态快照, Vitest 96项单测, 真实用户代理 4 轨合一)`);
console.log(`========================================================================\n`);

