#!/usr/bin/env bash
# scripts/register-roles.sh [company_id]
#
# WAVE 1 stub：把 5 个 Palantir 角色名列出到 stdout，**不调 API**。
# 第二波（铁匠）将接通：POST /api/companies/<company_id>/agents × 5
# 见 docs-coolie/specs/2026-09-21-coolie-platform-company-template.md §2.2 / §4.3
set -euo pipefail

COMPANY_ID="${1:-<unset>}"
echo "register-roles: company_id=$COMPANY_ID (stub: no API call)" >&2
echo "fda core-swe pre-sre fdse ds"
