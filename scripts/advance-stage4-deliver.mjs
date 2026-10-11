import http from 'node:http';
import { execSync } from 'node:child_process';

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3100,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  const companyId = 'da2e705c-c80a-411b-b2ae-e39372b1251f';
  const projectId = '2288f08d-349d-46b0-abf4-5d4d7502f79a';
  const issueG5Id = '8608ba27-5a6c-4587-b80e-3d9b85ca477b';
  const issueAuditId = 'b9faf330-5ac4-4988-94e7-6b1f3e4da152';

  console.log('--- 1. Attaching G5 Release SOP Work Product to 8608ba27 ---');
  const addG5Wp = await request('POST', `/api/issues/${issueG5Id}/work-products`, {
    type: 'deliverable',
    provider: 'paperclip',
    title: '[G5·SOP] 生产投产部署与秒级回滚标准作业程序',
    status: 'active',
    isPrimary: true,
    summary: 'CMMI G5: 不可变制品指纹矩阵 (SHA-256)、7 处版本源强一致性校验、生产级双机热备拓扑、生产投产 9 步法与 ≤60s 原子回滚预案。',
    metadata: {
      wbsCode: '7.1',
      cmmiPhase: '07_release',
      resourceRef: {
        kind: 'workspace_file',
        displayPath: 'docs/07_release/system-deployment-sop.md',
        relativePath: 'docs/07_release/system-deployment-sop.md',
      },
    },
  });
  console.log('Add G5 WP Result:', addG5Wp.status, addG5Wp.data?.id || addG5Wp.data);

  console.log('\n--- 2. Attaching CMMI Audit SPC Work Product to b9faf330 ---');
  const addAuditWp = await request('POST', `/api/issues/${issueAuditId}/work-products`, {
    type: 'deliverable',
    provider: 'paperclip',
    title: '[CMMI 5·SPC] 统计过程控制与缺陷预防 (CAR 5-Whys) 审计报告',
    status: 'active',
    isPrimary: true,
    summary: 'CMMI Level 5 QPM/CAR/OPM: 全生命周期工时度量、3σ 控制图 (UCL=+11.73%, LCL=-17.37%, Cpk=1.34)、典型缺陷 CAR-20261011-001 5-Whys 根因剖析与长效防退化固化。',
    metadata: {
      wbsCode: '6.1',
      cmmiPhase: '06_cmmi_audit',
      resourceRef: {
        kind: 'workspace_file',
        displayPath: 'docs/06_cmmi_audit/spc-control-chart.md',
        relativePath: 'docs/06_cmmi_audit/spc-control-chart.md',
      },
    },
  });
  console.log('Add Audit WP Result:', addAuditWp.status, addAuditWp.data?.id || addAuditWp.data);

  console.log('\n--- 3. Marking G5 Issue as done ---');
  const patchG5 = await request('PATCH', `/api/issues/${issueG5Id}`, {
    status: 'done',
  });
  console.log('Patch G5 to done:', patchG5.status, patchG5.data?.status || patchG5.data);

  console.log('\n--- 4. Marking CMMI Audit Issue as done ---');
  const patchAudit = await request('PATCH', `/api/issues/${issueAuditId}`, {
    status: 'done',
  });
  console.log('Patch Audit to done:', patchAudit.status, patchAudit.data?.status || patchAudit.data);

  console.log('\n--- 5. Git Commit Stage 4 Assets in Client Repo ---');
  const clientRepoPath = '/Users/mac/.paperclip/instances/default/projects/da2e705c-c80a-411b-b2ae-e39372b1251f/2288f08d-349d-46b0-abf4-5d4d7502f79a/_default';
  try {
    const gitAdd = execSync(`git -C "${clientRepoPath}" add docs/06_cmmi_audit docs/07_release`, { encoding: 'utf-8' });
    console.log('Git add:', gitAdd || 'OK');
    const gitCommit = execSync(`git -C "${clientRepoPath}" commit -m "feat(CMMI): 归档 G5 投产 SOP 与 CMMI 5 SPC 过程控制审计报告 (Stage 4 Complete)"`, { encoding: 'utf-8' });
    console.log('Git commit:', gitCommit);
  } catch (err) {
    console.log('Git commit notice:', err.message);
  }

  console.log('\n--- 6. Attempting Stage Advance to Stage 5 (sre_and_operations / gate_g5_release) ---');
  const advanceRes = await request('POST', `/api/companies/${companyId}/projects/${projectId}/stage/advance`, {
    completedGate: 'gate_g5_release',
  });
  console.log('Advance Stage Result:', advanceRes.status, advanceRes.data);

  console.log('\n--- 7. Querying Updated Project Issues List ---');
  const projectIssues = await request('GET', `/api/companies/${companyId}/issues?projectId=${projectId}`);
  const items = Array.isArray(projectIssues.data) ? projectIssues.data : (projectIssues.data.items || []);
  console.log(`Total project issues now: ${items.length}`);
  for (const it of items) {
    console.log(`- [${it.identifier || it.id}] status: ${it.status}, wbs: ${it.wbsCode || it.customFields?.cmmiWbsCode}, assignee: ${it.assigneeAgentId}, title: ${it.title}`);
  }
}

main().catch(console.error);
