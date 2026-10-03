// In-file corpse scanner — component-level AST reachability for ui/src .tsx files.
// Finds TOP-LEVEL non-exported const/function/class declarations that are never
// referenced outside their own declaration span (covers the OrgTreeNode class of
// dead code that file-level orphan scans structurally miss).
// Parser: @babel/parser (repo root ships TS7 native, which exposes no compiler API).
// Run: node_modules/.bin/tsx docs-coolie/audits/in-file-corpse-scan.ts [rootDir]
import { parse } from '@babel/parser';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.argv[2] || '/Users/mac/workspace/xaicd/coolie/ui/src';

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && e.name.endsWith('.tsx') && !e.name.includes('.test.') && !e.name.includes('.stories.'))
      out.push(p);
  }
  return out;
}

interface Finding {
  rel: string; name: string; kind: string; line: number; endLine: number;
  mode: 'zero-refs' | 'self-recursive'; grepTotal: number; grepInDecl: number;
}

const corpses: Finding[] = [];
let scanned = 0, parseFailed = 0;

for (const file of walk(ROOT).sort()) {
  scanned++;
  const text = fs.readFileSync(file, 'utf8');
  let program;
  try {
    program = parse(text, { sourceType: 'module', plugins: ['typescript', 'jsx'] }).program;
  } catch { parseFailed++; continue; }

  // 1. top-level declarations + export-ness
  interface Decl { name: string; kind: string; nameStart: number; span: [number, number] }
  const decls: Decl[] = [];
  const exported = new Set<string>();

  const collectFrom = (node: any, isExport: boolean) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'VariableDeclaration') {
      for (const dcl of node.declarations)
        if (dcl.id.type === 'Identifier') {
          decls.push({ name: dcl.id.name, kind: 'const', nameStart: dcl.id.start, span: [node.start, node.end] });
          if (isExport) exported.add(dcl.id.name);
        }
    } else if ((node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') && node.id) {
      decls.push({ name: node.id.name, kind: node.type === 'FunctionDeclaration' ? 'function' : 'class', nameStart: node.id.start, span: [node.start, node.end] });
      if (isExport) exported.add(node.id.name);
    }
  };

  for (const st of program.body) {
    if (st.type === 'ExportNamedDeclaration') {
      collectFrom(st.declaration, true);
      for (const sp of st.specifiers || []) exported.add(sp.local.name);
    } else if (st.type === 'ExportDefaultDeclaration') {
      if (st.declaration?.type === 'Identifier') exported.add(st.declaration.name);
      collectFrom(st.declaration, true);
    } else collectFrom(st, false);
  }

  // 2. single pass: all Identifier/JSXIdentifier occurrences
  const ids: { name: string; start: number; end: number }[] = [];
  const visit = (node: any): void => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'Identifier' || node.type === 'JSXIdentifier') ids.push({ name: node.name, start: node.start, end: node.end });
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments' || k === 'extra' || k === 'innerComments' || k === 'range') continue;
      const v = (node as any)[k];
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === 'object' && typeof v.type === 'string') visit(v);
    }
  };
  visit(program);

  for (const d of decls) {
    if (exported.has(d.name)) continue;
    const inDecl = (s: number, e: number) => s >= d.span[0] && e <= d.span[1];
    const refs = ids.filter(i => i.name === d.name && i.start !== d.nameStart && !inDecl(i.start, i.end));
    if (refs.length === 0 || refs.every(r => inDecl(r.start, r.end))) {
      const grepTotal = (text.match(new RegExp(`\\b${d.name}\\b`, 'g')) || []).length;
      const declText = text.slice(d.span[0], d.span[1]);
      const grepInDecl = (declText.match(new RegExp(`\\b${d.name}\\b`, 'g')) || []).length;
      const lineOf = (pos: number) => text.slice(0, pos).split('\n').length;
      corpses.push({
        rel: path.relative(ROOT, file), name: d.name, kind: d.kind,
        line: lineOf(d.span[0]), endLine: lineOf(d.span[1]),
        mode: refs.length === 0 ? 'zero-refs' : 'self-recursive',
        grepTotal, grepInDecl,
      });
    }
  }
}

const confirmed = corpses.filter(c => c.grepTotal === c.grepInDecl);
const suspect = corpses.filter(c => c.grepTotal !== c.grepInDecl);
const lineCount = (f: Finding) => f.endLine - f.line + 1;

console.log(`# scanned ${scanned} .tsx files under ${ROOT} (parse-failed: ${parseFailed})`);
console.log(`# corpses: ${confirmed.length} confirmed, ${suspect.length} suspect (string/shadow refs)`);
let total = 0;
for (const c of confirmed.sort((a, b) => lineCount(b) - lineCount(a))) {
  total += lineCount(c);
  console.log(`CORPSE ${c.rel}:${c.line}-${c.endLine} (${lineCount(c)} lines) ${c.kind} ${c.name} [${c.mode}] grep=${c.grepTotal}`);
}
for (const c of suspect.sort((a, b) => lineCount(b) - lineCount(a))) {
  console.log(`SUSPECT ${c.rel}:${c.line}-${c.endLine} (${lineCount(c)} lines) ${c.kind} ${c.name} [${c.mode}] grepTotal=${c.grepTotal} grepInDecl=${c.grepInDecl}`);
}
console.log(`# confirmed total dead lines: ~${total}`);
