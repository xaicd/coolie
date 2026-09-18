import { eq } from "drizzle-orm";
import { authUsers, type Db } from "@paperclipai/db";
import { claimFirstInstanceAdmin } from "./first-admin-claim.js";
import { logger } from "./middleware/logger.js";

export type BootstrapAdminClaimOutcome =
  | "claimed"
  | "already_claimed"
  | "not_configured"
  | "email_mismatch"
  | "not_authenticated_mode";

export function normalizeBootstrapAdminEmail(raw: string | null | undefined): string | undefined {
  const normalized = raw?.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

export function matchesBootstrapAdminEmail(
  configuredEmail: string | null | undefined,
  candidateEmail: string | null | undefined,
): boolean {
  const configured = normalizeBootstrapAdminEmail(configuredEmail);
  const candidate = normalizeBootstrapAdminEmail(candidateEmail);
  return Boolean(configured && candidate && configured === candidate);
}

export async function readAuthUserEmail(db: Db, userId: string): Promise<string | null> {
  const row = await db
    .select({ email: authUsers.email })
    .from(authUsers)
    .where(eq(authUsers.id, userId))
    .then((rows) => rows[0] ?? null);
  return row?.email ?? null;
}

/**
 * Grant instance admin to the account whose email the operator pinned with
 * PAPERCLIP_BOOTSTRAP_ADMIN_EMAIL, and only while the instance still has no
 * admin at all. The count-and-insert is `claimFirstInstanceAdmin`, which takes a
 * table lock, so two concurrent first sign-ins cannot both win.
 */
export async function claimBootstrapAdminByEmail(
  db: Db,
  input: {
    configuredEmail: string | null | undefined;
    deploymentMode: string;
    userId: string;
    email: string | null | undefined;
  },
): Promise<BootstrapAdminClaimOutcome> {
  if (!normalizeBootstrapAdminEmail(input.configuredEmail)) return "not_configured";
  if (input.deploymentMode !== "authenticated") return "not_authenticated_mode";
  if (!matchesBootstrapAdminEmail(input.configuredEmail, input.email)) return "email_mismatch";

  const claimed = await claimFirstInstanceAdmin(db, { userId: input.userId });
  return claimed.status;
}

/**
 * Hook-safe form: an auth flow must not fail because this grant failed, so the
 * error is logged and swallowed. Both sign-up and sign-in call this.
 */
export async function tryClaimBootstrapAdminByEmail(
  db: Db,
  input: {
    configuredEmail: string | null | undefined;
    deploymentMode: string;
    userId: string;
    email: string | null | undefined;
  },
): Promise<void> {
  try {
    const outcome = await claimBootstrapAdminByEmail(db, input);
    if (outcome === "claimed") {
      logger.info(
        { userId: input.userId },
        "Granted first instance admin from PAPERCLIP_BOOTSTRAP_ADMIN_EMAIL",
      );
    }
  } catch (error) {
    logger.warn(
      { err: error, userId: input.userId },
      "Could not grant first instance admin from PAPERCLIP_BOOTSTRAP_ADMIN_EMAIL",
    );
  }
}
