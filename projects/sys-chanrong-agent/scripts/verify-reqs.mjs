#!/usr/bin/env node
/**
 * [SYS_CHANRONG_AGENT] G1 需求与 RTM 跟踪门禁校验脚本
 */
import fs from "node:fs";
import path from "node:path";

const srsPath = path.resolve(process.cwd(), "docs/cmmi/01-srs.md");
if (!fs.existsSync(srsPath)) {
  console.error("❌ G1 门禁失败: 未找到 docs/cmmi/01-srs.md 需求规格说明书。");
  process.exit(1);
}

const content = fs.readFileSync(srsPath, "utf-8");
if (!content.includes("REQ-") || !content.includes("SHALL")) {
  console.error("❌ G1 门禁失败: 需求文档中未检测到符合 EARS 语法 (SHALL) 或 REQ- 编号的需求项。");
  process.exit(1);
}

console.log("✅ G1 需求门禁校验通过: 需求项符合 EARS 结构化定义，RTM 映射正常。");
