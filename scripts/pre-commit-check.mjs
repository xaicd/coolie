#!/usr/bin/env node
/**
 * scripts/pre-commit-check.mjs
 *
 * 平台级 Pre-Commit 提交前自动化校验与安全守卫 (Pre-Commit Guard)
 * 原则: 任何破坏仓库边界、类型系统、敏感凭据或架构公理的代码，在提交第一秒硬性拦截。
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
process.chdir(REPO_ROOT);

console.log('========================================================================');
console.log('🛡️  Coolie 提交前综合质量与安全守卫 (Pre-Commit Verification Guard)');
console.log('   原则: 制度由编译器与自动化守卫全面管局，杜绝口头规范与带病提交');
console.log('========================================================================\n');

const isContainer = process.platform === 'linux' && fs.existsSync('/usr/local/bin/host-exec');
function runPlatformCmd(cmd, options = {}) {
  const finalCmd = isContainer
    ? `host-exec "cd /Users/mac/workspace/xaicd/coolie && ${cmd.replace(/"/g, '\\"')}"`
    : cmd;
  return execSync(finalCmd, { stdio: 'inherit', ...options });
}

let hasError = false;

// -----------------------------------------------------------------------------
// 0. 获取当前 Git 暂存区文件列表 (Staged Files)
// -----------------------------------------------------------------------------
let stagedFiles = [];
try {
  const stdout = execSync('git diff --cached --name-only', { encoding: 'utf8' }).trim();
  stagedFiles = stdout ? stdout.split('\n').map((f) => f.trim()).filter(Boolean) : [];
} catch (e) {
  console.warn('⚠️  [WARN] 无法获取 git 暂存区文件，可能不在 git 仓库中，将执行通用基线检查。');
}

console.log(`📦 当前检测到 ${stagedFiles.length} 个暂存文件 (Staged Files)`);

// -----------------------------------------------------------------------------
// 1. 仓库生态位边界与标准骨架白名单守卫 (Platform Repo Skeleton Whitelist Guard)
// -----------------------------------------------------------------------------
console.log('\n🏛️  Gate 1: 仓库边界与目录洁净度守卫');

// 1.0 根目录骨架与顶级目录白名单硬拦截 (杜绝乱新增目录与散落文件)
const ALLOWED_ROOT_DIRS = new Set([
  'server',
  'ui',
  'packages',
  'cli',
  'skills',
  'doc',
  'docs-coolie',
  'clients',
  'scripts',
  'wiki',
  'openwiki',
  'specs',
  'evals',
  'tests',
  'templates',
  'patches',
  'docker',
  'design',
  'releases',
  'announcements',
  '.agents',
  '.github',
  '.kiro',
  '.specify',
]);

const ALLOWED_ROOT_FILES = new Set([
  'AGENTS.md',
  'CONTRIBUTING.md',
  'COOLIE-LOCAL-DEV.md',
  'DESIGN.md',
  'Dockerfile',
  'LICENSE',
  'README.md',
  'ROADMAP.md',
  'SECURITY.md',
  'TERMINOLOGY.md',
  'ecosystem.config.cjs',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'tsconfig.json',
  'version.json',
  'vitest.config.ts',
  '.cursorrules',
  '.gitignore',
  '.gitattributes',
  '.npmrc',
  '.prettierrc',
  '.editorconfig',
]);

const illegalRootItems = [];
for (const file of stagedFiles) {
  const parts = file.split('/');
  if (parts.length === 1) {
    if (!ALLOWED_ROOT_FILES.has(parts[0])) {
      illegalRootItems.push(`根目录未授权文件: ${parts[0]}`);
    }
  } else {
    const topDir = parts[0];
    if (!ALLOWED_ROOT_DIRS.has(topDir)) {
      illegalRootItems.push(`未授权顶级目录: ${topDir}/`);
    }
  }
}

if (illegalRootItems.length > 0) {
  console.error('  ❌ [FAIL] 检测到未授权的新增根目录或散落文件，严重破坏标准骨架规范！');
  console.error(`     ↳ 违规项: ${Array.from(new Set(illegalRootItems)).join(', ')}`);
  console.error('     ↳ 骨架铁律: 平台已具备完整标准骨架，严禁在根目录随意新建非白名单目录或乱堆临时文件！');
  console.error("     ↳ 解除方案: 执行 'git reset HEAD <违规路径>'，规范归档后重新提交。");
  hasError = true;
} else {
  console.log('  ✅ [PASS] 根目录骨架与顶级目录 100% 符合白名单规范');
}

// 1.1 严禁将商业交付项目提交至 platform control plane 根目录 (公理五)
const invalidProjectFiles = stagedFiles.filter((f) => f.startsWith('projects/'));
if (invalidProjectFiles.length > 0) {
  console.error('  ❌ [FAIL] 严禁将商业交付项目提交至 Coolie 平台控制面根目录！');
  console.error(`     ↳ 违规文件: ${invalidProjectFiles.slice(0, 5).join(', ')}${invalidProjectFiles.length > 5 ? ' 等' : ''}`);
  console.error('     ↳ 架构准则: 根据公理一与公理五，客户商业项目必须放置于独立平级仓库 (/host-workspace/xaicd/<project>)。');
  console.error("     ↳ 解除方案: 执行 'git reset HEAD projects/' 撤出暂存。");
  hasError = true;
} else {
  console.log('  ✅ [PASS] 仓库根目录边界合规，无非法 projects/ 混入');
}

// 1.2 严禁将历史构建缓存与截胡产物暂存提交 (server/ui-dist/)
const invalidUiDistFiles = stagedFiles.filter((f) => f.startsWith('server/ui-dist/'));
if (invalidUiDistFiles.length > 0) {
  console.error('  ❌ [FAIL] 严禁提交 server/ui-dist/ 临时打包产物！该目录会导致静态资源被死缓存截胡！');
  console.error("     ↳ 解除方案: 执行 'git reset HEAD server/ui-dist/' 并彻底删除该目录。");
  hasError = true;
} else {
  console.log('  ✅ [PASS] 无 server/ui-dist 缓存截胡产物');
}

// 1.3 敏感凭据、私钥与环境配置防泄露守卫
const SENSITIVE_PATTERNS = [
  /^\.env(\.(local|production|test|staging))?$/i,
  /\.(pem|key|pfx|p12|pkcs12)$/i,
  /id_rsa/i,
  /id_ed25519/i,
  /.*credentials.*\.json$/i,
];
const sensitiveFiles = stagedFiles.filter((f) => {
  const basename = path.basename(f);
  if (basename.endsWith('.example') || basename.endsWith('.sample')) return false;
  return SENSITIVE_PATTERNS.some((pat) => pat.test(basename));
});
if (sensitiveFiles.length > 0) {
  console.error('  ❌ [FAIL] 检测到疑似敏感凭据/私钥文件，阻断提交！');
  console.error(`     ↳ 敏感文件: ${sensitiveFiles.join(', ')}`);
  console.error("     ↳ 解除方案: 请将敏感文件移入 .gitignore 并执行 'git reset HEAD <file>'。");
  hasError = true;
} else {
  console.log('  ✅ [PASS] 无敏感凭据与私钥文件暂存');
}

// 1.4 大文件防误提守卫 (> 5MB)
const LARGE_FILE_LIMIT = 5 * 1024 * 1024; // 5MB
const oversizedFiles = [];
for (const f of stagedFiles) {
  try {
    if (fs.existsSync(f)) {
      const stats = fs.statSync(f);
      if (stats.size > LARGE_FILE_LIMIT) {
        oversizedFiles.push(`${f} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      }
    }
  } catch {}
}
if (oversizedFiles.length > 0) {
  console.error('  ❌ [FAIL] 检测到超过 5MB 的大文件暂存，阻断提交！');
  console.error(`     ↳ 超限文件: ${oversizedFiles.join(', ')}`);
  console.error("     ↳ 解除方案: 二进制大文件请使用 LFS 或外部存储，勿直接提交入 Git。");
  hasError = true;
} else {
  console.log('  ✅ [PASS] 无超限大文件暂存');
}

// -----------------------------------------------------------------------------
// 2. 禁用标记与敏感 Token 守卫
// -----------------------------------------------------------------------------
console.log('\n🔍 Gate 2: 禁用标记与敏感 Token 守卫');
try {
  execSync('node scripts/check-forbidden-tokens.mjs', { stdio: 'inherit' });
  console.log('  ✅ [PASS] 禁用 Token 扫描通过');
} catch {
  console.error('  ❌ [FAIL] check-forbidden-tokens 校验失败！');
  hasError = true;
}

// -----------------------------------------------------------------------------
// 3. 架构模块单向依赖方向守卫
// -----------------------------------------------------------------------------
console.log('\n🧭 Gate 3: 架构模块单向依赖方向守卫');
try {
  execSync('node scripts/check-module-boundaries.mjs', { stdio: 'inherit' });
  console.log('  ✅ [PASS] 模块单向依赖边界通过');
} catch {
  console.error('  ❌ [FAIL] check-module-boundaries 依赖方向违规！');
  hasError = true;
}

// -----------------------------------------------------------------------------
// 4. 全生命周期管局硬门禁
// -----------------------------------------------------------------------------
console.log('\n🏛️  Gate 4: 全生命周期管局硬门禁');
try {
  execSync('node scripts/check-governance-audit.mjs', { stdio: 'inherit' });
  console.log('  ✅ [PASS] 管局审计守卫通过');
} catch {
  console.error('  ❌ [FAIL] check-governance-audit 审计未完全通过！');
  hasError = true;
}

// -----------------------------------------------------------------------------
// 5. 暂存受影响包增量类型检查 (Incremental Package Typecheck Guard)
// -----------------------------------------------------------------------------
console.log('\n🧩 Gate 5: 暂存受影响包增量类型检查');
const PACKAGE_MAP = [
  { prefix: 'packages/db/', filter: '@paperclipai/db' },
  { prefix: 'packages/shared/', filter: '@paperclipai/shared' },
  { prefix: 'packages/plugins/plugin-ontology/', filter: '@paperclipai/plugin-ontology' },
  { prefix: 'packages/plugins/sdk/', filter: '@paperclipai/plugin-sdk' },
  { prefix: 'server/', filter: '@paperclipai/server' },
  { prefix: 'ui/', filter: '@paperclipai/ui' },
  { prefix: 'cli/', filter: '@paperclipai/cli' },
];

const affectedFilters = new Set();
for (const f of stagedFiles) {
  if (/\.(ts|tsx)$/.test(f)) {
    for (const item of PACKAGE_MAP) {
      if (f.startsWith(item.prefix)) {
        affectedFilters.add(item.filter);
        break;
      }
    }
  }
}

if (affectedFilters.size > 0) {
  console.log(`  🔎 受影响包增量编译: ${Array.from(affectedFilters).join(', ')}`);
  for (const filter of affectedFilters) {
    try {
      console.log(`  ⏳ 检查 ${filter} 类型完整性...`);
      runPlatformCmd(`pnpm --filter ${filter} typecheck`);
      console.log(`  ✅ [PASS] ${filter} 类型检查通过`);
    } catch {
      console.error(`  ❌ [FAIL] ${filter} 存在 TypeScript 类型报错，严禁带病提交！`);
      hasError = true;
    }
  }
} else {
  console.log('  ✅ [PASS] 暂存文件未修改核心 TS/TSX 代码包，跳过增量编译');
}

// -----------------------------------------------------------------------------
// 终验判定
// -----------------------------------------------------------------------------
console.log('\n========================================================================');
if (hasError) {
  console.error('❌ [REJECTED] Pre-Commit 检查未通过！已成功拦截问题提交。');
  console.error('   请修复上方所有标记 ❌ 的错误项后重新提交。');
  console.log('========================================================================\n');
  process.exit(1);
} else {
  console.log('🎉 [APPROVED] Pre-Commit 检查全绿通过！允许提交入库。');
  console.log('========================================================================\n');
  process.exit(0);
}
