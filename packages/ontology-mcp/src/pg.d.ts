/**
 * Minimal typings for the one `pg` surface this package uses.
 *
 * `@types/pg` is not a dependency of this workspace, and pulling a types package
 * in to describe two methods would be more coupling than the code it describes.
 * If this ever needs more of the client, install the real types instead of
 * growing this file.
 */
declare module "pg" {
  export class Pool {
    constructor(config?: { connectionString?: string; max?: number });
    query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
    end(): Promise<void>;
  }
}
