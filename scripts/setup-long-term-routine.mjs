import {
  decideRoutineResume,
  describeRoutineResumeDecision,
} from './lib/routine-pause-authority.mjs';

const API_BASE = 'http://127.0.0.1:3100/api';
const COMPANY_ID = 'da2e705c-c80a-411b-b2ae-e39372b1251f'; // Coolie 本地施工总社
const PROJECT_ID = 'a3b763bb-f751-4cdb-ac60-0c58a0c907cf'; // Coolie 工坊 AI 原生交付工厂本体系统
const HERMES_AGENT_ID = '5419bef9-6b72-477b-a5e4-0fe19aac5b77'; // Hermes

/** --force: 忽略"人工暂停"保护, 强行把 routine 拉回 active。 */
const forceResume = process.argv.includes('--force');
/** 本轮是否因"存在明确的暂停记录"而整体跳过 resume(含 trigger 强制 re-enable)。 */
let pauseRespected = false;

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
    // 幂等 resume — 但**不许覆盖人的暂停**。
    // 旧行为(心法 #49): "不论当前 status 是什么, 都强制拉回 active"。
    // 真事故 (2026-10-17): 掌柜 00:49 CST 亲手把心祖 routine 停掉 (revision 9, local-board),
    // 心跳按这条规则 PATCH 回 active, 之后 15 分钟一跳跑了一整夜 (COOA-463~472), 人的决定被静默撤销。
    // 现口径: 最近一次 revision 是人写的且写成非 active ⇒ 人工暂停, 尊重, 不 resume (需 --force 覆盖)。
    const revisions = await request(`/routines/${targetRoutine.id}/revisions`).catch(() => []);
    const decision = decideRoutineResume({
      routineStatus: targetRoutine.status,
      revisions,
      force: forceResume,
    });
    console.log(describeRoutineResumeDecision(decision));

    if (decision.action === 'resume') {
      targetRoutine = await request(`/routines/${targetRoutine.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'active' }),
      });
      console.log(`✅ 已恢复 active: ${targetRoutine.id}`);
    } else if (decision.action === 'skip_paused') {
      pauseRespected = true;
      console.log('⏸  已记录为主动暂停 —— 本轮不再 resume routine, 也不再强制 re-enable trigger;');
      console.log('   如确需覆盖, 重跑并加 --force。');
    } else {
      console.log(`✅ Routine 已是 active: ${targetRoutine.id}`);
    }
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

  console.log('\n=== [3/4] 检查并幂等 resume Schedule 触发器 ===');
  const routineDetail = await request(`/routines/${targetRoutine.id}`);
  const triggers = routineDetail.triggers || [];
  let scheduleTrigger = triggers.find(t => t.kind === 'schedule');

  if (pauseRespected) {
    console.log('⏸  已记录为主动暂停 —— 跳过 trigger 强制 re-enable (尊重暂停决定, 保留人工控制权)。');
  } else if (scheduleTrigger) {
    // 幂等 resume trigger: 不论 enabled 是 true/false 都强制 enable 并重排 nextRunAt
    if (!scheduleTrigger.enabled) {
      console.log(`⚠️  Trigger 当前 enabled=${scheduleTrigger.enabled}, 幂等 re-enable`);
      const patched = await request(`/routine-triggers/${scheduleTrigger.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: true }),
      });
      scheduleTrigger = patched.trigger || patched;
    } else {
      console.log(`✅ Schedule Trigger 已 enabled: ${scheduleTrigger.id} (${scheduleTrigger.cronExpression})`);

      // 心法 #50: "active + enabled 但 lastTriggeredAt 长期不更新" 静默退化检测
      // 场景: Routine 调度器因为 Race / DB migration / 运维误操作导致状态正常但 cron 不再 fire
      // 判据: */15 频率下 lastTriggeredAt 超过 90 分钟未动,强制 re-enable 一次重排 nextRunAt
      const lastFired = scheduleTrigger.lastFiredAt ? new Date(scheduleTrigger.lastFiredAt).getTime() : 0;
      const ageMin = lastFired ? (Date.now() - lastFired) / 60000 : Infinity;
      if (ageMin > 90) {
        console.log(`⚠️  Trigger enabled 但 lastFired 已 ${Math.round(ageMin)} 分钟无 fire (>90 min), 幂等 re-enable 重排 nextRunAt (心法 #50)`);
        const rePatched = await request(`/routine-triggers/${scheduleTrigger.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ enabled: true }),
        });
        scheduleTrigger = rePatched.trigger || rePatched;
        console.log(`✅ 已重排 nextRunAt = ${scheduleTrigger.nextRunAt}`);
      } else {
        console.log(`ℹ️  lastFired age = ${Math.round(ageMin)} min, 健康 (< 90 min 阈值)`);
      }
    }
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
