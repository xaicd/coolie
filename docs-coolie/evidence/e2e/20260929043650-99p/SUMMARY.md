# E2E run 20260929043650-99p

- Base URL: `(default)`
- Started: 2026-09-29T04:36:50.031Z · duration 169.4s
- Exit code: 1
- Playwright stats: 0 expected · 5 unexpected · 0 flaky · 0 skipped

## Cases

- [FAIL] p0-01-login.spec.ts › P0-1 login → organization → dashboard › signs in, selects an organization, and reaches a live dashboard
- [FAIL] p0-02-project.spec.ts › P0-2 project — create with a requirement document › uploads a docx, auto-recognizes the name, and the project shows docs + description
- [FAIL] p0-03-task.spec.ts › P0-3 task — create in a project, assign to an agent › creates a task with the project preselected, assigns an agent, and reads the assignee back
- [FAIL] p0-04-approval.spec.ts › P0-4 approval — find a pending item, approve it › approves a pending approval and both the new status and the audit trail are readable
- [FAIL] p0-05-artifact.spec.ts › P0-5 artifact — upload an attachment and open it › uploads an html artifact, lists it, and it renders (not raw source)

## Evidence

- Traces / videos / failure screenshots: `artifacts/`
- HTML report: `html-report/index.html`
- Machine results: `results.json`
- Run trail: `notes.log`

> Binary capture stays local (gitignored); only this summary and the run trail are committed.
