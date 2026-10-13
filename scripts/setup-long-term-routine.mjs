const API_BASE = 'http://127.0.0.1:3100/api';
const COMPANY_ID = 'da2e705c-c80a-411b-b2ae-e39372b1251f'; // Coolie 本地施工总社
const PROJECT_ID = 'a3b763bb-f751-4cdb-ac60-0c58a0c907cf'; // Coolie 工坊 AI 原生交付工厂本体系统
const HERMES_AGENT_ID = '5419bef9-6b72-477b-a5e4-0fe19aac5b77'; // Hermes

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
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}: ${typeof json === 'object' ? JSON.stringify(json) : json}`);
  }
  return json;
}

async function main() {
  console.log('=== [1/4] 检查目标项目现有工单 ===');
  const issues = await request(`/companies/${COMPANY_ID}/issues?projectId=${PROJECT_ID}`);
  const title = '[主线长任务] Coolie 工坊全生命周期持续研发与能力升级 (Continuous Evolution)';
  let targetIssue = issues.find(i => i.title === title);

  if (targetIssue) {
    console.log(`已存在主线工单: ${targetIssue.identifier} (${targetIssue.id}) - 状态: ${targetIssue.status}`);
  } else {
    console.log('未找到主线长任务工单，正在创建...');
    targetIssue = await request(`/companies/${COMPANY_ID}/issues`, {
      method: 'POST',
      body: JSON.stringify({
        projectId: PROJECT_ID,
        title,
        description: [
          '## 任务定位',
          '掌柜指示：把 Coolie 工坊平台的持续开发与自我进化作为常驻长期主线任务，与 Routines 深度联动，持续巡检、能力升级与质量守卫，直到掌柜手动暂停。',
          '',
          '## 核心职能与目标',
          '1. **前沿技术基座与逆向能力持续集成**：持续集成 REA 逆向工程能力、Yudao 四位一体多端基座、Ruoyi 全栈轻量级基座等开源工程资产；',
          '2. **CMMI 01~09 全生命周期质量门禁**：推进 G1~G5 规范资产沉淀，保持 0 编译报错与真机快照测试存证；',
          '3. **工坊长线自驱与巡检**：挂载常驻 Routine 调度器，定期健康巡检，保障数字员工队伍（Hermes、墨斗、铁匠、门神、兜底渊）顺畅运转。',
          '',
          '**注：本任务为常驻主线任务，持续演进，不作单次截断。**'
        ].join('\n'),
        priority: 'high',
        status: 'in_progress',
        assigneeAgentId: HERMES_AGENT_ID,
      }),
    });
    console.log(`成功创建长周期主线工单: ${targetIssue.identifier} (${targetIssue.id})`);
  }

  console.log('\n=== [2/4] 检查现有 Routines 调度器 ===');
  const routines = await request(`/companies/${COMPANY_ID}/routines?projectId=${PROJECT_ID}`);
  const routineTitle = 'Coolie 工坊持续研发与版本升级守护调度器 (Foundry Evolution Routine)';
  let targetRoutine = routines.find(r => r.title === routineTitle);

  if (targetRoutine) {
    console.log(`已存在 Routine: ${targetRoutine.id} - 状态: ${targetRoutine.status}`);
  } else {
    console.log('未找到常驻 Routine 调度器，正在创建...');
    targetRoutine = await request(`/companies/${COMPANY_ID}/routines`, {
      method: 'POST',
      body: JSON.stringify({
        projectId: PROJECT_ID,
        parentIssueId: targetIssue.id,
        title: routineTitle,
        description: '常驻守护调度器：每 15 分钟触发一次工坊能力演进巡检与状态同步，驱动长周期主线工单持续推进，直到掌柜手动暂停。',
        assigneeAgentId: HERMES_AGENT_ID,
        priority: 'high',
        status: 'active',
        concurrencyPolicy: 'coalesce_if_active',
        catchUpPolicy: 'skip_missed',
      }),
    });
    console.log(`成功创建 Routine: ${targetRoutine.id}`);
  }

  console.log('\n=== [3/4] 检查并配置 Schedule 触发器 ===');
  const routineDetail = await request(`/routines/${targetRoutine.id}`);
  const triggers = routineDetail.triggers || [];
  let scheduleTrigger = triggers.find(t => t.kind === 'schedule');

  if (scheduleTrigger) {
    console.log(`已存在 Schedule Trigger: ${scheduleTrigger.id} (${scheduleTrigger.cronExpression})`);
  } else {
    console.log('正在为 Routine 添加每 15 分钟定时触发器 (*/15 * * * *)...');
    const triggerRes = await request(`/routines/${targetRoutine.id}/triggers`, {
      method: 'POST',
      body: JSON.stringify({
        kind: 'schedule',
        cronExpression: '*/15 * * * *',
        timezone: 'Asia/Shanghai',
        enabled: true,
        label: '每15分钟工坊研发守护巡检',
      }),
    });
    scheduleTrigger = triggerRes.trigger;
    console.log(`成功创建 Schedule Trigger: ${scheduleTrigger.id}`);
  }

  console.log('\n=== [4/4] 最终状态回读确认 ===');
  const finalRoutine = await request(`/routines/${targetRoutine.id}`);
  console.log(JSON.stringify({
    issueIdentifier: targetIssue.identifier,
    issueTitle: targetIssue.title,
    issueStatus: targetIssue.status,
    routineId: finalRoutine.id,
    routineTitle: finalRoutine.title,
    routineStatus: finalRoutine.status,
    triggers: finalRoutine.triggers,
  }, null, 2));

  console.log('\n✅ Mac coolie-dev 持续研发长任务与 Routine 常驻守护调度器已成功就绪！');
}

main().catch(err => {
  console.error('执行失败:', err);
  process.exit(1);
});
