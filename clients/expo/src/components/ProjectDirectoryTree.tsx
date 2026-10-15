import React, { useState, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { CompanyArtifact, Project } from "@coolie/api-client";
import { C, COOLIE_BASE_URL } from "../coolie";

export interface ProjectFileNode {
  name: string;
  relativePath: string;
  type: "file" | "directory";
  fileKind?: "code" | "document" | "binary" | "sandbox" | "blueprint" | "config";
  sizeText?: string;
  badge?: string;
  description?: string;
  actionText?: string; // 2汉字标准: 【查看】/【预览】/【沙箱】/【下载】
  content?: string;
  language?: string;
  url?: string;
  artifact?: CompanyArtifact;
  children?: ProjectFileNode[];
}

export interface ProjectDirectoryTreeProps {
  project: Project | { id: string; name: string; description?: string | null };
  artifacts: CompanyArtifact[];
  onResetProject?: () => void;
  onOpenFile: (file: {
    title: string;
    path: string;
    content?: string;
    language?: string;
    artifact?: CompanyArtifact;
  }) => void;
  onOpenSandbox: (url: string, title?: string, artifact?: CompanyArtifact) => void;
  onDownload: (file: {
    url: string;
    filename: string;
    title: string;
    mimeType?: string;
    sizeText?: string;
  }) => void;
}

function isBinaryArtifact(item?: CompanyArtifact | null): boolean {
  if (!item) return false;
  const ct = (item.contentType ?? "").toLowerCase();
  const title = (item.title ?? "").toLowerCase();
  const path = (item.openPath || item.downloadPath || "").toLowerCase();
  return (
    ct.includes("word") ||
    ct.includes("officedocument") ||
    ct.includes("pdf") ||
    ct.includes("excel") ||
    ct.includes("spreadsheet") ||
    ct.includes("powerpoint") ||
    ct.includes("presentation") ||
    ct.includes("zip") ||
    ct.includes("octet-stream") ||
    ct.includes("android.package-archive") ||
    ct.includes("gzip") ||
    title.endsWith(".docx") ||
    title.endsWith(".doc") ||
    title.endsWith(".xlsx") ||
    title.endsWith(".pptx") ||
    title.endsWith(".pdf") ||
    title.endsWith(".zip") ||
    title.endsWith(".apk") ||
    title.endsWith(".tar.gz") ||
    path.endsWith(".apk") ||
    path.endsWith(".tar.gz") ||
    path.endsWith(".pdf") ||
    path.endsWith(".zip")
  );
}

function getArtifactCategory(artifact: CompanyArtifact): string {
  const p = (artifact.openPath || artifact.contentPath || "").toLowerCase();
  const t = (artifact.title || "").toLowerCase();
  const it = (artifact.issue?.title || "").toLowerCase();
  const text = `${p} ${t} ${it}`;

  // G5 / Release / Deployment / Fingerprint / Rollback
  if (
    text.includes("07_release") ||
    text.includes("release") ||
    text.includes("deploy") ||
    text.includes("sop") ||
    text.includes("fingerprint") ||
    text.includes("rollback") ||
    text.includes("投产") ||
    text.includes("发布") ||
    text.includes("回滚") ||
    text.includes("g5")
  ) {
    return "07_release";
  }

  // G4 / Verification / Tests / Audit
  if (
    text.includes("05_verification") ||
    text.includes("test") ||
    text.includes("验收") ||
    text.includes("测试") ||
    text.includes("g4") ||
    text.includes("eval") ||
    text.includes("mutation")
  ) {
    return "05_verification";
  }

  // G2 / G3 / Design / Architecture / Contracts / LLD / HLD
  if (
    text.includes("03_design") ||
    text.includes("hld") ||
    text.includes("lld") ||
    text.includes("contract") ||
    text.includes("facade") ||
    text.includes("架构") ||
    text.includes("设计") ||
    text.includes("g2") ||
    text.includes("g3") ||
    text.includes("erd") ||
    text.includes("openapi")
  ) {
    return "03_design";
  }

  // G1 / Requirements / SRS
  if (
    text.includes("02_requirements") ||
    text.includes("srs") ||
    text.includes("urs") ||
    text.includes("rtm") ||
    text.includes("需求") ||
    text.includes("g1")
  ) {
    return "02_requirements";
  }

  // G6 / SRE / SLO
  if (
    text.includes("08_sre") ||
    text.includes("sre") ||
    text.includes("slo") ||
    text.includes("sli") ||
    text.includes("postmortem") ||
    text.includes("复盘") ||
    text.includes("g6")
  ) {
    return "08_sre";
  }

  // G7 / Operations / Reconciliation
  if (
    text.includes("09_operations") ||
    text.includes("operations") ||
    text.includes("ops") ||
    text.includes("reconcil") ||
    text.includes("对账") ||
    text.includes("平账") ||
    text.includes("运营") ||
    text.includes("g7")
  ) {
    return "09_operations";
  }

  // G0 / QA / Compliance / CAR / SPC / Audit
  if (
    text.includes("06_quality") ||
    text.includes("qa") ||
    text.includes("spc") ||
    text.includes("car") ||
    text.includes("audit") ||
    text.includes("质量") ||
    text.includes("门禁")
  ) {
    return "06_quality_assurance";
  }

  // Project Management / Charter / DAR / WBS
  if (
    text.includes("01_management") ||
    text.includes("charter") ||
    text.includes("立项") ||
    text.includes("raci") ||
    text.includes("wbs") ||
    text.includes("dar")
  ) {
    return "01_management";
  }

  // Specs
  if (
    text.includes("specs") ||
    text.includes("spec") ||
    text.includes("brief") ||
    text.includes("tasks")
  ) {
    return "specs";
  }

  // Machine Evidence / Artifacts
  if (
    text.includes("artifacts") ||
    text.includes("evidence") ||
    text.includes("scan") ||
    text.includes("trace")
  ) {
    return "artifacts";
  }

  // Code files
  if (
    (artifact.source === "work_product" || artifact.source === "document") &&
    (p.startsWith("src/") ||
      p.includes("/src/") ||
      t.includes("源码") ||
      t.includes("server.js") ||
      t.includes("mcp-cli") ||
      t.endsWith(".ts") ||
      t.endsWith(".tsx") ||
      t.endsWith(".js") ||
      t.endsWith(".mjs") ||
      t.endsWith(".java") ||
      t.endsWith(".py") ||
      t.endsWith(".sql") ||
      t.endsWith(".vue") ||
      t.endsWith(".json"))
  ) {
    return "src";
  }

  // Images / Media
  if (artifact.mediaKind === "image" || artifact.mediaKind === "video") {
    return "media";
  }

  return "deliverables";
}

function artifactToFileNode(
  artifact: CompanyArtifact,
  folderPath: string,
  index: number
): ProjectFileNode {
  const binary = isBinaryArtifact(artifact);
  const isDoc =
    artifact.mediaKind === "document" || artifact.source === "document";
  const isSandbox =
    artifact.source === "work_product" &&
    ((artifact.previewText?.includes("http") ?? false) ||
      artifact.title.includes("沙箱") ||
      artifact.title.includes("原型"));

  let name = artifact.title || `deliverable-${index + 1}`;
  if (!name.includes(".") && isDoc) {
    name = `${name}.md`;
  }

  const relativePath = `${folderPath}/${name}`;

  let fileKind: ProjectFileNode["fileKind"] = "document";
  if (binary) fileKind = "binary";
  else if (isSandbox) fileKind = "sandbox";
  else if (
    name.endsWith(".sql") ||
    name.endsWith(".ts") ||
    name.endsWith(".js") ||
    name.endsWith(".java") ||
    name.endsWith(".json")
  ) {
    fileKind = "code";
  } else if (
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".webp")
  ) {
    fileKind = "blueprint";
  }

  let actionText = "查看";
  if (binary) actionText = "下载";
  else if (isSandbox) actionText = "沙箱";
  else if (fileKind === "blueprint") actionText = "图纸";

  const agent = artifact.createdByAgent?.name
    ? `经手: ${artifact.createdByAgent.name}`
    : "";
  const issueId = artifact.issue?.identifier || "";
  const badge = issueId
    ? `${issueId} · ${artifact.source === "work_product" ? "工件" : "文档"}`
    : "真资产";

  const description = `${agent ? `${agent} · ` : ""}${
    artifact.issue?.title || artifact.previewText?.slice(0, 45) || "已归档工程真资产"
  }`;

  return {
    name,
    relativePath,
    type: "file",
    fileKind,
    sizeText: isDoc ? "在线文档" : binary ? "二进制制品" : "真实资产",
    badge,
    description,
    actionText,
    content: artifact.previewText || "",
    language: name.endsWith(".json")
      ? "json"
      : name.endsWith(".sql")
      ? "sql"
      : name.endsWith(".ts") || name.endsWith(".js")
      ? "javascript"
      : "markdown",
    artifact,
  };
}

export function ProjectDirectoryTree({
  project,
  artifacts,
  onResetProject,
  onOpenFile,
  onOpenSandbox,
  onDownload,
}: ProjectDirectoryTreeProps) {
  // 记录折叠/展开的目录路径，默认展开核心目录以供检视
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set([
      "wiki",
      "wiki/stages",
      "docs/01_management",
      "docs/02_requirements",
      "docs/03_design",
      "docs/05_verification",
      "docs/07_release",
      "docs/specs",
      "src",
      "deploy",
      "deliverables",
      "media",
    ])
  );

  const toggleFolder = (folderPath: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  };


  // 将当前项目的真实产物按 CMMI 01~09 及工程子目录进行智能分类
  const categorizedArtifacts = useMemo(() => {
    const map: Record<string, CompanyArtifact[]> = {
      "01_management": [],
      "02_requirements": [],
      "03_design": [],
      "04_implementation": [],
      "05_verification": [],
      "06_quality_assurance": [],
      "07_release": [],
      "08_sre": [],
      "09_operations": [],
      specs: [],
      artifacts: [],
      src: [],
      media: [],
      deliverables: [],
    };

    for (const art of artifacts) {
      const category = getArtifactCategory(art);
      if (map[category]) {
        map[category].push(art);
      } else {
        map.deliverables.push(art);
      }
    }
    return map;
  }, [artifacts]);

  // 根据当前项目与已有真实产物动态构建专属的工程目录树
  const treeData = useMemo<ProjectFileNode[]>(() => {
    const projectName = project.name;
    const projectDesc = project.description || "全自主端到端商业软件交付工厂项目";

    // 0. OpenWiki 动态知识大脑 (wiki/)
    const wikiStageNodes: ProjectFileNode[] = [
      {
        name: "00_meta_standards.md",
        relativePath: "wiki/stages/00_meta_standards.md",
        type: "file",
        fileKind: "document",
        sizeText: "规范标准",
        badge: "00·元编程",
        description: `《${projectName}》技能元数据与测评基准 (主责: 墨斗·FDA)`,
        actionText: "查看",
        language: "markdown",
        content: `# 00 规范与元编程 (Meta & Standards)\n\n- 所属工程: ${projectName}\n- 核心技能: skill-authoring, skill-creator\n- 交付物: 合规 SKILL.md、技能测评报告\n- 阻断条件: 未经格式审计与测评的非规范技能严禁入仓。`,
      },
      {
        name: "01_management.md",
        relativePath: "wiki/stages/01_management.md",
        type: "file",
        fileKind: "document",
        sizeText: "选型立项",
        badge: "01·DAR选型",
        description: `《${projectName}》DAR 加权权衡矩阵与 WBS 里程碑任务分解 (主责: 墨斗/百晓生)`,
        actionText: "查看",
        language: "markdown",
        content: `# 01_management 决策分析与立项 (DAR & WBS)\n\n- 所属工程: ${projectName}\n- 核心技能: dar-decision-matrix, solution-scouting-and-dar, cmmi-wbs-milestone\n- 交付物: docs/01_management/dar-decision-records/、WBS 里程碑骨架树\n- 阻断条件: 拍脑袋盲目选型严禁开工。`,
      },
      {
        name: "02_requirements.md",
        relativePath: "wiki/stages/02_requirements.md",
        type: "file",
        fileKind: "document",
        sizeText: "需求工程",
        badge: "02·EARS需求",
        description: `《${projectName}》IEEE 29148 / EARS 需求规格与双向 RTM (主责: 百晓生/Hermes)`,
        actionText: "查看",
        language: "markdown",
        content: `# 02_requirements 需求工程与规格 (EARS & Spec-First)\n\n- 所属工程: ${projectName}\n- 核心技能: ears-spec-writer, cmmi-req-spec, requirements-capture\n- 交付物: docs/02_requirements/software-requirements.md、rtm-traceability-matrix.md\n- 敏捷特性包: docs/specs/<domain>/<feature-slug>/\n- 阻断条件: 口语化伪需求严禁编码。`,
      },
      {
        name: "03_design.md",
        relativePath: "wiki/stages/03_design.md",
        type: "file",
        fileKind: "document",
        sizeText: "架构契约",
        badge: "03·架构契约",
        description: `《${projectName}》总体架构 HLD、OpenAPI 契约与 ERD 模型 (主责: 墨斗/铁匠)`,
        actionText: "查看",
        language: "markdown",
        content: `# 03_design 架构设计与契约 (HLD, LLD & OpenAPI)\n\n- 所属工程: ${projectName}\n- 核心技能: cmmi-tech-solution, cmmi-detailed-contracts, adr-architect, archify\n- 交付物: docs/03_design/architecture-design-hld.md、interface-contracts/\n- 阻断条件: 跨域直连与手写无契约 Route 严禁通过。`,
      },
      {
        name: "04_implementation.md",
        relativePath: "wiki/stages/04_implementation.md",
        type: "file",
        fileKind: "document",
        sizeText: "编码实现",
        badge: "04·插件化",
        description: `《${projectName}》业务模块持久化与强类型 RPC 门面 (主责: 铁匠·CoreSWE)`,
        actionText: "查看",
        language: "markdown",
        content: `# 04_implementation 编码实现与插件化 (Core SWE & Plugins)\n\n- 所属工程: ${projectName}\n- 核心技能: core-swe, swe-delivery-flow, mcp-builder\n- 交付物: 业务插件、BaseMapper 持久化、RPC Facade\n- 阻断条件: 跳过类型校验与越权操作严禁合入主干。`,
      },
      {
        name: "05_verification.md",
        relativePath: "wiki/stages/05_verification.md",
        type: "file",
        fileKind: "document",
        sizeText: "打假验收",
        badge: "05·变异打假",
        description: `《${projectName}》变异测试反假Mock、真实 DB 驱动与真机快照 (主责: 门神/百晓生)`,
        actionText: "查看",
        language: "markdown",
        content: `# 05_verification 变异测试打假与全栈验收 (Anti-Fake Mock)\n\n- 所属工程: ${projectName}\n- 核心技能: cmmi-ver-val, mutation-tester, qa-humanlike-e2e\n- 交付物: docs/05_verification/test-summary-report.md、真机四态快照\n- 阻断条件: 假 Mock、空断言绿牌一票否决。`,
      },
      {
        name: "06_quality_assurance.md",
        relativePath: "wiki/stages/06_quality_assurance.md",
        type: "file",
        fileKind: "document",
        sizeText: "过程质量",
        badge: "06·门禁审计",
        description: `《${projectName}》门禁全绿跟踪、FCA/PCA 配置审计与 SPC 预防 (主责: 门神/Hermes)`,
        actionText: "查看",
        language: "markdown",
        content: `# 06_quality_assurance 质量门禁与过程控制 (Compliance & CAR)\n\n- 所属工程: ${projectName}\n- 核心技能: cmmi-car-spc-metrics, check-governance\n- 交付物: 门禁全绿追踪日志、FCA/PCA 审计单\n- 阻断条件: 存在 Blocker 债务严禁宣称完工。`,
      },
      {
        name: "07_release.md",
        relativePath: "wiki/stages/07_release.md",
        type: "file",
        fileKind: "document",
        sizeText: "不可变投产",
        badge: "07·容器发布",
        description: `《${projectName}》不可变容器镜像与秒级回滚 SOP (主责: 兜底渊·SRE)`,
        actionText: "查看",
        language: "markdown",
        content: `# 07_release 容器交付与不可变投产 (DevOps & Release)\n\n- 所属工程: ${projectName}\n- 核心技能: cmmi-immutable-release, app-release-pipeline\n- 交付物: docs/07_release/system-deployment-sop.md、生产编排\n- 阻断条件: 生产指纹漂移严禁放行。`,
      },
      {
        name: "08_sre.md",
        relativePath: "wiki/stages/08_sre.md",
        type: "file",
        fileKind: "document",
        sizeText: "可靠性保障",
        badge: "08·SLO复盘",
        description: `《${projectName}》SLO/SLI 矩阵与 5-Whys 无指责复盘 (主责: 兜底渊·SRE)`,
        actionText: "查看",
        language: "markdown",
        content: `# 08_sre 可靠性保障与事故复盘 (SRE, SLO & Incident)\n\n- 所属工程: ${projectName}\n- 核心技能: sre-slo-manager, postmortem-analyzer, strix-penetration-testing\n- 交付物: docs/08_sre/SLO-SLI-ERROR-BUDGET-MATRIX.md、安全渗透报告\n- 阻断条件: 盲目裸跑发版严禁关闭工单。`,
      },
      {
        name: "09_operations.md",
        relativePath: "wiki/stages/09_operations.md",
        type: "file",
        fileKind: "document",
        sizeText: "商业运营",
        badge: "09·平账对账",
        description: `《${projectName}》日终/月终财务对账平账与租户治理大盘 (主责: 百晓生/掌柜)`,
        actionText: "查看",
        language: "markdown",
        content: `# 09_operations 商业化持续运营与对账平账 (Ops & Reconciliation)\n\n- 所属工程: ${projectName}\n- 核心技能: financial-reconciliation-agent, ceo-company-ops\n- 交付物: docs/09_operations/tenant-governance.md\n- 阻断条件: 资金不守恒、账实不符一票否决。`,
      },
    ];

    const wikiNodes: ProjectFileNode[] = [
      {
        name: "index.md",
        relativePath: "wiki/index.md",
        type: "file",
        fileKind: "document",
        sizeText: "知识大脑",
        badge: "OpenWiki",
        description: `《${projectName}》面向 AI 数字员工的动态索引大脑 (RFC 8615)`,
        actionText: "查看",
        language: "markdown",
        content: `# 《${projectName}》OpenWiki (LLM 知识大脑)\n\n> **核心索引**：本知识库由底座真实元数据与各阶段契约自动化编译生成自愈。AI 数字员工进场首屏检索，Token 消耗直降 80%！\n\n## ⚡ 核心概况\n- 所属系统: ${projectName}\n- 业务说明: ${projectDesc}\n- CMMI 规范: 严格保持 docs/specs/ 扁平开放结构与 G1~G5 门禁。`,
      },
      {
        name: "stages",
        relativePath: "wiki/stages",
        type: "directory",
        badge: "CMMI截断",
        description: "00~09 全生命周期各阶段交付规范、核心专属 Skills 与门禁准则",
        children: wikiStageNodes,
      },
    ];

    // 1. 【01_management】项目立项与策划
    const mgtArtifacts = categorizedArtifacts["01_management"];
    const mgtNodes: ProjectFileNode[] = mgtArtifacts.length > 0
      ? mgtArtifacts.map((a, i) => artifactToFileNode(a, "docs/01_management", i))
      : [
          {
            name: "project-charter.md",
            relativePath: "docs/01_management/project-charter.md",
            type: "file",
            fileKind: "document",
            sizeText: "待生成",
            badge: "01·立项基线",
            description: `${projectName} 项目立项书与权责声明 (待 G0 门禁归档)`,
            actionText: "规约",
            language: "markdown",
            content: `# ${projectName} · 项目立项书 (Project Charter)\n\n- 所属工程: ${projectName}\n- 立项说明: ${projectDesc}\n- 阶段状态: 立项基线阶段，等待数字员工派工并正式归档\n- 交付要求: 需产出 WBS 里程碑字典、RACI 权责矩阵与 DAR 架构选型决议。`,
          },
        ];

    // 2. 【02_requirements】需求工程与规格
    const reqArtifacts = categorizedArtifacts["02_requirements"];
    const reqNodes: ProjectFileNode[] = reqArtifacts.length > 0
      ? reqArtifacts.map((a, i) => artifactToFileNode(a, "docs/02_requirements", i))
      : [
          {
            name: "software-requirements.md",
            relativePath: "docs/02_requirements/software-requirements.md",
            type: "file",
            fileKind: "document",
            sizeText: "待生成",
            badge: "02·需求基线",
            description: `${projectName} 软件需求规格说明书 (待 G1 门禁归档)`,
            actionText: "规约",
            language: "markdown",
            content: `# ${projectName} · 软件需求规格说明书 (SRS)\n\n- 所属工程: ${projectName}\n- 阶段状态: 尚未归档正式需求规格，等待 G1 门禁交付\n- 交付要求: 需遵循 IEEE 29148 / EARS 语法，产出 EARS 需求规格与双向需求跟踪矩阵 (RTM)。`,
          },
        ];

    // 3. 【03_design】架构设计与契约
    const designArtifacts = categorizedArtifacts["03_design"];
    const designNodes: ProjectFileNode[] = designArtifacts.length > 0
      ? designArtifacts.map((a, i) => artifactToFileNode(a, "docs/03_design", i))
      : [
          {
            name: "architecture-design-hld.md",
            relativePath: "docs/03_design/architecture-design-hld.md",
            type: "file",
            fileKind: "document",
            sizeText: "待生成",
            badge: "03·设计基线",
            description: `${projectName} 总体架构设计与契约规范 (待 G2/G3 门禁归档)`,
            actionText: "规约",
            language: "markdown",
            content: `# ${projectName} · 总体架构设计 (HLD) 与接口契约\n\n- 所属工程: ${projectName}\n- 阶段状态: 尚未归档架构设计说明，等待 G2/G3 门禁交付\n- 交付要求: 需产出系统概要设计 (HLD)、详细设计 (LLD)、OpenAPI 统一契约与 ERD 数据模型。`,
          },
        ];

    // 4. 【05_verification】验证验收与测试报告
    const verArtifacts = categorizedArtifacts["05_verification"];
    const verNodes: ProjectFileNode[] = verArtifacts.length > 0
      ? verArtifacts.map((a, i) => artifactToFileNode(a, "docs/05_verification", i))
      : [
          {
            name: "test-summary-report.md",
            relativePath: "docs/05_verification/test-summary-report.md",
            type: "file",
            fileKind: "document",
            sizeText: "待生成",
            badge: "05·验收基线",
            description: `${projectName} 全栈集成测试总结报告 (待 G4 门禁归档)`,
            actionText: "规约",
            language: "markdown",
            content: `# ${projectName} · 全栈集成测试总结报告 (VER/VAL)\n\n- 所属工程: ${projectName}\n- 阶段状态: 尚未归档验收报告，等待 G4 全栈验收门禁\n- 交付要求: 需产出端到端四态真机测试快照、反假 Mock 变异测试报告与客户终验核销单 (UAT)。`,
          },
        ];

    // 5. 【06_quality_assurance】质量保证与门禁
    const qaArtifacts = categorizedArtifacts["06_quality_assurance"];
    const qaNodes: ProjectFileNode[] = qaArtifacts.length > 0
      ? qaArtifacts.map((a, i) => artifactToFileNode(a, "docs/06_quality_assurance", i))
      : [
          {
            name: "car-prevention.md",
            relativePath: "docs/06_quality_assurance/car-prevention.md",
            type: "file",
            fileKind: "document",
            sizeText: "待生成",
            badge: "06·质量基线",
            description: `${projectName} CMMI 5 缺陷因果预防与过程审计 (待审计门禁归档)`,
            actionText: "规约",
            language: "markdown",
            content: `# ${projectName} · 质量门禁与过程控制 (CAR & SPC)\n\n- 所属工程: ${projectName}\n- 阶段状态: 等待过程质量审计与门禁全绿校验\n- 交付要求: 门禁全绿日志、FCA/PCA 配置审计单与 SPC 缺陷预防记录。`,
          },
        ];

    // 6. 【07_release】发布交付与投产 SOP
    const releaseArtifacts = categorizedArtifacts["07_release"];
    const releaseNodes: ProjectFileNode[] = releaseArtifacts.length > 0
      ? releaseArtifacts.map((a, i) => artifactToFileNode(a, "docs/07_release", i))
      : [
          {
            name: "system-deployment-sop.md",
            relativePath: "docs/07_release/system-deployment-sop.md",
            type: "file",
            fileKind: "document",
            sizeText: "待生成",
            badge: "07·投产基线",
            description: `${projectName} 生产部署 SOP 与秒级回滚预案 (待 G5 门禁归档)`,
            actionText: "规约",
            language: "markdown",
            content: `# ${projectName} · 系统投产与部署 SOP\n\n- 所属工程: ${projectName}\n- 阶段状态: 尚未归档投产 SOP，等待 G5 投产门禁\n- 交付要求: 不可变制品指纹、生产环境拓扑、部署说明与秒级回滚预案。`,
          },
        ];

    // 7. 【08_sre】SRE 可靠性保障与事故复盘
    const sreArtifacts = categorizedArtifacts["08_sre"];
    const sreNodes: ProjectFileNode[] = sreArtifacts.length > 0
      ? sreArtifacts.map((a, i) => artifactToFileNode(a, "docs/08_sre", i))
      : [
          {
            name: "SLO-SLI-ERROR-BUDGET-MATRIX.md",
            relativePath: "docs/08_sre/SLO-SLI-ERROR-BUDGET-MATRIX.md",
            type: "file",
            fileKind: "document",
            sizeText: "待生成",
            badge: "08·SRE基线",
            description: `${projectName} 服务等级目标与告警阈值矩阵 (待 G6 门禁归档)`,
            actionText: "规约",
            language: "markdown",
            content: `# ${projectName} · SRE 可靠性度量矩阵\n\n- 所属工程: ${projectName}\n- 阶段状态: 尚未归档 SLO 度量矩阵，等待 G6 SRE 门禁\n- 交付要求: SLO/SLI 矩阵、错误预算燃烧率与 5-Whys 故障复盘 SOP。`,
          },
        ];

    // 8. 【09_operations】持续运营与对账平账
    const opsArtifacts = categorizedArtifacts["09_operations"];
    const opsNodes: ProjectFileNode[] = opsArtifacts.length > 0
      ? opsArtifacts.map((a, i) => artifactToFileNode(a, "docs/09_operations", i))
      : [
          {
            name: "tenant-governance.md",
            relativePath: "docs/09_operations/tenant-governance.md",
            type: "file",
            fileKind: "document",
            sizeText: "待生成",
            badge: "09·运营基线",
            description: `${projectName} 持续运营多租户治理与对账规约 (待 G7 门禁归档)`,
            actionText: "规约",
            language: "markdown",
            content: `# ${projectName} · 持续运营与多租户治理规约\n\n- 所属工程: ${projectName}\n- 阶段状态: 尚未归档对账台账，等待 G7 持续运营门禁\n- 交付要求: 资金轧差对账平账 SOP、多租户开通治理与日终清算台账。`,
          },
        ];

    // 9. 【docs/specs】敏捷特性全息包
    const specArtifacts = categorizedArtifacts.specs;
    const specNodes: ProjectFileNode[] = specArtifacts.length > 0
      ? specArtifacts.map((a, i) => artifactToFileNode(a, "docs/specs", i))
      : [
          {
            name: "core/init-baseline",
            relativePath: "docs/specs/core/init-baseline",
            type: "directory",
            badge: "特性全息包",
            description: `${projectName} 工程初始地基全息内聚包 (Spec-Ops SDD)`,
            children: [
              {
                name: "brief.json",
                relativePath: "docs/specs/core/init-baseline/brief.json",
                type: "file",
                fileKind: "document",
                sizeText: "声明文件",
                badge: "Brief",
                description: `${projectName} 初始地基特性声明真源`,
                actionText: "查看",
                language: "json",
                content: JSON.stringify(
                  {
                    name: "init-baseline",
                    domain: "core",
                    title: `${projectName} 工程地基基线`,
                    type: "feature",
                    goal: `完成 ${projectName} 工程地基搭建与全生命周期规范初始化`,
                    project: projectName,
                  },
                  null,
                  2
                ),
              },
            ],
          },
        ];

    // 10. 【docs/artifacts】机器证据库
    const evidenceArtifacts = categorizedArtifacts.artifacts;
    const evidenceNodes: ProjectFileNode[] = evidenceArtifacts.length > 0
      ? evidenceArtifacts.map((a, i) => artifactToFileNode(a, "docs/artifacts", i))
      : [
          {
            name: "env-fingerprint.json",
            relativePath: "docs/artifacts/env-fingerprint.json",
            type: "file",
            fileKind: "code",
            sizeText: "机器指纹",
            badge: "环境指纹",
            description: `${projectName} 硬件环境指纹与不可变构建时间戳`,
            actionText: "查看",
            language: "json",
            content: JSON.stringify(
              {
                project: projectName,
                timestamp: new Date().toISOString(),
                nodeVersion: "v22.x",
                status: "VERIFIED",
              },
              null,
              2
            ),
          },
        ];

    // 11. 【src/】核心源码目录 (仅展示当前项目真实已归档的代码与契约工件，严禁虚构伪造模板源码)
    const codeArtifacts = categorizedArtifacts.src;
    const srcNodes: ProjectFileNode[] = codeArtifacts.map((art, idx) =>
      artifactToFileNode(art, "src", idx)
    );

    // 12. 【deploy/】交付制品目录 (仅展示当前项目已归档的物理制品，绝不混淆或伪造历史数据)
    const deployArtifacts = artifacts.filter((a) => {
      const p = (a.openPath || a.contentPath || a.downloadPath || "").toLowerCase();
      const t = (a.title || "").toLowerCase();
      const ct = (a.contentType || "").toLowerCase();
      return (
        p.includes("deploy") ||
        t.includes("deploy") ||
        t.includes("apk") ||
        p.includes("apk") ||
        ct.includes("android.package-archive") ||
        t.endsWith(".apk") ||
        p.endsWith(".apk") ||
        t.endsWith(".tar.gz") ||
        t.endsWith(".zip") ||
        t.includes("docker") ||
        t.includes("编排") ||
        t.includes("镜像")
      );
    });

    const deployNodes: ProjectFileNode[] = deployArtifacts.map((a, i) =>
      artifactToFileNode(a, "deploy", i)
    );

    // 装配 CMMI 01~09 规范目录
    const cmmiDocFolders: ProjectFileNode[] = [
      {
        name: "docs/01_management",
        relativePath: "docs/01_management",
        type: "directory",
        badge: mgtArtifacts.length > 0 ? `01·${mgtArtifacts.length}份真资产` : "01·立项策划",
        description: "项目立项书、综合管理计划、交付风险台账与 DAR 选型决议",
        children: mgtNodes,
      },
      {
        name: "docs/02_requirements",
        relativePath: "docs/02_requirements",
        type: "directory",
        badge: reqArtifacts.length > 0 ? `02·${reqArtifacts.length}份真资产` : "02·需求工程",
        description: "IEEE 29148 / EARS 软件需求规格说明书 (SRS)、URS 与双向 RTM 矩阵",
        children: reqNodes,
      },
      {
        name: "docs/03_design",
        relativePath: "docs/03_design",
        type: "directory",
        badge: designArtifacts.length > 0 ? `03·${designArtifacts.length}份真资产` : "03·架构契约",
        description: "总体架构说明书 (HLD)、物理 ERD 规约、统一 OpenAPI 契约与 MADR",
        children: designNodes,
      },
      {
        name: "docs/05_verification",
        relativePath: "docs/05_verification",
        type: "directory",
        badge: verArtifacts.length > 0 ? `05·${verArtifacts.length}份真资产` : "05·打假验收",
        description: "全栈集成测试总结报告 (VER/VAL)、四态覆盖率、反假 Mock 与缺陷台账",
        children: verNodes,
      },
      {
        name: "docs/06_quality_assurance",
        relativePath: "docs/06_quality_assurance",
        type: "directory",
        badge: qaArtifacts.length > 0 ? `06·${qaArtifacts.length}份真资产` : "06·质量保证",
        description: "物理/功能配置审计报告 (PCA/FCA)、CAR 缺陷因果预防与 SPC 控制界限",
        children: qaNodes,
      },
      {
        name: "docs/07_release",
        relativePath: "docs/07_release",
        type: "directory",
        badge: releaseArtifacts.length > 0 ? `07·${releaseArtifacts.length}份真资产` : "07·发布交付",
        description: "版本发布说明书、生产部署 SOP、秒级回滚自动化预案与制品指纹",
        children: releaseNodes,
      },
      {
        name: "docs/08_sre",
        relativePath: "docs/08_sre",
        type: "directory",
        badge: sreArtifacts.length > 0 ? `08·${sreArtifacts.length}份真资产` : "08·SRE保障",
        description: "SLO/SLI 矩阵、APM 链路追踪、多活容灾双活演练与 5-Whys 无指责复盘",
        children: sreNodes,
      },
      {
        name: "docs/09_operations",
        relativePath: "docs/09_operations",
        type: "directory",
        badge: opsArtifacts.length > 0 ? `09·${opsArtifacts.length}份真资产` : "09·持续运营",
        description: "日终/月终财务与业务对账平账、租户治理、健康巡检与数字员工造数",
        children: opsNodes,
      },
      {
        name: "docs/specs",
        relativePath: "docs/specs",
        type: "directory",
        badge: specArtifacts.length > 0 ? `敏捷·${specArtifacts.length}特性` : "敏捷特性规格",
        description: "Spec-Ops 全息内聚特性规格包 (brief, requirements, design, tasks, evidence)",
        children: specNodes,
      },
      {
        name: "docs/artifacts",
        relativePath: "docs/artifacts",
        type: "directory",
        badge: evidenceArtifacts.length > 0 ? `证据·${evidenceArtifacts.length}条目` : "机器证据库",
        description: "真实安全渗透扫描报告、生产高并发压测结果、环境硬件指纹与门禁追踪",
        children: evidenceNodes,
      },
    ];

    const rootList: ProjectFileNode[] = [
      {
        name: "wiki",
        relativePath: "wiki",
        type: "directory",
        badge: "OpenWiki大脑",
        description: "RFC 8615 动态自愈知识大脑，CMMI 00~09 截断技能路由与领域百科",
        children: wikiNodes,
      },
      ...cmmiDocFolders,
    ];

    if (srcNodes.length > 0) {
      rootList.push({
        name: "src",
        relativePath: "src",
        type: "directory",
        badge: `源码·${srcNodes.length}个工件`,
        description: "核心算法求解器、业务网关与后端微服务物理全栈实现",
        children: srcNodes,
      });
    }

    if (deployNodes.length > 0) {
      rootList.push({
        name: "deploy",
        relativePath: "deploy",
        type: "directory",
        badge: `制品·${deployNodes.length}个物理制品`,
        description: "不可变生产镜像编排、发布指纹与物理交付制品",
        children: deployNodes,
      });
    }

    // 如果该项目有额外的未分类真产物或媒体资源，单独挂载
    if (categorizedArtifacts.media.length > 0) {
      rootList.push({
        name: "media",
        relativePath: "media",
        type: "directory",
        badge: `视觉资产·${categorizedArtifacts.media.length}`,
        description: "真机快照、UI 视觉证据与多模态审计图像",
        children: categorizedArtifacts.media.map((a, i) =>
          artifactToFileNode(a, "media", i)
        ),
      });
    }

    if (categorizedArtifacts.deliverables.length > 0) {
      // 区分工程阶段验收工件与运行期空间设计样本 (如 222 件户型图全屋 3D/提案册)
      const sampleItems = categorizedArtifacts.deliverables.filter(
        (a) =>
          a.issue?.title?.includes("空间交付") ||
          a.title.includes("全屋 WebGL") ||
          a.title.includes("出版级住宅") ||
          a.title.includes("空间结构化")
      );
      const regularDeliverables = categorizedArtifacts.deliverables.filter(
        (a) => !sampleItems.includes(a)
      );

      if (regularDeliverables.length > 0) {
        rootList.push({
          name: "deliverables",
          relativePath: "deliverables",
          type: "directory",
          badge: `工程交付·${regularDeliverables.length}`,
          description: "经数字员工审核并验收归档的商业工程任务交付物与附件",
          children: regularDeliverables.map((a, i) =>
            artifactToFileNode(a, "deliverables", i)
          ),
        });
      }

      if (sampleItems.length > 0) {
        rootList.push({
          name: "sample-data",
          relativePath: "sample-data",
          type: "directory",
          badge: `空间样本·${sampleItems.length}件`,
          description: "空间规划与收纳交付服务运行期生成的户型方案交付样本库",
          children: sampleItems.map((a, i) =>
            artifactToFileNode(a, "sample-data", i)
          ),
        });
      }
    }

    return rootList;
  }, [project, categorizedArtifacts, artifacts]);

  // 统计当前项目的覆盖度与真实文件总数
  const summaryStats = useMemo(() => {
    let fileCount = 0;
    const countNodes = (nodes: ProjectFileNode[]) => {
      for (const n of nodes) {
        if (n.type === "file") fileCount++;
        if (n.children) countNodes(n.children);
      }
    };
    countNodes(treeData);

    const stages = [
      categorizedArtifacts["01_management"],
      categorizedArtifacts["02_requirements"],
      categorizedArtifacts["03_design"],
      categorizedArtifacts["05_verification"],
      categorizedArtifacts["06_quality_assurance"],
      categorizedArtifacts["07_release"],
      categorizedArtifacts["08_sre"],
      categorizedArtifacts["09_operations"],
      categorizedArtifacts.specs,
    ];
    const coveredCount = stages.filter((s) => s.length > 0).length;
    const coveragePercent = Math.round((coveredCount / 9) * 100);

    return {
      topDirsCount: treeData.length,
      fileCount,
      realArtifactsCount: artifacts.length,
      coveredStages: coveredCount,
      coveragePercent,
    };
  }, [treeData, artifacts, categorizedArtifacts]);

  const handleNodeAction = (node: ProjectFileNode) => {
    if (node.type === "directory") {
      toggleFolder(node.relativePath);
      return;
    }

    if (node.fileKind === "sandbox" && node.url) {
      onOpenSandbox(node.url, node.name, node.artifact);
      return;
    }

    if (node.fileKind === "binary" && (node.url || node.artifact?.downloadPath)) {
      const dlUrl = node.url || node.artifact?.downloadPath;
      if (dlUrl) {
        onDownload({
          url: dlUrl.startsWith("http") ? dlUrl : `${COOLIE_BASE_URL}${dlUrl}`,
          filename: node.name,
          title: node.name,
          sizeText: node.sizeText,
        });
        return;
      }
    }

    // 默认文档与代码查看
    onOpenFile({
      title: node.name,
      path: node.relativePath,
      content: node.content,
      language: node.language,
      artifact: node.artifact,
    });
  };

  const renderFileIcon = (node: ProjectFileNode) => {
    switch (node.fileKind) {
      case "binary":
        return <Text style={styles.nodeIcon}>📦</Text>;
      case "sandbox":
        return <Text style={styles.nodeIcon}>🌐</Text>;
      case "blueprint":
        return <Text style={styles.nodeIcon}>📑</Text>;
      case "document":
        return <Text style={styles.nodeIcon}>📝</Text>;
      case "code":
        return <Text style={styles.nodeIcon}>💻</Text>;
      case "config":
        return <Text style={styles.nodeIcon}>⚙️</Text>;
      default:
        return <Text style={styles.nodeIcon}>📄</Text>;
    }
  };

  // 递归树节点渲染器：支持任意层级目录嵌套
  const renderNode = (node: ProjectFileNode, level: number = 0) => {
    if (node.type === "directory") {
      const isExpanded = expandedFolders.has(node.relativePath);
      const isRootTopDir = level === 0;
      return (
        <View key={node.relativePath} style={isRootTopDir ? styles.dirBlock : styles.subDirBlock}>
          <Pressable
            style={[
              styles.dirRow,
              !isRootTopDir && {
                paddingLeft: 14 + level * 16,
                backgroundColor: "rgba(255, 255, 255, 0.015)",
              },
            ]}
            onPress={() => toggleFolder(node.relativePath)}
            accessibilityRole="button"
            accessibilityLabel={`切换目录 ${node.name}`}
          >
            <View style={styles.dirRowLeft}>
              <Ionicons
                name={isExpanded ? "chevron-down" : "chevron-forward"}
                size={13}
                color={C.ink3}
                style={styles.chevronIcon}
              />
              <Text style={styles.dirIcon}>📁</Text>
              <Text
                style={[styles.dirName, !isRootTopDir && styles.subDirName]}
                numberOfLines={1}
                ellipsizeMode="middle"
              >
                {node.name}
              </Text>
              {node.badge && (
                <View
                  style={[
                    styles.dirBadge,
                    node.badge.includes("真产物") && styles.dirBadgeActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.dirBadgeText,
                      node.badge.includes("真产物") && styles.dirBadgeTextActive,
                    ]}
                  >
                    {node.badge}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.dirCount}>
              {node.children?.length ?? 0} 项
            </Text>
          </Pressable>

          {isExpanded && node.children && (
            <View
              style={[
                styles.fileListContainer,
                !isRootTopDir && { borderTopWidth: StyleSheet.hairlineWidth },
              ]}
            >
              {node.children.map((child) => renderNode(child, level + 1))}
            </View>
          )}
        </View>
      );
    }

    // 文件节点渲染
    return (
      <Pressable
        key={node.relativePath}
        style={({ pressed }) => [
          styles.fileRow,
          { paddingLeft: 14 + level * 16 },
          pressed && styles.fileRowPressed,
        ]}
        onPress={() => handleNodeAction(node)}
      >
        <View style={styles.fileRowLeft}>
          {renderFileIcon(node)}
          <View style={styles.fileInfoCol}>
            <View style={styles.fileNameRow}>
              <Text
                style={styles.fileName}
                numberOfLines={1}
                ellipsizeMode="middle"
              >
                {node.name}
              </Text>
              {node.badge && (
                <View
                  style={[
                    styles.fileKindBadge,
                    node.fileKind === "binary" && styles.fileKindBadgeBinary,
                    node.fileKind === "sandbox" && styles.fileKindBadgeSandbox,
                    node.artifact && styles.fileKindBadgeReal,
                  ]}
                >
                  <Text
                    style={[
                      styles.fileKindBadgeText,
                      node.fileKind === "binary" && styles.fileKindBadgeTextBinary,
                      node.fileKind === "sandbox" && styles.fileKindBadgeTextSandbox,
                      node.artifact && styles.fileKindBadgeTextReal,
                    ]}
                    numberOfLines={1}
                  >
                    {node.badge}
                  </Text>
                </View>
              )}
            </View>
            <Text
              style={styles.fileSubDesc}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {node.description}
            </Text>
          </View>
        </View>

        <View style={styles.fileRowRight}>
          {node.sizeText ? (
            <Text style={styles.fileSizeText}>{node.sizeText}</Text>
          ) : null}
          <View
            style={[
              styles.actionBtn,
              node.fileKind === "binary" && styles.actionBtnDownload,
              node.fileKind === "sandbox" && styles.actionBtnSandbox,
              node.artifact && styles.actionBtnReal,
            ]}
          >
            <Text
              style={[
                styles.actionBtnText,
                node.fileKind === "binary" && styles.actionBtnTextDownload,
                node.fileKind === "sandbox" && styles.actionBtnTextSandbox,
                node.artifact && styles.actionBtnTextReal,
              ]}
            >
              {node.actionText || "查看"}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {/* 顶部工程概览卡：完全响应当前选中项目与真实产物状态 */}
      <View style={styles.projectHeaderCard}>
        <View style={styles.projectHeaderTop}>
          <View style={styles.projectBadgeRow}>
            <View style={styles.repoBadge}>
              <Ionicons name="git-branch" size={12} color="#818CF8" />
              <Text style={styles.repoBadgeText}>main · Monorepo</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {onResetProject && (
                <Pressable
                  style={styles.switchProjectBtn}
                  onPress={onResetProject}
                  hitSlop={6}
                >
                  <Ionicons name="swap-horizontal" size={11} color="#A78BFA" />
                  <Text style={styles.switchProjectBtnText}>切换项目</Text>
                </Pressable>
              )}
              <View style={styles.activePill}>
                <View style={styles.activeDot} />
                <Text style={styles.activeText}>
                  {summaryStats.realArtifactsCount > 0 ? "已归档工程真资产" : "立项准备中"}
                </Text>
              </View>
            </View>
          </View>
          <Text style={styles.projectTitle} numberOfLines={1} ellipsizeMode="tail">
            {project.name}
          </Text>
          <Text style={styles.projectDesc} numberOfLines={2} ellipsizeMode="tail">
            {project.description || "全自主端到端商业软件交付工厂项目资产总线"}
          </Text>
        </View>

        <View style={styles.statSummaryRow}>
          <View style={styles.statSummaryCol}>
            <Text style={styles.statSummaryVal}>
              {summaryStats.topDirsCount} 顶级目录
            </Text>
            <Text style={styles.statSummaryLabel}>
              {summaryStats.fileCount} 物理文件项
            </Text>
          </View>
          <View style={styles.statSummaryDivider} />
          <View style={styles.statSummaryCol}>
            <Text
              style={[
                styles.statSummaryVal,
                summaryStats.realArtifactsCount > 0 && { color: "#34D399" },
              ]}
            >
              {summaryStats.realArtifactsCount} 份交付物
            </Text>
            <Text style={styles.statSummaryLabel}>
              {summaryStats.realArtifactsCount > 0 ? "真实沉淀资产" : "等待派工交付"}
            </Text>
          </View>
          <View style={styles.statSummaryDivider} />
          <View style={styles.statSummaryCol}>
            <Text style={styles.statSummaryVal}>
              {summaryStats.coveragePercent}% 门禁
            </Text>
            <Text style={styles.statSummaryLabel}>
              {summaryStats.coveredStages}/9 阶段就绪
            </Text>
          </View>
        </View>
      </View>

      {/* 树形视图根容器 */}
      <View style={styles.treeSection}>
        <View style={styles.treeSectionHeader}>
          <Text style={styles.treeSectionTitle}>📁 工程全景物理目录树</Text>
          <Text style={styles.treeSectionTip}>
            按 CMMI 01~09 规范组织，真实交付产物以高亮勋章标识，点击即刻检视
          </Text>
        </View>

        {treeData.map((dirNode) => renderNode(dirNode, 0))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 40,
  },
  projectHeaderCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 16,
  },
  projectHeaderTop: {
    marginBottom: 14,
  },
  projectBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  repoBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(129, 140, 248, 0.12)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(129, 140, 248, 0.3)",
    gap: 4,
  },
  repoBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#818CF8",
  },
  switchProjectBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(167, 139, 250, 0.12)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(167, 139, 250, 0.3)",
    gap: 3,
  },
  switchProjectBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#A78BFA",
  },
  activePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 5,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#22C55E",
  },
  activeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#22C55E",
  },
  projectTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: C.ink,
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  projectDesc: {
    fontSize: 12,
    lineHeight: 18,
    color: C.ink3,
  },
  statSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.lineSubtle,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  statSummaryCol: {
    flex: 1,
    alignItems: "center",
  },
  statSummaryVal: {
    fontSize: 13,
    fontWeight: "700",
    color: C.ink,
    marginBottom: 2,
  },
  statSummaryLabel: {
    fontSize: 10,
    color: C.ink3,
  },
  statSummaryDivider: {
    width: 1,
    height: 20,
    backgroundColor: C.line,
  },
  treeSection: {
    marginHorizontal: 16,
  },
  treeSectionHeader: {
    marginBottom: 12,
  },
  treeSectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: C.ink,
    marginBottom: 4,
  },
  treeSectionTip: {
    fontSize: 11,
    color: C.ink3,
  },
  dirBlock: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    marginBottom: 10,
    overflow: "hidden",
  },
  subDirBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.lineSubtle,
    backgroundColor: "rgba(255, 255, 255, 0.01)",
  },
  dirRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255, 255, 255, 0.02)",
  },
  dirRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  chevronIcon: {
    marginRight: 2,
  },
  dirIcon: {
    fontSize: 15,
  },
  dirName: {
    fontSize: 14,
    fontWeight: "700",
    color: C.ink,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
    flexShrink: 1,
  },
  subDirName: {
    fontSize: 13,
    color: "#CBD5E1",
  },
  dirBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  dirBadgeActive: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  dirBadgeText: {
    fontSize: 10,
    color: C.ink3,
    fontWeight: "600",
  },
  dirBadgeTextActive: {
    color: "#34D399",
    fontWeight: "700",
  },
  dirCount: {
    fontSize: 11,
    color: C.ink3,
    flexShrink: 0,
  },
  fileListContainer: {
    borderTopWidth: 1,
    borderTopColor: C.lineSubtle,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 14,
    paddingLeft: 28,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.lineSubtle,
  },
  fileRowPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  fileRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  nodeIcon: {
    fontSize: 14,
  },
  fileInfoCol: {
    flex: 1,
    minWidth: 0,
  },
  fileNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
    minWidth: 0,
  },
  fileName: {
    fontSize: 13,
    fontWeight: "600",
    color: C.ink,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
    flexShrink: 1,
  },
  fileKindBadge: {
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.25)",
    flexShrink: 0,
  },
  fileKindBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#F59E0B",
  },
  fileKindBadgeReal: {
    backgroundColor: "rgba(99, 102, 241, 0.18)",
    borderColor: "rgba(129, 140, 248, 0.4)",
  },
  fileKindBadgeTextReal: {
    color: "#A5B4FC",
    fontWeight: "700",
  },
  fileKindBadgeBinary: {
    backgroundColor: "rgba(139, 92, 246, 0.12)",
    borderColor: "rgba(139, 92, 246, 0.25)",
  },
  fileKindBadgeTextBinary: {
    color: "#A78BFA",
  },
  fileKindBadgeSandbox: {
    backgroundColor: "rgba(34, 197, 94, 0.12)",
    borderColor: "rgba(34, 197, 94, 0.25)",
  },
  fileKindBadgeTextSandbox: {
    color: "#4ADE80",
  },
  fileSubDesc: {
    fontSize: 11,
    color: C.ink3,
    flexShrink: 1,
  },
  fileRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  fileSizeText: {
    fontSize: 10,
    color: C.ink3,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
  },
  actionBtn: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.line,
  },
  actionBtnReal: {
    backgroundColor: "rgba(99, 102, 241, 0.18)",
    borderColor: "rgba(129, 140, 248, 0.45)",
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: C.ink,
  },
  actionBtnTextReal: {
    color: "#C7D2FE",
  },
  actionBtnDownload: {
    backgroundColor: "rgba(99, 102, 241, 0.15)",
    borderColor: "rgba(99, 102, 241, 0.4)",
  },
  actionBtnTextDownload: {
    color: "#818CF8",
  },
  actionBtnSandbox: {
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    borderColor: "rgba(34, 197, 94, 0.4)",
  },
  actionBtnTextSandbox: {
    color: "#4ADE80",
  },
});
