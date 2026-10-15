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
  try {
    execSync("npx tsc --noEmit", { stdio: "inherit" });
  } catch (localErr) {
    // 若在容器环境下遇到架构二进制差异且 host-exec 可用，穿透宿主机执行 tsc
    const hostExecBin = fs.existsSync("/usr/local/bin/host-exec")
      ? "/usr/local/bin/host-exec"
      : (fs.existsSync("/root/.local/bin/host-exec") ? "/root/.local/bin/host-exec" : null);
    if (hostExecBin) {
      execSync(`${hostExecBin} "cd /Users/mac/workspace/xaicd/coolie/projects/sys-chanrong-agent && npx tsc --noEmit"`, { stdio: "inherit" });
    } else {
      throw localErr;
    }
  }
  console.log("✅ G3 静态契约检查通过: 0 编译报错。");
} catch (err) {
  console.error("❌ G3 静态契约检查失败，存在编译或契约类型不一致。");
  process.exit(1);
}
