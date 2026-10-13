/**
 * update-long-term-details.mjs
 * 
 * 规范化更新长任务主线工单 COOA-114 与首个细节子工单 COOA-116 (全量国际化)
 */

const API_BASE = 'http://127.0.0.1:3100/api';
const PARENT_ID = '179c5dfe-e531-48ac-8e29-fcfb2db2d74b'; // COOA-114
const SUB_ISSUE_ID = '182df248-498c-4f47-b921-d694a94dbe8d'; // COOA-116

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function main() {
  console.log('=== [1/2] 规范化更新子工单 COOA-116 描述 ===');
  await request(`/issues/${SUB_ISSUE_ID}`, {
    method: 'PATCH',
    body: JSON.stringify({
      description: [
        '## 业务背景与掌柜指示',
        '掌柜明确指示：“长任务 还得有 细节的 比如1. paperclip上游 功能的 全量国际化”。',
        '针对当前系统核心生产力页面英文残留、中文词条严重匮乏的现状，全面启动 Paperclip 上游功能全量国际化与本地化支持主线工程。',
        '',
        '## 现状诊断与差距分析',
        '1. **词条覆盖率不足 5%**: `ui/src/i18n/locales/zh-CN.json` 仅有 171 行（约 50 个基础键值），仅覆盖顶栏导航与仪表盘部分指标卡；',
        '2. **核心业务页面大量英文硬编码**: 工单看板/详情 (Issues)、项目与里程碑 (Projects)、例行任务 (Routines)、智能体与预算 (Agents)、工作区沙箱 (Workspaces)、系统与实例设置 (Settings) 均未接入多语言转译；',
        '3. **缺少运行时语言切换器**: 界面上缺少直接可操作的语言切换控件，用户无法在中文/英文间平滑切换；',
        '4. **服务端错误与枚举未本地化**: 后端返回的状态、错误码及审计活动日志缺少多语言转译字典。',
        '',
        '## 核心实施模块与交付路线图',
        '- [ ] **模块 1: Web 控制台词库全量补全 (UI Locale Dictionary Expansion)**',
        '  - 扩充 `zh-CN.json` 与 `en.json`，建立标准命名空间：`issues`、`projects`、`routines`、`agents`、`settings`、`workspaces`、`governance`、`common`；',
        '  - 词条规模从 170 行扩充至 1000+ 行全覆盖。',
        '- [ ] **模块 2: 核心业务页面组件去硬编码 (Component-Level i18n Integration)**',
        '  - 全面使用 `const { t } = useTranslation()` 替换各业务页面的硬编码英文；',
        '  - 重点覆盖：任务状态机 (Todo/In Progress/Done/Blocked)、执行策略、审批交互卡片、Agent 招募表单、环境变量配置。',
        '- [ ] **模块 3: 全局语言切换交互中枢 (Language Switcher UI & Persistence)**',
        '  - 在 TopNav / UserProfile 提供两字切换控件（【语言 / Language】）；',
        '  - 接入 `localStorage` 与用户偏好持久化存储，切换秒级免刷新生效。',
        '- [ ] **模块 4: 移动端 (Expo App) 国际化协同 (Mobile i18n Alignment)**',
        '  - 将移动端 `clients/expo/` 与 Web 端语言包契约对齐，消除移动端中英文混杂。',
        '- [ ] **模块 5: 契约测试与自动化防漂移 (i18n Contract Verification)**',
        '  - 编写 i18n 完整性单元测试，断言 `en.json` 与 `zh-CN.json` 键集合 100% 对齐，杜绝漏译。',
        '',
        '## 验收标准',
        '1. 控制面核心业务页面中文化覆盖率达到 100%；',
        '2. 支持中英文一键无缝切换；',
        '3. `pnpm -r typecheck` 与 i18n 契约测试全部通过。'
      ].join('\n'),
    }),
  });
  console.log('子工单 COOA-116 更新成功！');

  console.log('=== [2/2] 规范化更新长任务父工单 COOA-114 描述 ===');
  await request(`/issues/${PARENT_ID}`, {
    method: 'PATCH',
    body: JSON.stringify({
      description: [
        '## 任务定位',
        '掌柜指示：把 Coolie 工坊平台的持续开发与自我进化作为常驻长期主线任务，与 Routines 深度联动，持续巡检、能力升级与质量守卫，直到掌柜手动暂停。',
        '',
        '## 核心研发与细节子任务清单 (Continuous Evolution WBS)',
        '- [x] **细节 1: Paperclip 上游功能全量国际化与本地化 (Full i18n)** ➜ 挂载子工单 [`COOA-116`](http://127.0.0.1:3100) (进行中)',
        '- [ ] **细节 2: 存量老旧系统 REA 逆向认知流水线进阶 (Legacy REA Ingest)** ➜ 提升大型 APK/ASAR 在线抽取与活体本体图谱自动生成',
        '- [ ] **细节 3: Yudao / Ruoyi 双底座多端脚手架自动化编排 (Foundry Blueprint Engine)** ➜ 强化微服务与 Next.js 极速同构沙箱',
        '- [ ] **细节 4: CMMI 01~09 资产合规与自动化打假门禁 (CMMI Quality Gate)** ➜ 持续演进变异测试打假与不可变证据归档',
        '- [ ] **细节 5: 掌柜移动端驾驶舱 6 寸屏极致人机工程 (Mobile Cockpit 320px UX)** ➜ 持续优化两字交互、就地抽屉与极限防撑爆',
        '',
        '## 常驻守护机制',
        '- 绑定常驻 Routine 调度器：`b35ff456-cad2-42ef-9880-0fe3626beb70`；',
        '- 触发周期：每 15 分钟一次 (`*/15 * * * *`)；',
        '- 调度策略：并发聚合 (`coalesce_if_active`)、跳过遗漏 (`skip_missed`)。',
        '',
        '**注：本任务为常驻主线任务，持续演进，不作单次截断。**'
      ].join('\n'),
    }),
  });
  console.log('父工单 COOA-114 更新成功！');
}

main().catch(err => {
  console.error('执行失败:', err);
  process.exit(1);
});
