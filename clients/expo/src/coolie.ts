import * as SecureStore from "expo-secure-store";
import { CoolieClient } from "@coolie/api-client";

/**
 * Instance base URL. Point at your Coolie instance. In a real build read this
 * from app config / env; hardcoded here for the skeleton.
 * TODO: move to expo-constants / EAS env.
 */
export const COOLIE_BASE_URL = "http://100.84.124.71:3100";

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
 * Shared Coolie client. Auth is a bearer token (agent API key recommended for
 * mobile). For better-auth session cookies, React Native keeps cookies via the
 * global fetch cookie jar; this skeleton uses the bearer path.
 */
export const coolie = new CoolieClient({
  baseUrl: COOLIE_BASE_URL,
  getAuthHeader: async () => {
    const token = await getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
});
