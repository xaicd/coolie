import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import { readCockpit, upsertNoteSql, type Queryable } from "./cockpit.js";

/**
 * The ops console worker: one instance-wide read, one company-scoped write.
 *
 * The read is instance-wide by design, and it is guarded by refusing to run in
 * the one situation where the host would have gated it by membership instead of
 * by admin: if a `companyId` arrives, the caller was authorised for that single
 * company, so serving every company's numbers would be a leak dressed as a
 * filter. Failing closed here means a future host change that starts injecting
 * the active company produces a loud error rather than a quiet disclosure.
 */
const plugin = definePlugin({
  async setup(ctx) {
    ctx.data.register("cockpit", async (params) => {
      const scoped = (params as { companyId?: unknown } | undefined)?.companyId;
      if (typeof scoped === "string" && scoped !== "") {
        throw new Error(
          "Refusing the instance-wide cockpit read: a companyId was supplied, which means " +
            "the host authorised this caller for one company and not for the instance.",
        );
      }
      const clients = await readCockpit(ctx.db as unknown as Queryable, ctx.db.namespace, new Date());
      return { clients, generatedAt: new Date().toISOString() };
    });

    ctx.actions.register("set-client-note", async (params) => {
      const companyId = String((params as { companyId?: unknown }).companyId ?? "");
      if (!companyId) throw new Error("companyId is required");
      const note = String((params as { note?: unknown }).note ?? "");
      await ctx.db.execute(upsertNoteSql(ctx.db.namespace), [companyId, note]);
      return { ok: true, companyId, note };
    });
  },

  async onHealth() {
    return { status: "ok", message: "Ops console worker is running" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
