import http from 'node:http';

function req(path) {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3100' + path, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

async function main() {
  const issues = await req('/api/companies/da2e705c-c80a-411b-b2ae-e39372b1251f/issues?projectId=2288f08d-349d-46b0-abf4-5d4d7502f79a');
  const list = Array.isArray(issues) ? issues : issues.items;
  console.log('Project Issues Count:', list.length);
  for (const it of list) {
    console.log(`- [${it.identifier || it.id}] status: ${it.status}, wbs: ${it.wbsCode}, assignee: ${it.assigneeAgentId}, title: ${it.title}`);
  }
}

main().catch(console.error);
