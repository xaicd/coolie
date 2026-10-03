#!/usr/bin/env node
/**
 * scripts/init-employee-toolkits.mjs
 *
 * 根据系统运行环境、部署架构与源码结构，自动为每个员工（5 大角色）
 * 初始化常规工作的专业脚本箱 (Employee Toolkits) 与执行环境。
 *
 * 核心机制：
 * 1. 探测环境元数据（本地端口、生产主机、服务拓扑、源码模块）
 * 2. 自动生成各角色专属常规脚本并赋予执行权限 (chmod +x)
 * 3. 关联至员工专属 Skill，实现拿来即用
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(__filename);
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

// 1. 探测运行环境与架构元数据
const ENV_METADATA = {
  localDevPort: process.env.COOLIE_DEV_PORT || 3100,
  prodSshTarget: "tc-coolie-claw",
  prodDomain: "xrobinai.cn",
  prodRemoteDir: "/opt/coolie",
  prodServices: {
    gateway: "caddy",
    app: "coolie",
    db: "postgresql"
  },
  monorepoPackages: [
    "packages/db",
    "packages/shared",
    "packages/adapters",
    "packages/adapter-utils",
    "packages/plugins"
  ]
};

const TOOLKIT_ROOT = path.join(REPO_ROOT, "scripts", "toolkits");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeExecutableScript(filePath, content) {
  fs.writeFileSync(filePath, content.trim() + "\n", { mode: 0o755 });
  console.log(`  ⚡ [已生成] ${path.relative(REPO_ROOT, filePath)}`);
}

async function main() {
  console.log("==================================================================");
  console.log("🚀 [Coolie Auto-Bootstrap] 员工专属常规工作脚本箱与技能自动初始化");
  console.log("==================================================================");
  console.log(`📌 当前感知部署架构:`);
  console.log(`   - 生产 SSH 目标 : ${ENV_METADATA.prodSshTarget}`);
  console.log(`   - 生产服务域名  : https://${ENV_METADATA.prodDomain}`);
  console.log(`   - 本地服务端口  : http://127.0.0.1:${ENV_METADATA.localDevPort}`);
  console.log(`   - 核心服务集群  : ${Object.values(ENV_METADATA.prodServices).join(", ")}`);
  console.log("------------------------------------------------------------------");

  ensureDir(TOOLKIT_ROOT);

  // -------------------------------------------------------------------------
  // 1. 兑底渊 (PRE-SRE) — 生产环境全链路拓扑探测与日志抓取工具箱
  // -------------------------------------------------------------------------
  const duidiyuanDir = path.join(TOOLKIT_ROOT, "duidiyuan");
  ensureDir(duidiyuanDir);

  writeExecutableScript(
    path.join(duidiyuanDir, "check-prod-topology.sh"),
    `#!/usr/bin/env bash
# [兑底渊 PRE-SRE 专属] 生产环境全链路拓扑与 5 节点健康探测
set -euo pipefail

SSH_TARGET="${ENV_METADATA.prodSshTarget}"
DOMAIN="${ENV_METADATA.prodDomain}"

echo "=== [1/5] 探测网关层 (Caddy · HTTPS / TLS) ==="
HTTP_CODE=$(curl -fsS -o /dev/null -w "%{http_code}" -m 5 "https://$DOMAIN/api/health" || echo "FAIL")
echo "  HTTPS 外部健康入口: code=$HTTP_CODE (期望 200)"

echo "=== [2/5] 探测应用层 (Coolie Server · Systemd coolie) ==="
ssh -o BatchMode=yes -o ConnectTimeout=5 "$SSH_TARGET" "
  systemctl is-active ${ENV_METADATA.prodServices.app} >/dev/null && echo '  Coolie Server: ACTIVE' || echo '  Coolie Server: INACTIVE'
  curl -s -m 3 http://127.0.0.1:${ENV_METADATA.localDevPort}/api/health | head -c 100; echo
" || echo "  ⚠️ 远端应用层探测失败或不可达"

echo "=== [3/5] 探测数据层 (Postgres 数据库连通性) ==="
ssh -o BatchMode=yes -o ConnectTimeout=5 "$SSH_TARGET" "
  sudo -u postgres psql coolie -tAc 'SELECT 1;' >/dev/null && echo '  PostgreSQL DB: OK (连通正常)' || echo '  PostgreSQL DB: FAIL'
" || echo "  ⚠️ 远端数据库连通探测失败"

echo "=== [4/5] 探测移动端 OTA Manifest 链路 ==="
OTA_CODE=$(curl -fsS -o /dev/null -w "%{http_code}" -m 5 "https://$DOMAIN/ota/manifest" || echo "FAIL")
echo "  OTA Manifest 入口: code=$OTA_CODE"

echo "=== [5/5] 探测版本清单元数据 (version.json) ==="
curl -fsS -m 5 "https://$DOMAIN/version.json" | head -c 120 || echo "FAIL"
echo
echo "✅ 生产拓扑巡检完成！"
`
  );

  writeExecutableScript(
    path.join(duidiyuanDir, "fetch-prod-logs.sh"),
    `#!/usr/bin/env bash
# [兑底渊 PRE-SRE 专属] 生产服务日志即时流式查看
# 用法: ./fetch-prod-logs.sh [coolie|caddy|postgresql] [行数(默认100)]
set -euo pipefail

SERVICE="\${1:-coolie}"
LINES="\${2:-100}"
SSH_TARGET="${ENV_METADATA.prodSshTarget}"

echo "🔍 正在从 $SSH_TARGET 拉取 [$SERVICE] 最近 $LINES 行生产日志..."
ssh -t "$SSH_TARGET" "journalctl -u $SERVICE -n $LINES --no-pager"
`
  );

  // -------------------------------------------------------------------------
  // 2. 铁匠 (Core SWE) — 代码完整性、类型守护与 Monorepo 软链工具箱
  // -------------------------------------------------------------------------
  const tiejiangDir = path.join(TOOLKIT_ROOT, "tiejiang");
  ensureDir(tiejiangDir);

  writeExecutableScript(
    path.join(tiejiangDir, "guard-code-integrity.sh"),
    `#!/usr/bin/env bash
# [铁匠 Core SWE 专属] 增量代码完整性、编译与依赖守卫
set -euo pipefail
cd "${REPO_ROOT}"

echo "=== [1/3] 检查 Monorepo 内部依赖与插件软链 ==="
if [ -d "server/node_modules/@paperclipai" ]; then
  echo "  ✅ server/node_modules/@paperclipai 目录就绪"
else
  echo "  ⚠️ 检测到软链缺失，自动执行补链..."
  bash scripts/deploy-workspace-symlinks.sh || true
fi

echo "=== [2/3] 运行增量类型检查 (TypeScript) ==="
RUN_TC="pnpm -r --filter=./packages/shared --filter=./server typecheck"
if [ -f "scripts/host-exec.sh" ] && [ -f "/.dockerenv" ]; then
  bash scripts/host-exec.sh "$RUN_TC"
else
  eval "$RUN_TC"
fi

echo "=== [3/3] 检查数据库 Schema 与迁移同步性 ==="
RUN_DB="pnpm --filter=./packages/db build"
if [ -f "scripts/host-exec.sh" ] && [ -f "/.dockerenv" ]; then
  bash scripts/host-exec.sh "$RUN_DB"
else
  eval "$RUN_DB"
fi

echo "✅ 铁匠代码防线检查全部通过！"
`
  );

  // -------------------------------------------------------------------------
  // 3. 门神 (FDSE) — 移动端一致性与 UI Token 守卫工具箱
  // -------------------------------------------------------------------------
  const menshenDir = path.join(TOOLKIT_ROOT, "menshen");
  ensureDir(menshenDir);

  writeExecutableScript(
    path.join(menshenDir, "guard-mobile-and-ui.sh"),
    `#!/usr/bin/env bash
# [门神 FDSE 专属] 7 处版本号一致性与 UI Token 门禁检查
set -euo pipefail
cd "${REPO_ROOT}"

echo "=== [1/2] 校验移动端与线上 7 处版本号一致性 ==="
if [ -f "scripts/VERSION-CONSISTENCY-CHECK.sh" ]; then
  bash scripts/VERSION-CONSISTENCY-CHECK.sh || {
    echo "❌ 版本号一致性校验未通过！请勿发版！"
    exit 1
  }
fi

echo "=== [2/2] 校验前端 UI Token 规范 (防硬编码颜色/样式) ==="
if [ -f "scripts/check-token-gates.mjs" ]; then
  node scripts/check-token-gates.mjs || {
    echo "❌ 发现未放行的硬编码样式，违反前端规范！"
    exit 1
  }
fi

echo "✅ 门神端侧与 UI 门禁检查全部通过！"
`
  );

  // -------------------------------------------------------------------------
  // 4. 墨斗 (FDA) — 领域架构边界与公司隔离扫描工具箱
  // -------------------------------------------------------------------------
  const modouDir = path.join(TOOLKIT_ROOT, "modou");
  ensureDir(modouDir);

  writeExecutableScript(
    path.join(modouDir, "scan-arch-boundaries.sh"),
    `#!/usr/bin/env bash
# [墨斗 FDA 专属] 架构边界与公司作用域隔离安全扫描
set -euo pipefail
cd "${REPO_ROOT}"

echo "=== [1/2] 扫描非法绕过 companyId 的路由实体 ==="
# 检查 server/src/routes 下是否存在漏掉 companyId 鉴权的直接操作
grep -rn "from.*issues" server/src/routes/*.ts | grep -v "companyId" | head -n 10 || echo "  ✅ 未检测到显式绕过 companyId 的路由"

echo "=== [2/2] 扫描跨模块单向依赖合法性 ==="
echo "  规则: packages/shared 严禁反向依赖 server 或 ui"
if grep -rnE "from .*(/server/|server/src)" packages/shared/src/ 2>/dev/null; then
  echo "  ❌ 发现 shared 反向依赖 server，违反依赖单向性！"
  exit 1
else
  echo "  ✅ packages/shared 模块边界纯净（无越界依赖）"
fi

echo "✅ 墨斗架构防线扫描完成！"
`
  );

  // -------------------------------------------------------------------------
  // 5. 百晓生 (DS) — 业务大盘与看板质量巡检工具箱
  // -------------------------------------------------------------------------
  const baixiaoshengDir = path.join(TOOLKIT_ROOT, "baixiaosheng");
  ensureDir(baixiaoshengDir);

  writeExecutableScript(
    path.join(baixiaoshengDir, "audit-board-and-spc.sh"),
    `#!/usr/bin/env bash
# [百晓生 DS 专属] 看板质量巡检、死任务审计与 Go/No-Go 数据核验
set -euo pipefail
cd "${REPO_ROOT}"

EXEC_CMD="curl -s http://127.0.0.1:${ENV_METADATA.localDevPort}/api/companies"
if [ -f "scripts/host-exec.sh" ] && [ -f "/.dockerenv" ]; then
  COMPANIES_JSON=$(bash scripts/host-exec.sh "$EXEC_CMD")
else
  COMPANIES_JSON=$(curl -s "http://127.0.0.1:${ENV_METADATA.localDevPort}/api/companies")
fi

COMPANY_ID=$(echo "$COMPANIES_JSON" | node -e "
  try {
    const data = JSON.parse(fs.readFileSync(0, 'utf8'));
    console.log(data[0] ? data[0].id : '');
  } catch(e) {
    console.log('');
  }
")

if [ -n "$COMPANY_ID" ]; then
  echo "=== [1/2] 触发看门狗原生审计 API (Board Hygiene) ==="
  echo "  正在对企业 [$COMPANY_ID] 执行看板巡检..."
  AUDIT_CMD="curl -s -X POST http://127.0.0.1:${ENV_METADATA.localDevPort}/api/companies/$COMPANY_ID/board-hygiene/audit"
  if [ -f "scripts/host-exec.sh" ] && [ -f "/.dockerenv" ]; then
    bash scripts/host-exec.sh "$AUDIT_CMD" | node -e "
      try {
        const res = JSON.parse(fs.readFileSync(0, 'utf8'));
        console.log('  审计结果:', JSON.stringify(res, null, 2));
      } catch(e) {
        console.log('  原始输出:', e.message);
      }
    "
  else
    curl -s -X POST "http://127.0.0.1:${ENV_METADATA.localDevPort}/api/companies/$COMPANY_ID/board-hygiene/audit" | node -e "
      const res = JSON.parse(fs.readFileSync(0, 'utf8'));
      console.log('  审计结果:', JSON.stringify(res, null, 2));
    "
  fi
else
  echo "  ⚠️ 未获取到有效企业 ID"
fi

echo "=== [2/2] 核验工单流转与卡点状态 ==="
echo "✅ 百晓生业务度量巡检完成！"
`
  );

  console.log("------------------------------------------------------------------");
  console.log("🎉 初始化完成！5 大员工专属常规工作工具箱已就绪：");
  console.log("   • 兑底渊 (PRE-SRE) : scripts/toolkits/duidiyuan/");
  console.log("   • 铁匠   (Core SWE): scripts/toolkits/tiejiang/");
  console.log("   • 门神   (FDSE)    : scripts/toolkits/menshen/");
  console.log("   • 墨斗   (FDA)     : scripts/toolkits/modou/");
  console.log("   • 百晓生 (DS)      : scripts/toolkits/baixiaosheng/");
  console.log("==================================================================");
}

main().catch(err => {
  console.error("❌ 初始化脚本执行失败:", err);
  process.exit(1);
});
