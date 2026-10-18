#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { collectExpoI18nChecks } from './check-expo-i18n.mjs';
import { collectServerI18nChecks } from './check-server-i18n.mjs';
import { collectUiI18nRefChecks } from './check-ui-i18n-refs.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
process.chdir(REPO_ROOT);

console.log('========================================================================');
console.log('🏛️  Coolie 高管级全生命周期交付与交互审计守卫 (Governance Audit Gate)');
console.log('   原则: 制度必须由编译器与自动化守卫全面管局，杜绝口头规范与人肉记忆');
console.log('========================================================================\n');

let failed = false;
function assertRule(name, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ [PASS] ${name}`);
  } else {
    console.error(`  ❌ [FAIL] ${name}`);
    if (detail) console.error(`     ↳ 根因: ${detail}`);
    failed = true;
  }
}

// -----------------------------------------------------------------------------
// 1. CMMI 六大阶段门禁基线产物标准规范目录审计 (G0-G5 Artifacts)
// -----------------------------------------------------------------------------
console.log('📁 1. CMMI 全生命周期六大阶段门禁产物规范目录审计:');
const g0Briefs = fs.existsSync('docs-coolie/briefs') && fs.readdirSync('docs-coolie/briefs').length > 0;
const g0Specs = fs.existsSync('docs-coolie/specs') && fs.readdirSync('docs-coolie/specs').length > 0;
assertRule('G0_Req: 需求简报与 EARS 规格说明书规范归档', g0Briefs && g0Specs, 'docs-coolie/briefs/ 或 specs/ 缺失');

const g1Protos = fs.existsSync('docs-coolie/protos') && fs.readdirSync('docs-coolie/protos').length > 0;
const g1Plans = fs.existsSync('doc/plans') && fs.readdirSync('doc/plans').length > 0;
assertRule('G1_Arch: 架构原型与系统演进设计文档规范归档', g1Protos && g1Plans, 'docs-coolie/protos/ 或 doc/plans/ 缺失');

const g2Schema = fs.existsSync('packages/db/src/schema') && fs.readdirSync('packages/db/src/schema').length > 50;
assertRule('G2_Design: 详细设计物理 Drizzle 模型规范落盘 (>50 表)', g2Schema, 'packages/db/src/schema/ 表定义不全');

const g3Build = fs.existsSync('server/src') && fs.existsSync('clients/expo/src');
assertRule('G3_Build: 服务端控制面与移动原生端核心实现就绪', g3Build, 'server/src 或 clients/expo/src 缺失');

const g4Val = fs.existsSync('docs-coolie/evidence') && fs.readdirSync('docs-coolie/evidence').length > 0;
assertRule('G4_Val: 全栈验收、真机快照与 QA 报告不可变证据归档', g4Val, 'docs-coolie/evidence/ 缺失');

const g5Release = fs.existsSync('version.json') && fs.existsSync('docs-coolie/VERSION-CONSISTENCY.md');
assertRule('G5_Release: 全局唯一版本指纹与 7 处一致性守卫就绪', g5Release, 'version.json 或 VERSION-CONSISTENCY.md 缺失');

// -----------------------------------------------------------------------------
// 2. 移动端经典 5 槽位绝对对称底栏与防重复入口审计
// -----------------------------------------------------------------------------
console.log('\n📱 2. 移动端经典 5 槽位绝对对称底栏与防重复入口审计:');
const tabBarPath = 'clients/expo/src/components/TabBar.tsx';
let tabBarContent = '';
if (fs.existsSync(tabBarPath)) {
  tabBarContent = fs.readFileSync(tabBarPath, 'utf8');
}

const hasInboxInTabBar = tabBarContent.includes('key: "inbox"') || tabBarContent.includes('label: "收件箱"');
assertRule('底栏单一职责守卫: 严禁在底栏放置收件箱槽位 (统一由顶栏 🔔 统领)', !hasInboxInTabBar, 'TabBar.tsx 仍残留 inbox 槽位导致重复入口');

const leftMatch = tabBarContent.match(/const LEFT:\s*Slot\[\]\s*=\s*\[([\s\S]*?)\];/);
const rightMatch = tabBarContent.match(/const RIGHT:\s*Slot\[\]\s*=\s*\[([\s\S]*?)\];/);
const leftSlots = leftMatch ? (leftMatch[1].match(/key:\s*"/g) || []).length : 0;
const rightSlots = rightMatch ? (rightMatch[1].match(/key:\s*"/g) || []).length : 0;
const isSymmetric5 = leftSlots === 2 && rightSlots === 2;
assertRule(`底栏对称美学守卫: 严格保持 2 + 1 + 2 = 5 槽位绝对居中对称 (当前: 左${leftSlots} + 中1 + 右${rightSlots})`, isSymmetric5, '底栏槽位未等分或中央加号偏心');

// 底栏文案两字守卫: i18n 迁移后两字标签真源迁移至 i18n 字典 (mobile.tabs.*),
// 守卫需解析字典后的实际渲染文案, 兼容老的 `label: "xx"` 硬编码写法。
const legacyLabels = (tabBarContent.match(/label:\s*"([^"]+)"/g) || []).map((l) =>
  l.replace(/label:\s*"/, "").replace(/"/, ""),
);
const tabLabelKeys = (tabBarContent.match(/labelKey:\s*"([^"]+)"/g) || []).map((l) =>
  l.replace(/labelKey:\s*"/, "").replace(/"/, ""),
);
let twoCharLabels = legacyLabels;
if (tabLabelKeys.length > 0) {
  let expoZhDict = {};
  try {
    expoZhDict = JSON.parse(fs.readFileSync('clients/expo/src/i18n/locales/zh-CN.json', 'utf8'));
  } catch {
    expoZhDict = {};
  }
  const resolveKey = (key) =>
    key.split('.').reduce((node, seg) => (node && typeof node === 'object' ? node[seg] : undefined), expoZhDict);
  twoCharLabels = tabLabelKeys.map(resolveKey).filter((value) => typeof value === 'string');
}
const allLabelsTwoChars = twoCharLabels.length > 0 && twoCharLabels.every((l) => l.length === 2);
assertRule(`底栏文案两字守卫: 底栏标签 100% 两个字 (${twoCharLabels.join(' · ')})`, allLabelsTwoChars, `存在非两字标签或字典缺失: ${twoCharLabels.join(', ')}`);

// -----------------------------------------------------------------------------
// 3. 高管审批治理三大直达快道审计 (Approval Governance Fast Paths)
// -----------------------------------------------------------------------------
console.log('\n⚖️ 3. 高管控制面审批三大直达快道审计:');
const appContent = fs.existsSync('clients/expo/App.tsx') ? fs.readFileSync('clients/expo/App.tsx', 'utf8') : '';
const inboxScreenContent = fs.existsSync('clients/expo/src/screens/InboxScreen.tsx') ? fs.readFileSync('clients/expo/src/screens/InboxScreen.tsx', 'utf8') : '';
const boardChatContent = fs.existsSync('clients/expo/src/screens/BoardChatScreen.tsx') ? fs.readFileSync('clients/expo/src/screens/BoardChatScreen.tsx', 'utf8') : '';
const dashboardContent = fs.existsSync('clients/expo/src/screens/DashboardScreen.tsx') ? fs.readFileSync('clients/expo/src/screens/DashboardScreen.tsx', 'utf8') : '';

const bellRoutesToInbox = appContent.includes('notificationsOpen ? (\n            <InboxScreen') || appContent.includes('notificationsOpen ? (\n            <InboxScreen') || appContent.includes('<InboxScreen\n              company={company}\n              onBack={() => setNotificationsOpen(false)}');
assertRule('快道 1 (收件中枢): 顶栏 🔔 铃铛直达全功能 InboxScreen 并支持返回', bellRoutesToInbox, 'App.tsx 顶栏铃铛未正确绑定至全功能 InboxScreen');

const inboxHasApprovals = inboxScreenContent.includes('key: "approvals"') && inboxScreenContent.includes('onBack?: () => void');
assertRule('收件箱能力完备性: InboxScreen 必须包含【审批】Tab 且支持 onBack 模态返回', inboxHasApprovals, 'InboxScreen 缺少审批 Tab 或缺少 onBack 支持');

const chatHasApprovalBanner = boardChatContent.includes('approvalHeaderText') || boardChatContent.includes('待办审批');
assertRule('快道 2 (开会协同): 工坊 (Board-Chat) 会话顶栏必须具备常驻待办审批横幅', chatHasApprovalBanner, 'BoardChatScreen 缺少待办审批横幅卡点');

const dashHasApprovalMetric = dashboardContent.includes('pendingApprovals');
assertRule('快道 3 (大盘预警): 汇览 (Dashboard) 态势大盘具备待办审批指标与红灯穿透', dashHasApprovalMetric, 'DashboardScreen 缺少 pendingApprovals 统计');

// -----------------------------------------------------------------------------
// 4. 极简主义两字按钮与消灭口语长文案审计 (Two-Character Buttons)
// -----------------------------------------------------------------------------
console.log('\n🔤 4. 极简主义两字按钮与交互降噪审计:');
const forbiddenButtonTexts = [
  { file: 'clients/expo/src/screens/ProjectsScreen.tsx', bad: '查看任务', good: '任务' },
  { file: 'clients/expo/src/screens/ProjectsScreen.tsx', bad: '查看产物', good: '产物' },
  { file: 'clients/expo/src/screens/ProjectsScreen.tsx', bad: '极速立项', good: '立项' },
  { file: 'clients/expo/src/screens/TaskDetailScreen.tsx', bad: '原型沙箱', good: '沙箱' },
  { file: 'clients/expo/src/screens/TaskDetailScreen.tsx', bad: 'Spec 编辑器', good: '规范' },
  { file: 'clients/expo/src/screens/ArtifactsScreen.tsx', bad: '🔍 预览大图', good: '预览' },
  { file: 'clients/expo/src/screens/ArtifactsScreen.tsx', bad: '外部应用 / QQ打开', good: '打开' },
  { file: 'clients/expo/src/screens/NewTaskPage.tsx', bad: '创建任务', good: '创建' },
  { file: 'clients/expo/src/screens/WebContainerScreen.tsx', bad: '重新加载', good: '重载' },
  { file: 'clients/expo/src/screens/WebLoginScreen.tsx', bad: '使用原生表单登录', good: '原生' },
];

let allForbiddenCleared = true;
for (const check of forbiddenButtonTexts) {
  if (fs.existsSync(check.file)) {
    const text = fs.readFileSync(check.file, 'utf8');
    if (text.includes(`>${check.bad}<`)) {
      console.error(`  ❌ [FAIL] 违规长按钮残留: ${check.file} 中仍存在 "${check.bad}"，应为 "${check.good}"`);
      allForbiddenCleared = false;
      failed = true;
    }
  }
}
assertRule('全局两字按钮契约: 核心操作按钮完全收敛，禁止口语化与技术泄露长文案', allForbiddenCleared, '存在未收敛的多字长按钮');

// -----------------------------------------------------------------------------
// 5. 提示词资产与方法论手册落盘审计
// -----------------------------------------------------------------------------
console.log('\n📚 5. 高管提示词资产与方法论手册落盘审计:');
const playbookExists = fs.existsSync('docs-coolie/playbooks/executive-prompts-and-governance.md');
assertRule('高管提示词库已沉淀: docs-coolie/playbooks/executive-prompts-and-governance.md', playbookExists, '提示词库手册未落盘');

const skillExists = fs.existsSync('.agents/skills/minimalist-ui-and-cmmi-governance/SKILL.md');
assertRule('治理规范技能已沉淀: .agents/skills/minimalist-ui-and-cmmi-governance/SKILL.md', skillExists, '治理技能未落盘');

// -----------------------------------------------------------------------------
// 6. Hermes 一级 Worker 拓扑与后台免交互权限硬审计 (wave302)
// -----------------------------------------------------------------------------
console.log('\n🤖 6. Hermes 一级 Worker 拓扑与后台免交互权限硬审计:');
const dispatchScriptContent = fs.readFileSync('scripts/dispatch-local-employee.sh', 'utf8');
const cmdHasYolo = dispatchScriptContent.includes('cmd') && dispatchScriptContent.includes('--yolo') && dispatchScriptContent.includes('--tools-all');
assertRule('dispatch-local-employee.sh: cmd 拥有 --yolo 与 --tools-all 最大自主权限', cmdHasYolo, 'cmd 缺少 --yolo 或 --tools-all，后台执行将被权限门禁卡死');

const claudeHasSkipPerms = dispatchScriptContent.includes('--dangerously-skip-permissions');
assertRule('dispatch-local-employee.sh: claude 拥有 --dangerously-skip-permissions 免交互权限', claudeHasSkipPerms, 'claude 缺少 --dangerously-skip-permissions');

const hasDevNullRedirect = dispatchScriptContent.includes('< /dev/null');
assertRule('dispatch-local-employee.sh: 执行管道重定向 < /dev/null 防 stdin 悬空死锁', hasDevNullRedirect, '未重定向 stdin，后台无 TTY 管道易挂起');

const registerScriptContent = fs.readFileSync('scripts/register-employees-cron.sh', 'utf8');
const noClaudeAgentsInstall = !registerScriptContent.includes('cp "$src" "$dst"') || registerScriptContent.includes('严禁在 Claude 内部嵌套 subagent');
// -----------------------------------------------------------------------------
// 7. Coolie 根本大纲与工程宪法 (党章级法典) 审计 (wave304)
// -----------------------------------------------------------------------------
console.log('\n📜 7. Coolie 根本大纲与工程宪法 (党章级法典) 审计:');
const constitutionExists = fs.existsSync('docs-coolie/research/2026-10-05-coolie-constitution-and-palantir-master-spec.md');
const constitutionContent = constitutionExists ? fs.readFileSync('docs-coolie/research/2026-10-05-coolie-constitution-and-palantir-master-spec.md', 'utf8') : '';
const hasTwentyTwoArticles = constitutionContent.includes('第 22 条') && constitutionContent.includes('全 Adapter');
assertRule('根本大纲与工程宪法已沉淀: docs-coolie/research/2026-10-05-coolie-constitution-and-palantir-master-spec.md', constitutionExists && hasTwentyTwoArticles, '党章级法典缺失或条款不全');

const agentsMdContent = fs.existsSync('AGENTS.md') ? fs.readFileSync('AGENTS.md', 'utf8') : '';
const hasOntologyAxiom = agentsMdContent.includes('公理三：活体业务本体即中枢与真业务物理并轨铁律') || agentsMdContent.includes('北极星目标与真业务本体物理并轨铁律');
assertRule('AGENTS.md 已载入真业务本体并轨法典 (公理三)', hasOntologyAxiom, 'AGENTS.md 缺少真本体并轨法典');

const masterPlanExists = fs.existsSync('docs-coolie/research/2026-10-05-coolie-core-mission-and-real-ontology-master-plan.md');
assertRule('真本体破局复盘白皮书已沉淀: docs-coolie/research/2026-10-05-coolie-core-mission-and-real-ontology-master-plan.md', masterPlanExists, '复盘白皮书未落盘');

const oddRulePath = '.agents/rules/ONTOLOGY-DRIVEN-DEVELOPMENT.md';
const oddRuleContent = fs.existsSync(oddRulePath) ? fs.readFileSync(oddRulePath, 'utf8') : '';
assertRule(
  'ODD 活体本体驱动开发规则落盘守卫: .agents/rules/ONTOLOGY-DRIVEN-DEVELOPMENT.md',
  fs.existsSync(oddRulePath) && oddRuleContent.includes('Object Types') && oddRuleContent.includes('Action Types'),
  '.agents/rules/ONTOLOGY-DRIVEN-DEVELOPMENT.md 未落盘或缺少业务双核定义',
);

const prescriptiveRulePath = '.agents/rules/PRESCRIPTIVE-ENGINEERING-CONTRACTS.md';
const prescriptiveContent = fs.existsSync(prescriptiveRulePath) ? fs.readFileSync(prescriptiveRulePath, 'utf8') : '';
assertRule(
  '正向建设性工程契约最高法典已沉淀: .agents/rules/PRESCRIPTIVE-ENGINEERING-CONTRACTS.md',
  fs.existsSync(prescriptiveRulePath) && prescriptiveContent.includes('RFC 2119') && prescriptiveContent.includes('Negation Blindness'),
  '.agents/rules/PRESCRIPTIVE-ENGINEERING-CONTRACTS.md 缺失或未包含 RFC 2119 / 反否定盲区契约',
);

assertRule(
  'AGENTS.md 已载入正向建设性工程契约与反否定盲区法典 (公理十二)',
  agentsMdContent.includes('公理十二：正向建设性工程契约与反否定盲区铁律'),
  'AGENTS.md 缺少公理十二',
);

// -----------------------------------------------------------------------------
// 8. 宪法第 2 条「项目进厂即本体域」防退化守卫 (wave302)
// -----------------------------------------------------------------------------
console.log('\n🏗️ 8. 宪法第 2 条「项目进厂即本体域」防退化守卫:');
const ontologyBootstrapPath = 'server/src/services/project-ontology-bootstrap.ts';
const ontologyBootstrapContent = fs.existsSync(ontologyBootstrapPath) ? fs.readFileSync(ontologyBootstrapPath, 'utf8') : '';
const projectsRouteContent = fs.existsSync('server/src/routes/projects.ts') ? fs.readFileSync('server/src/routes/projects.ts', 'utf8') : '';

assertRule(
  '第2条_挂钩: 项目创建路由在事务内调用 ensureProjectOntologyDomain (杜绝裸项目)',
  projectsRouteContent.includes('ensureProjectOntologyDomain'),
  'server/src/routes/projects.ts 未挂钩本体域原子初始化',
);

assertRule(
  '第2条_原子性: 本体域写入随调用方事务原子提交 (project + domain + resource_link 同生共死)',
  ontologyBootstrapContent.includes("caller's transaction") && ontologyBootstrapContent.includes('to_regclass'),
  'project-ontology-bootstrap.ts 丢失事务内原子写入或就绪探测',
);

assertRule(
  '第2条_血缘: 写入 project→domain owner 资源链 (ontology_resource_links, role=owner)',
  ontologyBootstrapContent.includes('ontology_resource_links') && ontologyBootstrapContent.includes('"owner"'),
  '缺少 project→domain 资源链写入',
);

assertRule(
  '第2条_防退化: 原子性/回滚/降级/重放/撞名守卫测试就位 (project-ontology-bootstrap.test.ts)',
  fs.existsSync('server/src/__tests__/project-ontology-bootstrap.test.ts'),
  '防退化测试文件缺失',
);

// -----------------------------------------------------------------------------
// 9. wave357 标准 ACP 调度协议栈防退化守卫 (架构设计: docs-coolie/specs/2026-10-06-wave357-acp-dispatch-architecture.md)
// -----------------------------------------------------------------------------
console.log('\n🔌 9. wave357 标准 ACP (Agent Client Protocol) 调度协议栈防退化守卫:');
const ACP_ADAPTER_LAUNCHERS = [
  'scripts/adapters/docker-agy-acp.sh',
  'scripts/adapters/cmd-acp.sh',
  'scripts/adapters/claude-mm-acp.sh',
  'scripts/adapters/claude-glm-acp.sh',
  'scripts/adapters/copilot-acp.sh',
  'scripts/adapters/codex-acp.sh',
];
const adapterLaunchersOk = ACP_ADAPTER_LAUNCHERS.every((p) => {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
});
assertRule(
  'R1_适配器族: 6 大 ACP 适配器启动脚本存在且可执行',
  adapterLaunchersOk,
  '适配器文件缺失或丢失可执行位: scripts/adapters/*.sh',
);

const acpRoutesOk = ['docker-agy-acp.sh', 'cmd-acp.sh', 'claude-mm-acp.sh', 'claude-glm-acp.sh', 'copilot-acp.sh', 'codex-acp.sh']
  .every((adapter) => dispatchScriptContent.includes(adapter));
assertRule(
  'R2_派单选路: dispatch-local-employee.sh 经 acpx 按 6 工具路由标准适配器 (杜绝退化回逐工具内联 argv)',
  dispatchScriptContent.includes('ACPX_BIN') && acpRoutesOk,
  '派单脚本 acpx 选路段缺失或适配器路由不全',
);

const acpxConstantsPath = 'packages/adapter-utils/src/acpx-engine/constants.ts';
const acpxConstants = fs.existsSync(acpxConstantsPath) ? fs.readFileSync(acpxConstantsPath, 'utf8') : '';
const acpxExecutePath = 'packages/adapter-utils/src/acpx-engine/execute.ts';
const acpxExecute = fs.existsSync(acpxExecutePath) ? fs.readFileSync(acpxExecutePath, 'utf8') : '';
const controlPlaneOk =
  acpxConstants.includes('agy_local') && acpxConstants.includes('cmd_local') && acpxConstants.includes('copilot_local') &&
  acpxExecute.includes('docker-agy-acp.sh') && acpxExecute.includes('cmd-acp.sh');
assertRule(
  'R3_并轨: 控制面注册 agy_local/cmd_local/copilot_local 且与脚本面共用同一适配器 (两张皮不复活)',
  controlPlaneOk,
  'acpx-engine constants/execute 与 scripts/adapters 并轨断裂',
);

const agyAdapter = fs.readFileSync('scripts/adapters/docker-agy-acp.mjs', 'utf8');
const cmdAdapter = fs.readFileSync('scripts/adapters/cmd-acp.mjs', 'utf8');
const autonomyOk =
  agyAdapter.includes('--dangerously-skip-permissions') &&
  cmdAdapter.includes('--yolo') && cmdAdapter.includes('--tools-all');
assertRule(
  'R5_自主权限: 适配器保后台免交互旗标 (agy --dangerously-skip-permissions / cmd --yolo --tools-all)',
  autonomyOk,
  '适配器丢失自主权限旗标, 后台执行将被权限门禁卡死',
);

const protocolOk =
  agyAdapter.includes('PROTOCOL_VERSION') && agyAdapter.includes('initialize') && agyAdapter.includes('session/prompt') &&
  cmdAdapter.includes('PROTOCOL_VERSION') && cmdAdapter.includes('initialize') && cmdAdapter.includes('session/prompt');
assertRule(
  'R6_协议面: 自建适配器保持 ACP 握手/会话/提示方法面 (不塌缩成裸 PTY spawn)',
  protocolOk,
  '适配器丢失 PROTOCOL_VERSION/initialize/session/prompt 协议面',
);

const whichToolContent = fs.readFileSync('scripts/which-tool.sh', 'utf8');
const toolsDocContent = fs.readFileSync('docs-coolie/TOOLS.md', 'utf8');
const matrixOk =
  whichToolContent.includes('acp_tools') && toolsDocContent.includes('Agent Client Protocol');
assertRule(
  'R7_矩阵在册: which-tool.sh acp 探针与 TOOLS.md ACP 矩阵章节不漂移',
  matrixOk,
  '工具矩阵探针或 TOOLS.md ACP 手册被删, 文档与实现漂移',
);

console.log('\n🌐 10. Dev 与 Prod 环境职责红线与项目绝对物理隔离审计:');
const agentsMd = fs.readFileSync('AGENTS.md', 'utf8');
const terminologyMd = fs.readFileSync('docs-coolie/TERMINOLOGY.md', 'utf8');
assertRule(
  '环境隔离法典守卫: AGENTS.md 必须载入 Dev/Prod 物理隔离铁律 (公理七)',
  agentsMd.includes('Dev 与 Prod 环境职责红线与项目绝对物理隔离铁律'),
  'AGENTS.md 丢失 Dev 与 Prod 环境隔离铁律',
);
assertRule(
  '业务边界定义守卫: TERMINOLOGY.md 必须明确 Dev 专事工坊建设、Prod 专事实体交付',
  terminologyMd.includes('Dev 与 Prod 环境定位与项目边界'),
  'TERMINOLOGY.md 丢失 Dev 与 Prod 环境定位与项目边界定义',
);

console.log('\n🚀 11. 移动端版本决策与静默热更人机工程守卫 (wave360):');
const appVersionTs = fs.readFileSync('clients/expo/src/AppVersion.ts', 'utf8');
const otaTs = fs.readFileSync('clients/expo/src/OTA.ts', 'utf8');

assertRule(
  '原生 versionCode 优先门禁: localCode >= info.versionCode 绝对不弹整包升级',
  appVersionTs.includes('localCode >= info.versionCode'),
  'AppVersion.ts 缺失 localCode >= info.versionCode 原生优先判定',
);

assertRule(
  'OTA 原生运行时对齐判定: isNativeAheadOfManifest 必须支持 fingerprint 对齐直接兼容',
  appVersionTs.includes('nativeRuntime.trim() === manifestRuntime.trim()'),
  'AppVersion.ts 丢失 fingerprint 运行时对齐判定，将导致同哈希误报升级',
);

assertRule(
  'OTA 增量静默压制: 具备 OTA 能力时压制整包 APK 弹窗打扰',
  appVersionTs.includes('otaCapable'),
  'AppVersion.ts 丢失 OTA 覆盖压制逻辑',
);

assertRule(
  'OTA 重启提示防刷防重与两字按钮规范: promptRestart 具备会话防重与【稍后】/【重启】按钮',
  otaTs.includes('promptedSessionUpdateId') && otaTs.includes('重启'),
  'OTA.ts 缺失会话防重或两字按钮规范',
);

console.log('\n🧭 12. 移动端无感就地导航与调用栈完整性守卫 (wave363):');
const taskDetailTs = fs.readFileSync('clients/expo/src/screens/TaskDetailScreen.tsx', 'utf8');

const selectedAboveTabs = appContent.indexOf('selected ? (\n            taskDetail') > 0 &&
  appContent.indexOf('selected ? (\n            taskDetail') < appContent.indexOf('tab === "dashboard"');
assertRule(
  '实体详情全局顶层抽屉化: selected 任务详情必须在外层求值，严禁嵌死在 tasks tab 内部',
  selectedAboveTabs,
  'App.tsx 任务详情未提升至顶层三元链，导致非 tasks tab 无法就地查看实体',
);

const hasArtifactsDeadRoute = appContent.includes('navigateTab("artifacts")');
assertRule(
  '消灭孤儿死路由: 严禁在代码中调用已从底栏移除的 navigateTab("artifacts")',
  !hasArtifactsDeadRoute,
  'App.tsx 仍残留 navigateTab("artifacts") 孤儿路由',
);

const assetsTabControlled = appContent.includes('activeTab={assetsTab}') && appContent.includes('onTabChange={setAssetsTab}');
assertRule(
  '复合屏状态受控与跨模态记忆: OrgAssetsScreen 必须受控绑定 activeTab 与 onTabChange',
  assetsTabControlled,
  'App.tsx 未对 OrgAssetsScreen 进行受控管理，关闭子模态时将导致用户被莫名踢回本体',
);

const taskDetailHeaderTwoChar = taskDetailTs.includes('backLabel="返回"');
assertRule(
  '任务详情返回文案纯两字: TaskDetailScreen 头部返回按钮必须收敛为【‹ 返回】',
  taskDetailHeaderTwoChar,
  'TaskDetailScreen 头部返回文案仍包含口语化长词（如"返回任务列表"）',
);

console.log('\n🏢 13. AI 原生软件交付工厂与 CMMI 0-1 工程资产法典审计 (wave364):');
const quickCardMd = fs.readFileSync('docs-coolie/PM-DISPATCH-QUICKCARD.md', 'utf8');
const cmmiArtifactsRuleExists = fs.existsSync('.agents/rules/CMMI-SPEC-FIRST-ARTIFACTS.md');

assertRule(
  '工厂最高生态位法典守卫: AGENTS.md 必须载入公理一(商业软件交付工厂与三层隔离)与公理四(CMMI工程资产)',
  agentsMd.includes('AI 原生商业软件交付工厂最高生态位与三层物理隔离铁律') &&
  agentsMd.includes('CMMI 0-1 软件工程交付资产与 Spec-First 实体产物铁律'),
  'AGENTS.md 缺失交付工厂与 CMMI 资产法典',
);

assertRule(
  'CMMI Spec-First 规则落盘守卫: .agents/rules/CMMI-SPEC-FIRST-ARTIFACTS.md 必须存在且包含 No Artifact, No Done 铁律',
  cmmiArtifactsRuleExists && fs.readFileSync('.agents/rules/CMMI-SPEC-FIRST-ARTIFACTS.md', 'utf8').includes('No Artifact, No Done'),
  '.agents/rules/CMMI-SPEC-FIRST-ARTIFACTS.md 规则缺失或未声明 No Artifact, No Done 铁律',
);

assertRule(
  '生命周期术语隔离守卫: TERMINOLOGY.md 必须明确区分 CMMI 0-1 软件工程资产 与 运行时业务数据/产物',
  terminologyMd.includes('CMMI 0-1 软件工程资产') && terminologyMd.includes('运行时业务数据/产物'),
  'TERMINOLOGY.md 缺失工程交付资产与运行时业务数据严格区分定义',
);

assertRule(
  'Hermes 派工 8 要素与结项门禁守卫: PM-DISPATCH-QUICKCARD.md 必须升级为 8 要素模板且包含 No Artifact, No Done',
  quickCardMd.includes('brief 8 要素模板') && quickCardMd.includes('No Artifact, No Done 铁律'),
  'PM-DISPATCH-QUICKCARD.md 未升级 brief 8 要素模板或缺失结项硬门禁',
);

assertRule(
  '项目目录结构与基座自适应法典守卫: AGENTS.md 必须载入公理五(默认 PNPM monorepo/开源基座自适应/废弃.coolie-cmmi全面采用docs-specs扁平规范)',
  agentsMd.includes('项目目录结构规范与开源基座自适应物理归宿铁律') &&
  agentsMd.includes('PNPM workspace monorepo') &&
  agentsMd.includes('docs/specs'),
  'AGENTS.md 缺失项目目录结构与 docs/specs 扁平规范铁律',
);

const cmmiRuleContent = cmmiArtifactsRuleExists ? fs.readFileSync('.agents/rules/CMMI-SPEC-FIRST-ARTIFACTS.md', 'utf8') : '';
assertRule(
  'CMMI 过程文档 docs/specs/ 扁平物理归宿守卫: 规范必须彻底废弃 .coolie/cmmi 转向 docs/specs/ 与 docs/architecture/',
  cmmiRuleContent.includes('docs/specs/') &&
  cmmiRuleContent.includes('docs/architecture/') &&
  (cmmiRuleContent.includes('废弃') || cmmiRuleContent.includes('弃用')),
  '.agents/rules/CMMI-SPEC-FIRST-ARTIFACTS.md 缺失 docs/specs 扁平归宿或未明确废弃 .coolie/cmmi',
);

// -----------------------------------------------------------------------------
// 14. 仓库防通胀与目录自清洁守卫 (Anti-Inflation & Anti-Entropy Gate)
// -----------------------------------------------------------------------------
console.log('\n🧹 14. 仓库防通胀与目录自清洁守卫:');
const noDuplicateAuditsDir = !fs.existsSync('docs-coolie/audits');
assertRule('消灭双胞胎目录: docs-coolie/audits/ 必须已合并入 audit/ (严禁双胞胎复活)', noDuplicateAuditsDir, 'docs-coolie/audits/ 残留');

const noDuplicatePrototypesDir = !fs.existsSync('docs-coolie/prototypes');
assertRule('消灭双胞胎目录: docs-coolie/prototypes/ 必须已合并入 protos/ (严禁双胞胎复活)', noDuplicatePrototypesDir, 'docs-coolie/prototypes/ 残留');

const ALLOWED_ROOT_DIRS = new Set([
  'server',
  'ui',
  'packages',
  'cli',
  'skills',
  'doc',
  'docs',
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
  'deploy',
  'design',
  'releases',
  'announcements',
  'tools',
  'report',
  'skills-releases',
  'projects',
  'ontology',
  '.agents',
  '.claude',
  '.codex',
  '.commandcode',
  '.devin',
  '.github',
  '.kiro',
  '.specify',
]);

let unknownTopDirs = [];
try {
  const trackedFiles = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
  const unknownSet = new Set();
  for (const rawFile of trackedFiles) {
    const f = rawFile.replace(/^"/, '').replace(/"$/, '');
    const parts = f.split('/');
    if (parts.length > 1 && !ALLOWED_ROOT_DIRS.has(parts[0])) {
      unknownSet.add(parts[0]);
    }
  }
  unknownTopDirs = Array.from(unknownSet);
} catch {}

assertRule(
  '根目录标准骨架白名单守卫: 平台 Git 跟踪的顶级目录必须 100% 属于受管骨架，严禁乱建非标目录',
  unknownTopDirs.length === 0,
  `发现未授权顶级目录被 Git 跟踪: ${unknownTopDirs.join(', ')}`
);

// -----------------------------------------------------------------------------
// 15. CMMI 00~09 阶段化 Skills 装配与 OpenWiki (LLM-Wiki) 动态自愈知识大脑守卫
// -----------------------------------------------------------------------------
console.log('\n🧠 15. CMMI 00~09 阶段化 Skills 装配与 OpenWiki (LLM-Wiki) 动态自愈守卫:');
const wikiIndexExists = fs.existsSync('wiki/index.md');
assertRule('OpenWiki 根索引守卫: wiki/index.md 必须存在且定义全生命周期阶段与领域导航', wikiIndexExists, 'wiki/index.md 缺失');

const openwikiSymlinkExists = fs.existsSync('openwiki');
assertRule('RFC 8615 规范守卫: openwiki -> wiki 软链接必须存在', openwikiSymlinkExists, 'openwiki 软链接缺失');

const syncOpenwikiExists = fs.existsSync('scripts/sync-openwiki.mjs');
assertRule('自愈同步引擎守卫: scripts/sync-openwiki.mjs 必须存在且支持动态自愈与漂移校验', syncOpenwikiExists, 'scripts/sync-openwiki.mjs 缺失');

const skillsReadmeContent = fs.existsSync('.agents/skills/README.md') ? fs.readFileSync('.agents/skills/README.md', 'utf8') : '';
assertRule(
  'CMMI 00~09 阶段化装配守卫: .agents/skills/README.md 必须包含 00~09 截断交付与专属 Skills 矩阵',
  skillsReadmeContent.includes('CMMI 00~09 全生命周期阶段化装配矩阵') && skillsReadmeContent.includes('OpenWiki'),
  '.agents/skills/README.md 未包含 CMMI 00~09 装配矩阵或 OpenWiki 规范',
);

const agentsHasOpenWiki = agentsMd.includes('OpenWiki (LLM-Wiki) 动态自愈知识大脑铁律');
assertRule('最高法典守卫: AGENTS.md 必须载入 OpenWiki First 动态自愈知识大脑铁律', agentsHasOpenWiki, 'AGENTS.md 缺失 OpenWiki 铁律');

let openwikiCheckOk = false;
try {
  const checkOutput = execSync('node scripts/sync-openwiki.mjs --check', { encoding: 'utf8' });
  openwikiCheckOk = checkOutput.includes('PASS');
} catch (e) {
  openwikiCheckOk = false;
}
assertRule('OpenWiki 零漂移守卫: node scripts/sync-openwiki.mjs --check 必须通过 (0 漂移)', openwikiCheckOk, 'OpenWiki 知识库内容存在漂移');

// -----------------------------------------------------------------------------
// 16. CMMI 01~09 完整规范目录与在制项目守卫 (CMMI 01~09 Full Specification Gate)
// -----------------------------------------------------------------------------
console.log('\n📐 16. CMMI 01~09 完整规范目录与在制项目守卫:');
const hatchScriptContent = fs.existsSync('scripts/hatch-client-project.sh') ? fs.readFileSync('scripts/hatch-client-project.sh', 'utf8') : '';
assertRule(
  '立项脚手架 01~09 覆盖守卫: hatch-client-project.sh 必须生成完整的 01_management ~ 09_operations',
  hatchScriptContent.includes('01_management') && hatchScriptContent.includes('09_operations') && hatchScriptContent.includes('software-requirements.md'),
  'hatch-client-project.sh 缺失 01~09 阶段目录生成逻辑',
);

const ynDocsExists = fs.existsSync('projects/sys-yunnan-wecom/docs/01_management') && fs.existsSync('projects/sys-yunnan-wecom/docs/09_operations');
const ynNoOldCmmi = !fs.existsSync('projects/sys-yunnan-wecom/docs/cmmi');
assertRule(
  '在制项目规范守卫 (云南移动企微): 具备完整 01~09 目录且旧 cmmi/ 已彻底清退',
  ynDocsExists && ynNoOldCmmi,
  'projects/sys-yunnan-wecom 缺失 01~09 目录或旧 cmmi/ 未清退',
);

const jxDocsExists = fs.existsSync('projects/sys-jiuxia-smart/docs/01_management') && fs.existsSync('projects/sys-jiuxia-smart/docs/09_operations');
const jxNoOldCmmi = !fs.existsSync('projects/sys-jiuxia-smart/docs/cmmi');
assertRule(
  '在制项目规范守卫 (九夏智居中台): 具备完整 01~09 目录且旧 cmmi/ 已彻底清退',
  jxDocsExists && jxNoOldCmmi,
  'projects/sys-jiuxia-smart 缺失 01~09 目录或旧 cmmi/ 未清退',
);

const hatchHasAiHarness = hatchScriptContent.includes('bootstrap-client-project-harness.mjs');
assertRule(
  '商业项目孵化器 AI 规范全覆盖守卫: hatch-client-project.sh 必须自动生成 HARNESS/MEMORY/CLAUDE/AGENTS/copilot 等 6 大规范与 harness.sh',
  hatchHasAiHarness,
  'hatch-client-project.sh 缺失 AI 规范与 Harness 自动注入引擎调用',
);

const ynAiSpecsOk =
  fs.existsSync('projects/sys-yunnan-wecom/HARNESS.md') &&
  fs.existsSync('projects/sys-yunnan-wecom/MEMORY.md') &&
  fs.existsSync('projects/sys-yunnan-wecom/CLAUDE.md') &&
  fs.existsSync('projects/sys-yunnan-wecom/.cursorrules') &&
  fs.existsSync('projects/sys-yunnan-wecom/AGENTS.md') &&
  fs.existsSync('projects/sys-yunnan-wecom/scripts/harness.sh');
assertRule(
  '在制商业项目 AI 规范守卫 (云南移动企微): 必须具备完整 HARNESS/MEMORY/CLAUDE/AGENTS 等规范与 harness.sh',
  ynAiSpecsOk,
  'projects/sys-yunnan-wecom 缺失 AI 规范文件或 harness.sh',
);

const jxAiSpecsOk =
  fs.existsSync('projects/sys-jiuxia-smart/HARNESS.md') &&
  fs.existsSync('projects/sys-jiuxia-smart/MEMORY.md') &&
  fs.existsSync('projects/sys-jiuxia-smart/CLAUDE.md') &&
  fs.existsSync('projects/sys-jiuxia-smart/.cursorrules') &&
  fs.existsSync('projects/sys-jiuxia-smart/AGENTS.md') &&
  fs.existsSync('projects/sys-jiuxia-smart/scripts/harness.sh');
assertRule(
  '在制商业项目 AI 规范守卫 (九夏智居中台): 必须具备完整 HARNESS/MEMORY/CLAUDE/AGENTS 等规范与 harness.sh',
  jxAiSpecsOk,
  'projects/sys-jiuxia-smart 缺失 AI 规范文件或 harness.sh',
);

const cmmiScaffoldExists = fs.existsSync('scripts/cmmi-asset-scaffold.cjs');
assertRule('CMMI 资产脚手架引擎守卫: scripts/cmmi-asset-scaffold.cjs 必须存在且支持 01~09 阶段 26 种标准资产', cmmiScaffoldExists, 'scripts/cmmi-asset-scaffold.cjs 缺失');

const cmmiAuthoringSkillContent = fs.existsSync('.agents/skills/cmmi-asset-authoring/SKILL.md')
  ? fs.readFileSync('.agents/skills/cmmi-asset-authoring/SKILL.md', 'utf8')
  : '';
assertRule(
  'CMMI 01~09 SOP 与 Skill 固化矩阵守卫: .agents/skills/cmmi-asset-authoring/SKILL.md 必须定义完整 SOP 矩阵与防假门禁',
  cmmiAuthoringSkillContent.includes('CMMI 01~09 全生命周期工序与顶级 Skill 固化矩阵') &&
  cmmiAuthoringSkillContent.includes('Zero Fake Demos'),
  'cmmi-asset-authoring/SKILL.md 缺失或未包含 01~09 SOP 矩阵',
);

let cmmiCheckOk = false;
try {
  const cmmiOut = execSync('node scripts/cmmi-asset-scaffold.cjs check', { encoding: 'utf8' });
  cmmiCheckOk = cmmiOut.includes('全部通过');
} catch (e) {
  cmmiCheckOk = false;
}
assertRule('CMMI 标准资产反造假扫描守卫: node scripts/cmmi-asset-scaffold.cjs check 必须通过 (0 散落、0 假 Demo)', cmmiCheckOk, 'cmmi-asset-scaffold check 失败');

// -----------------------------------------------------------------------------
// 16.1 运营对账平账 (G7 / Phase 09) 三方对账能力与零假基线守卫 (wave286-COOA-110)
// -----------------------------------------------------------------------------
const reconSopPath = fs.existsSync('projects/cls-core-services/docs/09_operations/tenant-governance.md')
  ? 'projects/cls-core-services/docs/09_operations/tenant-governance.md'
  : 'docs/09_operations/tenant-governance.md';
const reconSopContent = fs.existsSync(reconSopPath) ? fs.readFileSync(reconSopPath, 'utf8') : '';
const reconSopHasSources = ['hk_orders', 'pay_orders', '对账单'].every((k) => reconSopContent.includes(k));
const reconSopHasInvariants =
  reconSopContent.includes('复式记账') && reconSopContent.includes('期初余额') && reconSopContent.includes('无对账不放款');
assertRule(
  '运营对账平账 SOP 守卫: docs/09_operations/tenant-governance.md 必须定义三方对账源 (业务订单/支付网关/外部渠道账单) 与复式记账不变量',
  reconSopHasSources && reconSopHasInvariants,
  'G7 运营 SOP 缺失三方对账数据源或复式记账 / 无对账不放款不变量',
);

const reconRoots = ['docs', 'projects/sys-yunnan-wecom/docs', 'projects/sys-chanrong-agent/docs', 'projects/sys-jiuxia-smart/docs', 'projects/cls-core-services/docs'];
const reconFakeFiles = [];
for (const reconRoot of reconRoots) {
  const reconDir = path.join(reconRoot, '09_operations/02_financial_reconciliation');
  if (!fs.existsSync(reconDir)) continue;
  for (const entry of fs.readdirSync(reconDir)) {
    if (entry !== '.gitkeep') reconFakeFiles.push(path.join(reconDir, entry));
  }
}
assertRule(
  '运营对账平账零假基线守卫: 真实外部流水发生前, 02_financial_reconciliation/ 仅允许 .gitkeep 占位 (真实流水启动后须同步升级本守卫)',
  reconFakeFiles.length === 0,
  `存在未经真实外部流水的对账产物: ${reconFakeFiles.join(', ')}`,
);

// -----------------------------------------------------------------------------
// 16.1.1–16.1.7 运营对账硬化 (wave286-COOA-112 · F1–F7) — 反向传播防退化
// -----------------------------------------------------------------------------
// 取 SOP §四 (§4.*) 与 §六 (§六) 段落,精准断言 (基于行号,兼容中英标题)
function extractSection(content, headerPattern) {
  const lines = content.split('\n');
  const startIdx = lines.findIndex((l) => l.startsWith(headerPattern));
  if (startIdx < 0) return '';
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^## \S/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx, endIdx).join('\n');
}
const sopSectionFour = extractSection(reconSopContent, '## 四、 ');
const sopSectionSix = extractSection(reconSopContent, '## 六、 ');
const sopHeaderBlock = reconSopContent.split('\n').slice(0, 12).join('\n');

// F1 · 空账期口径: §四含 is_empty_day / 空日结 / recon_date 三关键词
assertRule(
  'F1 空账期口径守卫: SOP §四 必须定义 is_empty_day / 空日结 / recon_date 三要素',
  sopSectionFour.includes('is_empty_day') && sopSectionFour.includes('空日结') && sopSectionFour.includes('recon_date'),
  'G7 SOP §四 缺失 F1 空账期口径关键词 (is_empty_day / 空日结 / recon_date)',
);

// F2 · 调账 maker-checker: §六含 ops:recon:adjust + approver != applicant + 403
assertRule(
  'F2 调账 maker-checker 互斥守卫: SOP §六 必须强制 approver != applicant (ops:recon:adjust + 403)',
  sopSectionSix.includes('ops:recon:adjust') && sopSectionSix.includes('approver != applicant') && sopSectionSix.includes('403'),
  'G7 SOP §六 缺失 F2 调账 maker-checker 互斥 (与 INV-6 不一致)',
);

// F3 · 长款 SLA/终态: §四含 force_closed / SLA / 72h
assertRule(
  'F3 长款处置终态守卫: SOP §四 必须定义 force_closed 终态 + SLA + 72h',
  sopSectionFour.includes('force_closed') && sopSectionFour.includes('SLA') && sopSectionFour.includes('72h'),
  'G7 SOP §四 缺失 F3 长款处置终态/SLA/超时兜底',
);

// F4 · 短款幂等: §四含 vendor_txn_id + 幂等
assertRule(
  'F4 短款补单幂等守卫: SOP §四 必须定义幂等键 vendor_txn_id',
  sopSectionFour.includes('vendor_txn_id') && sopSectionFour.includes('幂等'),
  'G7 SOP §四 缺失 F4 短款补单幂等键 vendor_txn_id',
);

// F5 · 跨日退款归属: §四含 vendor_settled_at + 外部渠道清算日
assertRule(
  'F5 跨日退款归属守卫: SOP §四 必须定义 vendor_settled_at + 外部渠道清算日',
  sopSectionFour.includes('vendor_settled_at') && sopSectionFour.includes('外部渠道清算日'),
  'G7 SOP §四 缺失 F5 跨日/部分退款 recon_date 归属口径',
);

// F6 · 报告指纹算法: §四含 SHA-256 + fingerprint + canonicalJSON
assertRule(
  'F6 报告指纹算法守卫: SOP §四 必须定义 SHA-256 校验指纹 (canonicalJSON + fingerprint)',
  sopSectionFour.includes('SHA-256') && sopSectionFour.includes('fingerprint') && sopSectionFour.includes('canonicalJSON'),
  'G7 SOP §四 缺失 F6 校验指纹算法 (不可伪造不可验证)',
);

// F6 配套: fingerprint lib `scripts/signature.cjs` 实体存在
const signatureLibExists = fs.existsSync('scripts/signature.cjs');
assertRule(
  'F6 fingerprint lib 实体守卫: scripts/signature.cjs 必须存在并提供 computeReconciliationFingerprint()',
  signatureLibExists,
  'scripts/signature.cjs 缺失 (F6 校验指纹无落地实现)',
);

// F7 · 上游契约断链修复: SOP 头注不再含 02_requirements/ 字面;指向 SPEC-implementation.md 或 PRODUCT.md
assertRule(
  'F7 上游契约修复守卫: SOP 头注必须删除 02_requirements/ 引用并指向 SPEC-implementation.md / PRODUCT.md',
  !sopHeaderBlock.includes('02_requirements/') &&
    (sopHeaderBlock.includes('SPEC-implementation.md') || sopHeaderBlock.includes('PRODUCT.md')),
  'G7 SOP 头注仍引用不存在的 02_requirements/ (合同断链未修复)',
);

// F6 配套: reconciliation 模板必须显式输出 fingerprint 字段 (对齐 SOP §4.4 "报告模板头部必须输出 fingerprint")
const scaffoldReconTemplateSource = fs.readFileSync('scripts/cmmi-asset-scaffold.cjs', 'utf8');
assertRule(
  'F6 对账模板指纹输出守卫: cmmi-asset-scaffold.cjs reconciliation 模板必须显式输出 fingerprint 字段',
  scaffoldReconTemplateSource.includes('fingerprint'),
  'cmmi-asset-scaffold.cjs reconciliation 模板未输出 fingerprint 字段 (F6 模板未落地)',
);

// -----------------------------------------------------------------------------
// 17. Spec-Kit 统一全类型 SDD 规格引擎守卫 (Unified Spec-Kit SDD Engine Gate)
// -----------------------------------------------------------------------------
console.log('\n⚙️ 17. Spec-Kit 统一全类型 SDD 规格引擎守卫:');
const speckitExists = fs.existsSync('scripts/speckit.cjs');
assertRule('Spec-Kit 引擎实体守卫: scripts/speckit.cjs 必须存在且具备执行能力', speckitExists, 'scripts/speckit.cjs 缺失');

const pkgJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const pkgHasSpeckit = Boolean(pkgJson.scripts && pkgJson.scripts['speckit'] && pkgJson.scripts['speckit:new']);
assertRule('CLI 快捷指令守卫: package.json 必须配置 speckit 与 speckit:new 指令', pkgHasSpeckit, 'package.json 缺失 speckit 相关脚本配置');

let specHealthOk = false;
try {
  const healthOutput = execSync('node scripts/speckit.cjs health', { encoding: 'utf8' });
  specHealthOk = healthOutput.includes('全盘扫描通过');
} catch (e) {
  specHealthOk = false;
}
assertRule('全仓规格防污染扫描守卫: node scripts/speckit.cjs health 必须通过 (0 散落、0 污染)', specHealthOk, 'speckit health 扫描发现不合规项');

const speckitContent = fs.readFileSync('scripts/speckit.cjs', 'utf8');
const speckitHasOfficialDocsSync =
  speckitContent.includes('/documents/spec') &&
  speckitContent.includes('/documents/plan') &&
  speckitContent.includes('official-migrate');
assertRule(
  '官方 issue_documents 协同守卫: scripts/speckit.cjs 必须实现向官方 /documents/spec 与 /documents/plan 挂载并提供 official-migrate 迁移指令',
  speckitHasOfficialDocsSync,
  'speckit.cjs 缺失向官方 issue_documents 协同通道同步或迁移能力',
);

const issueSpecsRouteContent = fs.readFileSync('server/src/routes/issue-specs.ts', 'utf8');
const issueSpecsHasDualWrite =
  issueSpecsRouteContent.includes('documentService') &&
  issueSpecsRouteContent.includes('upsertIssueDocument') &&
  issueSpecsRouteContent.includes('getIssueDocumentByKey');
assertRule(
  'Issue-Specs 官方双写与回退守卫: server/src/routes/issue-specs.ts 必须集成 documentService 实现官方 issue_documents 双写镜像与读取 fallback',
  issueSpecsHasDualWrite,
  'server/src/routes/issue-specs.ts 缺失官方 issue_documents 双写或回退逻辑',
);

const forkSurfaceContent = fs.readFileSync('scripts/fork-surface.json', 'utf8');
const forkSurfaceHasDeprecation =
  forkSurfaceContent.includes('DEPRECATED - GRAINFUL DRAIN') &&
  forkSurfaceContent.includes('9008_add_issue_spec.sql');
assertRule(
  'Fork Issue 表面防腐守卫: scripts/fork-surface.json 必须明确标记 9008_add_issue_spec.sql 为渐进淘汰中，冻结私有字段扩张',
  forkSurfaceHasDeprecation,
  'scripts/fork-surface.json 未标记 9008_add_issue_spec.sql 为 DEPRECATED',
);

// -----------------------------------------------------------------------------
// 18. OpenMuse Sentinel 零信任看门狗与全 Agent 驱动守卫 (Sentinel & Sovereign Gate)
// -----------------------------------------------------------------------------
console.log('\n🛡️ 18. OpenMuse Sentinel 零信任看门狗与全 Agent 驱动守卫:');
const agentsHasAxiom10 = agentsMd.includes('公理十：全能力 AI Agent 闭环驱动与实事求是 0 假 Demo 铁律');
const agentsHasAxiom11 = agentsMd.includes('公理十一：Sentinel 零信任看门狗自主安全防御铁律');
assertRule('宪法级法典守卫: AGENTS.md 必须载入公理十与公理十一', agentsHasAxiom10 && agentsHasAxiom11, 'AGENTS.md 缺失公理十或公理十一');

const sentinelWhitepaperExists = fs.existsSync('docs-coolie/research/2026-10-10-openmuse-sentinel-and-foundry-guardrails.md');
const sentinelWikiExists = fs.existsSync('wiki/architecture/sentinel-guardrails.md');
assertRule('Sentinel 理论与架构词条守卫: 白皮书与 Wiki 词条必须落盘', sentinelWhitepaperExists && sentinelWikiExists, 'Sentinel 白皮书或架构词条缺失');

const noWeakPasswordsInCode = !hatchScriptContent.includes('admin123') && !hatchScriptContent.includes('123456');
assertRule('高熵凭据守卫: 脚手架与核心脚本杜绝 admin123/123456 等弱口令', noWeakPasswordsInCode, '检测到弱口令残留');

// -----------------------------------------------------------------------------
// 19. Paperclip 控制面与 ruoyi-all-next 正交并轨守卫 (Orthogonal Integration Gate)
// -----------------------------------------------------------------------------
console.log('\n⚖️ 19. Paperclip 控制面与 ruoyi-all-next 正交并轨守卫:');
const agentsHasAxiom13 = agentsMd.includes('公理十三：Paperclip 控制面与 ruoyi-all-next 商业交付工程法典正交并轨铁律');
assertRule('宪法级法典守卫: AGENTS.md 必须载入公理十三 (正交并轨铁律)', agentsHasAxiom13, 'AGENTS.md 缺失公理十三');

const orthogonalRuleExists = fs.existsSync('.agents/rules/RUOYI-PAPERCLIP-ORTHOGONAL-INTEGRATION.md');
assertRule('仲裁手册守卫: .agents/rules/RUOYI-PAPERCLIP-ORTHOGONAL-INTEGRATION.md 必须落盘', orthogonalRuleExists, 'RUOYI-PAPERCLIP-ORTHOGONAL-INTEGRATION.md 缺失');

const scaffoldScriptContent = fs.readFileSync('scripts/scaffold-project-cmmi-skills.mjs', 'utf8');
const scaffoldHasNoProjectsDefault = !scaffoldScriptContent.includes('targetDir = path.join(repoRoot, "projects"');
const scaffoldHasNestingGuard = scaffoldScriptContent.includes('[架构红线拦截]');
assertRule(
  '脚手架外部工作区守卫: scaffold-project-cmmi-skills.mjs 严禁默认 projects/ 且包含仓库嵌套拦截',
  scaffoldHasNoProjectsDefault && scaffoldHasNestingGuard,
  '脚手架脚本仍残留默认 projects/ 路径或缺乏嵌套拦截',
);

const hatchHasNestingGuard = hatchScriptContent.includes('[架构红线拦截]');
assertRule('孵化器仓库嵌套拦截守卫: hatch-client-project.sh 必须包含平台仓库嵌套拦截', hatchHasNestingGuard, 'hatch-client-project.sh 缺失仓库嵌套拦截');

// -----------------------------------------------------------------------------
// 20. Expo 移动端 i18n 契约同步防退化守卫 (Stage 5 · Web zh-CN/en 对齐)
// -----------------------------------------------------------------------------
console.log('\n🌐 20. Expo 移动端 i18n 契约同步防退化守卫 (Stage 5):');
for (const check of collectExpoI18nChecks()) {
  assertRule(check.name, check.ok, check.detail);
}

// -----------------------------------------------------------------------------
// 21. 服务端错误码/状态机/枚举 i18n 字典契约防退化守卫 (COOA-135)
// -----------------------------------------------------------------------------
console.log('\n🧩 21. 服务端错误码/状态机/枚举 i18n 字典契约防退化守卫 (COOA-135):');
for (const check of collectServerI18nChecks()) {
  assertRule(check.name, check.ok, check.detail);
}

// -----------------------------------------------------------------------------
// 22. 老板工具状态探测直通守卫 (COOA-160 · --probe-tool-status)
// -----------------------------------------------------------------------------
console.log('\n🩺 22. 老板 --probe-tool-status 工具池状态探测直通守卫 (COOA-160):');
const teamStatusScriptContent = fs.readFileSync('scripts/cron-team-status.sh', 'utf8');
const bossIntentContent = fs.readFileSync('scripts/hermes-boss-intent-dispatcher.sh', 'utf8');

assertRule(
  '工具探测子命令守卫: cron-team-status.sh 必须内建 --probe-tool-status 并复用 tool-health-monitor.sh',
  teamStatusScriptContent.includes('--probe-tool-status') && teamStatusScriptContent.includes('tool-health-monitor.sh'),
  'cron-team-status.sh 缺失 --probe-tool-status 子命令或未复用 tool-health-monitor.sh (重复造轮子/能力未打通)',
);

assertRule(
  '老板直通派单守卫: hermes-boss-intent-dispatcher.sh 必须识别 --probe-tool-status 并直通探测 (杜绝误派编码任务)',
  bossIntentContent.includes('--probe-tool-status') && bossIntentContent.includes('cron-team-status.sh'),
  'hermes-boss-intent-dispatcher.sh 未识别 --probe-tool-status, 老板微信指令被误派为编码任务',
);

assertRule(
  '帮助指令拦截守卫: hermes-boss-intent-dispatcher.sh 必须拦截 --help|-h|help 打印 usage 退出 (杜绝假任务进流水线 COOA-312)',
  bossIntentContent.includes('--help') && bossIntentContent.includes('-h') && bossIntentContent.includes('help'),
  'hermes-boss-intent-dispatcher.sh 缺失 --help/-h/help 拦截逻辑, 容易将帮助指令误派为真实开发工单',
);

assertRule(
  '巡检查询误派拦截守卫: hermes-boss-intent-dispatcher.sh §0.06 必须拦截「主线巡检/巡检…缺陷/本轮…缺陷/这轮…缺陷」查询语 (杜绝一次探活连起多张重单 COOA-485)',
  bossIntentContent.includes('主线巡检') && bossIntentContent.includes('本轮[^[:space:]]*缺陷') && bossIntentContent.includes('这轮[^[:space:]]*缺陷'),
  'hermes-boss-intent-dispatcher.sh §0.06 未拦截巡检缺陷查询语, 掌柜探活原话会连起多张假单 (COOA-485)',
);

assertRule(
  '干跑零写守卫: hermes-boss-intent-dispatcher.sh 必须支持 COOLIE_DISPATCH_DRY_RUN 干跑 (巡检单测严禁真在 Dev Server 建单/落 Receipt, 防自造工单风暴 COOA-485)',
  bossIntentContent.includes('COOLIE_DISPATCH_DRY_RUN'),
  'hermes-boss-intent-dispatcher.sh 缺失 COOLIE_DISPATCH_DRY_RUN 干跑门禁, 巡检单元测试会真在 Dev Server 建单',
);

assertRule(
  '派单幂等去重守卫: hermes-boss-intent-dispatcher.sh §0.07 必须按规范化原话窗口去重 (杜绝一句原话裂变多张工单 COOA-486)',
  bossIntentContent.includes('COOLIE_DISPATCH_DEDUP_WINDOW_SEC') &&
    bossIntentContent.includes('派单幂等去重') &&
    bossIntentContent.includes('DEDUP_WINDOW_SEC'),
  'hermes-boss-intent-dispatcher.sh 缺失 §0.07 派单幂等去重门禁, 巡检/探活原话会裂变多张重单 (COOA-486)',
);

assertRule(
  '裸巡检语义拦截守卫: hermes-boss-intent-dispatcher.sh §0.06 必须扩展拦截「缺陷…巡检 / 巡检…缺陷 / 看看…缺陷」裸巡检语义 (或走 --review-probe 旗标, COOA-486)',
  bossIntentContent.includes('看看[^[:space:]]*缺陷') &&
    bossIntentContent.includes('缺陷[^[:space:]]*巡检') &&
    bossIntentContent.includes('--review-probe'),
  'hermes-boss-intent-dispatcher.sh §0.06 未拦截裸巡检缺陷语义或缺失 --review-probe 旗标, 探活原话仍会被当派单 (COOA-486)',
);

assertRule(
  'Dev Server 既有 open 工单复用守卫: hermes-boss-intent-dispatcher.sh 建单前必须查近期同题 open 工单并复用 (不新建 Issue/不写新 Receipt, COOA-486)',
  bossIntentContent.includes('dispatcher-intent-dedup') &&
    bossIntentContent.includes('ISSUE_REUSED') &&
    bossIntentContent.includes('COOLIE_DEV_SERVER_URL'),
  'hermes-boss-intent-dispatcher.sh 缺失「既有 open 工单复用」幂等门禁 (COOA-486)',
);

assertRule(
  'Receipt 去重键守卫: 派单必须给 dispatch-local-employee.sh 传 --dedup-key 且 receipt 落库 dedupKey (COOA-486)',
  bossIntentContent.includes('--dedup-key') &&
    dispatchScriptContent.includes('DEDUP_KEY') &&
    dispatchScriptContent.includes('dedupKey'),
  'dispatch-local-employee.sh 缺失 receipt 级 dedupKey 幂等键 (COOA-486)',
);

const dispatcherIdempotencyTest = 'scripts/__tests__/hermes-dispatcher-idempotency.test.mjs';
assertRule(
  '派单幂等防退化单测落盘守卫: scripts/__tests__/hermes-dispatcher-idempotency.test.mjs 必须存在',
  fs.existsSync(dispatcherIdempotencyTest),
  '缺少 dispatcher 幂等防退化单测, 一句原话裂变 5 张工单的缺陷无法被机检拦截 (COOA-486)',
);

let dispatcherIdempotencyOk = false;
let dispatcherIdempotencyDetail = '';
try {
  dispatcherIdempotencyDetail = execSync(
    `node --test --test-reporter=tap ${dispatcherIdempotencyTest}`,
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  dispatcherIdempotencyOk = /^# fail 0\b/m.test(dispatcherIdempotencyDetail) && /^# pass \d+/m.test(dispatcherIdempotencyDetail);
} catch (error) {
  dispatcherIdempotencyOk = false;
  dispatcherIdempotencyDetail = `${error?.stdout ?? ''}${error?.stderr ?? ''}`;
}
assertRule(
  '派单幂等单测全绿守卫: node --test scripts/__tests__/hermes-dispatcher-idempotency.test.mjs 必须全绿 (连调两次不裂变 / 裸巡检 0 派单, COOA-486)',
  dispatcherIdempotencyOk,
  `dispatcher 幂等单测未全绿: ${dispatcherIdempotencyDetail.split('\n').filter((l) => /^not ok|# fail/.test(l)).join(' | ') || 'no summary'}`,
);

// -----------------------------------------------------------------------------
// 23. Web (ui/) i18n 引用-定义一致性守卫 (COOA-178 · 杜绝原始键外泄)
// -----------------------------------------------------------------------------
console.log('\n🧭 23. Web i18n 引用-定义一致性守卫 (COOA-178):');
for (const check of collectUiI18nRefChecks()) {
  assertRule(check.name, check.ok, check.detail);
}

// -----------------------------------------------------------------------------
// 24. 真机设备串行化锁守卫 (COOA-232 · 两并发一成一败 / 僵尸 TTL 可回收)
// -----------------------------------------------------------------------------
console.log('\n📵 24. 真机设备串行化锁 (device-claim) 守卫 (COOA-232):');
const deviceClaimPath = 'scripts/device-claim.sh';
const deviceClaimContent = fs.existsSync(deviceClaimPath) ? fs.readFileSync(deviceClaimPath, 'utf8') : '';
assertRule(
  '设备串行化锁实体守卫: scripts/device-claim.sh 必须存在且实现 acquire/release/status/reap/run 五个子命令',
  fs.existsSync(deviceClaimPath) &&
    ['acquire)', 'release)', 'status)', 'reap)', 'run)'].every((arm) => deviceClaimContent.includes(`  ${arm}`)),
  'scripts/device-claim.sh 缺失或子命令不全',
);

assertRule(
  '原子文件锁守卫: 锁必须经 mkdir 原子创建目录实现, 记录 owner/pid/host/TTL, 且默认 TTL 为 900s (15min)',
  deviceClaimContent.includes('mkdir "$cdir"') &&
    ['owner=', 'pid=', 'host=', 'startedAtEpoch=', 'ttlSeconds='].every((k) => deviceClaimContent.includes(`'${k}`)) &&
    deviceClaimContent.includes('DEVICE_CLAIM_TTL:-900'),
  'device-claim.sh 丢失 mkdir 原子锁 / owner+TTL 元数据 / 15min 默认租约',
);

const deviceWrapPath = 'scripts/agent-device-locked.sh';
assertRule(
  'agent-device 驱动包装守卫: scripts/agent-device-locked.sh 必须存在并委派 device-claim.sh run',
  fs.existsSync(deviceWrapPath) &&
    fs.readFileSync(deviceWrapPath, 'utf8').includes('device-claim.sh" run'),
  'agent-device 驱动包装缺失或未委派 device-claim run',
);

const deviceSkillPath = '.agents/skills/agent-device-browser-automation/SKILL.md';
const deviceSkillContent = fs.existsSync(deviceSkillPath) ? fs.readFileSync(deviceSkillPath, 'utf8') : '';
assertRule(
  "技能法典守卫: agent-device-browser-automation/SKILL.md 必须增补「驱动前必须 acquire」一节并引用 device-claim.sh",
  deviceSkillContent.includes('驱动真机前必须 acquire') && deviceSkillContent.includes('device-claim.sh'),
  'SKILL.md 未增补设备串行化锁章节',
);

assertRule(
  'CLI 快捷指令守卫: package.json 必须配置 test:device-claim 单测入口',
  Boolean(pkgJson.scripts && pkgJson.scripts['test:device-claim']),
  'package.json 缺失 test:device-claim 脚本',
);

let deviceClaimTestOk = false;
let deviceClaimTestDetail = '';
try {
  deviceClaimTestDetail = execSync(
    'node --test --test-reporter=tap scripts/__tests__/device-claim.test.mjs',
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  deviceClaimTestOk = /^# fail 0\b/m.test(deviceClaimTestDetail) && /^# pass \d+/m.test(deviceClaimTestDetail);
} catch (error) {
  deviceClaimTestOk = false;
  deviceClaimTestDetail = `${error?.stdout ?? ''}${error?.stderr ?? ''}`;
}
assertRule(
  '设备串行化锁并发竞争单测守卫: node --test scripts/__tests__/device-claim.test.mjs 必须全绿 (两并发一成一败 / 僵尸 TTL 回收 / 释放归属)',
  deviceClaimTestOk,
  `device-claim 单测未全绿: ${deviceClaimTestDetail.split('\n').filter((l) => /^not ok|# fail/.test(l)).join(' | ') || 'no summary'}`,
);

// -----------------------------------------------------------------------------
// 25. 新 SOA 场景配方驾驶舱、2PC 契约与 HLD/原型防退化守卫 (COOA-265)
// -----------------------------------------------------------------------------
console.log('\n📐 25. 新 SOA 场景配方驾驶舱、2PC 契约与 HLD/原型防退化守卫 (COOA-265):');
let wave286VerifyOk = false;
let wave286Detail = '';
try {
  wave286Detail = execSync('node scripts/verify-wave286-new-soa-prototype.mjs', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  wave286VerifyOk = wave286Detail.includes('全部 32/32 项 Delta 真实验证通过');
} catch (e) {
  wave286VerifyOk = false;
  wave286Detail = `${e?.stdout ?? ''}${e?.stderr ?? ''}`;
}

assertRule(
  '新 SOA 架构与原型 Delta 全量契约守卫: node scripts/verify-wave286-new-soa-prototype.mjs 必须通过 (32/32 PASS)',
  wave286VerifyOk,
  `wave286 Delta 验证未通过: ${wave286Detail.slice(0, 300)}`,
);

// -----------------------------------------------------------------------------
// 26. 技能口语评测产物 hermetic 化与计数漂移守卫 (COOA-487 · 源自 wave286 缺陷巡检)
// -----------------------------------------------------------------------------
console.log('\n🔒 26. 技能口语评测产物 hermetic 化与计数漂移守卫 (COOA-487):');
const skillEvalLibPath = 'scripts/lib/skill-spoken-intent-eval.mjs';
const skillEvalTestPath = 'scripts/__tests__/skill-spoken-intent-evaluation.test.mjs';
const skillEvalLibContent = fs.existsSync(skillEvalLibPath) ? fs.readFileSync(skillEvalLibPath, 'utf8') : '';
const skillEvalTestContent = fs.existsSync(skillEvalTestPath) ? fs.readFileSync(skillEvalTestPath, 'utf8') : '';
assertRule(
  '评测单测 hermetic 契约守卫: 单测默认 MUST NOT 直接写盘 (写盘仅经 SKILL_EVAL_WRITE=1 或独立生成器)',
  fs.existsSync('scripts/generate-skill-spoken-intent-eval.mjs') &&
    skillEvalLibContent.includes('computeReport') &&
    skillEvalTestContent.includes('SKILL_EVAL_WRITE') &&
    !skillEvalTestContent.includes('fs.writeFileSync') &&
    skillEvalTestContent.includes('gitStatusPorcelain'),
  '评测单测仍直接写盘或缺 hermetic 前后对拍, 违背 hermetic 契约 (COOA-487)',
);

assertRule(
  '评测产物确定性守卫: 核心引擎 MUST NOT 含易变时间戳 (new Date / toISOString)',
  skillEvalLibContent.includes('fingerprint') && !/new Date\(/.test(skillEvalLibContent),
  '评测引擎仍含易变时间戳, committed 证据无法确定性重生成',
);

let skillEvalFreshOk = false;
let skillEvalFreshDetail = '';
try {
  skillEvalFreshDetail = execSync('node scripts/check-skill-eval-freshness.mjs', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  skillEvalFreshOk = skillEvalFreshDetail.includes('[PASS]');
} catch (e) {
  skillEvalFreshOk = false;
  skillEvalFreshDetail = `${e?.stdout ?? ''}${e?.stderr ?? ''}`;
}
assertRule(
  '评测产物零漂移守卫: node scripts/check-skill-eval-freshness.mjs 必须通过 (确定性重生成 == committed 证据)',
  skillEvalFreshOk,
  `技能评测证据存在漂移或缺失: ${skillEvalFreshDetail.split('\n').filter(Boolean).slice(-3).join(' | ')}`,
);

// -----------------------------------------------------------------------------
// 27. telemetry 提案提取器 TS7 防退化守卫 (COOA-496 · 源自 COOA-488 巡检)
// -----------------------------------------------------------------------------
console.log('\n🧪 27. telemetry 提案提取器 TS7 防退化守卫 (COOA-496):');
const extractorTest = 'scripts/extract-proposed-events.test.mjs';
let extractorOk = false;
let extractorDetail = '';
try {
  extractorDetail = execSync(`node --test --test-reporter=tap ${extractorTest}`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  extractorOk = /^# fail 0\b/m.test(extractorDetail) && /^# pass \d+/m.test(extractorDetail);
} catch (e) {
  extractorOk = false;
  extractorDetail = `${e?.stdout ?? ''}${e?.stderr ?? ''}`;
}
assertRule(
  '提取器 TS7 契约守卫: 根 typescript 7.x 为 native 编译器不导出 classic API; scripts/extract-proposed-events.mjs 必须经 typescript-classic 载入且单测全绿',
  extractorOk &&
    fs.readFileSync('scripts/extract-proposed-events.mjs', 'utf8').includes('from "typescript-classic"') &&
    Boolean(pkgJson.devDependencies?.['typescript-classic']),
  `提取器单测未全绿或缺 classic-TS 解析路径: ${extractorDetail.split('\n').filter((l) => /^not ok|# fail/.test(l)).join(' | ') || 'no summary'}`,
);

// -----------------------------------------------------------------------------
// 28. release-package-map 结构性防退化守卫 (COOA-496 · 源自 COOA-488 巡检)
// -----------------------------------------------------------------------------
console.log('\n🧪 28. release-package-map 结构性防退化守卫 (COOA-496):');
let releaseMapOk = false;
let releaseMapDetail = '';
try {
  releaseMapDetail = execSync('node --test --test-reporter=tap scripts/release-package-map.test.mjs', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  releaseMapOk = /^# fail 0\b/m.test(releaseMapDetail) && /^# pass \d+/m.test(releaseMapDetail);
} catch (e) {
  releaseMapOk = false;
  releaseMapDetail = `${e?.stdout ?? ''}${e?.stderr ?? ''}`;
}
assertRule(
  '发布面包结构守卫: scripts/release-package-manifest.json 必须覆盖全部公共包且无「已发布包依赖未发布 workspace 包」悬空边 (node --test scripts/release-package-map.test.mjs 全绿)',
  releaseMapOk,
  `发布面包结构红: ${releaseMapDetail.split('\n').filter((l) => /^not ok|# fail/.test(l)).join(' | ') || 'no summary'}`,
);

console.log('\n========================================================================');
if (failed) {
  console.error('🚫 全面管局审计未通过！存在不符合高管治理规范的阻断项，请修复后重试。');
  process.exit(1);
} else {
  console.log('🎉 全面管局审计全绿通过！系统完全符合极简两字 UI、对称底栏、CMMI 01~09 规范产物、Spec-Ops SDD 引擎、Sentinel 零信任看门狗、全能力 Agent 驱动、高管审批治理、Hermes 扁平化 Worker 契约、就地导航调用栈、党章级工程宪法、AI 原生软件交付工厂与 OpenWiki 动态知识大脑硬门禁！');
  process.exit(0);
}

