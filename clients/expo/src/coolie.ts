import * as SecureStore from "expo-secure-store";
import { CoolieClient, type Company } from "@coolie/api-client";

/**
 * Instance base URL. Override per build with `EXPO_PUBLIC_COOLIE_BASE_URL`
 * (Expo inlines `EXPO_PUBLIC_*` at bundle time), so a device build can point at a
 * different instance without editing code.
 *
 * The default is this machine's Tailscale address — how a phone on the tailnet
 * reaches the local dev instance — kept as the default so the skeleton works out
 * of the box.
 */
declare const process: { env?: Record<string, string | undefined> } | undefined;

export const COOLIE_BASE_URL =
  process?.env?.EXPO_PUBLIC_COOLIE_BASE_URL ?? "http://100.84.124.71:3100";

const AUTH_KEY = "coolie.authToken";

/**
 * Persist an auth token (agent API key or session bearer). SecureStore keeps it
 * in the device keychain/keystore.
 */
export async function saveAuthToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(AUTH_KEY, token);
}
export async function clearAuthToken(): Promise<void> {
  await SecureStore.deleteItemAsync(AUTH_KEY);
}
export async function getAuthToken(): Promise<string | null> {
  return SecureStore.getItemAsync(AUTH_KEY);
}

/**
 * Validate a candidate token before storing it, by making one authenticated call
 * with it. Returns the companies it can see, so sign-in can both prove the
 * credential works and warm the first screen; throws `CoolieApiError` otherwise.
 *
 * Storing first and discovering a bad key later is what the app did before, and it
 * presents as an empty task list rather than as "your key is wrong".
 */
export async function validateAuthToken(token: string): Promise<Company[]> {
  const probe = new CoolieClient({
    baseUrl: COOLIE_BASE_URL,
    getAuthHeader: () => ({ Authorization: `Bearer ${token}` }),
  });
  return probe.listCompanies();
}

/**
 * Shared Coolie client. Auth is a bearer token (agent API key recommended for
 * mobile). For better-auth session cookies, React Native keeps cookies via the
 * global fetch cookie jar; this skeleton uses the bearer path.
 */
export const coolie = new CoolieClient({
  baseUrl: COOLIE_BASE_URL,
  // Explicit return type: without it the unauth branch infers as
  // `{ Authorization?: undefined }`, which is not a `Record<string, string>`.
  getAuthHeader: async (): Promise<Record<string, string>> => {
    const token = await getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
});
