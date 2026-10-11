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
  const duidiyuanId = '8a288a46-8598-4c68-b52e-545360e11929';
  const baixiaoshengId = '58bb5a96-c241-4b35-babb-1cc1771d5dd5';

  console.log('--- 1. Repair Duidiyuan (PRE-SRE) ---');
  const patchDui = await request('PATCH', `/api/agents/${duidiyuanId}`, {
    status: 'idle',
    adapterType: 'claude_local',
    adapterConfig: {
      agentCommand: '/Users/mac/workspace/xaicd/coolie/scripts/adapters/cmd-acp.sh',
    },
  });
  console.log('Patch Duidiyuan:', patchDui.status, patchDui.data?.status || patchDui.data);

  console.log('\n--- 2. Repair Baixiaosheng (DS) ---');
  const patchBai = await request('PATCH', `/api/agents/${baixiaoshengId}`, {
    status: 'idle',
    adapterType: 'claude_local',
    adapterConfig: {
      agentCommand: '/Users/mac/workspace/xaicd/coolie/scripts/adapters/cmd-acp.sh',
    },
  });
  console.log('Patch Baixiaosheng:', patchBai.status, patchBai.data?.status || patchBai.data);

  console.log('\n--- 3. Reassign Stage 4 Tasks ---');
  // 8608ba27: G5 投产发布 -> 指派给兑底渊 (PRE-SRE)
  const patchG5 = await request('PATCH', `/api/issues/8608ba27-5a6c-4587-b80e-3d9b85ca477b`, {
    assigneeAgentId: duidiyuanId,
    status: 'in_progress',
  });
  console.log('Assign G5 Task to Duidiyuan:', patchG5.status, patchG5.data?.status || patchG5.data);

  // b9faf330: SPC 审计与 5-Whys -> 指派给百晓生 (DS)
  const patchSpc = await request('PATCH', `/api/issues/b9faf330-5ac4-4988-94e7-6b1f3e4da152`, {
    assigneeAgentId: baixiaoshengId,
    status: 'in_progress',
  });
  console.log('Assign SPC Task to Baixiaosheng:', patchSpc.status, patchSpc.data?.status || patchSpc.data);
}

main().catch(console.error);
