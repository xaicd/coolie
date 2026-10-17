// scripts/__tests__/deterministic-tar.test.mjs
//
// 视觉基线包必须**可移植**且**确定性**: 同一批快照在任何机器上打两次包,
// sha256 必须一致 (校验和固定的基线 manifest 靠它), 且 macOS 自带 bsdtar
// 必须能解开。历史实现调用 GNU tar 专有旗标, 在 macOS 上直接报错 —— 这组
// 用例就是那条缺陷的回归网。

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { writeDeterministicTarGz } from "../lib/deterministic-tar.mjs";

function makeSourceTree(entries) {
  const root = mkdtempSync(join(tmpdir(), "deterministic-tar-"));
  const source = join(root, "source");
  mkdirSync(source, { recursive: true });
  for (const [path, body] of entries) {
    const absolute = join(source, path);
    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, body);
  }
  return { root, source };
}

test("同一批文件两次打包字节完全一致 (mtime/uid 不影响 sha256)", () => {
  const { root, source } = makeSourceTree([
    ["b.png", "png-b"],
    ["a.png", "png-a"],
    ["nested/c.png", Buffer.alloc(1024, 7)],
  ]);
  try {
    const first = writeDeterministicTarGz({ sourceDir: source, outFile: join(root, "one.tgz") });
    const second = writeDeterministicTarGz({ sourceDir: source, outFile: join(root, "two.tgz") });
    assert.equal(first.entryCount, 3);
    assert.equal(first.sha256, second.sha256);
    assert.ok(
      readFileSync(join(root, "one.tgz")).equals(readFileSync(join(root, "two.tgz"))),
      "两次打包应字节相同",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("产物可被系统 tar 解开 (macOS bsdtar / Linux GNU tar 均可)", () => {
  const { root, source } = makeSourceTree([
    ["one.png", "png-one"],
    ["nested/two.png", "png-two"],
  ]);
  try {
    const archive = join(root, "snapshots.tgz");
    writeDeterministicTarGz({ sourceDir: source, outFile: archive });

    const listed = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" })
      .trim()
      .split("\n")
      .sort();
    assert.deepEqual(listed, ["nested/two.png", "one.png"]);

    const dest = join(root, "extracted");
    mkdirSync(dest, { recursive: true });
    execFileSync("tar", ["-xzf", archive, "-C", dest]);
    assert.equal(readFileSync(join(dest, "nested", "two.png"), "utf8"), "png-two");
    assert.equal(readFileSync(join(dest, "one.png"), "utf8"), "png-one");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("条目按路径字节序写入 (打包顺序不受目录遍历顺序影响)", () => {
  const { root, source } = makeSourceTree([
    ["zzz.png", "z"],
    ["aaa.png", "a"],
    ["mmm/bbb.png", "b"],
  ]);
  try {
    const archive = join(root, "snapshots.tgz");
    writeDeterministicTarGz({ sourceDir: source, outFile: archive });
    const listed = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" })
      .trim()
      .split("\n");
    assert.deepEqual(listed, [...listed].sort(), `未按字节序: ${JSON.stringify(listed)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("超出 ustar 路径上限时报错, 不静默截断 (截断会撞 sha256)", () => {
  const { root, source } = makeSourceTree([["ok.png", "x"]]);
  try {
    const deep = "p".repeat(120) + "/" + "q".repeat(120) + "/deep.png";
    mkdirSync(join(source, deep, ".."), { recursive: true });
    writeFileSync(join(source, deep), "deep");
    assert.throws(
      () => writeDeterministicTarGz({ sourceDir: source, outFile: join(root, "x.tgz") }),
      /tar path too long/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("源目录不存在时明确报错", () => {
  const root = mkdtempSync(join(tmpdir(), "deterministic-tar-"));
  try {
    assert.throws(
      () =>
        writeDeterministicTarGz({ sourceDir: join(root, "missing"), outFile: join(root, "x.tgz") }),
      /not a directory/,
    );
    assert.equal(statSync(join(root, "x.tgz"), { throwIfNoEntry: false }), undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("相对路径分隔符统一为 '/' (包内条目不含平台分隔符)", () => {
  const { root, source } = makeSourceTree([["dir/leaf.png", "leaf"]]);
  try {
    const archive = join(root, "snapshots.tgz");
    writeDeterministicTarGz({ sourceDir: source, outFile: archive });
    const listed = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" }).trim();
    assert.equal(listed, "dir/leaf.png");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
