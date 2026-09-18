---
name: fork-sync
description: Sync this Paperclip fork with the upstream branch and resolve the merge conflicts safely. Use when asked to 同步官方/上游, update from upstream, merge master into main, handle fork conflicts, or when a sync produces conflicts in files upstream also owns.
when_to_use: 同步官方、同步上游、upstream sync、merge master into main、fork conflict、冲突、check-fork-surface
---

# Syncing this fork with upstream

This repo is a **public fork** of Paperclip. `main` is ours and is pushed to
`origin`. `master` is the **upstream mirror** and is reserved for syncing official
work — never commit or push to it. Full rules: `docs-coolie/BRANCHING.md`.

The conflict map (which files actually diverge, and how far) is
`docs-coolie/FORK-SURFACE-AUDIT.md`. Read it before resolving anything: **91
upstream files / 9295 lines diverge, and only 6 are registered in the budget
manifest**, so the budget gate's PASS says nothing about the rest.

## 1. Compute the conflicts before merging (read-only)

```sh
git fetch upstream                                   # one-time: git remote add upstream https://github.com/paperclipai/paperclip.git
git merge-tree --write-tree --messages main upstream/master
```

No conflicts prints a single tree hash and exits 0. This never touches the working
tree, so run it **first** — it is much cheaper than discovering conflicts after a
merge. Without an `upstream` remote, compute against the snapshot:
`git merge-tree --write-tree --messages main origin/master`.

## 2. Merge (never rebase, never `-X ours`)

```sh
git checkout main
git merge upstream/master
```

- `main` is already published, so rebasing rewrites public history — don't.
- `-X ours` silently discards upstream work — don't, except for generated files (§3.1).
- Enable `git config rerere.enabled true` before the first sync: it records each
  resolution so the same conflict resolves itself next time. This is what makes a
  repeating fork sync bearable.

## 3. Resolve by class, not case by case

| Class | Examples | Rule |
| --- | --- | --- |
| Generated / lockfile | `pnpm-lock.yaml` | **Take upstream's, then regenerate** (`pnpm install`). Never hand-merge. |
| Interleaved edits (our lines inside an upstream file) | `ui/src/plugins/slots.tsx`, `ui/src/components/Sidebar.tsx`, `server/src/routes/plugin-ui-static.ts`, `server/src/app.ts`, `ui/src/i18n/locales/*.json` | Keep upstream's logic, replay our delta. If our change is a whole block, **move it into our own file and leave one import/re-export line** — that collapses a recurring conflict into one line. |
| Files we added (upstream has none) | `scripts/check-fork-surface.mjs`, `server/src/icp-footer.ts` | Normally no conflict. Rename with a `coolie-` prefix or move under our own directory so a future same-named upstream file cannot collide. |
| Upstream renamed/moved a file we edited | — | Worst case: git reads it as "they deleted, we modified". Resolve by intent, using the `reason` recorded in `scripts/fork-surface.json` and the comment at the top of our change. |

## 4. Prove the merge is complete

```sh
node scripts/check-fork-surface.mjs --range=origin/master..main   # note: --range= takes a value
pnpm -r typecheck && pnpm test:run
```

`--range=` sees **new** upstream-owned files; `--cumulative` only checks the files
already listed in `scripts/fork-surface.json`, so it cannot tell you the upstream
surface was respected.

## 5. When you change an upstream-owned file

Every intentional change to a file upstream owns gets an entry in
`scripts/fork-surface.json` — `maxNetLines` plus a `reason` that says **why it
cannot live in our own tree**. Without the reason, the next sync resolves the
conflict by guessing. Prefer shrinking the change to a single import line.

Checklist for this skill: preflight computed · merged (not rebased) · no `-X ours`
outside generated files · `rerere` on · `--range=` clean · typecheck + tests green ·
any new upstream edit recorded with a reason.
