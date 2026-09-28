import { and, asc, eq } from "drizzle-orm";
import { companies, companyMemberships } from "@paperclipai/db";
import type { Db } from "@paperclipai/db";

/**
 * The loopback board-concierge principal minted by `actorMiddleware` when a
 * request carries the `x-paperclip-api-key` header (see `middleware/auth.ts`).
 *
 * It is an instance-admin *board* actor, not a company member: there is no
 * `auth_users` row and no `company_memberships` row behind it. Any company-scoped
 * record that stores this id as a `responsible_user_id` is therefore permanently
 * unusable for agents — `assertCompanyAccess` intersects the responsible user's
 * memberships with the company, finds nothing, and rejects every agent request
 * with `RESPONSIBLE_USER_UNAVAILABLE` (403). The run's identity then never
 * records a disposition, so periodic recovery marks the issue `blocked` and the
 * repair path cannot fix itself. Keep the id here and import it, rather than
 * re-typing the literal in the middleware and each writer.
 */
export const PAPERCLIP_CONCIERGE_USER_ID = "paperclip-concierge";

/** Whether an id is the synthetic loopback-concierge principal. */
export function isConciergePrincipalUserId(
  userId: string | null | undefined,
): boolean {
  return typeof userId === "string" && userId.trim() === PAPERCLIP_CONCIERGE_USER_ID;
}

type Reader = Pick<Db, "select">;

function readNonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

/**
 * The company's real responsible user when no actor-specific one applies: the
 * explicit `defaultResponsibleUserId`, then the owner membership, then the
 * earliest active user membership. A company created through the normal board
 * flow always has at least the owner here, which is why it is the correct
 * replacement for the synthetic concierge id.
 */
export async function resolveCompanyDefaultResponsibleUserId(
  reader: Reader,
  companyId: string,
): Promise<string | null> {
  const company = await reader
    .select({ defaultResponsibleUserId: companies.defaultResponsibleUserId })
    .from(companies)
    .where(eq(companies.id, companyId))
    .then((rows) => rows[0] ?? null);
  const explicit = readNonEmpty(company?.defaultResponsibleUserId);
  if (explicit) return explicit;

  const memberships = await reader
    .select({
      userId: companyMemberships.principalId,
      membershipRole: companyMemberships.membershipRole,
    })
    .from(companyMemberships)
    .where(
      and(
        eq(companyMemberships.companyId, companyId),
        eq(companyMemberships.principalType, "user"),
        eq(companyMemberships.status, "active"),
      ),
    )
    .orderBy(asc(companyMemberships.createdAt), asc(companyMemberships.id));
  const owner = memberships.find((row) => row.membershipRole === "owner");
  return owner?.userId ?? memberships[0]?.userId ?? null;
}

/**
 * Resolve a company-scoped responsible user, substituting the synthetic
 * loopback-concierge principal with the company's real default user.
 *
 * Every other id is returned unchanged on purpose: run seeding deliberately
 * allows responsible users who are *not* company members (an external commenter,
 * a manual-wake caller — see `heartbeat-responsible-user-invariant.test.ts`), so
 * only the one id that can never be a member is rewritten. When the company has
 * no real member to substitute (an ownerless/dev company), the candidate is
 * returned unchanged rather than nulled, so attribution is preserved.
 */
export async function resolveCompanyScopedResponsibleUserId(
  reader: Reader,
  companyId: string,
  candidate: string | null | undefined,
): Promise<string | null> {
  const id = readNonEmpty(candidate);
  if (!id) return null;
  if (!isConciergePrincipalUserId(id)) return id;
  return (await resolveCompanyDefaultResponsibleUserId(reader, companyId)) ?? id;
}
