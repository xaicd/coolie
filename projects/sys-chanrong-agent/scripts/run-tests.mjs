#!/usr/bin/env node
/**
 * [SYS_CHANRONG_AGENT] G4 全栈验收与集成测试运行脚本
 * 技术栈: node
 */
import { execSync } from "node:child_process";

console.log("🧪 启动 G4 全栈验收与集成测试用例...");
try {
  execSync("npm test --if-present", { stdio: "inherit" });
  console.log("✅ G4 验收测试全部通过。");
} catch (err) {
  console.error("❌ G4 验收测试用例存在失败项，请修复后再提测。");
  process.exit(1);
}
