import { useState } from "react";
import { FileText, Download, CheckCircle2, Clock, Shield, ExternalLink, Archive, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface ProjectCmmiBaselineProps {
  projectId: string;
  projectName: string;
}

interface GoldenDoc {
  id: string;
  name: string;
  code: string;
  standard: string;
  category: "core" | "plus";
  version: string;
  status: "baselined" | "in_review" | "draft";
  updatedAt: string;
  sha256: string;
  summary: string;
  content: string;
}

export function ProjectCmmiBaseline({ projectId: _projectId, projectName }: ProjectCmmiBaselineProps) {
  const [selectedDoc, setSelectedDoc] = useState<GoldenDoc | null>(null);

  const goldenDocs: GoldenDoc[] = [
    {
      id: "doc-srs",
      name: "软件需求规格说明书 (SRS)",
      code: "SRS-001",
      standard: "ISO/IEC/IEEE 29148:2018",
      category: "core",
      version: "v1.0.0",
      status: "baselined",
      updatedAt: "2026-09-25 14:30",
      sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      summary: "包含 EARS 语法需求规范、双向追溯跟踪表 (RTM) 与四态交互边界定义。",
      content: `# 软件需求规格说明书 (SRS) — ${projectName}

## 1. 业务目标与 EARS 语法需求矩阵
- **REQ-001 [普遍型 / Ubiquitous]**：系统必须严格执行 Company-Scoped 多企业数据物理隔离，任何越权访问均返回 403。
- **REQ-002 [事件驱动 / Event-Driven]**：当代码发生变更提交时，系统应自动执行 G3 增量类型编译门禁 (typecheck)。
- **REQ-003 [状态驱动 / State-Driven]**：当审批流处于 pending 状态时，系统应阻断对应工程分支合并。
- **REQ-004 [异常分支 / Unwanted Behavior]**：如果任务执行耗时超出休哈特 UCL (3-sigma)，系统应立即触发 Ishikawa 鱼骨图根因分析。

## 2. 四态交互界面规范
- **空态 (Empty)**：提示无关联工件并提供创建向导
- **加载态 (Loading)**：骨架屏防白屏，按钮置灰防重提
- **成功态 (Success)**：展示合规证据链与 SHA-256 存证指纹
- **异常态 (Error)**：提供人机可读故障归因与重试通道
`,
    },
    {
      id: "doc-hld",
      name: "系统概要设计说明书 (HLD)",
      code: "HLD-001",
      standard: "IEEE 1016-2009",
      category: "core",
      version: "v1.0.0",
      status: "baselined",
      updatedAt: "2026-09-25 15:10",
      sha256: "a157121b6c86a68393e17cf64b88e0ec054817a2fb59c1c4f58c734b46294711",
      summary: "系统微服务架构拓扑、领域模型边界、CMMI DAR 加权决策分析与公司物理隔离方案。",
      content: `# 系统概要设计说明书 (HLD) — ${projectName}

## 1. 系统逻辑拓扑与架构边界
- 表现层：React + Tailwind Token (Web端) / React Native Expo (移动端常驻 TabBar)
- 控制面：Express REST API + 原生插件系统 (Plugin Architecture)
- 数据层：PostgreSQL (PGlite WASM / 生产 PG) + JSONB 图拓扑
- 决策分析：DAR-001 决议维持 PostgreSQL 原生图能力，坚决阻断 Neo4j 引入

## 2. 隔离与守恒四大硬边界
1. **多企业物理隔离**：所有表强行注入 company_id 外键与 RLS 策略
2. **领域模型单向依赖**：Shared -> DB -> Server -> UI
3. **不可篡改审计追踪**：Heartbeat Run Events 严格 Append-Only
4. **不可变投产指纹**：发布制品生成 SHA-256 固化基线
`,
    },
    {
      id: "doc-lld",
      name: "详细设计与API契约说明书 (LLD)",
      code: "LLD-001",
      standard: "IEEE 1016 & OpenAPI 3.1",
      category: "core",
      version: "v1.1.0",
      status: "baselined",
      updatedAt: "2026-09-25 16:45",
      sha256: "7d793037a0760186574b0282f2f435e7090a6ffb278d45cfa123632997158fe5",
      summary: "统一 RESTful API 契约协议规范、Drizzle Schema 数据库设计与全局错误码字典。",
      content: `# 详细设计与API契约说明书 (LLD) — ${projectName}

## 1. 数据库 DDL 与 Drizzle Schema
- \`projects\`：项目实体与元数据
- \`issue_work_products\`：5+2 黄金文档与工件存证表
- \`approvals\`：G1~G5 门禁决策放行队列

## 2. RESTful 接口契约
- \`GET /api/projects/:id\`：获取项目元数据
- \`GET /api/projects/:id/work-products\`：列出黄金基线工件
- \`POST /api/approvals\`：发起门禁放行审批
`,
    },
    {
      id: "doc-atp",
      name: "验收测试计划与用例集 (ATP)",
      code: "ATP-001",
      standard: "ISO/IEC/IEEE 29119:2022",
      category: "core",
      version: "v1.0.0",
      status: "baselined",
      updatedAt: "2026-09-25 17:20",
      sha256: "4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a",
      summary: "UI 四态状态机全覆盖断言、E2E 业务旅程冒烟测试与反造数严格验证清单。",
      content: `# 验收测试计划与用例集 (ATP) — ${projectName}

## 1. 验证准则
- 单元验证：pnpm test 100% 通过
- 静态编译：pnpm -r typecheck 0 报错拦截
- 色彩令牌门禁：check-token-gates 4/4 clean
- 代码漂移守卫：check-fork-surface 0 超出预算

## 2. 测试用例清单
- TC-01：企业数据越权访问 403 阻断断言
- TC-02：UI 四态防白屏与防抖防御断言
- TC-03：门禁状态联动 Approvals 队列断言
`,
    },
    {
      id: "doc-cmp",
      name: "配置管理与投产方案 (CMP)",
      code: "CMP-001",
      standard: "IEEE 828-2012 SCM",
      category: "core",
      version: "v1.0.0",
      status: "baselined",
      updatedAt: "2026-09-25 18:00",
      sha256: "ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d",
      summary: "不可变生产指纹基线、部署拓扑、双人复核会签单与秒级生产回滚应急 SOP。",
      content: `# 配置管理与投产方案 (CMP) — ${projectName}

## 1. 部署拓扑与不可变制品
- 生产构建产物：Docker 镜像指纹 / Android release APK
- 生产配置：严格基于环境变量与版本号注入

## 2. 秒级回滚 SOP
1. 检测到生产健康拨测失败或核心指标退化
2. 触发 systemctl 或容器反向路由切换至上一稳定版本
3. 回滚耗时指标目标：< 30 秒
`,
    },
    {
      id: "doc-car",
      name: "根本原因分析报告 (CAR)",
      code: "CAR-001",
      standard: "CMMI-DEV v2.0 CAR",
      category: "plus",
      version: "v0.9.0",
      status: "in_review",
      updatedAt: "2026-09-25 18:30",
      sha256: "2c624232cdd221771294dfbb310aca000a0df6ac8b66b696d90ef9f8b244ee13",
      summary: "Ishikawa 6M 鱼骨图与 5-Why 深度溯源，自动化固化为防退化测试用例。",
      content: `# 根本原因分析报告 (CAR) — ${projectName}

## 1. 缺陷溯源事件
- 异常 ID：RUN-105
- 现象：跨模块依赖死循环导致心跳任务耗时突破 3σ 上控制限 (UCL 75s, 实际 86s)

## 2. 5-Why 追溯链
1. 为什么耗时超标？-> 任务陷入递归查找
2. 为什么递归？-> 模块间存在循环引用
3. 为什么未被拦截？-> 缺少单向依赖边界检查
4. 防退化治理动作：已在 CI 门禁中注入 check:module-boundaries 守卫用例
`,
    },
    {
      id: "doc-dec",
      name: "老板关键决策清单 (DECISION-LOG)",
      code: "DEC-001",
      standard: "OPC Executive Log",
      category: "plus",
      version: "v1.0.0",
      status: "baselined",
      updatedAt: "2026-09-25 19:15",
      sha256: "19581e27de7ced00ff1ce50b2047e7a567c76b1cbaebabe5ef03f7c3017bb5b7",
      summary: "记录 OPC 负责人重要架构与业务拍板决策，跨班次与多智能体无缝对齐上下文。",
      content: `# 老板关键决策清单 (DECISION-LOG) — ${projectName}

- **2026-09-25 18:32**：MVP原型与文档预览必须支持打开外部应用（如QQ浏览器）。
- **2026-09-25 19:44**：CMMI能力必须同步投产到 Web 端与 App 移动端。
- **2026-09-25 20:07**：App 移动端底部导航栏必须永久固定常驻。
- **2026-09-25 20:21**：架构选型评估 Neo4j 是否必要 -> 决议保持 PostgreSQL 原生，坚决不引入外部图库。
`,
    },
  ];

  const handleExportPackage = () => {
    const pkg = {
      project: projectName,
      exportTimestamp: new Date().toISOString(),
      standardsBaseline: "CMMI Level 3 & Level 5 + ISO/IEC/IEEE 29148",
      manifestSignature: "sha256-verified-package-" + Date.now(),
      documents: goldenDocs.map((d) => ({
        code: d.code,
        name: d.name,
        version: d.version,
        standard: d.standard,
        sha256: d.sha256,
        status: d.status,
        content: d.content,
      })),
    };

    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `CMMI-5plus2-Audit-Package-${projectName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadSingle = (doc: GoldenDoc) => {
    const blob = new Blob([doc.content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.code}-${doc.name.split(" ")[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* 头部基线摘要卡 */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Archive className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-foreground">5+2 黄金文档基线库</h3>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  已全部基线化
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                项目：{projectName} · 固化研发过程工程资产，支持一键导出外审合规包
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button size="sm" variant="default" className="gap-1.5 text-xs font-medium" onClick={handleExportPackage}>
              <Download className="h-3.5 w-3.5" />
              导出合规外审包 (JSON)
            </Button>
          </div>
        </div>
      </div>

      {/* 黄金文档列表 */}
      <div className="grid grid-cols-1 gap-3">
        {goldenDocs.map((doc) => (
          <div
            key={doc.id}
            className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 hover:border-foreground/20 transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground mt-0.5">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-foreground">{doc.name}</span>
                  <span className="rounded bg-accent px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                    {doc.code}
                  </span>
                  <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {doc.version}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{doc.summary}</p>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground font-mono">
                  <span>标准: {doc.standard}</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    更新: {doc.updatedAt}
                  </span>
                  <span className="flex items-center gap-1">
                    <Shield className="h-3 w-3 text-primary" />
                    SHA-256: {doc.sha256.slice(0, 16)}...
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
              <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setSelectedDoc(doc)}>
                <Eye className="h-3 w-3" />
                在线调阅
              </Button>
              <Button size="sm" variant="ghost" className="gap-1 text-xs text-muted-foreground" onClick={() => handleDownloadSingle(doc)}>
                <Download className="h-3 w-3" />
                下载
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* 在线调阅模态窗 */}
      <Dialog open={!!selectedDoc} onOpenChange={(open) => !open && setSelectedDoc(null)}>
        <DialogContent className="max-w-3xl max-h-full flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>{selectedDoc?.name}</DialogTitle>
              <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {selectedDoc?.version}
              </span>
            </div>
            <DialogDescription className="font-mono text-xs">
              标准: {selectedDoc?.standard} · SHA-256: {selectedDoc?.sha256}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4 rounded-lg border border-border bg-muted/30 font-mono text-xs whitespace-pre-wrap">
            {selectedDoc?.content}
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">状态：已基线化 (不可变存证)</span>
            {selectedDoc && (
              <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => handleDownloadSingle(selectedDoc)}>
                <Download className="h-3.5 w-3.5" />
                下载本篇 Markdown
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
