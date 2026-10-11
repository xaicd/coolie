#!/usr/bin/env node
/**
 * scripts/install-git-hooks.mjs
 *
 * 自动化安装 Git Hooks 守卫
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const GIT_HOOKS_DIR = path.join(REPO_ROOT, '.git', 'hooks');
const PRE_COMMIT_HOOK = path.join(GIT_HOOKS_DIR, 'pre-commit');

if (!fs.existsSync(GIT_HOOKS_DIR)) {
  console.log('⚠️  .git/hooks 目录不存在，跳过安装。');
  process.exit(0);
}

const HOOK_CONTENT = `#!/bin/sh
# Coolie 平台级 Pre-Commit 提交前自动化校验守卫
node scripts/pre-commit-check.mjs
`;

fs.writeFileSync(PRE_COMMIT_HOOK, HOOK_CONTENT, { mode: 0o755 });
console.log('✅ [SUCCESS] Git pre-commit hook 已成功安装至 .git/hooks/pre-commit 并配置执行权限！');
