/**
 * Public release-notes endpoint — serves the App "What's New" screen.
 *
 * GET /api/release-notes?version=0.5.63
 *   → { version, title, content, bullets } extracted from the App CHANGELOG.
 *
 * Why server-side: the release notes used to live only inside the app bundle
 * (clients/expo/src/releaseNotes.ts), so every version bump needed hand-edited
 * copy in two extra places (App + h5) and the h5 screen drifted for months.
 * The CHANGELOG is already the maintained release record; this endpoint makes
 * it the single source of truth and lets an installed build show notes it was
 * not shipped with (wave89, 修法 C).
 *
 * Auth: intentionally public. The What's New screen renders before sign-in,
 * same trust level as /version.json. No company scoping — the CHANGELOG holds
 * no company data, only version headings and feature bullets.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";

/** One parsed CHANGELOG section: `## v0.5.63` + body until the next `## `. */
interface ChangelogSection {
  version: string;
  content: string;
  bullets: string[];
  title: string;
}

const CHANGELOG_ENV = "COOLIE_CHANGELOG_PATH";
/** Re-read at most this often; the file is small and traffic is near-zero. */
const PARSE_CACHE_TTL_MS = 30_000;

const moduleDir = dirname(fileURLToPath(import.meta.url));

/**
 * Candidate locations, first hit wins:
 * 1. explicit env override
 * 2. repo layout from this module — works from src/ (tsx) AND dist/ since both
 *    sit three levels below the repo root (server/src/routes, server/dist/routes)
 * 3. cwd = server/ (prod systemd WorkingDirectory=/opt/coolie/server)
 * 4. cwd = repo root (dev `pnpm dev`)
 */
const CHANGELOG_CANDIDATES = [
  process.env[CHANGELOG_ENV],
  resolve(moduleDir, "../../../clients/expo/CHANGELOG.md"),
  resolve(process.cwd(), "../clients/expo/CHANGELOG.md"),
  resolve(process.cwd(), "clients/expo/CHANGELOG.md"),
].filter((p): p is string => typeof p === "string" && p.length > 0);

function findChangelogPath(): string | null {
  for (const candidate of CHANGELOG_CANDIDATES) {
    try {
      readFileSync(candidate, "utf-8");
      return candidate;
    } catch {
      // try next candidate
    }
  }
  return null;
}

/** Split the CHANGELOG into `## vX.Y.Z` sections (file order = newest first). */
function parseSections(markdown: string): ChangelogSection[] {
  const sections: ChangelogSection[] = [];
  const heading = /^## v(\d+\.\d+\.\d+)\s*$/gm;
  let match: RegExpExecArray | null;
  const marks: { version: string; start: number }[] = [];
  while ((match = heading.exec(markdown)) !== null) {
    marks.push({ version: match[1], start: match.index });
  }
  for (let i = 0; i < marks.length; i++) {
    const bodyStart = markdown.indexOf("\n", marks[i].start) + 1;
    const bodyEnd = i + 1 < marks.length ? marks[i + 1].start : markdown.length;
    const content = markdown.slice(bodyStart, bodyEnd).replace(/\n+---\s*$/, "").trim();
    // Top-level bullets only: nested "  - " lines stay part of their parent.
    const bullets = content
      .split("\n")
      .filter((line) => /^- /.test(line))
      .map((line) => line.slice(2).trim())
      .filter((line) => line.length > 0);
    sections.push({
      version: marks[i].version,
      content,
      bullets,
      // First bullet is the wave summary line — the best one-line theme we have.
      title: bullets[0] ?? `v${marks[i].version}`,
    });
  }
  return sections;
}

let cache: { at: number; sections: ChangelogSection[]; path: string | null } | null = null;

function loadSections(): ChangelogSection[] {
  const now = Date.now();
  if (cache && now - cache.at < PARSE_CACHE_TTL_MS) return cache.sections;
  const path = findChangelogPath();
  const sections = path ? parseSections(readFileSync(path, "utf-8")) : [];
  cache = { at: now, sections, path };
  return sections;
}

function normalizeVersion(raw: string): string {
  return raw.trim().replace(/^v/i, "");
}

export function releaseNotesRoutes(): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const sections = loadSections();
    if (sections.length === 0) {
      res.status(503).json({ error: "Changelog unavailable" });
      return;
    }
    const requested = typeof req.query.version === "string" ? normalizeVersion(req.query.version) : "";
    // No version → newest section; unknown version → 404 so the client can
    // fall back to its bundled copy instead of showing the wrong version.
    const section = requested
      ? sections.find((s) => s.version === requested)
      : sections[0];
    if (!section) {
      res.status(404).json({ error: `No release notes for v${requested}` });
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json({
      version: section.version,
      title: section.title,
      content: section.content,
      bullets: section.bullets,
    });
  });

  return router;
}
