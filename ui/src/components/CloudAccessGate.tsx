import { useState, type FormEvent } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { accessApi } from "@/api/access";
import { ApiError } from "@/api/client";
import { authApi } from "@/api/auth";
import { healthApi } from "@/api/health";
import { queryKeys } from "@/lib/queryKeys";
import { useSignOut } from "@/hooks/useSignOut";
import { BootstrapPendingPage } from "@/components/BootstrapPendingPage";
import { PaperclipLoading } from "@/components/AnimatedPaperclipIcon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Accepts either a raw invite code or a full invite URL pasted from an
 * administrator's message. Everything up to and including the last `/invite/`
 * segment is stripped, along with any query string, fragment, or trailing
 * slash, so both shapes land on the `/invite/:token` route the landing page
 * expects.
 */
export function inviteTokenFromInput(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "";
  const withoutFragment = trimmed.split(/[?#]/)[0] ?? "";
  const marker = "/invite/";
  const markerIndex = withoutFragment.lastIndexOf(marker);
  const candidate = markerIndex >= 0 ? withoutFragment.slice(markerIndex + marker.length) : withoutFragment;
  return candidate.replace(/\/+$/, "").trim();
}

function NoBoardAccessPage({
  onSignOut,
  isSigningOut,
}: {
  onSignOut: () => void;
  isSigningOut: boolean;
}) {
  const navigate = useNavigate();
  const [inviteInput, setInviteInput] = useState("");
  const inviteToken = inviteTokenFromInput(inviteInput);

  const handleJoin = (event: FormEvent) => {
    event.preventDefault();
    if (inviteToken.length === 0) return;
    navigate(`/invite/${encodeURIComponent(inviteToken)}`);
  };

  return (
    <div className="mx-auto max-w-xl py-10">
      <Card className="block p-6">
        <h1 className="text-xl font-semibold">No organization access</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This account is signed in, but it does not have an active organization membership or instance-admin access on
          this Coolie instance.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Join an organization with the invite link or code an admin sent you, or ask an admin to invite this email
          address.
        </p>
        <form className="mt-6 space-y-3" noValidate onSubmit={handleJoin}>
          <label htmlFor="organization-invite" className="text-xs text-muted-foreground mb-1 block">
            Organization invite link or code
          </label>
          <input
            id="organization-invite"
            name="organization-invite"
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
            value={inviteInput}
            onChange={(event) => setInviteInput(event.target.value)}
            placeholder="https://…/invite/… or invite code"
            autoComplete="off"
          />
          <Button type="submit" disabled={inviteToken.length === 0} className="w-full">
            Join organization
          </Button>
        </form>
        <div className="mt-5 text-sm text-muted-foreground">
          <button
            type="button"
            className="font-medium text-foreground underline underline-offset-2 disabled:opacity-50"
            onClick={onSignOut}
            disabled={isSigningOut}
          >
            {isSigningOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </Card>
    </div>
  );
}

export function CloudAccessGate() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => healthApi.get(),
    retry: false,
    refetchInterval: (query) => {
      const data = query.state.data as
        | { deploymentMode?: "local_trusted" | "authenticated"; bootstrapStatus?: "ready" | "bootstrap_pending" }
        | undefined;
      return data?.deploymentMode === "authenticated" && data.bootstrapStatus === "bootstrap_pending"
        ? 2000
        : false;
    },
    refetchIntervalInBackground: true,
  });

  const isAuthenticatedMode = healthQuery.data?.deploymentMode === "authenticated";
  const isBootstrapPending = isAuthenticatedMode && healthQuery.data?.bootstrapStatus === "bootstrap_pending";
  const sessionQuery = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    enabled: isAuthenticatedMode,
    retry: false,
  });

  const boardAccessQuery = useQuery({
    queryKey: queryKeys.access.currentBoardAccess,
    queryFn: () => accessApi.getCurrentBoardAccess(),
    enabled: isAuthenticatedMode && !isBootstrapPending && !!sessionQuery.data,
    retry: false,
  });
  const claimMutation = useMutation({
    mutationFn: () => accessApi.claimBootstrapAdmin(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.session });
      await queryClient.invalidateQueries({ queryKey: queryKeys.health });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.stats });
      await queryClient.invalidateQueries({ queryKey: queryKeys.access.currentBoardAccess });
    },
  });
  // Public instances need this one: with no browser claim, the pinned address is the
  // only way in, and the grant fires at sign-in — so a signed-in visitor is one
  // sign-out away from admin and has no other move. Signing out here resets the
  // session query, which brings the signed-out state below back on its own.
  const signOutMutation = useSignOut();

  if (
    healthQuery.isLoading ||
    (isAuthenticatedMode && sessionQuery.isLoading) ||
    (isAuthenticatedMode && !isBootstrapPending && !!sessionQuery.data && boardAccessQuery.isLoading)
  ) {
    return <PaperclipLoading />;
  }

  if (healthQuery.error || boardAccessQuery.error) {
    return (
      <div className="mx-auto max-w-xl py-10 text-sm text-destructive">
        {healthQuery.error instanceof Error
          ? healthQuery.error.message
          : boardAccessQuery.error instanceof Error
            ? boardAccessQuery.error.message
            : "Failed to load app state"}
      </div>
    );
  }

  if (isBootstrapPending) {
    const health = healthQuery.data;
    if (!health) {
      return <PaperclipLoading />;
    }
    const claimError = claimMutation.error instanceof ApiError
      ? { status: claimMutation.error.status, message: claimMutation.error.message }
      : claimMutation.error instanceof Error
        ? { message: claimMutation.error.message }
        : null;
    return (
      <BootstrapPendingPage
        claimAvailable={health.deploymentExposure === "private"}
        hasActiveInvite={health.bootstrapInviteActive}
        session={sessionQuery.data}
        claimState={claimMutation.isSuccess ? "success" : claimMutation.isPending ? "claiming" : "idle"}
        claimError={claimError}
        onClaim={() => claimMutation.mutate()}
        onSignOut={() => signOutMutation.mutate()}
        isSigningOut={signOutMutation.isPending}
      />
    );
  }

  if (isAuthenticatedMode && !sessionQuery.data) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/auth?next=${next}`} replace />;
  }

  if (
    isAuthenticatedMode &&
    sessionQuery.data &&
    !boardAccessQuery.data?.isInstanceAdmin &&
    (boardAccessQuery.data?.companyIds.length ?? 0) === 0
  ) {
    return (
      <NoBoardAccessPage
        onSignOut={() => signOutMutation.mutate()}
        isSigningOut={signOutMutation.isPending}
      />
    );
  }

  return <Outlet />;
}
