#!/usr/bin/env node
/**
 * specs/agent-device-app.spec.mjs
 *
 * AI Agent Driven Native App Spec Script.
 * Uses `agent-device` & ADB driver to interact with the real Android emulator (coolie-test),
 * walk through App startup, WhatsNew self-check dismiss, and capture real GUI evidence.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function exec(cmd) {
  return execSync(cmd, { encoding: "utf-8" }).trim();
}

function adb(subcmd) {
  return exec(`adb ${subcmd}`);
}

async function main() {
  console.log("=== [Spec] Starting Agent-Device Native App Automation ===");
  fs.mkdirSync("screenshots", { recursive: true });

  // 1. Device Presence Check
  console.log("1. Checking connected Android devices via ADB...");
  const devices = adb("devices");
  console.log("Devices:\n" + devices);
  if (!devices.includes("emulator-5554") && !devices.includes("device")) {
    throw new Error("No online Android emulator/device detected!");
  }

  // 2. Ensure reverse tunnel
  console.log("2. Ensuring reverse proxy tunnel for dev server on 3100...");
  adb("reverse tcp:3100 tcp:3100");
  const reverseList = adb("reverse --list");
  console.log("Active tunnels:\n" + reverseList);

  // 3. Launch Coolie App
  console.log("3. Launching cloud.coolie.app on emulator...");
  adb("shell am start -n cloud.coolie.app/.MainActivity");
  exec("sleep 3");

  // 4. Dump UI hierarchy & inspect state
  console.log("4. Dumping UI hierarchy and checking interactive nodes...");
  adb("shell uiautomator dump /sdcard/spec_dump.xml");
  adb("pull /sdcard/spec_dump.xml /tmp/spec_dump.xml");
  const xmlContent = fs.readFileSync("/tmp/spec_dump.xml", "utf-8");

  // 5. Handle WhatsNew / Self-check dialog if present
  if (xmlContent.includes("我知道了") || xmlContent.includes("装机自检")) {
    console.log("Detected WhatsNew self-check screen. Tapping 【我知道了】...");
    // Tap center of "我知道了" button
    adb("shell input tap 600 2393");
    exec("sleep 2");
    // Re-dump
    adb("shell uiautomator dump /sdcard/spec_dump2.xml");
    adb("pull /sdcard/spec_dump2.xml /tmp/spec_dump2.xml");
  }

  // 6. Verify App UI Elements (Logo, Tagline, Buttons)
  console.log("6. Verifying core UI elements on screen...");
  const targetDumpPath = fs.existsSync("/tmp/spec_dump2.xml") ? "/tmp/spec_dump2.xml" : "/tmp/spec_dump.xml";
  const dump = fs.readFileSync(targetDumpPath, "utf-8");
  const hasLogo = dump.includes("Coolie");
  const hasTagline = dump.includes("把 AI 智能体当成一支团队来管理");
  const hasLoginBtn = dump.includes("登录");

  console.log(`- Coolie Title / Brand: ${hasLogo ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`- Core Motto Tagline:   ${hasTagline ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`- Login Two-Char Button: ${hasLoginBtn ? "✅ PASS" : "❌ FAIL"}`);

  if (!hasLogo || !hasLoginBtn) {
    throw new Error("App UI inspection failed: essential elements missing!");
  }

  // 7. Capture Real GUI Screenshot
  const screenshotPath = "screenshots/evidence-app-workshop-spec.png";
  console.log(`7. Capturing real device screenshot to ${screenshotPath}...`);
  adb("shell screencap -p /sdcard/spec_screen.png");
  adb(`pull /sdcard/spec_screen.png ${screenshotPath}`);

  const stat = fs.statSync(screenshotPath);
  console.log(`Screenshot saved successfully (${(stat.size / 1024).toFixed(1)} KB).`);

  console.log("=== [Spec] Agent-Device Native App Spec PASSED ===");
}

main().catch((err) => {
  console.error("Spec Execution Failed:", err);
  process.exit(1);
});
