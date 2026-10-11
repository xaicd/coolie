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
  const issueG2Id = 'c6b93ccc-2995-4b88-87fe-1e1e54595369';
  const issueLldId = 'de674d5f-9421-4a9a-8dc7-e5dabdbe4817';

  console.log('--- 1. Attaching DAR Work Product to G2 Issue ---');
  const addDarWp = await request('POST', `/api/issues/${issueG2Id}/work-products`, {
    type: 'deliverable',
    provider: 'paperclip',
    title: '[DAR] 技术选型加权决策分析矩阵',
    status: 'active',
    isPrimary: false,
    summary: 'CMMI DAR-003: 社区生活服务商用中台开源基座选型加权决策报告，Yudao-Cloud 裁剪版以 4.70 分胜出。',
    metadata: {
      wbsCode: '3.1',
      cmmiPhase: '03_design',
      resourceRef: {
        kind: 'workspace_file',
        displayPath: 'docs/03_design/dar-base-selection.md',
        relativePath: 'docs/03_design/dar-base-selection.md',
      },
    },
  });
  console.log('Add DAR WP:', addDarWp.status, addDarWp.data?.id || addDarWp.data);

  console.log('\n--- 2. Attaching ERD Work Product to LLD Issue ---');
  const addErdWp = await request('POST', `/api/issues/${issueLldId}/work-products`, {
    type: 'deliverable',
    provider: 'paperclip',
    title: '[ERD] 数据库设计说明书与物理表结构 (29表)',
    status: 'active',
    isPrimary: false,
    summary: 'CMMI 详细数据模型：29 张物理表建表 SQL 与 SM4-GCM 隐私数据加密脱敏规约。',
    metadata: {
      wbsCode: '3.2',
      cmmiPhase: '03_design',
      resourceRef: {
        kind: 'workspace_file',
        displayPath: 'docs/03_design/database-design-erd.md',
        relativePath: 'docs/03_design/database-design-erd.md',
      },
    },
  });
  console.log('Add ERD WP:', addErdWp.status, addErdWp.data?.id || addErdWp.data);

  console.log('\n--- 3. Setting Issues to done ---');
  const patchG2 = await request('PATCH', `/api/issues/${issueG2Id}`, {
    status: 'done',
  });
  console.log('Patch G2 to done:', patchG2.status, patchG2.data?.status || patchG2.data);

  const patchLld = await request('PATCH', `/api/issues/${issueLldId}`, {
    status: 'done',
  });
  console.log('Patch LLD to done:', patchLld.status, patchLld.data?.status || patchLld.data);

  console.log('\n--- 4. Advance Stage 3 (implementation_and_eval via gate_g2_arch) ---');
  const advanceRes = await request('POST', `/api/companies/${companyId}/projects/${projectId}/stage/advance`, {
    completedGate: 'gate_g2_arch',
  });
  console.log('Advance Stage Result:', advanceRes.status, advanceRes.data);

  console.log('\n--- 5. Querying Project Issues List ---');
  const projectIssues = await request('GET', `/api/companies/${companyId}/issues?projectId=${projectId}`);
  const items = Array.isArray(projectIssues.data) ? projectIssues.data : (projectIssues.data.items || []);
  console.log(`Total project issues now: ${items.length}`);
  for (const it of items) {
    console.log(`- [${it.identifier || it.id}] status: ${it.status}, wbs: ${it.wbsCode || it.customFields?.cmmiWbsCode}, assignee: ${it.assigneeAgentId}, title: ${it.title}`);
  }
}

main().catch(console.error);
