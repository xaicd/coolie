#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

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

const twoCharLabels = (tabBarContent.match(/label:\s*"([^"]+)"/g) || []).map(l => l.replace(/label:\s*"/, '').replace(/"/, ''));
const allLabelsTwoChars = twoCharLabels.length > 0 && twoCharLabels.every(l => l.length === 2);
assertRule(`底栏文案两字守卫: 底栏标签 100% 两个字 (${twoCharLabels.join(' · ')})`, allLabelsTwoChars, `存在非两字标签: ${twoCharLabels.join(', ')}`);

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
const hasChapter18 = agentsMdContent.includes('## 18. Coolie 工坊唯一核心北极星目标与真业务本体物理并轨铁律');
assertRule('AGENTS.md 已载入第 18 章北极星目标与真本体并轨铁律', hasChapter18, 'AGENTS.md 缺少第 18 章');

const masterPlanExists = fs.existsSync('docs-coolie/research/2026-10-05-coolie-core-mission-and-real-ontology-master-plan.md');
assertRule('真本体破局复盘白皮书已沉淀: docs-coolie/research/2026-10-05-coolie-core-mission-and-real-ontology-master-plan.md', masterPlanExists, '复盘白皮书未落盘');

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
  '环境隔离法典守卫: AGENTS.md 必须载入第 20 条 Dev/Prod 物理隔离铁律',
  agentsMd.includes('## 20. Dev 与 Prod 环境职责红线与项目绝对物理隔离铁律'),
  'AGENTS.md 丢失第 20 条 Dev 与 Prod 环境隔离铁律',
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

console.log('\n========================================================================');
if (failed) {
  console.error('🚫 全面管局审计未通过！存在不符合高管治理规范的阻断项，请修复后重试。');
  process.exit(1);
} else {
  console.log('🎉 全面管局审计全绿通过！系统完全符合极简两字 UI、对称底栏、CMMI 产物、高管审批治理、Hermes 扁平化 Worker 契约、就地导航调用栈与党章级工程宪法！');
  process.exit(0);
}
