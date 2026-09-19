import * as SecureStore from "expo-secure-store";
import {
  CoolieApiError,
  CoolieClient as BaseCoolieClient,
  type AgentIdentity,
  type Company,
  type SessionUser,
} from "@coolie/api-client";

// ── Linear 设计系统色彩令牌 (DESIGN.md 第1节) ─────────────────────────
export const C = {
  // 背景三层(亮度阶梯 = 海拔)
  bg: "#08090A", // 页面最底(marketing black)
  panel: "#0F1011", // 侧栏/面板
  surface: "#191A1B", // 卡片/浮层
  surfaceHover: "#28282C",
  // 文字四级
  ink: "#F7F8F8", // 主文字(不是纯白!)
  ink2: "#D0D6E0", // 次文字
  ink3: "#8A8F98", // 占位/元数据
  ink4: "#62666D", // 时间戳/禁用
  // 品牌色(全 App 唯一彩色,只用于 CTA/激活/选中)
  brand: "#5E6AD2", // 按钮底/品牌标记
  accent: "#7170FF", // 链接/激活态
  accentHover: "#828FFF",
  // 状态(仅状态指示)
  ok: "#27A644",
  done: "#10B981",
  warn: "#F59E0B",
  err: "#EF4444",
  // 边框(半透明白,不用实色深边)
  line: "rgba(255,255,255,0.08)",
  lineSubtle: "rgba(255,255,255,0.05)",
} as const;

/**
 * Instance base URL. Override per build with `EXPO_PUBLIC_COOLIE_BASE_URL`
 * (Expo inlines `EXPO_PUBLIC_*` at bundle time), so one build can point at a
 * customer's private instance instead of ours.
 *
 * The default is the live HTTPS instance, so an installed build works out of the
 * box for anyone with an account on it. Local development points elsewhere:
 *
 *   EXPO_PUBLIC_COOLIE_BASE_URL=http://192.168.3.85:3100 npx expo run:ios --device
 */
declare const process: { env?: Record<string, string | undefined> } | undefined;

export const COOLIE_BASE_URL =
  process?.env?.EXPO_PUBLIC_COOLIE_BASE_URL ?? "https://xrobinai.cn";

/**
 * The origin this native client declares on every request.
 *
 * A native app sends no `Origin` header, and the host then refuses
 * cookie-authenticated mutations ("Board mutation requires trusted browser
 * origin", measured 403) — even though the same request succeeds with a bearer
 * credential. Declaring the instance's own origin is the same-origin evidence
 * the guard asks for, and it is derived from the target rather than configured,
 * so it cannot drift from where requests actually go.
 *
 * Parsed with a regex, not `URL`: React Native's `URL` is a partial polyfill and
 * this runs at import time, where a throw would take the whole app down.
 */
export const COOLIE_ORIGIN = /^(https?:\/\/[^/]+)/i.exec(COOLIE_BASE_URL)?.[1];

const AUTH_KEY = "coolie.authToken";

/**
 * Persist a bearer credential (agent API key or board API key). SecureStore keeps
 * it in the device keychain/keystore. Session cookies are not stored here — the
 * platform's own cookie jar holds them.
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
 * Shared Coolie client. Auth is either a bearer token from SecureStore or the
 * session cookie the platform's own cookie jar holds after sign-in; both travel
 * in the same `Authorization`/`Cookie` headers RN already manages.
 */
/** 员工(agents)行的最小字段 */
export interface AgentRow {
  id: string;
  name: string;
  title?: string | null;
  role?: string | null;
  status: string;
  adapterType?: string | null;
}

export class CoolieClient extends BaseCoolieClient {
  /** GET /api/companies/:id/agents — 员工(智能体)列表 */
  async listAgents(companyId: string): Promise<AgentRow[]> {
    return this.request<AgentRow[]>(
      "GET",
      `/api/companies/${encodeURIComponent(companyId)}/agents`,
    );
  }
}

export const coolie = new CoolieClient({
  baseUrl: COOLIE_BASE_URL,
  originHeader: COOLIE_ORIGIN,
  // Explicit return type: without it the unauth branch infers as
  // `{ Authorization?: undefined }`, which is not a `Record<string, string>`.
  getAuthHeader: async (): Promise<Record<string, string>> => {
    const token = await getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
});

/** How we got in. Decides whether a company has to be chosen. */
export type Credential =
  | { kind: "agent"; token: string; identity: AgentIdentity }
  | { kind: "board"; token: string }
  | { kind: "session"; user: SessionUser };

function probeWith(token: string): CoolieClient {
  return new CoolieClient({
    baseUrl: COOLIE_BASE_URL,
    originHeader: COOLIE_ORIGIN,
    getAuthHeader: () => ({ Authorization: `Bearer ${token}` }),
  });
}

/**
 * Work out what a pasted bearer token is by using it, rather than by asking the
 * user to say. Both kinds arrive in the same `Authorization: Bearer` header and
 * the host prefers board keys, so `GET /api/agents/me` is the discriminator: an
 * agent key answers 200 there, a board key answers 401 ("Agent authentication
 * required") and then lists companies.
 *
 * A bad key fails both probes, which is the point — the app should say "this key
 * isn't accepted", not show an empty task list.
 */
export async function classifyToken(token: string): Promise<Credential> {
  const probe = probeWith(token);
  try {
    return { kind: "agent", token, identity: await probe.getAgentIdentity() };
  } catch (e) {
    if (!(e instanceof CoolieApiError) || e.status === 0) throw e;
  }
  try {
    await probe.listCompanies();
    return { kind: "board", token };
  } catch (e) {
    throw new Error(
      `This instance did not accept that key (${
        e instanceof CoolieApiError ? `${e.status} ${e.message}` : String(e)
      }).`,
    );
  }
}

/**
 * Sign in with email and password, returning the session user.
 *
 * Any stored bearer token is cleared first: the shared client sends both, and a
 * stale token would shadow the session cookie for every later call.
 */
export async function signInWithEmail(input: {
  email: string;
  password: string;
}): Promise<SessionUser> {
  await clearAuthToken();
  await coolie.signInEmail(input);
  const session = await coolie.getSession();
  if (!session?.user) {
    throw new Error("Signed in, but this instance returned no session for the account.");
  }
  return session.user;
}

/** The signed-in user, or null when there is no usable session. */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    return (await coolie.getSession())?.user ?? null;
  } catch {
    return null;
  }
}

/**
 * Drop both credentials: the stored bearer token, and the session server-side.
 * Signing out of only one leaves the other to sign the user back in on relaunch.
 * The server call is best-effort — a signed-out user should not be stuck on a
 * spinner because the instance is unreachable.
 */
export async function signOutEverywhere(): Promise<void> {
  await clearAuthToken();
  try {
    await coolie.signOut();
  } catch {
    // Already signed out, or offline: the local credential is gone either way.
  }
}

/**
 * Who is signed in on this launch, if anyone: a stored bearer token first (it is
 * explicit), else a session the cookie jar still holds. A token the instance no
 * longer accepts is dropped here, turning a revoked key into the sign-in screen
 * rather than a screen full of 401s.
 */
export async function restoreCredential(): Promise<Credential | null> {
  const token = await getAuthToken();
  if (token) {
    try {
      return await classifyToken(token);
    } catch {
      await clearAuthToken();
    }
  }
  const user = await getSessionUser();
  return user ? { kind: "session", user } : null;
}

/**
 * The companies this credential may act in. An agent key is scoped to exactly
 * one and cannot list companies at all, so it takes its single company from
 * `GET /api/agents/me`. A board key or a session sees whatever it is a member of,
 * which may be nothing — the UI has to say so rather than show an empty board.
 */
export async function credentialCompanies(cred: Credential): Promise<Company[]> {
  if (cred.kind === "agent") {
    return [await coolie.getCompany(cred.identity.companyId)];
  }
  return coolie.listCompanies();
}
