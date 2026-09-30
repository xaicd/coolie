import fs from "node:fs";
import { request } from "@playwright/test";
import { resolveRunInfo } from "./run-info.js";
import { ApiClient } from "./api.js";
import { listCompanies, type Company } from "./board.js";
import { sweepLeftovers } from "./factory.js";
import { note } from "./notes.js";

/**
 * Global teardown: sweep any marker-prefixed leftovers. Per-test fixtures
 * already delete what they create; this is the safety net for a run that was
 * interrupted (Ctrl-C, timeout, crash) before its cleanup ran.
 */
export default async function globalTeardown(): Promise<void> {
  const info = resolveRunInfo();
  if (!fs.existsSync(info.storageStatePath)) return;
  const ctx = await request.newContext({ baseURL: info.apiOrigin, storageState: info.storageStatePath });
  try {
    const api = new ApiClient(ctx, info.apiOrigin);
    let companies: Company[] = [];
    try {
      companies = await listCompanies(api);
    } catch {
      return;
    }
    const swept = await sweepLeftovers(api, companies);
    if (swept.projects + swept.issues + swept.attachments > 0) {
      note("global teardown swept leftovers", swept);
    } else {
      note("global teardown found no leftovers");
    }
  } finally {
    await ctx.dispose();
  }
}
