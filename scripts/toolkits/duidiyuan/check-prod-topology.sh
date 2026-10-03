#!/usr/bin/env bash
# [兑底渊 PRE-SRE 专属] 生产环境全链路拓扑与 5 节点健康探测
set -euo pipefail

SSH_TARGET="tc-coolie-claw"
DOMAIN="xrobinai.cn"

echo "=== [1/5] 探测网关层 (Caddy · HTTPS / TLS) ==="
HTTP_CODE=$(curl -fsS -o /dev/null -w "%{http_code}" -m 5 "https://$DOMAIN/api/health" || echo "FAIL")
echo "  HTTPS 外部健康入口: code=$HTTP_CODE (期望 200)"

echo "=== [2/5] 探测应用层 (Coolie Server · Systemd coolie) ==="
ssh -o BatchMode=yes -o ConnectTimeout=5 "$SSH_TARGET" "
  systemctl is-active coolie >/dev/null && echo '  Coolie Server: ACTIVE' || echo '  Coolie Server: INACTIVE'
  curl -s -m 3 http://127.0.0.1:3100/api/health | head -c 100; echo
" || echo "  ⚠️ 远端应用层探测失败或不可达"

echo "=== [3/5] 探测数据层 (Postgres 数据库连通性) ==="
ssh -o BatchMode=yes -o ConnectTimeout=5 "$SSH_TARGET" "
  sudo -u postgres psql coolie -tAc 'SELECT 1;' >/dev/null && echo '  PostgreSQL DB: OK (连通正常)' || echo '  PostgreSQL DB: FAIL'
" || echo "  ⚠️ 远端数据库连通探测失败"

echo "=== [4/5] 探测移动端 OTA Manifest 链路 ==="
OTA_CODE=$(curl -fsS -o /dev/null -w "%{http_code}" -m 5 "https://$DOMAIN/ota/manifest" || echo "FAIL")
echo "  OTA Manifest 入口: code=$OTA_CODE"

echo "=== [5/5] 探测版本清单元数据 (version.json) ==="
curl -fsS -m 5 "https://$DOMAIN/version.json" | head -c 120 || echo "FAIL"
echo
echo "✅ 生产拓扑巡检完成！"
