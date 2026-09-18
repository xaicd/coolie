import { useContext } from "react";
import { QueryClient, QueryClientContext, useQuery } from "@tanstack/react-query";
import type { InstanceExperimentalSettings } from "@paperclipai/shared";
import { instanceSettingsApi } from "@/api/instanceSettings";
import { queryKeys } from "@/lib/queryKeys";

export function resolveStreamlinedUiEnabled(
  settings:
    | Pick<InstanceExperimentalSettings, "enableStreamlinedUi">
    | null
    | undefined,
): boolean {
  return settings?.enableStreamlinedUi !== false;
}

let detachedClient: QueryClient | null = null;
function getDetachedClient(): QueryClient {
  detachedClient ??= new QueryClient();
  return detachedClient;
}

/**
 * The streamlined shell is the default experience. Missing legacy values,
 * loading states, and read failures all fail open so the app never flashes or
 * falls back to the legacy shell unless an instance explicitly opts out.
 */
export function useStreamlinedUiEnabled(): { enabled: boolean; loaded: boolean } {
  const contextClient = useContext(QueryClientContext);
  const query = useQuery(
    {
      queryKey: queryKeys.instance.experimentalSettings,
      queryFn: () => instanceSettingsApi.getExperimental(),
      enabled: contextClient != null,
      // A signed-out visitor on a protected route gets 401/403 here. Without
      // this, the default retry backoff keeps `loaded` false for seconds and
      // the shell holds on a loading state; the endpoint is read-only and the
      // resolver already fails open, so one attempt is enough.
      retry: false,
    },
    contextClient ?? getDetachedClient(),
  );

  if (!contextClient) return { enabled: true, loaded: true };

  return {
    enabled: resolveStreamlinedUiEnabled(query.data),
    loaded: query.isFetched,
  };
}
