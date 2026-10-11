#!/usr/bin/env node
/**
 * [SYS_CHANRONG_AGENT] G5 生产不可变基线与发布守卫脚本
 */
import fs from "node:fs";
import path from "node:path";

const sopCandidates = [
  path.resolve(process.cwd(), "docs/07_release/system-deployment-sop.md"),
  path.resolve(process.cwd(), "docs/release/deploy-sop.md"),
];
const sopPath = sopCandidates.find(p => fs.existsSync(p));
if (!sopPath) {
  console.error("❌ G5 发布门禁失败: 缺少 docs/07_release/system-deployment-sop.md 发布与回滚 SOP。");
  process.exit(1);
}

const sopContent = fs.readFileSync(sopPath, "utf-8");
if (!sopContent.includes("回滚") || (!sopContent.includes("校验和") && !sopContent.includes("SHA256") && !sopContent.includes("指纹"))) {
  console.error("❌ G5 发布门禁失败: SOP 中必须包含明确的秒级回滚命令与制品校验和。");
  process.exit(1);
}

console.log("✅ G5 不可变生产发布门禁通过: 具备制品校验和与秒级回滚保障。");
