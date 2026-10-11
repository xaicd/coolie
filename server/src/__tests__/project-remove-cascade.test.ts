import { describe, expect, it } from "vitest";
import { boardConversations, costEvents, financeEvents, issues, projects } from "@paperclipai/db";
import type { Db } from "@paperclipai/db";
import { projectService } from "../services/projects.js";

function makeRecordingDb() {
  const deletes: string[] = [];
  const label = (t: unknown): string =>
    t === costEvents ? "costEvents"
      : t === financeEvents ? "financeEvents"
        : t === boardConversations ? "boardConversations"
          : t === issues ? "issues"
            : t === projects ? "projects"
              : "other";

  const tx: any = {
    delete: (t: unknown) => {
      const name = label(t);
      deletes.push(name);
      return {
        where: () => ({
          returning: () =>
            Promise.resolve(
              name === "projects" ? [{ id: "proj-1", name: "Demo Project", companyId: "comp-1" }] : [],
            ),
          then: (resolve: any, reject: any) => Promise.resolve([]).then(resolve, reject),
        }),
      };
    },
  };

  const db: any = {
    transaction: (cb: any) => cb(tx),
  };

  return { db: db as Db, deletes };
}

describe("projectService.remove", () => {
  it("clears child rows in FK-safe order before deleting the project", async () => {
    const { db, deletes } = makeRecordingDb();
    const svc = projectService(db);

    const removed = await svc.remove("proj-1");

    expect(deletes).toEqual([
      "costEvents",
      "financeEvents",
      "boardConversations",
      "issues",
      "projects",
    ]);
    expect(removed?.id).toBe("proj-1");
    expect(removed?.urlKey).toBeTruthy();
  });

  it("returns null when the project row is absent", async () => {
    const { db } = makeRecordingDb();
    (db as any).transaction = (cb: any) =>
      cb({
        delete: () => ({
          where: () => ({
            returning: () => Promise.resolve([]),
            then: (resolve: any) => Promise.resolve([]).then(resolve),
          }),
        }),
      });
    const svc = projectService(db as Db);

    expect(await svc.remove("missing")).toBeNull();
  });
});
