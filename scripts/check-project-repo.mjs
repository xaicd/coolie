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
  const p = await req('/api/projects/2288f08d-349d-46b0-abf4-5d4d7502f79a');
  console.log('Project Details:', JSON.stringify(p, null, 2));

  const workspaces = await req('/api/companies/da2e705c-c80a-411b-b2ae-e39372b1251f/workspaces');
  console.log('Company Workspaces:', JSON.stringify(workspaces, null, 2));
}

main().catch(console.error);
