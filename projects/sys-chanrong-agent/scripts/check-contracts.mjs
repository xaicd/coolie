#!/usr/bin/env node
/**
 * [SYS_CHANRONG_AGENT] G3 静态契约与编译守卫检查脚本
 * 技术栈: node
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

console.log("🔍 执行 G3 静态契约与编译检查...");

try {
  // 根据技术栈执行对应的编译或静态分析检查
  execSync("npx tsc --noEmit", { stdio: "inherit" });
  console.log("✅ G3 静态契约检查通过: 0 编译报错。");
} catch (err) {
  console.error("❌ G3 静态契约检查失败，存在编译或契约类型不一致。");
  process.exit(1);
}
