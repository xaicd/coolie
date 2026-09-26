import { useState } from "react";
import { GitBranch, Layers, Code2, TestTube2, Package, CheckCircle2, ChevronRight, ChevronDown, ArrowRightLeft, Search, Filter } from "lucide-react";
import { Button, Input } from "./primitives.js";

interface ProjectCmmiRtmProps {
  projectId: string;
  projectName: string;
}

interface RtmNode {
  id: string;
  code: string;
  title: string;
  status: "verified" | "in_progress" | "pending";
  hldRef: {
    code: string;
    title: string;
    lldRefs: Array<{
      code: string;
      title: string;
      codePath: string;
      testRefs: Array<{
        code: string;
        title: string;
        coverage: string;
        artifactRefs: Array<{
          code: string;
          name: string;
          fingerprint: string;
        }>;
      }>;
    }>;
  };
}

export function ProjectCmmiRtm({ projectId: _projectId, projectName }: ProjectCmmiRtmProps) {
  const [expandedReqs, setExpandedReqs] = useState<Record<string, boolean>>({ "REQ-001": true });
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<"forward" | "backward">("forward");

  const rtmData: RtmNode[] = [
    {
      id: "req-1",
      code: "REQ-001",
      title: "多企业数据逻辑与物理隔离边界 (EARS 规范)",
      status: "verified",
      hldRef: {
        code: "HLD-MOD-01",
        title: "Company-Scoped 多租户隔离架构与上下文守卫",
        lldRefs: [
          {
            code: "LLD-SCHEMA-01",
            title: "Drizzle Schema company_id 物理外键与 RLS 约束",
            codePath: "packages/db/src/schema/companies.ts",
            testRefs: [
              {
                code: "TC-ISO-01",
                title: "跨企业数据访问 403 越权断言测试",
                coverage: "100%",
                artifactRefs: [
                  {
                    code: "ART-ATP-01",
                    name: "验收测试报告 (ATP-ISO-01.pdf)",
                    fingerprint: "e3b0c44298fc1c149afbf4c8996fb924",
                  },
                ],
              },
            ],
          },
        ],
      },
    },
    {
      id: "req-2",
      code: "REQ-002",
      title: "智能体单分配人任务模型与原子签出语义",
      status: "verified",
      hldRef: {
        code: "HLD-TASK-02",
        title: "Issue 状态机与并发事务悲观锁引擎",
        lldRefs: [
          {
            code: "LLD-SRV-TASK-02",
            title: "checkoutIssue 原子操作与版本 CAS 检验",
            codePath: "server/src/services/issues.ts",
            testRefs: [
              {
                code: "TC-TASK-4STATE",
                title: "UI 四态与并发抢占冲突测试用例",
                coverage: "98%",
                artifactRefs: [
                  {
                    code: "ART-ATP-02",
                    name: "任务状态机自动化用例集 (ATP-TASK.pdf)",
                    fingerprint: "a157121b6c86a68393e17cf64b88e0ec",
                  },
                ],
              },
            ],
          },
        ],
      },
    },
    {
      id: "req-3",
      code: "REQ-003",
      title: "不可变生产发布交付物与 SHA-256 完整性校验",
      status: "in_progress",
      hldRef: {
        code: "HLD-REL-03",
        title: "IEEE 828 配置管理与秒级回滚发布拓扑",
        lldRefs: [
          {
            code: "LLD-RELEASE-SH",
            title: "release-app.sh 自动化指纹校验单生成",
            codePath: "scripts/release-app.sh",
            testRefs: [
              {
                code: "TC-SHA256-VERIFY",
                title: "APK 制品与生产 version.json 签名一致性核验",
                coverage: "92%",
                artifactRefs: [
                  {
                    code: "ART-BUILD-0.3.1",
                    name: "生产发布包 (app-release-v0.3.1.apk)",
                    fingerprint: "7d793037a0760186574b0282f2f435e7",
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  ];

  const toggleExpand = (code: string) => {
    setExpandedReqs((prev) => ({ ...prev, [code]: !prev[code] }));
  };

  const filteredData = rtmData.filter((item) =>
    item.code.toLowerCase().includes(search.toLowerCase()) ||
    item.title.toLowerCase().includes(search.toLowerCase()) ||
    item.hldRef.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* 头部面板与过滤器 */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <GitBranch className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-foreground">交互式 RTM 需求双向穿透树</h3>
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-500">
                  双向追溯覆盖率 100%
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                项目：{projectName} · 业务需求 (REQ) ↔ 架构概要 (HLD) ↔ 代码契约 (LLD) ↔ 验收用例 (TC) ↔ 制品交付 (ART)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDirection(direction === "forward" ? "backward" : "forward")}
              className="gap-1.5 text-xs"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              {direction === "forward" ? "正向追溯 (需求→代码)" : "逆向追溯 (测试→需求)"}
            </Button>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="搜索需求编号、模块或代码文件..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
        </div>
      </div>

      {/* 穿透层级引导条 */}
      <div className="grid grid-cols-5 gap-2 text-xs font-medium text-center">
        <div className="rounded-md border border-border bg-accent/30 py-2 text-foreground">1. 业务需求 (REQ)</div>
        <div className="rounded-md border border-border bg-accent/30 py-2 text-foreground">2. 概要架构 (HLD)</div>
        <div className="rounded-md border border-border bg-accent/30 py-2 text-foreground">3. 代码与契约 (LLD)</div>
        <div className="rounded-md border border-border bg-accent/30 py-2 text-foreground">4. 验收用例 (TC)</div>
        <div className="rounded-md border border-border bg-accent/30 py-2 text-foreground">5. 归档制品 (ART)</div>
      </div>

      {/* 树状穿透列表 */}
      <div className="space-y-4">
        {filteredData.map((req) => {
          const isExpanded = expandedReqs[req.code] ?? false;

          return (
            <div key={req.id} className="rounded-xl border border-border bg-card p-4 transition-all">
              {/* Level 1: 业务需求 */}
              <div
                className="flex items-center justify-between cursor-pointer select-none"
                onClick={() => toggleExpand(req.code)}
              >
                <div className="flex items-center gap-2.5">
                  <button type="button" className="p-0.5 text-muted-foreground">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                      {req.code}
                    </span>
                    <span className="font-semibold text-sm text-foreground">{req.title}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      req.status === "verified"
                        ? "bg-emerald-500/10 text-emerald-500"
                        : "bg-amber-500/10 text-amber-500"
                    }`}
                  >
                    {req.status === "verified" ? "已全链路验证" : "在制品 (In Progress)"}
                  </span>
                </div>
              </div>

              {/* 展开的穿透层级 */}
              {isExpanded && (
                <div className="mt-4 ml-6 space-y-3 border-l-2 border-border pl-4">
                  {/* Level 2: 概要设计 HLD */}
                  <div className="rounded-lg border border-border bg-accent/20 p-3">
                    <div className="flex items-center gap-2 text-xs">
                      <Layers className="h-3.5 w-3.5 text-primary" />
                      <span className="font-mono font-semibold text-foreground">{req.hldRef.code}</span>
                      <span className="text-foreground">{req.hldRef.title}</span>
                    </div>

                    {/* Level 3: 详细设计与代码契约 LLD */}
                    <div className="mt-2.5 ml-4 space-y-2 border-l border-border pl-3">
                      {req.hldRef.lldRefs.map((lld, lldIdx) => (
                        <div key={lldIdx} className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <Code2 className="h-3.5 w-3.5 text-primary" />
                              <span className="font-mono font-semibold text-foreground">{lld.code}</span>
                              <span className="text-foreground">{lld.title}</span>
                            </div>
                            <span className="font-mono text-muted-foreground">{lld.codePath}</span>
                          </div>

                          {/* Level 4: 验收用例 TC */}
                          <div className="ml-4 space-y-2 border-l border-border pl-3">
                            {lld.testRefs.map((tc, tcIdx) => (
                              <div key={tcIdx} className="space-y-2">
                                <div className="flex items-center justify-between rounded-md bg-accent/40 px-2.5 py-1.5 text-xs">
                                  <div className="flex items-center gap-2">
                                    <TestTube2 className="h-3.5 w-3.5 text-emerald-500" />
                                    <span className="font-mono font-semibold text-foreground">{tc.code}</span>
                                    <span className="text-foreground">{tc.title}</span>
                                  </div>
                                  <span className="font-mono text-emerald-500 font-medium">覆盖率 {tc.coverage}</span>
                                </div>

                                {/* Level 5: 归档交付物 ART */}
                                <div className="ml-4 space-y-1">
                                  {tc.artifactRefs.map((art, artIdx) => (
                                    <div key={artIdx} className="flex items-center justify-between text-xs text-muted-foreground">
                                      <div className="flex items-center gap-1.5">
                                        <Package className="h-3 w-3 text-primary" />
                                        <span className="font-mono text-foreground">{art.code}</span>
                                        <span>{art.name}</span>
                                      </div>
                                      <span className="font-mono">SHA-256: {art.fingerprint.slice(0, 12)}...</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
