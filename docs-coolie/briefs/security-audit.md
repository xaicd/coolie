# Task: Security audit (read-only)

## Branch
release/0.5.0

## Goal
Identify top 5 concrete security gaps in Coolie server + Coolie App. Read-only.

## Files to scan
- server/src/middleware/auth.ts
- server/src/middleware/authz.ts
- server/src/routes/auth.ts
- server/src/routes/plugins.ts (especially /plugins/:id/install + /api/secrets/*)
- server/src/auth/better-auth.ts
- server/src/services/plugin-secrets-handler.ts
- clients/expo/src/coolie.ts
- clients/expo/App.tsx

## Steps
1. Look for:
   - missing CSRF protection on state-changing routes
   - missing or weak rate limit
   - secrets stored without rotation path
   - missing audit log for sensitive actions
   - missing CORS tightening
   - token / cookie leakage via logs
   - missing auth on routes (assertAuthenticated bypassed)
   - any /tmp scratch files with secret material
2. Rank 5 worst, write to docs-coolie/security-audit-2026-09-20.md
3. Each: exact file + line + concrete fix

## Acceptance
- docs-coolie/security-audit-2026-09-20.md exists
- git commit "docs(audit): security audit". No push.
- Output: 5 bullet summary

Do NOT change code. Audit only.
