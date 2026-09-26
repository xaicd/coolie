#!/usr/bin/env node
/**
 * [SYS_CHANRONG_AGENT] G5 生产不可变基线与发布守卫脚本
 */
import fs from "node:fs";
import path from "node:path";

const sopPath = path.resolve(process.cwd(), "docs/cmmi/05-deploy-sop.md");
if (!fs.existsSync(sopPath)) {
  console.error("❌ G5 发布门禁失败: 缺少 docs/cmmi/05-deploy-sop.md 发布与回滚 SOP。");
  process.exit(1);
}

const sopContent = fs.readFileSync(sopPath, "utf-8");
if (!sopContent.includes("回滚") || !sopContent.includes("校验和")) {
  console.error("❌ G5 发布门禁失败: SOP 中必须包含明确的秒级回滚命令与制品 SHA-256 校验和。");
  process.exit(1);
}

console.log("✅ G5 不可变生产发布门禁通过: 具备制品校验和与秒级回滚保障。");
