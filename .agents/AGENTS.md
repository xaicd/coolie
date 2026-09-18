# About this directory

`skills/` here is **our skill library** — the shared ones, discovered automatically by
Command Code (and by other tools that implement the Agent Skills standard), which read
`.agents/skills/` as a project location. `skills/*/SKILL.md` is what makes a skill real;
a skill's own `name` must match its directory name.

## The trap worth knowing before adding a file here

The repo's `.gitignore` contains `/.agents/`, so this directory is **ignored** — yet
every file in it is **tracked** (43 at the time of writing). Those two facts together
mean:

- a **new** file added here is silently invisible to git. `git status` will not list it,
  and it will not be in a commit unless you force it:

  ```sh
  git add -f .agents/skills/<name>/SKILL.md
  ```

- a **new clone** only has the tracked files, so something that is not force-added
  exists on one machine only.

Nothing is currently untracked under `.agents/`, so the ignore rule blocks no local
junk today. It only swallows new shared files — which is why this note exists rather
than a rule at the top of each file. If the intent of that ignore line was "keep my
personal agent library out of the repo", say so and this note changes; until then, add
skills with `-f`.

## Where the fork's own conventions live

- `../docs-coolie/BRANCHING.md` — branches, push discipline, upstream sync, conflicts.
- `../docs-coolie/TERMINOLOGY.md` — the names we use (**company**, not tenant).
- `../docs-coolie/FORK-SURFACE-AUDIT.md` — how far this fork diverges from upstream.
- `skills/fork-sync/SKILL.md` — the sync/conflict playbook, as a skill.
