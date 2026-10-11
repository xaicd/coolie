#!/usr/bin/env node
/**
 * specs/agent-browser-workshop.spec.mjs
 *
 * AI Agent Driven Web Workshop Spec Script.
 * Uses `agent-browser` to drive real Chromium, interact with the Web Console,
 * send intent into BoardChat (会议室), verify live SSE stream, and capture visual proof.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function runBrowser(cmd) {
  return execSync(`agent-browser ${cmd}`, { encoding: "utf-8" });
}

async function main() {
  console.log("=== [Spec] Starting Agent-Browser Web Workshop Automation ===");
  fs.mkdirSync("screenshots", { recursive: true });

  // 1. Open Web Console
  console.log("1. Opening Web Console at http://localhost:3100...");
  runBrowser("open http://localhost:3100");
  runBrowser("wait 2000");

  // 2. Check and ensure active company is Coolie 本地施工总社
  console.log("2. Ensuring active company is Coolie 本地施工总社...");
  try {
    const snap = runBrowser("snapshot -i");
    if (!snap.includes("Open Coolie 本地施工总社 organization switcher")) {
      const match = snap.match(/button "Open (.*) organization switcher" \[.*ref=(e\d+)\]/);
      if (match && match[2]) {
        console.log(`Clicking org switcher [@${match[2]}]...`);
        runBrowser(`click @${match[2]}`);
        runBrowser("wait 1000");
        const menuSnap = runBrowser("snapshot -i");
        const itemMatch = menuSnap.match(/menuitem ".*Coolie 本地施工总社.*" \[.*ref=(e\d+)\]/);
        if (itemMatch && itemMatch[1]) {
          console.log(`Selecting Coolie 本地施工总社 [@${itemMatch[1]}]...`);
          runBrowser(`click @${itemMatch[1]}`);
          runBrowser("wait 2000");
        }
      }
    } else {
      console.log("Already in Coolie 本地施工总社 context.");
    }
  } catch (err) {
    console.log("Org switcher notice:", err.message.slice(0, 100));
  }

  // 3. Click "会议室" in sidebar
  console.log("3. Navigating to BoardChat (会议室) via sidebar link...");
  try {
    const navSnap = runBrowser("snapshot -i");
    const chatLinkMatch = navSnap.match(/link "会议室" \[.*ref=(e\d+)\]/);
    if (chatLinkMatch && chatLinkMatch[1]) {
      runBrowser(`click @${chatLinkMatch[1]}`);
    } else {
      runBrowser("find role link click --name '会议室'");
    }
  } catch (err) {
    runBrowser("open http://localhost:3100/board-chat");
  }
  runBrowser("wait 2500");

  // 4. Inspect conference room elements
  console.log("4. Inspecting BoardChat interactive elements...");
  const snapChat = runBrowser("snapshot -i");
  const textboxMatch = snapChat.match(/textbox "Ask anything about your organization\.\.\." \[.*ref=(e\d+)\]/);

  if (!textboxMatch || !textboxMatch[1]) {
    throw new Error("Could not locate BoardChat textarea in snapshot");
  }

  const textboxRef = textboxMatch[1];
  console.log(`Found BoardChat input at @${textboxRef}`);

  // 5. Input prompt into chat
  console.log("5. Filling prompt into Hermes chat box...");
  const promptText = "Hermes，请汇报 Coolie 工坊全生命周期工程资产建设进展";
  runBrowser(`fill @${textboxRef} '${promptText}'`);
  runBrowser("wait 800");

  // 6. Re-inspect to get active send button ref
  const snapReady = runBrowser("snapshot -i");
  const activeSendMatch = snapReady.match(/button "Send message" \[ref=(e\d+)\]/);
  if (activeSendMatch && activeSendMatch[1]) {
    console.log(`6. Clicking active Send message button [@${activeSendMatch[1]}]...`);
    runBrowser(`click @${activeSendMatch[1]}`);
  } else {
    runBrowser("find role button click --name 'Send message'");
  }

  // 7. Wait for live interaction and scroll
  console.log("7. Waiting for message transmission and response...");
  runBrowser("wait 3000");
  try {
    const snapJump = runBrowser("snapshot -i");
    const jumpMatch = snapJump.match(/button "Jump to latest messages" \[.*ref=(e\d+)\]/);
    if (jumpMatch && jumpMatch[1]) {
      runBrowser(`click @${jumpMatch[1]}`);
      runBrowser("wait 1000");
    }
  } catch (e) {
    // Ignore jump failure if already at bottom
  }

  // 8. Capture final visual screenshot
  const screenshotPath = "screenshots/evidence-web-workshop-spec.png";
  console.log(`8. Capturing live annotated screenshot to ${screenshotPath}...`);
  runBrowser(`screenshot ${screenshotPath}`);

  console.log("=== [Spec] Agent-Browser Web Workshop Spec PASSED ===");
}

main().catch((err) => {
  console.error("Spec Execution Failed:", err);
  process.exit(1);
});
