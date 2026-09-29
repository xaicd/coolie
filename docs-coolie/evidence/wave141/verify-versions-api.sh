#!/usr/bin/env bash
# wave141 真验: 交付物版本链 (v1/v2/v3) + 去重 + 版本回滚 + 交付产物按项目筛选.
# Runs against a LIVE local instance (local_trusted board session, no credentials).
#
#   CID=<companyId> bash docs-coolie/evidence/wave141/verify-versions-api.sh
#
# Produces: a version chain v1/v2/v3 for one logical deliverable, an
# "unchanged" reply for a byte-identical re-upload, downloadable v1 vs v3 with
# different sha256, and a project-filtered artifacts list.
set -euo pipefail
API="${API:-http://localhost:3100}"
CID="${CID:?set CID}"

json() { python3 -c "import json,sys;d=json.load(sys.stdin);print($1)"; }
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

make_html() { # $1=path  $2=marker
  printf '<!doctype html><html><head><title>Proto %s</title></head><body><h1>版本 %s</h1><p>%s</p></body></html>\n' "$2" "$2" "$2" > "$1"
}
make_html "$TMP/v1.html" "1"
make_html "$TMP/v2.html" "2"
make_html "$TMP/v3.html" "3"
cp "$TMP/v3.html" "$TMP/v3dup.html"

echo "== 0. 建项目 + 任务 =="
PID=$(curl -fsS -X POST "$API/api/companies/$CID/projects" -H 'content-type: application/json' \
  --data "{\"name\":\"wave141-verify-$(date +%s)\"}" | json 'd.get("id")')
IID=$(curl -fsS -X POST "$API/api/companies/$CID/issues" -H 'content-type: application/json' \
  --data "{\"title\":\"wave141 交付物版本验证 $(date +%s)\",\"projectId\":\"$PID\",\"status\":\"todo\",\"priority\":\"medium\"}" | json 'd.get("id")')
echo "projectId=$PID issueId=$IID"

upload() { # $1=file  -> attachmentId
  curl -fsS -X POST "$API/api/companies/$CID/issues/$IID/attachments" \
    -F "file=@$1;filename=proto.html;type=text/html" | json 'd.get("id")'
}
register() { # $1=attachmentId -> work-product json line
  curl -fsS -X POST "$API/api/issues/$IID/work-products" -H 'content-type: application/json' \
    --data "{\"type\":\"artifact\",\"provider\":\"paperclip\",\"title\":\"proto.html\",\"metadata\":{\"attachmentId\":\"$1\"}}"
}

echo "== 1. 连续上传 3 版 (同名 proto.html, 内容不同) =="
WP=""
for f in v1 v2 v3; do
  AID=$(upload "$TMP/$f.html")
  LINE=$(register "$AID")
  echo "$LINE" | python3 -c "import json,sys;d=json.load(sys.stdin);print('  %s -> v%d latest=%s group=%s' % ('$f', d['versionNumber'], d['isLatest'], d['versionGroupId']))"
  WP=$(printf '%s' "$LINE" | json 'd.get("id")')
done

echo "== 2. 版本链读回 (新->旧) =="
curl -fsS "$API/api/work-products/$WP/versions" | python3 -c '
import json,sys
d=json.load(sys.stdin)
print("  count=%d group=%s" % (len(d["versions"]), d["groupId"]))
for v in d["versions"]:
    print("  v%d latest=%s sha=%s" % (v["versionNumber"], v["isLatest"], (v["contentSha256"] or "")[:12]))
'

V1=$(curl -fsS "$API/api/work-products/$WP/versions" | json 'd["versions"][-1]["id"]')
V3PATH=$(curl -fsS "$API/api/work-products/$WP/versions" | json 'd["versions"][0]["contentPath"]')
V1PATH=$(curl -fsS "$API/api/work-products/$WP/versions" | json 'd["versions"][-1]["contentPath"]')

echo "== 3. 下载 v1 / v3 并比对 (内容必须不同) =="
curl -fsS "$API$V1PATH" -o "$TMP/down-v1.html"
curl -fsS "$API$V3PATH" -o "$TMP/down-v3.html"
S1=$(shasum -a 256 "$TMP/down-v1.html" | cut -d' ' -f1)
S3=$(shasum -a 256 "$TMP/down-v3.html" | cut -d' ' -f1)
echo "  v1 sha256=$S1"
echo "  v3 sha256=$S3"
[ "$S1" != "$S3" ] && echo "  OK: v1 != v3" || { echo "  !! v1 == v3"; exit 1; }

echo "== 4. 再上传一次与 v3 完全相同的内容 (应提示内容未变化, 不新增版本) =="
DAID=$(upload "$TMP/v3dup.html")
DUP=$(register "$DAID")
echo "$DUP" | python3 -c "import json,sys;d=json.load(sys.stdin);print('  versionUnchanged=%s newVersionNumber=%s' % (d.get('versionUnchanged'), d.get('versionNumber')))"
COUNT=$(curl -fsS "$API/api/work-products/$WP/versions" | json 'len(d["versions"])')
echo "  版本数仍为: $COUNT"

echo "== 5. 回滚到 v1 (设某版为最新, 留痕) =="
curl -fsS -X POST "$API/api/work-products/$WP/versions/$V1/activate" >/dev/null
curl -fsS "$API/api/work-products/$WP/versions" | python3 -c 'import json,sys;d=json.load(sys.stdin);print("  latest now:", [v["versionNumber"] for v in d["versions"] if v["isLatest"]][0])'
WPV3=$(curl -fsS "$API/api/work-products/$WP/versions" | json 'd["versions"][0]["id"]')
curl -fsS -X POST "$API/api/work-products/$WP/versions/$WPV3/activate" >/dev/null

echo "== 6. 交付产物按项目筛选 =="
curl -fsS "$API/api/companies/$CID/artifacts?projectId=$PID" | python3 -c '
import json,sys
d=json.load(sys.stdin)
print("  filtered count=%d" % len(d["artifacts"]))
for a in d["artifacts"]:
    print("  %s | %s | version=%s" % (a["source"], a["title"], a.get("version")))
'
echo "PID=$PID IID=$IID WP=$WP"
