# Task: e2e test suite (Playwright)

## Branch
release/0.5.0

## Goal
Playwright e2e tests covering critical paths. Runs on every PR.

## Steps
1. cd ~/workspace/xaicd/coolie && git checkout -b release/0.5.0
2. Create tests/e2e/
3. Localhost:3100 dev target (PGlite dev or docker compose)
4. Tests to write:
   - auth.test.ts: sign-in, session cookie + bearer
   - voice-dispatch.test.ts: upload audio, transcription -> issue created
   - approval.test.ts: list pending -> click row -> quick approve -> echo
   - ontology.test.ts: seed sample domains -> list domains -> view graph -> inject instances
   - app-version.test.ts: GET /version.json + /ota/manifest version shape
   - security.test.ts: cookie tampering rejected, CSRF protected, rate limit
5. playwright.config.ts: headless, single worker, baseURL http://127.0.0.1:3100
6. Add pnpm test:e2e script
7. .github/workflows/e2e.yml (write but commented trigger)

## Acceptance
- pnpm install succeeds
- pnpm test:e2e — all green
- git commit "test(e2e): Playwright suite". No push.
- Output: test count + pass rate + average runtime

Stay out of server/ and clients/expo/. Tests only.
