#!/usr/bin/env python3
"""Inverse sweep v2: server routes with zero client callers.
Fixes over v1: (a) mount prefix bound via import-line (file stem -> local var
-> use() prefix), (b) query strings stripped on both sides.
"""
import re, os, glob, collections

ROOT = os.environ.get("REPO_ROOT", os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

app_ts = open(f"{ROOT}/server/src/app.ts").read()
prefix_by_var = {}
for line in app_ts.splitlines():
    m = re.search(r'\b(api|app)\.use\(\s*"(/[^"]*)"\s*,\s*([A-Za-z0-9_]+)', line)
    if m:
        obj, pfx, var = m.group(1), m.group(2), m.group(3)
        if obj == "api" and not pfx.startswith("/api"):
            pfx = "/api" + pfx
        prefix_by_var[var] = pfx
prefix_by_file = collections.defaultdict(set)
for m in re.finditer(r'import\s*\{([^}]*)\}\s*from\s*"\./routes/([A-Za-z0-9_-]+)\.js"', app_ts):
    for name in m.group(1).split(","):
        name = name.strip().split(" as ")[0].strip()
        if name:
            prefix_by_file[m.group(2)].add(name)

routes_dir = f"{ROOT}/server/src/routes"
file_paths = collections.defaultdict(list)
file_prefix = {}
VERB = re.compile(r'router\.(get|post|put|patch|delete)\(\s*"([^"]*)"')
CONST = re.compile(r'router\.(get|post|put|patch|delete)\(\s*([A-Z_][A-Z0-9_]*)')
const_defs = {}
for fp in glob.glob(f"{routes_dir}/*.ts"):
    fname = os.path.basename(fp)
    src = open(fp).read()
    for m in re.finditer(r'const\s+([A-Z_][A-Z0-9_]*)\s*=\s*"(/[^"]*)"', src):
        const_defs[m.group(1)] = m.group(2)
    stem = re.sub(r'\.ts$', '', fname)
    prefixes = [prefix_by_var[v] for v in prefix_by_file.get(stem, ()) if v in prefix_by_var]
    prefix = prefixes[0] if prefixes else "/api"
    file_prefix[fname] = prefix
    def mkfull(p):
        p = re.sub(r'\$\{[^}]*\}', ':P', p)
        if p.startswith("/api") or prefix == "":
            return p
        return prefix if p == "/" else prefix + p
    for m in VERB.finditer(src):
        full = mkfull(m.group(2))
        file_paths[fname].append((m.group(1).upper(), full))
    for m in CONST.finditer(src):
        if m.group(2) in const_defs:
            file_paths[fname].append((m.group(1).upper(), mkfull(const_defs[m.group(2)])))

client_sources = []
for pat in ["clients/api-client/src/**/*.ts", "clients/expo/src/**/*.ts",
            "clients/expo/src/**/*.tsx", "clients/expo/App.tsx",
            "clients/h5/src/**/*.ts", "clients/h5/src/**/*.tsx",
            "cli/src/**/*.ts", "ui/src/**/*.ts", "ui/src/**/*.tsx",
            "clients/expo-paperclip-web/**/*.tsx", "clients/expo-paperclip-web/**/*.ts"]:
    client_sources += glob.glob(f"{ROOT}/{pat}", recursive=True)
client_sources = [p for p in client_sources if "/node_modules/" not in p
                  and not p.endswith(".d.ts") and "/__tests__/" not in p
                  and ".test." not in p]

def collapse_interp(s):
    # collapse ${...} innermost-first (handles nested templates)
    prev = None
    while prev != s:
        prev = s
        s = re.sub(r'\$\{[^{}]*\}', ':P', s)
    return s

client_paths = set()
LIT = re.compile(r'"(/api/[^"`]*)"')
TPL = re.compile(r'`(/api/[^`]*)`')
for fp in client_sources:
    try:
        src = open(fp).read()
    except Exception:
        continue
    for rx in (LIT, TPL):
        for m in rx.finditer(src):
            client_paths.add(collapse_interp(m.group(1)).split("?")[0])

# ui/src/api/*.ts: relative paths through BASE="/api" wrapper (ui/src/api/client.ts).
# Harvest every /... literal there and prefix /api. Pages calling api.<verb>(...),
# harvest the first /... literal on the same call line (best effort, single-line).
UI_API = re.compile(r'[\`"\'](/[^`\"\']*)[\`"\']')
API_CALL = re.compile(r'api\.(?:get|post|patch|put|delete|request)(?:<[^>(]*>)?\(\s*[\`"\'](/[^`\"\']*)')
for fp in client_sources:
    if "/ui/src/" not in fp:
        continue
    try:
        src = open(fp).read()
    except Exception:
        continue
    if "/ui/src/api/" in fp:
        for m in UI_API.finditer(src):
            client_paths.add("/api" + collapse_interp(m.group(1)).split("?")[0])
    else:
        for m in API_CALL.finditer(src):
            client_paths.add("/api" + collapse_interp(m.group(1)).split("?")[0])

def norm(p):
    p = p.split("?")[0]
    return re.sub(r'/:[^/]+', '/:P', p).rstrip("/")

client_norm = set()
for p in client_paths:
    client_norm.add(norm(p))

def covered(full):
    n = norm(full)
    if n in client_norm:
        return True
    parts = n.split("/")
    for k in range(len(parts)-1, 1, -1):
        if parts[k] == ":P" and "/".join(parts[:k]) in client_norm:
            return True
    return False

report = {}
for fname, paths in sorted(file_paths.items()):
    hit = sum(1 for _, p in paths if covered(p))
    report[fname] = (hit, len(paths), [p for _, p in paths if not covered(p)])

total = sum(len(v) for v in file_paths.values())
total_hit = sum(v[0] for v in report.values())
print(f"server routes: {total} | client-covered: {total_hit} | orphan: {total-total_hit}")
print(f"client paths: {len(client_paths)} (normalized {len(client_norm)})")
print()
print("=== ZERO-exposure files ===")
for fname, (hit, tot, missing) in sorted(report.items()):
    if hit == 0:
        print(f"--- {fname} ({tot}) [prefix={file_prefix.get(fname,'?')}]")
        for p in missing[:15]:
            print("   ", p)
        if len(missing) > 15:
            print(f"    ... +{len(missing)-15} more")
print()
print("=== PARTIAL files: uncovered routes ===")
for fname, (hit, tot, missing) in sorted(report.items()):
    if 0 < hit < tot:
        print(f"--- {fname} ({hit}/{tot})")
        for p in missing:
            print("   ", p)
