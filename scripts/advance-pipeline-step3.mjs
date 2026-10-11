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

  console.log('--- Advance Project 2288f08d to Stage 4 (release via gate_g4_eval) ---');
  const advanceRes = await request('POST', `/api/companies/${companyId}/projects/${projectId}/stage/advance`, {
    completedGate: 'gate_g4_eval',
  });
  console.log('Advance Stage Result:', advanceRes.status, advanceRes.data);

  console.log('\n--- Querying Project Issues List ---');
  const projectIssues = await request('GET', `/api/companies/${companyId}/issues?projectId=${projectId}`);
  const items = Array.isArray(projectIssues.data) ? projectIssues.data : (projectIssues.data.items || []);
  console.log(`Total project issues now: ${items.length}`);
  for (const it of items) {
    console.log(`- [${it.identifier || it.id}] status: ${it.status}, wbs: ${it.wbsCode}, assignee: ${it.assigneeAgentId}, title: ${it.title}`);
  }
}

main().catch(console.error);
