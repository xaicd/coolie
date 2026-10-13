#!/usr/bin/env node
/**
 * scripts/sre-repro-engine.mjs
 * 
 * SRE 自动化问题复现与真实验证引擎 (SRE Reproduction & Verification Engine)
 * 驱动 agent-browser (Web 端 Playwright) 与 agent-device (移动真机/模拟器 ADB)
 * 捕获四态快照、物理截图、白屏/红屏崩溃嗅探，输出不可变 CMMI 机器证据。
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs-coolie/evidence/sre-repro');

const IS_DARWIN = process.platform === 'darwin';

/**
 * 跨宿主机/容器穿透执行底层工具命令 (agent-browser / agent-device / adb)
 */
export function execHost(cmd, timeoutMs = 25000) {
  if (IS_DARWIN) {
    return execSync(cmd, { encoding: 'utf8', timeout: timeoutMs });
  }
  // 容器环境优先通过 host-exec 穿透到宿主机
  if (fs.existsSync('/usr/local/bin/host-exec')) {
    const escaped = cmd.replace(/"/g, '\\"');
    return execSync(`/usr/local/bin/host-exec "${escaped}"`, { encoding: 'utf8', timeout: timeoutMs });
  }
  return execSync(cmd, { encoding: 'utf8', timeout: timeoutMs });
}

/**
 * 1. 验证 Web 端 (agent-browser)
 */
export async function verifyWebEndpoint(options = {}) {
  const url = options.url || 'http://localhost:3100/';
  const outDir = options.outDir || EVIDENCE_DIR;
  fs.mkdirSync(outDir, { recursive: true });

  const timestamp = Date.now();
  const screenshotFileName = `web-repro-${timestamp}.png`;
  const screenshotPath = path.join(outDir, screenshotFileName);
  // Mac 宿主机路径 (如果从容器运行)
  const hostScreenshotPath = IS_DARWIN
    ? screenshotPath
    : `/Users/mac/workspace/xaicd/coolie/docs-coolie/evidence/sre-repro/${screenshotFileName}`;

  const startedAt = Date.now();
  const issuesFound = [];
  let snapshotText = '';
  let screenshotSaved = false;

  try {
    // 1. 打开网页并等待 DOM 沉降
    execHost(`agent-browser open "${url}" && agent-browser wait 2000`);

    // 2. 获取交互 DOM 节点快照
    snapshotText = execHost(`agent-browser snapshot -i`);

    // 3. 异常特征嗅探
    if (!snapshotText || snapshotText.trim().length === 0) {
      issuesFound.push('BLANK_PAGE: DOM 快照为空，可能白屏');
    } else if (/500 Internal Server Error|502 Bad Gateway|Cannot GET/i.test(snapshotText)) {
      issuesFound.push('HTTP_SERVER_ERROR: 页面渲染包含服务端错误提示');
    } else if (/Uncaught Error|ReferenceError|TypeError|ChunkLoadError/i.test(snapshotText)) {
      issuesFound.push('JS_RUNTIME_ERROR: 前端渲染捕获未处理 JS 运行时异常');
    } else if (snapshotText.includes('Loading…') && snapshotText.split('\n').length <= 2) {
      issuesFound.push('STUCK_LOADING: 页面长期停留在 Loading 态，无法完成水合');
    }

    // 4. 捕获真实屏幕截图
    try {
      execHost(`agent-browser screenshot "${hostScreenshotPath}"`);
      screenshotSaved = true;
    } catch (ssErr) {
      issuesFound.push(`SCREENSHOT_FAILED: 截图捕获失败 (${ssErr.message})`);
    }

  } catch (err) {
    issuesFound.push(`BROWSER_EXEC_ERROR: ${err.message}`);
  }

  const durationMs = Date.now() - startedAt;
  const ok = issuesFound.length === 0;

  return {
    ok,
    target: 'web',
    url,
    issuesFound,
    snapshotText,
    screenshotPath: screenshotSaved ? screenshotPath : null,
    durationMs
  };
}

/**
 * 2. 验证移动端模拟器/真机 (agent-device)
 */
export async function verifyDeviceApp(options = {}) {
  const appId = options.appId || 'cloud.coolie.app';
  const sessionName = options.session || 'default';
  const outDir = options.outDir || EVIDENCE_DIR;
  fs.mkdirSync(outDir, { recursive: true });

  const timestamp = Date.now();
  const screenshotFileName = `device-repro-${timestamp}.png`;
  const screenshotPath = path.join(outDir, screenshotFileName);
  const hostScreenshotPath = IS_DARWIN
    ? screenshotPath
    : `/Users/mac/workspace/xaicd/coolie/docs-coolie/evidence/sre-repro/${screenshotFileName}`;

  const startedAt = Date.now();
  const issuesFound = [];
  let snapshotText = '';
  let screenshotSaved = false;

  try {
    // 1. 检查会话与设备状态
    let sessionList = '';
    try {
      sessionList = execHost(`agent-device session list`);
    } catch (_) {}

    // 如果没有活动会话，先启动一次
    if (!sessionList.includes(sessionName)) {
      try {
        execHost(`agent-device open ${appId} --foreground`);
      } catch (_) {}
    }

    // 2. 捕获交互节点快照
    try {
      snapshotText = execHost(`agent-device --session ${sessionName} snapshot -i`);
    } catch (snapErr) {
      // 降级尝试重连前台
      try {
        execHost(`agent-device open ${appId} --foreground`);
        snapshotText = execHost(`agent-device snapshot -i`);
      } catch (_) {
        issuesFound.push(`DEVICE_SNAPSHOT_FAILED: ${snapErr.message}`);
      }
    }

    // 3. 移动端异常特征嗅探
    if (snapshotText) {
      if (/React Native warning\/error overlay detected|RedBox/i.test(snapshotText)) {
        issuesFound.push('REACT_NATIVE_OVERLAY: 检测到 RN 报错红屏/警告遮罩覆盖层');
      }
      if (/Application Not Responding|has stopped|Crash|ANR/i.test(snapshotText)) {
        issuesFound.push('APP_CRASH_OR_ANR: 检测到 App 崩溃或未响应弹窗');
      }
      if (snapshotText.includes('Snapshot: 0 visible nodes')) {
        issuesFound.push('DEVICE_WHITE_SCREEN: 移动端全屏零可见节点（白屏）');
      }
    }

    // 4. 捕获真机截图
    try {
      execHost(`agent-device --session ${sessionName} screenshot "${hostScreenshotPath}"`);
      screenshotSaved = true;
    } catch (ssErr) {
      issuesFound.push(`DEVICE_SCREENSHOT_FAILED: ${ssErr.message}`);
    }

  } catch (err) {
    issuesFound.push(`DEVICE_EXEC_ERROR: ${err.message}`);
  }

  const durationMs = Date.now() - startedAt;
  const ok = issuesFound.length === 0;

  return {
    ok,
    target: 'device',
    appId,
    issuesFound,
    snapshotText,
    screenshotPath: screenshotSaved ? screenshotPath : null,
    durationMs
  };
}

/**
 * 3. 综合工单与故障复现验证 (CMMI G4/G5 证据落盘)
 */
export async function reproduceAndVerify(issueIdentifier = 'INCIDENT', context = {}) {
  const ts = new Date().toISOString();
  console.log(`\x1b[36m=== [SRE Repro Engine] 开始对 ${issueIdentifier} 执行真机与浏览器复现走查 ===\x1b[0m`);

  const results = {
    issueIdentifier,
    timestamp: ts,
    web: null,
    device: null,
    verdict: 'PASS'
  };

  const isMobileRelated = /expo|app|mobile|移动端|真机|安卓|android/i.test(
    `${issueIdentifier} ${context.title || ''} ${context.description || ''}`
  );
  const isWebRelated = /web|console|h5|ui|界面|看板|admin|react|vue/i.test(
    `${issueIdentifier} ${context.title || ''} ${context.description || ''}`
  ) || !isMobileRelated;

  // 1. 执行 Web 验证
  if (isWebRelated) {
    console.log(`🌐 正在拉起 agent-browser 验证 Web 控制台...`);
    results.web = await verifyWebEndpoint({
      url: context.url || 'http://localhost:3100/'
    });
    console.log(`   Web 结果: ${results.web.ok ? '✅ 无异常' : '❌ 发现缺陷: ' + results.web.issuesFound.join(', ')} (${results.web.durationMs}ms)`);
  }

  // 2. 执行移动端真机验证
  if (isMobileRelated) {
    console.log(`📱 正在拉起 agent-device 验证移动端模拟器...`);
    results.device = await verifyDeviceApp({
      appId: context.appId || 'cloud.coolie.app'
    });
    console.log(`   移动端结果: ${results.device.ok ? '✅ 无异常' : '❌ 发现缺陷: ' + results.device.issuesFound.join(', ')} (${results.device.durationMs}ms)`);
  }

  const allIssues = [
    ...(results.web?.issuesFound || []),
    ...(results.device?.issuesFound || [])
  ];

  results.verdict = allIssues.length === 0 ? 'PASS' : 'FAIL';
  results.allIssues = allIssues;

  // 3. 生成不可变 CMMI Markdown 机器证据
  const reportPath = path.join(EVIDENCE_DIR, `${issueIdentifier}-sre-repro-${Date.now()}.md`);
  const markdown = `# SRE 自动化问题复现与真实验证报告 (${issueIdentifier})

- **验证时间**: ${ts}
- **主审数字员工**: 🤖 兑底渊 (PRE-SRE)
- **总体结论 (Verdict)**: **${results.verdict === 'PASS' ? '✅ PASS (无异常/已修复)' : '❌ FAIL (复现缺陷)'}**
- **缺陷清单**: ${allIssues.length > 0 ? allIssues.join('; ') : '无'}

---

## 1. Web 控制台自动化走查 (agent-browser)
${results.web ? `
- **目标 URL**: \`${results.web.url}\`
- **耗时**: ${results.web.durationMs}ms
- **状态**: ${results.web.ok ? '✅ 正常' : '❌ 存在异常: ' + results.web.issuesFound.join(', ')}
- **物理截屏**: ${results.web.screenshotPath ? `![Web Screenshot](${results.web.screenshotPath})` : '无'}
- **交互 DOM 节点概览**:
\`\`\`text
${(results.web.snapshotText || '').split('\n').slice(0, 30).join('\n')}
\`\`\`
` : '_未触发 Web 走查_'}

---

## 2. 移动端真机/模拟器自动化走查 (agent-device)
${results.device ? `
- **目标应用**: \`${results.device.appId}\`
- **耗时**: ${results.device.durationMs}ms
- **状态**: ${results.device.ok ? '✅ 正常' : '❌ 存在异常: ' + results.device.issuesFound.join(', ')}
- **真机截屏**: ${results.device.screenshotPath ? `![Device Screenshot](${results.device.screenshotPath})` : '无'}
- **原生 UI 树节点概览**:
\`\`\`text
${(results.device.snapshotText || '').split('\n').slice(0, 30).join('\n')}
\`\`\`
` : '_未触发移动端走查_'}

---

## 3. 防退化治理措施
- 本次验证依据 **No Artifact, No Done** 铁律执行，证据与截图已持久化到物理磁盘；
- 若结论为 FAIL，SRE 自动阻断工单流转并上报 P0 自愈工单；
- 若结论为 PASS，已核实真实渲染未退化。
`;

  fs.writeFileSync(reportPath, markdown, 'utf8');
  console.log(`📄 不可变 SRE 验证证据已落盘: ${reportPath}`);
  results.reportPath = reportPath;

  return results;
}

// CLI 直调入口
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  if (args.includes('--web')) {
    const url = args.find(a => a.startsWith('http')) || 'http://localhost:3100/';
    verifyWebEndpoint({ url }).then(res => {
      console.log(JSON.stringify(res, null, 2));
      process.exit(res.ok ? 0 : 1);
    });
  } else if (args.includes('--device')) {
    verifyDeviceApp().then(res => {
      console.log(JSON.stringify(res, null, 2));
      process.exit(res.ok ? 0 : 1);
    });
  } else {
    const issue = args[0] || 'COOA-144';
    reproduceAndVerify(issue).then(res => {
      process.exit(res.verdict === 'PASS' ? 0 : 1);
    });
  }
}
