import { CoolieClient } from "@coolie/api-client";

const TOKEN_KEY = "coolie.authToken";

export function saveAuthToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearAuthToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}
export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Shared Coolie client for the H5 app. In dev, requests go to /api and Vite
 * proxies to the instance (see vite.config.ts). A stored bearer token (agent
 * API key) is attached; better-auth session cookies also flow via credentials.
 */
export const coolie = new CoolieClient({
  baseUrl: "",
  getAuthHeader: () => {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
});
