/**
 * scripts/lib/env-identity.test.mjs — 多环境 Hermes 动态命名与角色标识单测 (wave358)
 *
 * 跑法: node --test scripts/lib/env-identity.test.mjs
 *
 * 真值表 (纯文件解析, 不依赖网络 / docker / Coolie Dev Server):
 *   - 默认身份 (仓库默认 = Hermes 掌柜 Echo / local)
 *   - $COOLIE_ENV_IDENTITY 显式覆盖 (delta/prod、dev/staging 全矩阵)
 *   - .coolie-local/env-identity.json 运行态覆盖 (COOLIE_LOCAL_DIR)
 *   - 覆盖优先级: COOLIE_ENV_IDENTITY > COOLIE_LOCAL_DIR > 仓库默认
 *   - 非法/缺字段兜底 (archetype→echo, deployEnv→local)
 *   - 老字段 environment 兼容 (archetype / deployEnv 两个语义)
 *   - 动态命名公式: 显示名 / 徽记 / 全徽记 / 单行 Header 值
 */

import { strict as assert } from "node:assert";
import { describe, it, after } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LIB = new URL("./env-identity.sh", import.meta.url).pathname;
const BASH = "/bin/bash";

function fn(name, env = {}) {
  return execFileSync(BASH, ["-c", `source '${LIB}' >/dev/null 2>&1 && ${name}`], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  }).trim();
}

function makeIdentityFile(fields) {
  const tmp = track(mkdtempSync(join(tmpdir(), "env-identity-")));
  const file = join(tmp, "env-identity.json");
  writeFileSync(file, JSON.stringify({ schemaVersion: 1, ...fields }, null, 2));
  return { tmp, file };
}

const cleanups = [];
function track(tmp) {
  cleanups.push(tmp);
  return tmp;
}

// 全部用例结束后清临时目录, 避免堆积
after(() => {
  for (const tmp of cleanups) {
    try { rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
});

describe("env-identity: 默认身份 (仓库默认 = Hermes 掌柜 Echo)", () => {
  it("resolves archetype=echo deployEnv=local from repo default file", () => {
    assert.equal(fn("env_archetype"), "echo");
    assert.equal(fn("deploy_env"), "local");
    assert.equal(fn("env_codename"), "Echo");
    assert.equal(fn("env_label"), "业务战略");
    assert.equal(fn("env_scope"), "Palantir Echo (业务战略与价值中枢)");
  });

  it("builds dynamic display name and badges per 公式", () => {
    assert.equal(fn("hermes_display_name"), "Hermes·Echo");
    assert.equal(fn("hermes_badge"), "【Hermes·Echo·业务战略】");
    assert.equal(fn("hermes_badge_full"), "【Hermes·Echo·业务战略·PM掌柜】");
  });

  it("emits pipe-separated header value", () => {
    assert.equal(fn("env_header_value"), "echo|Echo|业务战略|Hermes·Echo|local");
  });

  it("standalone run prints human identity report", () => {
    const out = execFileSync(BASH, [LIB], { encoding: "utf8" });
    assert.ok(out.includes("【Hermes·Echo·业务战略·PM掌柜】"), "report should carry full badge");
    assert.ok(out.includes("宿主: local"), "report should carry deployEnv");
    assert.ok(out.includes("echo|Echo|业务战略|Hermes·Echo|local"), "report should carry header value");
  });
});

describe("env-identity: $COOLIE_ENV_IDENTITY 显式覆盖 (全矩阵)", () => {
  it("delta/prod 前线交付机 (自定义 baseName/role/project)", () => {
    const { file } = makeIdentityFile({
      archetype: "delta",
      deployEnv: "prod",
      baseName: "Palantir",
      role: "FDSE (现场攻坚)",
      projectName: "客户 A 智慧调度前线",
    });
    const env = { COOLIE_ENV_IDENTITY: file };
    assert.equal(fn("env_archetype", env), "delta");
    assert.equal(fn("deploy_env", env), "prod");
    assert.equal(fn("env_codename", env), "Delta");
    assert.equal(fn("env_label", env), "前线工程");
    assert.equal(fn("env_scope", env), "Palantir Delta (前线全栈工程攻坚)");
    assert.equal(fn("hermes_display_name", env), "Palantir·Delta");
    // 职责徽记化: 去空格/括号 → FDSE现场攻坚
    assert.equal(fn("hermes_badge_full", env), "【Palantir·Delta·前线工程·FDSE现场攻坚】");
    assert.equal(
      fn("env_header_value", env),
      "delta|Delta|前线工程|Palantir·Delta|prod"
    );
  });

  it("dev/staging 平台底座机", () => {
    const { file } = makeIdentityFile({
      archetype: "dev",
      deployEnv: "staging",
      role: "PRE-SRE (底座守卫)",
    });
    const env = { COOLIE_ENV_IDENTITY: file };
    assert.equal(fn("env_archetype", env), "dev");
    assert.equal(fn("deploy_env", env), "staging");
    assert.equal(fn("env_codename", env), "Dev");
    assert.equal(fn("env_label", env), "底座抽象");
    assert.equal(fn("env_scope", env), "Palantir Dev (平台底座抽象演进)");
    assert.equal(fn("hermes_display_name", env), "Hermes·Dev");
    assert.equal(fn("env_header_value", env), "dev|Dev|底座抽象|Hermes·Dev|staging");
  });

  it("env_identity_file points at the explicit override", () => {
    const { file } = makeIdentityFile({ archetype: "delta", deployEnv: "prod" });
    assert.equal(fn("env_identity_file", { COOLIE_ENV_IDENTITY: file }), file);
  });
});

describe("env-identity: .coolie-local 运行态覆盖与优先级", () => {
  it("COOLIE_LOCAL_DIR/env-identity.json 生效 (第 2 层)", () => {
    const tmp = track(mkdtempSync(join(tmpdir(), "env-identity-local-")));
    writeFileSync(join(tmp, "env-identity.json"), JSON.stringify({
      archetype: "dev",
      deployEnv: "staging",
      baseName: "Forge",
      role: "Core SWE",
    }));
    const env = { COOLIE_LOCAL_DIR: tmp };
    assert.equal(fn("env_archetype", env), "dev");
    assert.equal(fn("deploy_env", env), "staging");
    assert.equal(fn("hermes_display_name", env), "Forge·Dev");
    assert.equal(fn("hermes_badge_full", env), "【Forge·Dev·底座抽象·CoreSWE】");
  });

  it("COOLIE_ENV_IDENTITY 优先于 COOLIE_LOCAL_DIR (第 1 层 > 第 2 层)", () => {
    const tmp = track(mkdtempSync(join(tmpdir(), "env-identity-prio-")));
    writeFileSync(join(tmp, "env-identity.json"), JSON.stringify({ archetype: "dev" }));
    const { file } = makeIdentityFile({ archetype: "delta", deployEnv: "prod" });
    const env = { COOLIE_LOCAL_DIR: tmp, COOLIE_ENV_IDENTITY: file };
    assert.equal(fn("env_archetype", env), "delta");
    assert.equal(fn("deploy_env", env), "prod");
  });

  it("不存在的 COOLIE_ENV_IDENTITY 路径静默落回下层 (不报错)", () => {
    const env = { COOLIE_ENV_IDENTITY: "/nonexistent/env-identity.json" };
    assert.equal(fn("env_archetype", env), "echo");
    assert.equal(fn("deploy_env", env), "local");
  });
});

describe("env-identity: 非法值兜底与老字段兼容", () => {
  it("archetype/deployEnv 非法值兜底 echo/local", () => {
    const { file } = makeIdentityFile({ archetype: "生产网", deployEnv: "echo" });
    const env = { COOLIE_ENV_IDENTITY: file };
    assert.equal(fn("env_archetype", env), "echo");
    assert.equal(fn("deploy_env", env), "local");
  });

  it("缺 archetype/deployEnv 字段兜底默认", () => {
    const { file } = makeIdentityFile({ projectName: "只有项目名" });
    const env = { COOLIE_ENV_IDENTITY: file };
    assert.equal(fn("env_archetype", env), "echo");
    assert.equal(fn("deploy_env", env), "local");
    assert.equal(fn("env_field projectName", env), "只有项目名");
  });

  it("老字段 environment=delta 视作 archetype (兼容)", () => {
    const { file } = makeIdentityFile({ environment: "delta" });
    const env = { COOLIE_ENV_IDENTITY: file };
    assert.equal(fn("env_archetype", env), "delta");
    // environment=delta 不是合法 deployEnv → 兜底 local
    assert.equal(fn("deploy_env", env), "local");
  });

  it("老字段 environment=prod 视作 deployEnv (兼容)", () => {
    const { file } = makeIdentityFile({ environment: "prod" });
    const env = { COOLIE_ENV_IDENTITY: file };
    assert.equal(fn("deploy_env", env), "prod");
    // environment=prod 不是合法 archetype → 兜底 echo
    assert.equal(fn("env_archetype", env), "echo");
  });

  it("坏 JSON 文件静默落回仓库默认", () => {
    const tmp = track(mkdtempSync(join(tmpdir(), "env-identity-bad-")));
    const file = join(tmp, "env-identity.json");
    writeFileSync(file, "{ not valid json !!");
    const env = { COOLIE_ENV_IDENTITY: file };
    // node 解析失败 → grep 兜底也拿不到 → 走 env_identity_file 指定的坏文件,
    // 字段全空 → 各归一化函数兜底
    assert.equal(fn("env_archetype", env), "echo");
    assert.equal(fn("deploy_env", env), "local");
  });
});
