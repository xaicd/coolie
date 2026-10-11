import http from 'node:http';

function req(path) {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3100' + path, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch { resolve(d); }
      });
    }).on('error', reject);
  });
}

async function main() {
  for (const id of ['87aa0572-f24e-4a1a-b228-8b958693044e', '5d7d6f5f-e210-4d66-adae-a9e2023cc2f5']) {
    const issue = await req('/api/issues/' + id);
    const agent = issue.assigneeAgentId ? await req('/api/agents/' + issue.assigneeAgentId) : null;
    const wp = await req('/api/issues/' + id + '/work-products');
    console.log(`[${issue.id}] identifier=${issue.identifier} status=${issue.status} wbs=${issue.wbsCode} title=${issue.title}`);
    console.log(`  Assignee: ${agent ? agent.name + ' (' + agent.role + ') adapter=' + agent.adapterType : 'None'}`);
    console.log(`  WorkProducts:`, wp.map(w => ({ id: w.id, title: w.title, ref: w.metadata?.resourceRef })));
  }
}

main().catch(console.error);
