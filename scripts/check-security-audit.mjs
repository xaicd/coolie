#!/usr/bin/env node
/**
 * Security Dependency Audit Gate.
 *
 * Implements the Supply Chain & Dependency Security Defense line:
 * - Checks packages for known security vulnerabilities via pnpm audit.
 * - By default, enforces a zero-tolerance policy on CRITICAL vulnerabilities (--audit-level=critical).
 * - Can be run with --strict or --level=high for proactive remediation tracking.
 *
 * Usage:
 *   node scripts/check-security-audit.mjs              # Enforce critical gate
 *   node scripts/check-security-audit.mjs --level=high  # Check high severity
 *   pnpm check:security
 */
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const levelArg = args.find((a) => a.startsWith("--level="));
const isStrict = args.includes("--strict");

const auditLevel = levelArg ? levelArg.slice("--level=".length) : isStrict ? "high" : "critical";

console.log(`[Security Audit] Running dependency vulnerability check (threshold: ${auditLevel.toUpperCase()})...`);

const result = spawnSync("pnpm", ["audit", `--audit-level=${auditLevel}`], {
  stdio: "inherit",
  env: process.env,
});

if (result.status !== 0) {
  console.error(`\n[Security Audit] FAILED: Found dependencies exceeding ${auditLevel.toUpperCase()} severity threshold.`);
  console.error(`Please review the advisories above and update vulnerable packages.`);
  process.exit(result.status ?? 1);
}

console.log(`\n[Security Audit] PASSED: No dependencies violate the ${auditLevel.toUpperCase()} severity threshold.`);
