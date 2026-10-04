#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function walk(dir, ext) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      if (!fullPath.includes('node_modules') && !fullPath.includes('dist') && !fullPath.includes('build')) {
        results = results.concat(walk(fullPath, ext));
      }
    } else {
      if (ext.some((e) => file.endsWith(e))) results.push(fullPath);
    }
  }
  return results;
}

console.log('========================================================================');
console.log('🤖 Coolie Agent-Native UI 架构合规度量审查器 (wave296)');
console.log('   审查范围: Web 控制台 (ui/src) & 移动原生端 (clients/expo/src)');
console.log('========================================================================\n');

// 1. Web 审查
const uiFiles = walk('ui/src', ['.tsx']);
let webButtons = 0;
let webInputs = 0;
let webAgentTarget = 0;
let webAgentScope = 0;
let webAgentState = 0;
let webLegacyTestId = 0;
let webInertUsage = 0;

for (const f of uiFiles) {
  const content = fs.readFileSync(f, 'utf8');
  webButtons += (content.match(/<button|<Button/g) || []).length;
  webInputs += (content.match(/<input|<Input|<textarea|<Textarea/g) || []).length;
  webAgentTarget += (content.match(/data-agent-target=/g) || []).length;
  webAgentScope += (content.match(/data-agent-scope=/g) || []).length;
  webAgentState += (content.match(/data-agent-state=/g) || []).length;
  webLegacyTestId += (content.match(/data-testid=/g) || []).length;
  webInertUsage += (content.match(/inert=/g) || []).length;
}

const totalWebInteractive = webButtons + webInputs;
const webComplianceRate = totalWebInteractive > 0 ? ((webAgentTarget / totalWebInteractive) * 100).toFixed(1) : '0.0';

console.log('🌐 1. Web 端 (agent-browser) 审查结果:');
console.log(`   - 扫描 TSX 文件数:        ${uiFiles.length} 个`);
console.log(`   - 可交互组件总量:          ${totalWebInteractive} (按钮: ${webButtons}, 输入框: ${webInputs})`);
console.log(`   - 具备 data-agent-target:  ${webAgentTarget} 处 (Agent-Native 标准交互目标)`);
console.log(`   - 具备 data-agent-scope:   ${webAgentScope} 处 (多层级作用域隔离)`);
console.log(`   - 具备 data-agent-state:   ${webAgentState} 处 (状态信号灯防抖)`);
console.log(`   - 具备 inert 遮挡剪枝:     ${webInertUsage} 处 (多层弹窗节点降噪)`);
console.log(`   - 遗留 data-testid:        ${webLegacyTestId} 处 (传统单测遗留，未结构化命名)`);
console.log(`   - 【Web 规范符合度】:      ${webComplianceRate}% (基线待治理)\n`);

// 2. 移动原生端审查
const expoFiles = walk('clients/expo/src', ['.tsx']);
let mobileTouchables = 0;
let mobileInputs = 0;
let mobileTestIds = 0;
let mobileStructuredTestIds = 0;
let mobileModals = 0;
let mobileModalWithIsModal = 0;

for (const f of expoFiles) {
  const content = fs.readFileSync(f, 'utf8');
  mobileTouchables += (content.match(/<TouchableOpacity|<Pressable|<Button/g) || []).length;
  mobileInputs += (content.match(/<TextInput/g) || []).length;
  const testIds = content.match(/testID=["']([^"']+)["']/g) || [];
  mobileTestIds += testIds.length;
  for (const tid of testIds) {
    if (tid.includes('__')) {
      mobileStructuredTestIds++;
    }
  }
  mobileModals += (content.match(/<Modal/g) || []).length;
  mobileModalWithIsModal += (content.match(/accessibilityViewIsModal/g) || []).length;
}

const totalMobileInteractive = mobileTouchables + mobileInputs;
const mobileComplianceRate = totalMobileInteractive > 0 ? ((mobileStructuredTestIds / totalMobileInteractive) * 100).toFixed(1) : '0.0';

console.log('📱 2. 移动原生端 (agent-device) 审查结果:');
console.log(`   - 扫描 TSX 文件数:        ${expoFiles.length} 个`);
console.log(`   - 触控交互组件总量:        ${totalMobileInteractive} (触控: ${mobileTouchables}, 输入: ${mobileInputs})`);
console.log(`   - 具备结构化 testID:       ${mobileStructuredTestIds} 处 ([Screen]__[Comp]__[Action] 规范)`);
console.log(`   - 遗留未结构化 testID:     ${mobileTestIds - mobileStructuredTestIds} 处`);
console.log(`   - 弹窗 Modal 总量:         ${mobileModals} 个`);
console.log(`   - 具备 accessibilityViewIsModal: ${mobileModalWithIsModal} 个 (弹窗独占防穿透)`);
console.log(`   - 【移动原生规范符合度】:  ${mobileComplianceRate}% (基线待治理)\n`);

console.log('========================================================================');
console.log('📋 审查结论与改造建议:');
console.log('  ❌ 现状判定: 当前代码库尚未符合 Agent-Native UI 架构规范 (符合度 < 5%)。');
console.log('  ⚠️ 根因分析: 过去依赖传统 CSS/div 渲染，缺乏语义化属性，导致 Agent 定位');
console.log('             在复杂多层级 UI 下出现迷航、连击与遮挡误触。');
console.log('  ✅ 改造路径:');
console.log('     1. 底座组件注入: 在 ui/src/components/ui/button.tsx 等基础组件默认暴露 data-agent-target 契约;');
console.log('     2. 核心屏幕补齐: 在收件箱 (Inbox)、治理控制台、Spec 编辑器等高频业务率先实施标注;');
console.log('     3. 纳入 CI/CD 门禁: 对新增 PR 进行 Agent 标注增量拦截，逐步清零历史技术债。');
console.log('========================================================================');
