# Coolie Workshop Construction Backlog

This document tracks the outstanding construction and improvement tasks for the local Coolie development workshop.  It is the single source of truth for any pending work that should be visible to the whole team.

## High‑Priority
- [ ] **Dual‑MCP demo script** – Create `scripts/dual-mcp-demo.sh` that shows switching between dev and prod MCP endpoints.
- [ ] **CI validation for MCP docs** – Add a CI step that checks `doc/DEVELOPING.md` contains the "Dual MCP" section and that the `PAPERCLIP_MCP` environment variable usage is up‑to‑date.
- [ ] **Standard TODO file creation** – Ensure this `WORKSHOP_TODO.md` exists and is referenced from the main dev guide.

## Medium‑Priority
- [ ] **Link from DEVELOPING.md** – Add a reference to this backlog at the end of `doc/DEVELOPING.md` so new contributors can locate it.
- [ ] **Digital employee init docs** – Document how to add new digital employees via `scripts/coolie-local-dev.sh init-team`.
- [ ] **Automated backlog artifact** – Set up a Paperclip artifact upload (via `skills/paperclip/scripts/paperclip-upload-artifact.sh`) that publishes the current backlog to the Paperclip UI after each dev run.

## Low‑Priority / Future Ideas
- [ ] **Backlog dashboard** – Build a tiny UI page in `ui/` that displays the markdown backlog.
- [ ] **Backlog migration to issue tracker** – Sync high‑priority items to a dedicated Paperclip issue board.
- [ ] **Backlog review SOP** – Define a quarterly review process and add it to `doc/DEVELOPING.md`.

*All items are scoped to the Coolie workshop and should be managed via PRs that edit this file.*
