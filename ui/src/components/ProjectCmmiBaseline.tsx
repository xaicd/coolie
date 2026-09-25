import { FileText, Download, CheckCircle2, Clock, Shield, ExternalLink, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";

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
}

export function ProjectCmmiBaseline({ projectId: _projectId, projectName }: ProjectCmmiBaselineProps) {
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
    },
  ];

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
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-500">
                  已全部基线化
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                项目：{projectName} · 固化研发过程工程资产，支持一键导出外审合规包
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button size="sm" variant="default" className="gap-1.5 text-xs font-medium">
              <Download className="h-3.5 w-3.5" />
              导出合规外审包 (ZIP)
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
                    <Shield className="h-3 w-3 text-emerald-500" />
                    SHA-256: {doc.sha256.slice(0, 16)}...
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
              <Button size="sm" variant="outline" className="gap-1 text-xs">
                <ExternalLink className="h-3 w-3" />
                在线调阅
              </Button>
              <Button size="sm" variant="ghost" className="gap-1 text-xs text-muted-foreground">
                <Download className="h-3 w-3" />
                下载
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
