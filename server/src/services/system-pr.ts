/**
 * `system-pr` — server-side facade around `@paperclipai/adapter-git-ops/services/SystemPRManager`.
 *
 * The persistence layer is intentionally minimal for the wave 68 sync —
 * the coolie fork stores them as a JSON document on the issue under
 * `metadata.systemPr`, but a future migration will move them to a
 * dedicated table. Today `createChangeSet()` returns the manager
 * summary without writing back to the database.
 */

import { SystemPRManager, type ChangeSetTaskResult } from "@paperclipai/adapter-git-ops/services";

export interface CreateChangeSetInput {
  systemId: string;
  requirement: string;
  userId: string;
  taskResults: ChangeSetTaskResult;
}

export function systemPrService() {
  const manager = new SystemPRManager({
    async create(record) {
      // Wave 68: persistence is handled by the issue metadata; the manager
      // only needs a `find`/`list` roundtrip in subsequent calls. For
      // `create` we accept the record and store nothing in the DB yet.
      return {
        ...record,
        createdAt: new Date(),
        status: "open" as const,
        completedAt: null,
      };
    },
    async find() {
      return null;
    },
    async list() {
      return [];
    },
    async updatePrs() {
      // No-op until the dedicated `system_change_sets` table lands in wave 69.
    },
  });

  return {
    async createChangeSet(input: CreateChangeSetInput) {
      return manager.createChangeSet(input);
    },
  };
}