import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Coolie fork (wave358) — 多环境 Hermes 动态命名与 Palantir 作战力量身份解析 (TS 侧).
 *
 * 这套系统装到各台电脑后, 每台机器用一份 `env-identity.json` 声明自己的
 * Palantir 作战力量定位 (Echo 业务战略与翻译 / Delta 前线全栈工程攻坚 / Dev 平台底座抽象演进)
 * 与正交的物理部署宿主 (prod 生产网 / staging 预发网 / local 本地机)。
 * 工坊会话、微信、派单 Header 都从这一份身份自适应取名, 而不是各处硬编码机器名。
 * bash 侧的同一套矩阵在 `scripts/lib/env-identity.sh` — 两边字段与取值必须保持一致。
 *
 * 覆盖顺序 (先命中先用, 与 bash 侧一致):
 *   1. $COOLIE_ENV_IDENTITY                      显式指定的身份文件
 *   2. $COOLIE_REPO_DIR/.coolie-local/env-identity.json  本机运行态覆盖 (不入 git)
 *   3. <repo>/scripts/lib/default-env-identity.json      仓库默认 (Hermes 掌柜 Echo)
 */

export type PalantirArchetype = "echo" | "delta" | "dev";
export type DeployEnv = "prod" | "staging" | "local";

/** 老接口别名兼容 */
export type EnvKey = PalantirArchetype;

export interface EnvIdentity {
  /** Palantir 作战力量原型: echo (业务战略) | delta (前线工程) | dev (底座抽象). */
  archetype: PalantirArchetype;
  /** 部署基础设施环境 (正交维度): prod | staging | local. */
  deployEnv: DeployEnv;
  /** 部署项目名称, 如 "Coolie 本地施工总社" / "客户 A 智慧调度前线". */
  projectName: string;
  /** 动态改名基名, 默认 "Hermes"; 按项目可改 (如 "Palantir" / 项目代号). */
  baseName: string;
  /** 职责属性, 如 "PM (掌柜)" / "FDSE (现场攻坚)" / "PRE-SRE (底座守卫)". */
  role: string;
  /** 生效的身份文件路径 (证据链用). */
  sourceFile: string;
  /**
   * 兼容旧字段: 等价于 archetype.
   */
  environment: PalantirArchetype;
}

interface EnvIdentityFileShape {
  archetype?: unknown;
  environment?: unknown;
  deployEnv?: unknown;
  projectName?: unknown;
  baseName?: unknown;
  role?: unknown;
}

const DEFAULT_IDENTITY_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../scripts/lib/default-env-identity.json",
);

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeArchetype(value: unknown, fallback: PalantirArchetype = "echo"): PalantirArchetype {
  if (value === "echo" || value === "delta" || value === "dev") return value;
  return fallback;
}

function normalizeDeployEnv(value: unknown, fallback: DeployEnv = "local"): DeployEnv {
  if (value === "prod" || value === "staging" || value === "local") return value;
  return fallback;
}

function readIdentityFile(file: string): EnvIdentityFileShape | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as EnvIdentityFileShape;
  } catch {
    return null;
  }
}

/**
 * 解析本机环境身份。任何一层缺文件/坏 JSON 都静默落到下一层, 最终兜底仓库默认。
 */
export function resolveEnvIdentity(env: NodeJS.ProcessEnv = process.env): EnvIdentity {
  const candidates: string[] = [];
  if (env.COOLIE_ENV_IDENTITY) candidates.push(env.COOLIE_ENV_IDENTITY);
  if (env.COOLIE_REPO_DIR) {
    candidates.push(path.join(env.COOLIE_REPO_DIR, ".coolie-local", "env-identity.json"));
  }
  candidates.push(DEFAULT_IDENTITY_FILE);

  for (const file of candidates) {
    const raw = readIdentityFile(file);
    if (!raw) continue;

    // 支持 archetype 优先; 兼容老 environment 字段
    const rawArchetype =
      raw.archetype ??
      (raw.environment === "echo" || raw.environment === "delta" || raw.environment === "dev"
        ? raw.environment
        : undefined);
    const rawDeployEnv =
      raw.deployEnv ??
      (raw.environment === "prod" || raw.environment === "staging" || raw.environment === "local"
        ? raw.environment
        : undefined);

    const archetype = normalizeArchetype(rawArchetype, "echo");
    const deployEnv = normalizeDeployEnv(rawDeployEnv, "local");

    return {
      archetype,
      deployEnv,
      environment: archetype,
      projectName: asString(raw.projectName),
      baseName: asString(raw.baseName) || "Hermes",
      role: asString(raw.role),
      sourceFile: file,
    };
  }

  return {
    archetype: "echo",
    deployEnv: "local",
    environment: "echo",
    projectName: "Coolie 本地施工总社",
    baseName: "Hermes",
    role: "PM (掌柜)",
    sourceFile: DEFAULT_IDENTITY_FILE,
  };
}

/** 环境代号 (Echo | Delta | Dev). */
export function envCodename(identity: EnvIdentity): string {
  if (identity.archetype === "echo") return "Echo";
  if (identity.archetype === "delta") return "Delta";
  return "Dev";
}

/** 作战属性标签 (业务战略 | 前线工程 | 底座抽象). */
export function envLabel(identity: EnvIdentity): string {
  if (identity.archetype === "echo") return "业务战略";
  if (identity.archetype === "delta") return "前线工程";
  return "底座抽象";
}

/** Palantir 体系全称. */
export function envScope(identity: EnvIdentity): string {
  if (identity.archetype === "echo") return "Palantir Echo (业务战略与价值中枢)";
  if (identity.archetype === "delta") return "Palantir Delta (前线全栈工程攻坚)";
  return "Palantir Dev (平台底座抽象演进)";
}

/** 动态显示名: <baseName>·<Codename>, 例 "Hermes·Echo". */
export function hermesDisplayName(identity: EnvIdentity): string {
  return `${identity.baseName}·${envCodename(identity)}`;
}

/** 徽记: 【显示名·作战标签】, 例 【Hermes·Echo·业务战略】. */
export function hermesBadge(identity: EnvIdentity): string {
  return `【${hermesDisplayName(identity)}·${envLabel(identity)}】`;
}

/** 全徽记: 含职责, 例 【Hermes·Echo·业务战略·PM掌柜】. */
export function hermesBadgeFull(identity: EnvIdentity): string {
  const role = identity.role.replace(/[ ()（）/]/g, "").slice(0, 24);
  return role
    ? `【${hermesDisplayName(identity)}·${envLabel(identity)}·${role}】`
    : hermesBadge(identity);
}

/** 单行 Header 值 (派单 Receipt / HTTP 头 / 日志字段用): `archetype|Codename|标签|显示名|宿主`. */
export function envHeaderValue(identity: EnvIdentity): string {
  return `${identity.archetype}|${envCodename(identity)}|${envLabel(identity)}|${hermesDisplayName(identity)}|${identity.deployEnv}`;
}

/**
 * 一行环境身份声明 (工坊会话 SYSTEM 块与派单 Header 共用), 例:
 * `身份：【Hermes·Echo·业务战略·PM掌柜】 · Palantir Echo (业务战略与价值中枢) · 宿主: local · 项目: Coolie 本地施工总社`
 */
export function envIdentityLine(identity: EnvIdentity): string {
  return `身份：${hermesBadgeFull(identity)} · ${envScope(identity)} · 宿主: ${identity.deployEnv} · 项目: ${identity.projectName || "未声明"}`;
}
