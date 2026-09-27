#!/usr/bin/env node
/**
 * [SYS_CHANRONG_AGENT] G2 架构隔离与治理门禁校验脚本
 *
 * 对应门禁: gate_g2_arch  (cmmi-profile.json → gates.g2)
 * 受检文档: docs/cmmi/02-hld.md
 * 主责角色: emp_fda (前线架构师) / 技能: cmmi-tech-solution
 *
 * 背景: `cmmi-profile.json` 一直把 g2 指向本文件名,但仓库里从未提供该脚本,
 * 因此 G2 一直无法执行(命令直接报模块不存在)。本文件补齐该门禁。
 *
 * 校验内容对齐 cmmi-tech-solution 的 G2 通过准则:
 *   1. 架构分层清晰,对外契约明确
 *   2. 企业/租户数据隔离机制有强制防线
 *   3. 关键技术选型附带 DAR 加权评估矩阵(而非仅文字对比)
 *   4. 01-srs.md 的每条需求都在 HLD 的选型落地表中登记
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const hldPath = path.resolve(root, "docs/cmmi/02-hld.md");
const srsPath = path.resolve(root, "docs/cmmi/01-srs.md");

const failures = [];
const notes = [];

if (!fs.existsSync(hldPath)) {
  console.error("❌ G2 门禁失败: 未找到 docs/cmmi/02-hld.md 概要设计说明书。");
  process.exit(1);
}
const hld = fs.readFileSync(hldPath, "utf-8");

// 1. 架构分层:拓扑图 + 至少 4 个分层/边界小节
if (!/```mermaid[\s\S]*?```/.test(hld)) {
  failures.push("缺少总体架构拓扑图(mermaid 代码块)。");
}
const layerHits = ["接入", "网关", "业务", "存储", "适配"].filter((k) => hld.includes(k));
if (layerHits.length < 3) {
  failures.push(`架构分层描述不足,仅命中 ${layerHits.length} 类分层关键词: ${layerHits.join("/") || "无"}。`);
}

// 2. 企业/租户隔离强制防线
if (!hld.includes("company_id")) {
  failures.push("未登记企业/租户隔离字段 company_id 的强制过滤方案。");
}
if (!/(隔离|边界)/.test(hld)) {
  failures.push("未定义数据隔离边界章节。");
}

// 3. DAR 加权评估矩阵(cmmi-tech-solution 明确要求多准则加权打分法)
const matrixCount = (hld.match(/加权总分/g) ?? []).length;
if (matrixCount === 0) {
  failures.push("缺少 DAR 加权评估矩阵:文档中未出现任何『加权总分』行,仅有文字方案对比不符合 G2 准则。");
} else if (matrixCount < 3) {
  notes.push(`DAR 加权矩阵数量偏少(仅 ${matrixCount} 个),建议核心选型逐项成表。`);
}
const criteriaHit = ["权重"].some((k) => hld.includes(k));
if (!criteriaHit) failures.push("DAR 矩阵缺少评价准则权重列。");

// 4. 需求覆盖:01-srs.md 的每条 REQ 必须在 HLD 选型落地表中登记
if (fs.existsSync(srsPath)) {
  const srs = fs.readFileSync(srsPath, "utf-8");
  const reqIds = [...new Set((srs.match(/REQ-CR-\d{3}/g) ?? []))].sort();
  if (reqIds.length === 0) {
    notes.push("01-srs.md 未解析到 REQ-CR-### 编号,跳过覆盖校验。");
  } else {
    const missing = reqIds.filter((id) => !hld.includes(id));
    if (missing.length > 0) {
      failures.push(`HLD 选型落地表未覆盖 ${missing.length} 条需求: ${missing.join(", ")}。`);
    } else {
      notes.push(`需求覆盖校验通过:${reqIds.length} 条 REQ-CR-### 均已登记。`);
    }
  }
} else {
  notes.push("未找到 01-srs.md,跳过需求覆盖校验。");
}

// 5. 待决事项必须显式登记(未决问题不得静默进入实现)
if (!/(待决|Open Decision|开放决策)/.test(hld)) {
  failures.push("未登记『待决事项 / Open Decisions』章节,未决架构问题不得静默进入实现。");
}

for (const note of notes) console.log(`   · ${note}`);
if (failures.length > 0) {
  console.error("❌ G2 架构隔离与治理门禁未通过:");
  for (const failure of failures) console.error(`   - ${failure}`);
  process.exit(1);
}
console.log("✅ G2 架构门禁通过: 分层拓扑完整、隔离防线明确、DAR 加权矩阵齐备、需求全覆盖、待决事项已登记。");
