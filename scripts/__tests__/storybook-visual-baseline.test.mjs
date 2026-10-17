import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { writeDeterministicTarGz } from "../lib/deterministic-tar.mjs";

const script = new URL("../storybook-visual-baseline.mjs", import.meta.url).pathname;

// Fixtures are packed with the same writer the script uses. Building them with
// `tar --sort=name --mtime=@0 ...` made these tests pass only where GNU tar is
// installed (Linux CI) and fail on every macOS dev box (bsdtar rejects those
// flags), while also testing a tar invocation the production path no longer
// used. Packing through the real helper keeps fixture and product identical.
function packFixture(sourceDir, archive) {
  writeDeterministicTarGz({ sourceDir, outFile: archive });
  return createHash("sha256").update(readFileSync(archive)).digest("hex");
}

test("downloads and verifies a checksum-pinned local baseline archive", () => {
  const root = mkdtempSync(join(tmpdir(), "storybook-visual-baseline-test-"));
  try {
    const source = join(root, "source");
    const cache = join(root, "cache");
    const snapshots = join(root, "snapshots");
    const manifest = join(root, "manifest.json");
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, "one.png"), "png-one");
    writeFileSync(join(source, "two.png"), "png-two");
    const archive = join(root, "snapshots.tgz");
    const sha256 = packFixture(source, archive);
    const byteSize = statSync(archive).size;
    writeFileSync(
      manifest,
      JSON.stringify(
        {
          version: 1,
          baselineId: "test-baseline",
          snapshotCount: 2,
          archive: {
            url: `file://${archive}`,
            sha256,
            byteSize,
          },
          environment: {
            browser: "chromium",
            viewport: "1200x800",
            deviceScaleFactor: 1,
            platform: "test",
          },
        },
        null,
        2,
      ),
    );

    const env = {
      ...process.env,
      STORYBOOK_VISUAL_BASELINE_MANIFEST: manifest,
      STORYBOOK_VISUAL_BASELINE_CACHE_DIR: cache,
      STORYBOOK_VISUAL_SNAPSHOT_DIR: snapshots,
    };
    const download = spawnSync(process.execPath, [script, "download"], { env, encoding: "utf8" });
    assert.equal(download.status, 0, download.stderr);
    const verify = spawnSync(process.execPath, [script, "verify"], { env, encoding: "utf8" });
    assert.equal(verify.status, 0, verify.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("verify fails closed on snapshot count mismatch", () => {
  const root = mkdtempSync(join(tmpdir(), "storybook-visual-baseline-test-"));
  try {
    const snapshots = join(root, "snapshots");
    const manifest = join(root, "manifest.json");
    mkdirSync(snapshots, { recursive: true });
    writeFileSync(join(snapshots, "one.png"), "png-one");
    const archive = join(root, "snapshots.tgz");
    const sha256 = packFixture(snapshots, archive);
    const manifestBody = {
      version: 1,
      baselineId: "test-baseline",
      snapshotCount: 1,
      archive: {
        url: `file://${archive}`,
        sha256,
        byteSize: statSync(archive).size,
      },
    };
    writeFileSync(manifest, JSON.stringify(manifestBody));
    const env = {
      ...process.env,
      STORYBOOK_VISUAL_BASELINE_MANIFEST: manifest,
      STORYBOOK_VISUAL_BASELINE_CACHE_DIR: root,
      STORYBOOK_VISUAL_SNAPSHOT_DIR: snapshots,
    };
    const download = spawnSync(process.execPath, [script, "download"], { env, encoding: "utf8" });
    assert.equal(download.status, 0, download.stderr);
    writeFileSync(manifest, JSON.stringify({ ...manifestBody, snapshotCount: 2 }));
    unlinkSync(join(snapshots, "one.png"));
    const result = spawnSync(process.execPath, [script, "verify"], { env, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /snapshot count mismatch/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

