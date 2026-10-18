import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "@paperclipai/db";
import { issueWorkProducts } from "@paperclipai/db";
import { documentService } from "./documents.js";
import type { IssueSpecKitConfig } from "@paperclipai/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ScaffoldSpecParams {
  issueId: string;
  issueIdentifier?: string | null;
  title: string;
  companyId: string;
  projectId?: string | null;
  specKitConfig?: IssueSpecKitConfig | null;
  actor?: {
    agentId?: string | null;
    userId?: string | null;
    runId?: string | null;
  };
}

export interface ScaffoldSpecResult {
  success: boolean;
  specName: string;
  domain: string;
  specType: string;
  specRelDir: string;
  requirementsMarkdown?: string;
  planMarkdown?: string;
  error?: string;
}

export function generateSpecSlug(rawTitle: string, explicitName?: string | null, identifier?: string | null): string {
  if (explicitName && explicitName.trim()) {
    return explicitName.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  }
  // 剥离 【微信·...】 或 [QQ] 等前缀
  const clean = rawTitle.replace(/【[^】]*】/g, "").replace(/\[[^\]]*\]/g, "").trim();
  const asciiMatch = clean.match(/[a-zA-Z0-9_-]{3,}/g);
  if (asciiMatch && asciiMatch.length > 0) {
    const slug = asciiMatch.join("-").toLowerCase().slice(0, 32).replace(/^-+|-+$/g, "");
    if (slug.length >= 3) return slug;
  }
  const ident = identifier ? identifier.toLowerCase().replace(/[^a-z0-9_-]+/g, "-") : "task";
  return `${ident}-${Date.now().toString(36)}`;
}

export function inferSpecDomain(title: string, explicitDomain?: string | null): string {
  if (explicitDomain && explicitDomain.trim()) return explicitDomain.trim().toLowerCase();
  const lower = title.toLowerCase();
  if (lower.includes("pay") || lower.includes("支付") || lower.includes("结算") || lower.includes("财务")) return "pay";
  if (lower.includes("auth") || lower.includes("login") || lower.includes("登录") || lower.includes("权限") || lower.includes("用户")) return "auth";
  if (lower.includes("ontology") || lower.includes("本体")) return "ontology";
  if (lower.includes("governance") || lower.includes("门禁") || lower.includes("架构") || lower.includes("规范")) return "governance";
  if (lower.includes("ops") || lower.includes("运维") || lower.includes("发布") || lower.includes("监控")) return "ops";
  if (lower.includes("wechat") || lower.includes("微信") || lower.includes("qq") || lower.includes("gateway")) return "gateway";
  return "general";
}

export function inferSpecType(title: string, explicitType?: string | null): "feature" | "bugfix" | "refactor" | "security" | "enhancement" {
  if (explicitType && ["feature", "bugfix", "refactor", "security", "enhancement"].includes(explicitType)) {
    return explicitType as "feature" | "bugfix" | "refactor" | "security" | "enhancement";
  }
  const lower = title.toLowerCase();
  if (lower.includes("修") || lower.includes("bug") || lower.includes("fix") || lower.includes("排查") || lower.includes("解决") || lower.includes("卡死") || lower.includes("报错")) {
    return "bugfix";
  }
  if (lower.includes("重构") || lower.includes("refactor") || lower.includes("解耦") || lower.includes("拆分")) {
    return "refactor";
  }
  if (lower.includes("安全") || lower.includes("security") || lower.includes("漏洞") || lower.includes("cve") || lower.includes("防刷")) {
    return "security";
  }
  return "feature";
}

function findSpeckitScript(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "scripts/speckit.cjs"),
    path.resolve(process.cwd(), "../scripts/speckit.cjs"),
    path.resolve(__dirname, "../../../scripts/speckit.cjs"),
    path.resolve(__dirname, "../../scripts/speckit.cjs"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

export function speckitDispatchService(db: Db) {
  const docs = documentService(db);

  return {
    async scaffoldAndBindSpec(params: ScaffoldSpecParams): Promise<ScaffoldSpecResult> {
      const { issueId, issueIdentifier, title, companyId, projectId, specKitConfig, actor } = params;
      const slug = generateSpecSlug(title, specKitConfig?.name, issueIdentifier);
      const domain = inferSpecDomain(title, specKitConfig?.domain);
      const specType = inferSpecType(title, specKitConfig?.type);
      const cleanTitle = title.replace(/【[^】]*】/g, "").replace(/\[[^\]]*\]/g, "").trim() || slug;

      let specRelDir = `docs/specs/${domain}/${slug}`;
      let requirementsMarkdown = "";
      let planMarkdown = "";

      const speckitScript = findSpeckitScript();
      if (speckitScript) {
        try {
          // 动态加载本地单一真理源 speckit 引擎
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { createRequire } = await import("node:module");
          const customRequire = createRequire(import.meta.url);
          const speckitModule = customRequire(speckitScript);

          // 1. 脚手架新规格
          const newRes = speckitModule.handleNew({
            name: slug,
            domain,
            title: cleanTitle,
            type: specType,
            force: true,
          });

          if (newRes && newRes.dir) {
            specRelDir = newRes.specRelDir || path.relative(process.cwd(), newRes.dir);
            const dir = newRes.dir;

            // 1.1 若入参提供了自定义 brief，增量合并
            if (specKitConfig?.brief) {
              const briefPath = path.join(dir, "brief.json");
              if (fs.existsSync(briefPath)) {
                try {
                  const existingBrief = JSON.parse(fs.readFileSync(briefPath, "utf8"));
                  const briefUpdate = typeof specKitConfig.brief === "string"
                    ? { summary: specKitConfig.brief }
                    : specKitConfig.brief;
                  const merged = { ...existingBrief, ...briefUpdate, name: slug, domain };
                  fs.writeFileSync(briefPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
                } catch {}
              }
            }

            // 2. 展开编译生成 15 份规格与任务图
            const buildRes = speckitModule.handleBuild({ name: slug });
            if (buildRes && buildRes.files) {
              requirementsMarkdown = buildRes.files["requirements.md"] || buildRes.files["spec.md"] || "";
              planMarkdown = buildRes.files["plan.md"] || buildRes.files["tasks.md"] || "";
            } else {
              const reqPath = path.join(dir, "requirements.md");
              const planPath = path.join(dir, "plan.md");
              if (fs.existsSync(reqPath)) requirementsMarkdown = fs.readFileSync(reqPath, "utf8");
              if (fs.existsSync(planPath)) planMarkdown = fs.readFileSync(planPath, "utf8");
            }
          }
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          // 软降级：若在脱机或只读环境脚手架失败，构造合规的缺省 EARS 与 Wave 任务 Markdown
          requirementsMarkdown = `# [Spec·${domain}] ${cleanTitle}\n\n` +
            `> 由 Spec-Kit 派单引擎自动生成 (类型: ${specType}, 领域: ${domain})\n\n` +
            `## 1. 业务目标与价值\n${cleanTitle}\n\n` +
            `## 2. EARS 需求与验收标准\n- [ ] **Ubiquitous**: 系统应无感保持高可用与可回溯。\n` +
            `- [ ] **Event-Driven**: 当触发此工单动作时，执行严格状态机校验。\n`;

          planMarkdown = `# [Plan·${domain}] ${cleanTitle}\n\n` +
            `## Wave 任务波次图\n` +
            `- [ ] **T1**: 编写红灯复现测试或建立契约规格 [T1]\n` +
            `- [ ] **T2**: 实施核心业务变更并验证状态机闭环 [T2]\n` +
            `- [ ] **T3**: 全栈回归与 1 Task = 1 Commit 证据核验 [T3]\n`;
        }
      } else {
        requirementsMarkdown = `# [Spec·${domain}] ${cleanTitle}\n\n` +
          `> 由 Spec-Kit 派单引擎自动生成 (类型: ${specType}, 领域: ${domain})\n\n` +
          `## 1. 业务目标\n${cleanTitle}\n`;
        planMarkdown = `# [Plan·${domain}] ${cleanTitle}\n\n` +
          `- [ ] **T1**: 实施业务变更 [T1]\n`;
      }

      // 3. 原子同步写入官方 issue_documents
      if (requirementsMarkdown.trim()) {
        try {
          await docs.upsertIssueDocument({
            issueId,
            key: "spec",
            title: `Specification (${cleanTitle})`,
            format: "markdown",
            body: requirementsMarkdown,
            createdByAgentId: actor?.agentId ?? null,
            createdByUserId: actor?.userId ?? null,
            createdByRunId: actor?.runId ?? null,
          });
        } catch {}
      }

      if (planMarkdown.trim()) {
        try {
          await docs.upsertIssueDocument({
            issueId,
            key: "plan",
            title: `Plan (${cleanTitle})`,
            format: "markdown",
            body: planMarkdown,
            createdByAgentId: actor?.agentId ?? null,
            createdByUserId: actor?.userId ?? null,
            createdByRunId: actor?.runId ?? null,
          });
        } catch {}
      }

      // 4. 挂载物理规格工件凭证 (issue_work_products)
      try {
        await db.insert(issueWorkProducts).values({
          companyId,
          projectId: projectId ?? null,
          issueId,
          title: `Spec-Kit 需求规格说明: ${slug}`,
          type: "specification",
          provider: "speckit",
          status: "active",
          summary: `由 Spec-Kit 自动生成之物理规格，相对路径: ${specRelDir}`,
          metadata: {
            resourceRef: {
              kind: "workspace_file",
              path: `${specRelDir}/requirements.md`,
            },
            specName: slug,
            domain,
            specType,
          },
          createdByRunId: actor?.runId ?? null,
        });
      } catch {}

      return {
        success: true,
        specName: slug,
        domain,
        specType,
        specRelDir,
        requirementsMarkdown,
        planMarkdown,
      };
    },
  };
}
