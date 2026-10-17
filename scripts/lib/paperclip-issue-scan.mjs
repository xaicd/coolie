/**
 * scripts/lib/paperclip-issue-scan.mjs
 *
 * 工单全量翻页扫描 (keyset) —— PM 大盘 / 活路判定 / 队列负载 / 例行执行审计 的共用底座.
 *
 * 为什么需要它 (实测, 2026-10-18):
 *   `GET /api/companies/{cid}/issues?limit=N` 是**单页**端点, 超过 N 就静默截断,
 *   回包既不报 total 也不给 next cursor。公司当时 469 条工单, 而
 *   `scripts/hermes-heartbeat-snapshot.mjs` 用 `limit=400` 一枪打完 →
 *   漏掉 69 条, 其中 3 条是 `in_review` 等拍板 (COOA-44 / COOA-191 / COOA-278)。
 *   后果: "等拍板" 桶报 1 而实际 4, 老板的决策待办被藏掉 3 张 —— 且没有任何报错。
 *   同一份短名单还喂给了活路判定 (liveness), 于是"有活路"的结论也是基于漏掉的盘面。
 *
 * 为什么用 keyset (sortField=id&sortDir=asc&afterId) 而不是 offset:
 *   - afterId 走 `gt(issues.id, afterId)`, 翻页期间有新工单写入也不会漏页/重页;
 *     offset 会 (写入导致整体位移)。
 *   - server 侧硬校验: afterId 必须配 id 升序且 offset=0, 否则 422。
 *     参数形态在这一层固定死, 调用方没有拼错的机会。
 *
 * 本模块只做**游标逻辑**, 不做 HTTP: `loadPage(params)` 由调用方注入,
 * 这样每个脚本可以保留自己的错误语义 (快照降级成 error 字段 / 其余 fail-fast 抛错),
 * 同时共享同一套"翻到空为止 + 硬止损"的规则。
 */

/** 单页上限 —— 与 server 的 ISSUE_LIST_MAX_LIMIT (1000) 对齐, 避免被 clamp 掉。 */
export const ISSUES_PAGE_LIMIT = 1000;

/**
 * 翻页硬止损。1000 × 40 = 4 万条, 远超市公司体量;
 * 真触顶就诚实地标 `truncated: true`, 绝不假装"这就是全部"。
 */
export const ISSUES_PAGE_MAX = 40;

/** 构造一页请求参数 (固定 id 升序; afterId 为空时是第一页)。 */
export function issuePageParams({ afterId = null, pageLimit = ISSUES_PAGE_LIMIT } = {}) {
  const params = new URLSearchParams({
    limit: String(pageLimit),
    sortField: "id",
    sortDir: "asc",
  });
  if (afterId) params.set("afterId", afterId);
  return params;
}

/**
 * 翻完全部工单。
 *
 * @param {(params: URLSearchParams) => Promise<{rows: any[], ok?: boolean, error?: string|null}>} loadPage
 *        取一页。`rows` 为归一化后的数组; `ok=false` / `error` 表示该页失败。
 *        抛异常的 loadPage 也受支持 (原样冒泡, 由调用方决定要不要 fail-fast)。
 * @returns {Promise<{rows: any[], pages: number, truncated: boolean, error: string|null}>}
 */
export async function scanAllIssues({
  loadPage,
  pageLimit = ISSUES_PAGE_LIMIT,
  maxPages = ISSUES_PAGE_MAX,
} = {}) {
  if (typeof loadPage !== "function") throw new TypeError("scanAllIssues requires loadPage(params)");
  const rows = [];
  const seen = new Set();
  let pages = 0;
  let afterId = null;

  while (pages < maxPages) {
    const params = issuePageParams({ afterId, pageLimit });
    const page = await loadPage(params);
    pages += 1;

    const pageRows = Array.isArray(page) ? page : Array.isArray(page?.rows) ? page.rows : [];
    if (!Array.isArray(page) && (page?.ok === false || page?.error)) {
      return {
        rows,
        pages,
        truncated: false,
        error: page.error ?? "page load failed",
      };
    }
    if (pageRows.length === 0) {
      return { rows, pages, truncated: false, error: null };
    }

    let added = 0;
    for (const row of pageRows) {
      // 去重键优先 id, 退化到 identifier; 两者都缺的行也要收进盘面 (fixture/裁剪回包),
      // 只是不参与去重 —— 宁可多一条, 不可少一条.
      const key = row?.id ?? row?.identifier ?? null;
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      rows.push(row);
      added += 1;
    }

    if (pageRows.length < pageLimit) {
      return { rows, pages, truncated: false, error: null };
    }

    const nextAfterId = pageRows[pageRows.length - 1]?.id;
    // 游标不前进 / 整页都是旧行 = 端点退化。立刻止损, 不做无意义的循环。
    if (!nextAfterId || nextAfterId === afterId || added === 0) {
      return {
        rows,
        pages,
        truncated: true,
        error: `cursor stalled at ${nextAfterId ?? "null"}`,
      };
    }
    afterId = nextAfterId;
  }

  return { rows, pages, truncated: true, error: `page cap ${maxPages}` };
}
