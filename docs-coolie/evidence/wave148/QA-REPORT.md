# wave148 QA report — 工坊多对话 (multi-conversation)

Date: 2026-09-29
Author: CommandCodeBot (wave148)
Boss input: 「工坊对话要支持新建对话, 不能老在一个中对话」(2026-09-29 23:xx 实机)

---

## 1. What shipped (code)

Before this wave a company had exactly **one** workshop thread: every board-chat
turn was persisted onto a single standing `Board Operations` issue, so several
unrelated topics shared one history and one prompt context.

After wave148 a conversation is a first-class row; each one owns its own issue
(and therefore its own comment stream / prompt history):

| Layer | Change |
|---|---|
| `packages/db` | New table `board_conversations` (`id, company_id, project_id?, issue_id?, title, created_by_user_id, last_message_at, archived_at?, created_at`). Hand-written migration `9009_add_board_conversations.sql` **backfills each company's existing `Board Operations` issue into one conversation titled "Board Operations"**, so no history is lost. |
| `packages/db` (drive-by) | Added `9009_snapshot.json`. This also repairs a **pre-existing** failure: wave147 committed `9008` without a snapshot, so `migration-snapshot-drift.test.ts` was throwing `ENOENT` on `9008_snapshot.json`. The new snapshot absorbs 9006/9007/9008 and the drift test now passes. |
| `packages/shared` | `BoardConversation` type + `createBoardConversationSchema` / `updateBoardConversationSchema`. |
| `server` | `ensureBoardConversationIssue` (one issue per conversation), `resolveOrCreateDefaultConversation` (newest active, or adopt the existing Board Operations issue, or create the default), a shared feature/deployment gate, and REST: `GET/POST /api/companies/:cid/board/conversations`, `GET/PATCH/DELETE .../:conversationId` (DELETE = soft delete via `archived_at`). `POST /board/chat/stream` and `POST /board/chat/issue` now accept `conversationId`; `start`/`done` SSE events echo it back. |
| `clients/api-client` | `list/create/update/deleteBoardConversation`, `resolveBoardConversation`, and `conversationId` threaded through `streamBoardChat` / `getBoardChatHistory` / `ensureBoardIssue`. |
| `clients/expo` (App) | Header now has ☰ (conversation list) + ＋ (new conversation). Bottom-sheet list with switch / rename / archive, active-row highlight, and a new/rename editor with an optional project picker. History and every turn are scoped to the active conversation. |
| `ui` (Web) | The two previously-dead header buttons (`History`, `MessageSquarePlus`) are wired to a conversation side sheet (switch / rename / archive) and a new-conversation form (title + optional project). The stream now sends `conversationId`. |

`clients/h5` was **not** updated for conversation switching. It keeps working
because `getBoardChatHistory`/`streamBoardChat` resolve the newest active
conversation when no id is passed. Left as a follow-up.

## 2. Verification (real evidence)

Environment: local dev server on `http://localhost:3100` (tsx watch; hot-reloaded
with the changes), `enableConferenceRoomChat` enabled on this local instance via
`PATCH /api/instance/settings/experimental` (local test env; prod is
operator-configured).

### 2.1 Live API smoke (curl)

```
GET  /api/companies/<cid>/board/conversations                -> 200 []
POST /api/companies/<cid>/board/conversations {"title":...}  -> 201 {id, issueId:<uuid>, ...}
PATCH .../<conv> {"title":"..."}                             -> 200 (renamed)
GET   .../<conv>                                             -> 200
DELETE .../<conv>                                            -> 200 {ok:true}
GET   .../board/conversations                                -> 200 []          (archived hidden)
GET   .../board/conversations?includeArchived=1              -> 200 [archived row]
GET   /api/companies/<other>/board/conversations/<conv>      -> 404 (cross-tenant, same as missing)
POST /api/board/chat/issue {companyId}                       -> {issueId, conversationId}   (default "Board Operations")
POST /api/board/chat/issue {companyId, conversationId}       -> {issueId:<different>, conversationId}
POST /api/board/chat/stream {conversationId, message}        -> SSE:
   data: {"type":"start","issueId":"8877...","conversationId":"2b46..."}
   data: {"type":"chunk","text":"我是 ... 董事长助理,在岗。"}
   data: {"type":"done","issueId":"8877...","conversationId":"2b46...","exitCode":0,"timedOut":false}
GET  /api/issues/<conv2-issue>/comments                      -> the user turn landed on conv2's OWN issue
```

The last two lines are the point of the wave: the turn persisted to the
selected conversation's issue, not the shared one.

### 2.2 Tests

- `server` board-chat suites (updated for the new contract + a table-aware fake
  drizzle client): **25 passed**.
  `board-chat-issue-route` / `board-chat-route-feature-flag` / `board-chat-clear-conversation`.
- `packages/db` + `packages/shared` via the stable runner env (realpath TMPDIR,
  `DATABASE_URL` unset): **125 files / 967 tests passed**.
  This includes `migration-snapshot-drift.test.ts`, previously failing.

### 2.3 Typecheck & gates

- `@paperclipai/shared`, `@paperclipai/db`, `@paperclipai/server`,
  `@paperclipai/ui`, `clients/api-client`, `@coolie/h5`, `clients/expo`:
  **all `tsc --noEmit` clean** (exit 0).
- `pnpm check:token-gates`: **CLEAN** (1076 files scanned, all four gates clean).
- `pnpm test:fork-surface` (cumulative): **FAIL — 9 files over budget, all
  pre-existing and untouched by wave148.** wave148's own six declared files and
  four raised budgets are inside budget. The 9 are:
  `packages/shared/src/constants.ts` (112/60),
  `server/src/routes/projects.ts` (365/340),
  `ui/src/api/projects.ts` (92/90),
  `server/src/services/project-document-enrichment.ts` (469/320),
  `server/src/services/project-document-enrichment.test.ts` (233/120),
  `packages/db/src/schema/issues.ts` (23/20),
  `packages/shared/src/types/project.ts` (47/30),
  `packages/shared/src/validators/issue.ts` (63/60),
  `server/src/services/issues.ts` (132/120).
  These need their own owners to raise the budgets; wave148 did not touch their
  entries.

### 2.4 Known pre-existing failures (not wave148)

- `packages/skills-catalog` `src/shipped-catalog.test.ts`: fails because
  `.agents/skills/cmmi-wbs-milestone/SKILL.md` has a 330-char description (commit
  `87751261f`, wave140). File is unmodified by this wave.
- `packages/db` `src/runtime-config.test.ts`: fails only when `DATABASE_URL` is
  exported in the environment (it then resolves to `postgres` instead of the
  embedded fallback). Env artifact of the local shell, not the code.

## 3. Boss's three decisions (门神)

**A) Screenshot / "None" adapter — no action.** Boss confirmed prod adapter config
is correct (`hermes_local` / `claude_local`); the display field is `adapterType`
and the earlier "None" reading was a PM misread, not a display bug. Not
investigated further, per instruction.

**B) Ship 0.5.98 — ATTEMPTED, BLOCKED.** The App release (`scripts/release-app.sh
0.5.98`) aborts at `[1/9] 前置检查` because another agent has uncommitted tracked
changes under `clients/expo`:

```
clients/expo 下有未提交的改动，先处理干净再发版:
 M clients/expo/App.tsx
 M clients/expo/app.json
 M clients/expo/src/AppVersion.ts
 M clients/expo/src/screens/PrototypeSandboxScreen.tsx
```

These are **not wave148's** (they look like an in-flight iOS-release wave:
AppVersion + an iOS install card). The release script deliberately refuses to
build an artifact that maps to no commit, and this wave's discipline forbids
committing another owner's uncommitted work. wave144's fix (`078923ead`) and all
of wave148 are already committed on `main`, so once the tree is clean the release
is a single command:

```
bash scripts/release-app.sh 0.5.98 "wave144 工坊对话修复 + wave148 工坊多对话(新建/切换/重命名/归档)"
```

That drives gradle → COS → `version.json` → OTA android → `deploy-tc-coolie-claw.sh`
(the server carry is what delivers the multi-conversation endpoints to prod).
The coolie service restart is the one the boss authorised for this release.

**C) Public download URL — no action.** Confirmed not fixed this wave. Root cause
is the missing presign endpoint (a new, security-sensitive feature). The
client-side mitigation (disable + no fallback) from wave146-v3 stands; the
manual-open empty state is the fallback. Left as a wave150 todo.

## 4. Discipline / notes

- Did not touch `PAPERCLIP_API_KEY` / `DEPLOYMENT_MODE`.
- Did not commit other agents' in-flight work. A concurrent agent's `git commit`
  briefly swept wave148's staged files into its commit (`986377c64`); it then
  reset, and wave148 was re-committed cleanly as `32b8027f9` using an explicit
  git pathspec so only wave148's 20 files are included.
- `enableConferenceRoomChat` was enabled on the **local** dev instance to test;
  prod's value is operator-owned and unchanged.
- Assumption: the "App" in the task means `clients/expo` (the APK the boss
  installs). `clients/h5` is left on the default-conversation path (works, no
  switching UI yet).
