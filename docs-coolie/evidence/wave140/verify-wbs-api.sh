#!/usr/bin/env bash
# wave140 真验: 上传《产融…技术规范书》→ 触发 WBS 草案 → 采纳 → 读主线 + 门禁联动.
# Runs against a LIVE local instance (local_trusted board session).
set -euo pipefail
API="${API:-http://localhost:3100}"
CID="${CID:?set CID}"
DOC="${DOC:-docs-coolie/evidence/wave140/产融智能体应用系统技术规范书.txt}"
COOKIES="${COOKIES:-cookies.txt}"
C=(-b "$COOKIES" -H "Origin: $API")

json() { python3 -c "import json,sys;d=json.load(sys.stdin);print($1)"; }
dump_draft() { python3 -c '
import json,sys
d=json.load(sys.stdin)
print("  来源:", d["source"], "| 节点数:", len(d["items"]), "| 目标:", d["goalTitles"])
for it in d["items"]:
    mark = "★里程碑" if it["isMilestone"] else ("阶段" if it["type"]=="phase" else "工作包")
    gate = (it["milestone"] or {}).get("gate") or ""
    print("  %4s %s %s  %s" % (it["code"], mark, it["title"], gate))
'; }
dump_mainline() { python3 -c '
import json,sys
d=json.load(sys.stdin); m=d["mainline"]
print("  主线: 门禁 %d/%d 已达成; 当前阶段 index=%s" % (m["achievedGates"],m["totalGates"],m["currentPhaseIndex"]))
for p in m["phases"]:
    ms=p["milestone"]; st=ms["status"] if ms else "未采纳"
    print("  %d %-8s gate=%-16s 里程碑=%s" % (p["index"]+1,p["name"],(p["gate"] or "-"),st))
blocked=[(k,v) for k,v in d["gateStates"].items() if v["blocked"]]
print("  受阻任务数:", len(blocked))
for k,v in blocked[:6]: print("    -", v["reason"])
'; }

echo "== 1. 建项目 =="
NAME="产融智能体应用系统集成服务项目 $(date +%s)"
PID=$(curl -fsS "${C[@]}" -X POST "$API/api/companies/$CID/projects" \
  -H 'content-type: application/json' --data "{\"name\":\"$NAME\"}" | json 'd.get("id") or d.get("project",{}).get("id")')
echo "projectId=$PID  name=$NAME"

echo "== 2. 上传需求文档 (触发异步 enrichment) =="
curl -fsS "${C[@]}" -X POST "$API/api/companies/$CID/projects/$PID/documents" \
  -F "file=@$DOC;type=text/plain" >/dev/null && echo "  uploaded"

echo "== 3. 轮询 WBS 草案 (最多 ~20s) =="
DRAFT=""
for _ in $(seq 1 20); do
  BODY=$(curl -fsS "${C[@]}" "$API/api/companies/$CID/projects/$PID/wbs")
  DRAFT=$(printf '%s' "$BODY" | json 'json.dumps(d.get("draft"))')
  [ "$DRAFT" != "null" ] && break || true
  sleep 1
done
if [ "$DRAFT" = "null" ]; then echo "!! 草案未生成"; exit 1; fi
printf '%s' "$DRAFT" | dump_draft

echo "== 4. 一键采纳 =="
curl -fsS "${C[@]}" -X POST "$API/api/companies/$CID/projects/$PID/wbs/adopt" | json '"created=%d milestones=%d" % (d["itemCount"], len(d["milestoneIssueIds"]))'

echo "== 5. 读主线 + 门禁联动 =="
curl -fsS "${C[@]}" "$API/api/companies/$CID/projects/$PID/wbs" | dump_mainline
echo "PID=$PID"
