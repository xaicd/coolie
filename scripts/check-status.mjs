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
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('=== 1. Checking Old Pipeline Issues (COOA-96 ~ 101) ===');
  for (const ident of ['COOA-96', 'COOA-97', 'COOA-98', 'COOA-99', 'COOA-100', 'COOA-101']) {
    const issue = await request('GET', `/api/issues/${ident}`);
    if (issue && issue.id) {
      console.log(`[${ident}] id: ${issue.id}, status: ${issue.status}, assignee: ${issue.assigneeAgentId}, title: ${issue.title}`);
    } else {
      console.log(`[${ident}] Not found or error:`, issue);
    }
  }

  console.log('\n=== 2. Checking Project Details ===');
  const project = await request('GET', '/api/projects/2288f08d-349d-46b0-abf4-5d4d7502f79a');
  console.log('Project:', {
    id: project.id,
    name: project.name,
    status: project.status,
    customFields: project.customFields,
  });

  console.log('\n=== 3. Checking Project Issues ===');
  const projectIssues = await request('GET', '/api/companies/da2e705c-c80a-411b-b2ae-e39372b1251f/issues?projectId=2288f08d-349d-46b0-abf4-5d4d7502f79a');
  const items = Array.isArray(projectIssues) ? projectIssues : (projectIssues.items || []);
  console.log(`Total project issues: ${items.length}`);
  for (const it of items) {
    console.log(`- [${it.identifier || it.id}] status: ${it.status}, wbs: ${it.customFields?.cmmiWbsCode}, assignee: ${it.assigneeAgentId}, title: ${it.title}`);
  }

  console.log('\n=== 4. Checking G1 Task Documents & Work Products ===');
  const g1Docs = await request('GET', '/api/issues/68e557c5-6b06-4280-8fb7-4c593de0be0b/documents');
  console.log('G1 Docs:', g1Docs);
  const g1Wp = await request('GET', '/api/issues/68e557c5-6b06-4280-8fb7-4c593de0be0b/work-products');
  console.log('G1 Work Products:', g1Wp);
}

main().catch(console.error);
