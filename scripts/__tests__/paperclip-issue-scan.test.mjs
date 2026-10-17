/**
 * scripts/__tests__/paperclip-issue-scan.test.mjs
 *
 * 回归基线: 单枪 `?limit=N` 静默截断 (实测 469 条工单漏 69 条, 含 3 张 in_review 等拍板)
 * 会让 PM 大盘/活路判定/负载台账/执行审计全部基于漏掉的盘面。
 * 这里把"必须翻到空为止"钉成断言, 防止哪天有人又改回一枪打完。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  ISSUES_PAGE_LIMIT,
  ISSUES_PAGE_MAX,
  issuePageParams,
  scanAllIssues,
} from "../lib/paperclip-issue-scan.mjs";

const makeRow = (i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, identifier: `COOA-${i}` });

/** 造一个 keyset 语义的假服务端: id 升序, afterId 之后取 pageLimit 条 */
function fakeServer(total, { pageLimit = 3, tamper } = {}) {
  const rows = Array.from({ length: total }, (_, i) => makeRow(i + 1));
  const calls = [];
  const loadPage = async (params) => {
    const limit = Number(params.get("limit"));
    const afterId = params.get("afterId");
    const sortField = params.get("sortField");
    const sortDir = params.get("sortDir");
    calls.push({ limit, afterId, sortField, sortDir });
    assert.equal(sortField, "id", "keyset 必须按 id 排序");
    assert.equal(sortDir, "asc", "keyset 必须升序");
    assert.equal(params.get("offset"), null, "keyset 不允许带 offset (server 会 422)");
    const start = afterId ? rows.findIndex((r) => r.id === afterId) + 1 : 0;
    let page = rows.slice(start, start + (limit || pageLimit));
    if (tamper) page = tamper(page, calls.length);
    return page;
  };
  return { calls, loadPage, rows };
}

test("issuePageParams 固定 keyset 形态 (id 升序 / 无 offset / afterId 可选)", () => {
  const first = issuePageParams();
  assert.equal(first.get("sortField"), "id");
  assert.equal(first.get("sortDir"), "asc");
  assert.equal(first.get("limit"), String(ISSUES_PAGE_LIMIT));
  assert.equal(first.get("offset"), null);
  assert.equal(first.get("afterId"), null);

  const next = issuePageParams({ afterId: "abc" });
  assert.equal(next.get("afterId"), "abc");
});

test("scanAllIssues 翻到空为止, 不漏掉超过单页上限的工单", async () => {
  // 10 条工单 / 每页 3 条 → 4 页 (3+3+3+1), 绝不能只回 3 条
  const { calls, loadPage, rows } = fakeServer(10);
  const scan = await scanAllIssues({ loadPage, pageLimit: 3 });

  assert.equal(scan.rows.length, 10, "必须取全 10 条");
  assert.deepEqual(scan.rows.map((r) => r.id), rows.map((r) => r.id), "顺序与 keyset 一致");
  assert.equal(scan.pages, 4);
  assert.equal(scan.truncated, false);
  assert.equal(scan.error, null);
  // 第一页不带 afterId, 之后每页都带上一页最后一条
  assert.equal(calls[0].afterId, null);
  assert.equal(calls[1].afterId, rows[2].id);
  assert.equal(calls[2].afterId, rows[5].id);
});

test("scanAllIssues 在整页重复行时止损而不是死循环", async () => {
  // 服务端无视 afterId 反复回同一页 —— 必须报 truncated, 不能无限翻
  const stuck = Array.from({ length: 3 }, (_, i) => makeRow(i + 1));
  let calls = 0;
  const scan = await scanAllIssues({
    loadPage: async () => {
      calls += 1;
      return stuck;
    },
    pageLimit: 3,
  });
  assert.equal(scan.truncated, true);
  assert.match(scan.error ?? "", /cursor stalled/);
  assert.equal(calls, 2, "第二页发现游标没前进就该停");
  assert.equal(scan.rows.length, 3, "已取到的行不丢");
});

test("scanAllIssues 把页错误如实上报, 不返回看起来正常的短列表", async () => {
  const scan = await scanAllIssues({
    loadPage: async () => ({ rows: [], ok: false, error: "HTTP 500" }),
  });
  assert.deepEqual(scan.rows, []);
  assert.equal(scan.error, "HTTP 500");
});

test("scanAllIssues 支持裸数组返回 (调用方自己 pick)", async () => {
  const { loadPage } = fakeServer(4);
  const scan = await scanAllIssues({ loadPage, pageLimit: 2 });
  assert.equal(scan.rows.length, 4);
  assert.equal(scan.truncated, false);
});

test("scanAllIssues 触到页上限时诚实标 truncated", async () => {
  const { loadPage } = fakeServer(100);
  const scan = await scanAllIssues({ loadPage, pageLimit: 2, maxPages: 3 });
  assert.equal(scan.pages, 3);
  assert.equal(scan.truncated, true);
  assert.match(scan.error ?? "", new RegExp(`page cap 3`));
  assert.equal(scan.rows.length, 6);
});

test("ISSUES_PAGE_MAX 是有限止损, 不是无限翻页", () => {
  assert.ok(Number.isInteger(ISSUES_PAGE_MAX) && ISSUES_PAGE_MAX > 0);
  assert.ok(ISSUES_PAGE_MAX * ISSUES_PAGE_LIMIT >= 10000, "止损容量应远超公司体量");
});
