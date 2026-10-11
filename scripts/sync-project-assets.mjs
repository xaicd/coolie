import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

function req(urlPath) {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3100' + urlPath, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch { resolve(d); }
      });
    }).on('error', reject);
  });
}

async function main() {
  const targetBase = '/Users/mac/.paperclip/instances/default/projects/da2e705c-c80a-411b-b2ae-e39372b1251f/2288f08d-349d-46b0-abf4-5d4d7502f79a/_default';
  
  // 1. Fetch COOA-97 documents
  const docs = await req('/api/issues/COOA-97/documents');
  console.log('COOA-97 docs found:', docs.length);
  
  for (const d of docs) {
    console.log(`Doc: id=${d.id} title=${d.title} key=${d.key}`);
    const fullDoc = await req(`/api/documents/${d.id}`);
    if (fullDoc && (fullDoc.content || fullDoc.body)) {
      const content = fullDoc.content || fullDoc.body;
      const targetDir = path.join(targetBase, 'docs/02_requirements');
      fs.mkdirSync(targetDir, { recursive: true });
      const targetFile = path.join(targetDir, 'software-requirements.md');
      fs.writeFileSync(targetFile, content, 'utf8');
      console.log(`Successfully written SRS to ${targetFile} (${content.length} chars)`);
    }
  }

  // 2. Copy docs/03_design into targetBase/docs/03_design
  const sourceDesign = '/Users/mac/workspace/xaicd/coolie/docs/03_design';
  const targetDesign = path.join(targetBase, 'docs/03_design');
  fs.mkdirSync(targetDesign, { recursive: true });
  
  function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const ent of entries) {
      const srcPath = path.join(src, ent.name);
      const destPath = path.join(dest, ent.name);
      if (ent.isDirectory()) {
        copyDir(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  copyDir(sourceDesign, targetDesign);
  console.log('Successfully copied docs/03_design to', targetDesign);
}

main().catch(console.error);
