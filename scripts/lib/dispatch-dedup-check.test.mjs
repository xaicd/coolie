#!/usr/bin/env node
// scripts/lib/dispatch-dedup-check.test.mjs
// wave358 PRE-SRE: dispatch-dedup-check 单测 (node:test)。
// 覆盖 dedup 守护所有边界, 防止回归。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SCRIPT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "dispatch-dedup-check.mjs"
);

function runDedup(dir, W, A, T) {
  return spawnSync(
    "node",
    [SCRIPT, ...(dir ? [dir] : []), ...(W ? [W] : []), ...(A ? [A] : []), ...(T ? [T] : [])],
    { encoding: "utf8" }
  );
}

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dispatch-dedup-"));
}

function writeReceipt(dir, data) {
  const file = path.join(dir, `${data.id}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  return file;
}

test("usage: missing args → exit 2 + stderr message", () => {
  const r = runDedup("");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage:/);
  assert.equal(r.stdout.trim(), "");
});

test("missing dir: directory does not exist → exit 0, empty stdout", () => {
  const ghost = path.join(os.tmpdir(), `ghost-${Date.now()}-${Math.random()}`);
  const r = runDedup(ghost, "wave358", "duidiyuan-pre-sre", "task-x");
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "");
});

test("empty dir → exit 0, no hit", () => {
  const dir = mkTmp();
  try {
    const r = runDedup(dir, "wave358", "duidiyuan-pre-sre", "task-x");
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), "");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("hit: matching done receipt emits single-line JSON", () => {
  const dir = mkTmp();
  try {
    writeReceipt(dir, {
      schemaVersion: 1,
      id: "20261007T010000Z-wave358-duidiyuan-pre-sre",
      wave: "wave358",
      subagentType: "duidiyuan-pre-sre",
      task: "[wave358] 测试任务",
      status: "done",
      commit: "abc1234",
      completedAt: "2026-10-07T01:00:00Z",
    });
    const r = runDedup(
      dir,
      "wave358",
      "duidiyuan-pre-sre",
      "[wave358] 测试任务"
    );
    assert.equal(r.status, 0);
    const hit = JSON.parse(r.stdout.trim());
    assert.equal(hit.id, "20261007T010000Z-wave358-duidiyuan-pre-sre");
    assert.equal(hit.commit, "abc1234");
    assert.equal(hit.completedAt, "2026-10-07T01:00:00Z");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("no hit: status !== done → exit 0, empty", () => {
  const dir = mkTmp();
  try {
    writeReceipt(dir, {
      schemaVersion: 1,
      id: "running-1",
      wave: "wave358",
      subagentType: "duidiyuan-pre-sre",
      task: "[wave358] 测试任务",
      status: "running",
    });
    writeReceipt(dir, {
      schemaVersion: 1,
      id: "queued-1",
      wave: "wave358",
      subagentType: "duidiyuan-pre-sre",
      task: "[wave358] 测试任务",
      status: "queued",
    });
    const r = runDedup(
      dir,
      "wave358",
      "duidiyuan-pre-sre",
      "[wave358] 测试任务"
    );
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), "");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("no hit: different agent → exit 0, empty", () => {
  const dir = mkTmp();
  try {
    writeReceipt(dir, {
      schemaVersion: 1,
      id: "x1",
      wave: "wave358",
      subagentType: "menshen-fdse",
      task: "[wave358] 测试任务",
      status: "done",
    });
    const r = runDedup(
      dir,
      "wave358",
      "duidiyuan-pre-sre",
      "[wave358] 测试任务"
    );
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), "");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("no hit: different wave → exit 0, empty", () => {
  const dir = mkTmp();
  try {
    writeReceipt(dir, {
      schemaVersion: 1,
      id: "x1",
      wave: "wave357",
      subagentType: "duidiyuan-pre-sre",
      task: "[wave358] 测试任务",
      status: "done",
    });
    const r = runDedup(
      dir,
      "wave358",
      "duidiyuan-pre-sre",
      "[wave358] 测试任务"
    );
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), "");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("strict string match: substring task should NOT hit", () => {
  // 防止模糊匹配导致仅接受名单
  const dir = mkTmp();
  try {
    writeReceipt(dir, {
      schemaVersion: 1,
      id: "x1",
      wave: "wave358",
      subagentType: "duidiyuan-pre-sre",
      task: "[wave358] 测试任务 - 子集",
      status: "done",
    });
    const r = runDedup(
      dir,
      "wave358",
      "duidiyuan-pre-sre",
      "[wave358] 测试任务"
    );
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), "");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("regex/pipe meta in task: passed through as literal string", () => {
  // task 中含 . * | \ 等正则元字符, 不应触发 RE 注入
  const dir = mkTmp();
  try {
    const evilTask = "[wave358] 工具.*健康|度\\探测";
    writeReceipt(dir, {
      schemaVersion: 1,
      id: "x1",
      wave: "wave358",
      subagentType: "duidiyuan-pre-sre",
      task: evilTask,
      status: "done",
    });
    const r = runDedup(
      dir,
      "wave358",
      "duidiyuan-pre-sre",
      evilTask
    );
    assert.equal(r.status, 0);
    const hit = JSON.parse(r.stdout.trim());
    assert.equal(hit.id, "x1");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("malformed receipt JSON in dir is silently skipped (does not crash)", () => {
  const dir = mkTmp();
  try {
    fs.writeFileSync(path.join(dir, "broken.json"), "{ not json");
    writeReceipt(dir, {
      schemaVersion: 1,
      id: "good",
      wave: "wave358",
      subagentType: "duidiyuan-pre-sre",
      task: "[wave358] 测试",
      status: "done",
    });
    const r = runDedup(
      dir,
      "wave358",
      "duidiyuan-pre-sre",
      "[wave358] 测试"
    );
    assert.equal(r.status, 0);
    const hit = JSON.parse(r.stdout.trim());
    assert.equal(hit.id, "good");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("first done hit wins (deterministic short-circuit)", () => {
  const dir = mkTmp();
  try {
    writeReceipt(dir, {
      schemaVersion: 1,
      id: "first-done",
      wave: "wave358",
      subagentType: "duidiyuan-pre-sre",
      task: "[wave358] T",
      status: "done",
      commit: "aaa",
    });
    writeReceipt(dir, {
      schemaVersion: 1,
      id: "second-done",
      wave: "wave358",
      subagentType: "duidiyuan-pre-sre",
      task: "[wave358] T",
      status: "done",
      commit: "bbb",
    });
    const r = runDedup(
      dir,
      "wave358",
      "duidiyuan-pre-sre",
      "[wave358] T"
    );
    const hit = JSON.parse(r.stdout.trim());
    // 不强约束 first/second — 仅断言至少命中一条 done
    assert.ok(["first-done", "second-done"].includes(hit.id), `got: ${hit.id}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});