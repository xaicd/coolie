/**
 * Which Coolie instance this build talks to.
 *
 * Pure and dependency-free on purpose: the decision is the thing that has to be
 * right (a wrong target is how a valid production key came back 401), so it
 * lives on its own — no React Native imports — and can be exercised directly
 * rather than only through the client that consumes it.
 *
 * `EXPO_PUBLIC_COOLIE_BASE_URL` overrides the base URL per build (Expo inlines
 * `EXPO_PUBLIC_*` at bundle time), so one build can point at a customer's
 * private instance instead of ours.
 *
 * The default is the live HTTPS instance, so an installed build works out of the
 * box for anyone with an account on it. Local development points elsewhere:
 *
 *   EXPO_PUBLIC_COOLIE_BASE_URL=http://192.168.3.85:3100 npx expo run:ios --device
 *
 * The accesses below MUST stay plain `process.env.EXPO_PUBLIC_*` member
 * expressions. babel-preset-expo inlines only that exact form; an optional chain
 * (`process?.env?.X`) compiles to an OptionalMemberExpression the inliner does
 * not match, so the value stayed a runtime lookup that resolves to undefined in
 * a release build. Every installed APK then silently fell back to the default
 * and could not reach the instance at all (measured on a 0.5.6 APK: requests to
 * 127.0.0.1 died with "Network request failed"). The `typeof` guard keeps it
 * safe in a host without a `process` global, and being a ternary does not stop
 * the inliner from matching the member expression.
 */
declare const process: { env?: Record<string, string | undefined> } | undefined;

const inlinedBaseUrl =
  typeof process !== "undefined" && process.env
    ? process.env.EXPO_PUBLIC_COOLIE_BASE_URL
    : undefined;

const inlinedUseDevInstance =
  typeof process !== "undefined" && process.env
    ? process.env.EXPO_PUBLIC_COOLIE_USE_DEV_INSTANCE
    : undefined;

const inlinedDevBaseUrl =
  typeof process !== "undefined" && process.env
    ? process.env.EXPO_PUBLIC_COOLIE_DEV_BASE_URL
    : undefined;

/** The live production instance. Default target, unchanged. */
export const PROD_INSTANCE_BASE_URL = "https://xrobinai.cn";

/**
 * The local dev instance as seen from an Android emulator.
 *
 * `10.0.2.2` is the Android emulator's alias for the host's `127.0.0.1`, so a
 * dev server on `localhost:3100` is reachable from the emulator at this address
 * (an emulator cannot reach the host's loopback directly). An iOS simulator
 * shares the host network and would use `http://localhost:3100` instead — set
 * `EXPO_PUBLIC_COOLIE_DEV_BASE_URL` to override this default.
 *
 * The two instances are distinct deployments with distinct board API keys, so a
 * key accepted by one is 401 against the other. That is why the target has to
 * be explicit: an emulator build that silently reached the dev instance is
 * exactly how a valid prod key came back 401.
 */
export const DEV_INSTANCE_BASE_URL = "http://10.0.2.2:3100";

/**
 * Which instance this build talks to. Precedence:
 *
 *   1. `EXPO_PUBLIC_COOLIE_BASE_URL` — explicit full override, inlined at build.
 *   2. `EXPO_PUBLIC_COOLIE_USE_DEV_INSTANCE=1` — the local dev instance
 *      (`EXPO_PUBLIC_COOLIE_DEV_BASE_URL` overrides its address).
 *   3. production — the unchanged default.
 */
export function detectApiBaseUrl(): string {
  if (inlinedBaseUrl) return inlinedBaseUrl;
  if (inlinedUseDevInstance === "1" || inlinedUseDevInstance === "true") {
    return inlinedDevBaseUrl ?? DEV_INSTANCE_BASE_URL;
  }
  return PROD_INSTANCE_BASE_URL;
}

/**
 * Origin (scheme://host[:port]) of a base URL, or undefined if unparseable.
 *
 * Parsed with a regex, not `URL`: React Native's `URL` is a partial polyfill and
 * this runs at import time, where a throw would take the whole app down.
 */
export function originOf(baseUrl: string): string | undefined {
  return /^(https?:\/\/[^/]+)/i.exec(baseUrl)?.[1];
}

export const COOLIE_BASE_URL = detectApiBaseUrl();

/**
 * The origin this native client declares on every request.
 *
 * A native app sends no `Origin` header, and the host then refuses
 * cookie-authenticated mutations ("Board mutation requires trusted browser
 * origin", measured 403) — even though the same request succeeds with a bearer
 * credential. Declaring the instance's own origin is the same-origin evidence
 * the guard asks for, and it is derived from the target rather than configured,
 * so it cannot drift from where requests actually go.
 */
export const COOLIE_ORIGIN = originOf(COOLIE_BASE_URL);
