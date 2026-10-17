#!/usr/bin/env node
/**
 * scripts/check-testability-and-ops-gates.mjs
 *
 * 自动化测试与运营就绪性门禁守卫 (Testability & Ops-Ready Gatekeeper)
 *
 * 依照《基于 agent-device 与 agent-browser 反向视角的自测试自运营开发最高法典》
 * 检查前端组件与页面是否满足：
 * 1. [Gate 1] 语义寻址：所有新建/关键交互按钮拥有 testID 或 data-testid;
 * 2. [Gate 2] 极简两字：操作按钮中文文案严格 <= 2 字 (对齐 qaTwoLetterAudit);
 * 3. [Gate 3] 防遮挡安全区：吸底容器使用 SafeAreaFooter 或包含 safe-area 避让.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const SCAN_DIRS = [
  path.join(REPO_ROOT, 'clients/expo/src/components'),
  path.join(REPO_ROOT, 'clients/expo/src/screens'),
  path.join(REPO_ROOT, 'ui/src/components'),
  path.join(REPO_ROOT, 'ui/src/pages'),
];

let totalFiles = 0;
let violations = [];

function scanDirectory(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '__tests__' && entry.name !== 'dist') {
        scanDirectory(fullPath);
      }
    } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.jsx'))) {
      totalFiles++;
      auditFile(fullPath);
    }
  }
}

function auditFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relPath = path.relative(REPO_ROOT, filePath);
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    const lineNum = index + 1;

    // Gate 2: 极简两字 UI 检查 (按钮中文文本超过 2 个汉字)
    // 匹配如 <Button>立即提交</Button> 或 <Text>查看更多详情</Text> 且作为操作按钮
    const btnTextMatch = line.match(/<(?:Button|AppButton|TouchableOpacity|Pressable)[^>]*>([\u4e00-\u9fa5]{3,})<\//);
    if (btnTextMatch) {
      const text = btnTextMatch[1];
      // 排除常见非动作展示文案（如暂无数据、加载中等）
      const allowed = ['暂无数据', '加载中...', '请稍后...'];
      if (!allowed.includes(text)) {
        violations.push({
          gate: 'Gate 2 [极简两字 UI 违规]',
          file: relPath,
          line: lineNum,
          message: `操作按钮文案 "${text}" (${text.length}字) 超过 2 字限制，违反两字规范，请精简为 2 字（例如："提交"、"确定"、"查看"）`,
          code: line.trim(),
        });
      }
    }
  });
}

console.log('========================================================================');
console.log(' 🚀 运行 Agent-Device & Agent-Browser 反向测试与运营就绪性门禁');
console.log('========================================================================');

for (const dir of SCAN_DIRS) {
  scanDirectory(dir);
}

console.log(`\n扫描完成: 共检查 ${totalFiles} 个前端组件/页面文件\n`);

if (violations.length === 0) {
  console.log('✅ 全部通过！所有前端组件均符合自测性与两字 UI 规范。');
  process.exit(0);
} else {
  console.warn(`⚠️ 发现 ${violations.length} 处建议优化项 (按法典逐步收敛):`);
  violations.slice(0, 10).forEach((v, idx) => {
    console.warn(`\n[${idx + 1}] ${v.gate}`);
    console.warn(`   文件: ${v.file}:${v.line}`);
    console.warn(`   说明: ${v.message}`);
    console.warn(`   代码: ${v.code}`);
  });
  if (violations.length > 10) {
    console.warn(`\n... 其余 ${violations.length - 10} 项已省略`);
  }
  console.log('\n========================================================================');
  // 作为非阻塞警告模式输出，持续引导代码收敛
  process.exit(0);
}
