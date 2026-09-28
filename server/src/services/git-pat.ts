/**
 * Git PAT (Personal Access Token) auto-targeting service.
 * Supports Gitee and GitHub startup environment variables (GITEE_PAT, GITHUB_PAT).
 * Queries the first organization under the PAT and provisions remote repositories.
 */

export type GitPatTarget = {
  configured: boolean;
  platform: "gitee" | "github" | null;
  targetOrg: string | null;
  targetType: "org" | "user" | null;
  repoUrlTemplate: string | null;
  tokenMasked: string | null;
};

export type RemoteRepoResult = {
  platform: "gitee" | "github";
  fullName: string;
  cloneUrl: string;
  htmlUrl: string;
  created: boolean;
};

let cachedTarget: GitPatTarget | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Get active PAT token and platform from process.env
 */
export function getActivePatConfig(env = process.env): {
  platform: "gitee" | "github" | null;
  token: string | null;
} {
  // Gitee has priority if both are specified, or whichever is present
  const giteeToken = env.GITEE_PAT?.trim() || env.GITEE_TOKEN?.trim() || env.PAPERCLIP_GITEE_TOKEN?.trim();
  if (giteeToken) {
    return { platform: "gitee", token: giteeToken };
  }
  const githubToken = env.GITHUB_PAT?.trim() || env.GITHUB_TOKEN?.trim() || env.GH_TOKEN?.trim() || env.PAPERCLIP_GITHUB_TOKEN?.trim();
  if (githubToken) {
    return { platform: "github", token: githubToken };
  }
  const genericToken = env.GIT_PAT?.trim() || env.GIT_TOKEN?.trim();
  if (genericToken) {
    // If generic token starts with ghp_ or github format, assume github, else gitee
    if (genericToken.startsWith("ghp_") || genericToken.startsWith("github_pat_")) {
      return { platform: "github", token: genericToken };
    }
    return { platform: "gitee", token: genericToken };
  }
  return { platform: null, token: null };
}

/**
 * Mask token for safe UI display (e.g. "ghp_abc...xyz")
 */
function maskToken(token: string): string {
  if (token.length <= 8) return "***";
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

/**
 * Query the first organization under the PAT.
 * If user has no organizations, falls back to the user's personal account.
 */
export async function getDefaultPatTarget(forceRefresh = false): Promise<GitPatTarget> {
  const now = Date.now();
  if (!forceRefresh && cachedTarget && now < cacheExpiresAt) {
    return cachedTarget;
  }

  const { platform, token } = getActivePatConfig();
  if (!platform || !token) {
    const unconfigured: GitPatTarget = {
      configured: false,
      platform: null,
      targetOrg: null,
      targetType: null,
      repoUrlTemplate: null,
      tokenMasked: null,
    };
    cachedTarget = unconfigured;
    cacheExpiresAt = now + CACHE_TTL_MS;
    return unconfigured;
  }

  try {
    if (platform === "gitee") {
      // 1. Query Gitee organizations
      const orgsRes = await fetch(`https://gitee.com/api/v5/user/orgs?access_token=${encodeURIComponent(token)}&per_page=10`, {
        headers: { "User-Agent": "Coolie-Platform" },
      });
      if (orgsRes.ok) {
        const orgs = (await orgsRes.json()) as Array<{ login?: string; path?: string }>;
        if (Array.isArray(orgs) && orgs.length > 0) {
          const firstOrg = orgs[0].path || orgs[0].login || "";
          if (firstOrg) {
            const target: GitPatTarget = {
              configured: true,
              platform: "gitee",
              targetOrg: firstOrg,
              targetType: "org",
              repoUrlTemplate: `https://gitee.com/${firstOrg}/{repo}.git`,
              tokenMasked: maskToken(token),
            };
            cachedTarget = target;
            cacheExpiresAt = now + CACHE_TTL_MS;
            return target;
          }
        }
      }

      // 2. Fall back to Gitee personal user
      const userRes = await fetch(`https://gitee.com/api/v5/user?access_token=${encodeURIComponent(token)}`, {
        headers: { "User-Agent": "Coolie-Platform" },
      });
      if (userRes.ok) {
        const user = (await userRes.json()) as { login?: string };
        const userLogin = user.login || "user";
        const target: GitPatTarget = {
          configured: true,
          platform: "gitee",
          targetOrg: userLogin,
          targetType: "user",
          repoUrlTemplate: `https://gitee.com/${userLogin}/{repo}.git`,
          tokenMasked: maskToken(token),
        };
        cachedTarget = target;
        cacheExpiresAt = now + CACHE_TTL_MS;
        return target;
      }
    } else if (platform === "github") {
      // 1. Query GitHub organizations
      const orgsRes = await fetch("https://api.github.com/user/orgs?per_page=10", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "Coolie-Platform",
        },
      });
      if (orgsRes.ok) {
        const orgs = (await orgsRes.json()) as Array<{ login?: string }>;
        if (Array.isArray(orgs) && orgs.length > 0 && orgs[0].login) {
          const firstOrg = orgs[0].login;
          const target: GitPatTarget = {
            configured: true,
            platform: "github",
            targetOrg: firstOrg,
            targetType: "org",
            repoUrlTemplate: `https://github.com/${firstOrg}/{repo}.git`,
            tokenMasked: maskToken(token),
          };
          cachedTarget = target;
          cacheExpiresAt = now + CACHE_TTL_MS;
          return target;
        }
      }

      // 2. Fall back to GitHub personal user
      const userRes = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "Coolie-Platform",
        },
      });
      if (userRes.ok) {
        const user = (await userRes.json()) as { login?: string };
        const userLogin = user.login || "user";
        const target: GitPatTarget = {
          configured: true,
          platform: "github",
          targetOrg: userLogin,
          targetType: "user",
          repoUrlTemplate: `https://github.com/${userLogin}/{repo}.git`,
          tokenMasked: maskToken(token),
        };
        cachedTarget = target;
        cacheExpiresAt = now + CACHE_TTL_MS;
        return target;
      }
    }
  } catch (err) {
    console.warn("[git-pat] Failed to query default target:", err);
  }

  const fallback: GitPatTarget = {
    configured: true,
    platform,
    targetOrg: null,
    targetType: null,
    repoUrlTemplate: null,
    tokenMasked: maskToken(token),
  };
  cachedTarget = fallback;
  cacheExpiresAt = now + 60 * 1000; // retry after 1 min on failure
  return fallback;
}

/**
 * Sanitize a project name into a valid Git repository slug
 */
export function sanitizeRepoSlug(projectName: string): string {
  let slug = projectName.trim().toLowerCase();
  // Replace Chinese characters or non-ascii with hyphen if mixed, or keep alphanumeric
  slug = slug.replace(/[^a-z0-9_.-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!slug) {
    slug = `project-${Date.now().toString(36)}`;
  }
  return slug;
}

/**
 * Ensure a remote repository exists under the PAT's default organization.
 * If not exists, creates it as a private repository.
 */
export async function ensureRemoteRepository(
  projectName: string,
  description?: string,
): Promise<RemoteRepoResult | null> {
  const { platform, token } = getActivePatConfig();
  if (!platform || !token) return null;

  const target = await getDefaultPatTarget();
  if (!target.targetOrg) return null;

  const repoSlug = sanitizeRepoSlug(projectName);
  const repoDescription = description || `Project ${projectName} generated by Coolie`;

  if (platform === "gitee") {
    const isOrg = target.targetType === "org";
    const createUrl = isOrg
      ? `https://gitee.com/api/v5/orgs/${target.targetOrg}/repos`
      : "https://gitee.com/api/v5/user/repos";

    try {
      const response = await fetch(createUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json;charset=UTF-8",
          "User-Agent": "Coolie-Platform",
        },
        body: JSON.stringify({
          access_token: token,
          name: repoSlug,
          description: repoDescription,
          has_issues: true,
          has_wiki: false,
          private: true,
          auto_init: true,
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as { html_url?: string; full_name?: string };
        const fullName = data.full_name || `${target.targetOrg}/${repoSlug}`;
        return {
          platform: "gitee",
          fullName,
          cloneUrl: `https://gitee.com/${fullName}.git`,
          htmlUrl: data.html_url || `https://gitee.com/${fullName}`,
          created: true,
        };
      }

      // If already exists or error, construct URL
      const fullName = `${target.targetOrg}/${repoSlug}`;
      return {
        platform: "gitee",
        fullName,
        cloneUrl: `https://gitee.com/${fullName}.git`,
        htmlUrl: `https://gitee.com/${fullName}`,
        created: false,
      };
    } catch (err) {
      console.warn("[git-pat] Gitee repo creation network error:", err);
      const fullName = `${target.targetOrg}/${repoSlug}`;
      return {
        platform: "gitee",
        fullName,
        cloneUrl: `https://gitee.com/${fullName}.git`,
        htmlUrl: `https://gitee.com/${fullName}`,
        created: false,
      };
    }
  } else if (platform === "github") {
    const isOrg = target.targetType === "org";
    const createUrl = isOrg
      ? `https://api.github.com/orgs/${target.targetOrg}/repos`
      : "https://api.github.com/user/repos";

    try {
      const response = await fetch(createUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "Coolie-Platform",
        },
        body: JSON.stringify({
          name: repoSlug,
          description: repoDescription,
          private: true,
          auto_init: true,
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as { html_url?: string; full_name?: string };
        const fullName = data.full_name || `${target.targetOrg}/${repoSlug}`;
        return {
          platform: "github",
          fullName,
          cloneUrl: `https://github.com/${fullName}.git`,
          htmlUrl: data.html_url || `https://github.com/${fullName}`,
          created: true,
        };
      }

      const fullName = `${target.targetOrg}/${repoSlug}`;
      return {
        platform: "github",
        fullName,
        cloneUrl: `https://github.com/${fullName}.git`,
        htmlUrl: `https://github.com/${fullName}`,
        created: false,
      };
    } catch (err) {
      console.warn("[git-pat] GitHub repo creation network error:", err);
      const fullName = `${target.targetOrg}/${repoSlug}`;
      return {
        platform: "github",
        fullName,
        cloneUrl: `https://github.com/${fullName}.git`,
        htmlUrl: `https://github.com/${fullName}`,
        created: false,
      };
    }
  }

  return null;
}
