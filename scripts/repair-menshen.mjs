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
  const menshenId = '58dc794d-ae28-47f4-9e6e-5e798ef55df2';

  console.log('--- 1. Repair Menshen adapterConfig and status ---');
  const patchAgent = await request('PATCH', `/api/agents/${menshenId}`, {
    status: 'idle',
    adapterType: 'claude_local',
    adapterConfig: {
      agentCommand: '/Users/mac/workspace/xaicd/coolie/scripts/adapters/cmd-acp.sh',
    },
  });
  console.log('Patch Menshen:', patchAgent.status, patchAgent.data?.status || patchAgent.data);

  console.log('\n--- 2. Re-assign G4 Evaluation task to Menshen ---');
  const g4TaskId = '5d7d6f5f-e210-4d66-adae-a9e2023cc2f5';
  const patchTask = await request('PATCH', `/api/issues/${g4TaskId}`, {
    assigneeAgentId: menshenId,
    status: 'in_progress',
  });
  console.log('Patch G4 Task:', patchTask.status, patchTask.data?.status || patchTask.data);
}

main().catch(console.error);
