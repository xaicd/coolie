import { test as base, expect } from "@playwright/test";
import { readEnv, type E2EEnv } from "../src/env.js";
import { resolveRunInfo, type RunInfo } from "../src/run-info.js";
import { ApiClient } from "../src/api.js";
import { resolveBoard, type BoardContext } from "../src/board.js";
import { DataFactory } from "../src/factory.js";

export interface E2EFixtures {
  env: E2EEnv;
  runInfo: RunInfo;
  /** Cookie-authenticated API client — the "truth read-back" half. */
  api: ApiClient;
  /** Target company + agents, resolved once per test. */
  board: BoardContext;
  /** Creates marker-tagged data; auto-deletes it when the test ends. */
  factory: DataFactory;
}

export const test = base.extend<E2EFixtures>({
  env: async ({}, use) => {
    await use(readEnv());
  },
  runInfo: async ({}, use) => {
    await use(resolveRunInfo());
  },
  api: async ({ playwright, runInfo }, use) => {
    const ctx = await playwright.request.newContext({
      baseURL: runInfo.apiOrigin,
      storageState: runInfo.storageStatePath,
    });
    await use(new ApiClient(ctx, runInfo.apiOrigin));
    await ctx.dispose();
  },
  board: async ({ api, env }, use) => {
    await use(await resolveBoard(api, env));
  },
  factory: async ({ api, runInfo, board }, use) => {
    const short = runInfo.runId.replace(/[^a-z0-9]/gi, "").slice(-6);
    const factory = new DataFactory(api, board.company.id, short);
    try {
      await use(factory);
    } finally {
      // Cleanup even when the test failed: repeated runs must not accumulate.
      await factory.cleanup();
    }
  },
});

export { expect };
