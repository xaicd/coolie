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
  const g3IssueId = '87aa0572-f24e-4a1a-b228-8b958693044e';

  console.log('--- Completing G3 implementation issue ---');
  const patchRes = await request('PATCH', `/api/issues/${g3IssueId}`, {
    status: 'done',
  });
  console.log('Patch G3 status:', patchRes.status, patchRes.data?.status || patchRes.data);
}

main().catch(console.error);
