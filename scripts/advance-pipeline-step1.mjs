import http from 'node:http';

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

  console.log('--- Step 1: Cancel obsolete issues COOA-100 and COOA-101 ---');
  for (const ident of ['COOA-100', 'COOA-101']) {
    // 1. Add comment
    const commentRes = await request('POST', `/api/issues/${ident}/comments`, {
      content: `[PM Hermes 审计与流水线归并]
该任务属于旧版快捷构建临时生成的无归属流水线任务。现已在控制面建立正式商业交付项目「社区生活服务商用中台」（ID: ${projectId}）及其标准本体域。
依据 CMMI 因果流转与渐进式研发规范，本任务正式取消，后续测试验收与发布投产工作将在正式项目的因果 WBS 阶段中受控展开。`,
    });
    console.log(`Add comment to ${ident}:`, commentRes.status);

    // 2. Update status to cancelled
    const patchRes = await request('PATCH', `/api/issues/${ident}`, {
      status: 'cancelled',
    });
    console.log(`Cancel ${ident}:`, patchRes.status, patchRes.data?.status || patchRes.data);
  }

  console.log('\n--- Step 2: Advance Project 2288f08d to Stage 2 (architecture_and_design) ---');
  const advanceRes = await request('POST', `/api/companies/${companyId}/projects/${projectId}/stage/advance`, {
    completedGate: 'gate_g1_spec',
  });
  console.log('Advance Stage Result:', advanceRes.status, advanceRes.data);

  console.log('\n--- Step 3: Query New Issues for Project ---');
  const projectIssues = await request('GET', `/api/companies/${companyId}/issues?projectId=${projectId}`);
  const items = Array.isArray(projectIssues.data) ? projectIssues.data : (projectIssues.data.items || []);
  console.log(`Total project issues now: ${items.length}`);
  for (const it of items) {
    console.log(`- [${it.identifier || it.id}] status: ${it.status}, wbs: ${it.wbsCode || it.customFields?.cmmiWbsCode}, assignee: ${it.assigneeAgentId}, title: ${it.title}`);
  }
}

main().catch(console.error);
