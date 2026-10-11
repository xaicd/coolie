import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const COMPANY_ID = "4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e";
const AGENT_ID = "3e3dbce1-d8cb-47bd-af68-2872200ac509"; // Hermes

const DELIVERABLES = [
  // 云南移动 (Project: fdfd15b2-2417-4261-af4a-8f567c8a2b35)
  {
    projectId: "fdfd15b2-2417-4261-af4a-8f567c8a2b35",
    issueId: "540799aa-763e-4de0-9ab9-f72cede1df85", // XROA-2
    identifier: "XROA-2",
    title: "云南移动数智化企微运营底座软件需求规格说明书 (SRS-YN-WECOM-2025)",
    summary: "严格采用 EARS 需求语法规范定义的千兆宽带到期续约预警、智能导购派单分配、全光FTTR营销SOP、AI反诈敏感词拦截及BOSS双向对账流水全生命周期需求与双向RTM跟踪矩阵。",
    cmmiStage: "G1",
    deliverableType: "srs",
    filename: "01-srs.md",
    localPath: "projects/sys-yunnan-wecom/docs/cmmi/01-srs.md",
  },
  {
    projectId: "fdfd15b2-2417-4261-af4a-8f567c8a2b35",
    issueId: "f1c5ceab-ad1f-412b-b058-9ce7dc90d9d4", // XROA-3
    identifier: "XROA-3",
    title: "云南移动企微运营平台概要设计说明书与DAR选型 (HLD-YN-WECOM-2025)",
    summary: "Spring Cloud Gateway 与 Netty 电信级网关架构设计，呈贡与经开同城双活双数据中心容灾方案(RPO=0)，微服务拓扑及基于加权模型的 DAR 技术选型决策分析报告。",
    cmmiStage: "G2",
    deliverableType: "hld",
    filename: "02-hld.md",
    localPath: "projects/sys-yunnan-wecom/docs/cmmi/02-hld.md",
  },
  {
    projectId: "fdfd15b2-2417-4261-af4a-8f567c8a2b35",
    issueId: "18a62aab-7bb1-49d4-a06e-bbb06149d040", // XROA-4
    identifier: "XROA-4",
    title: "云南移动企微运营平台详细设计与OpenAPI契约 (LLD-YN-WECOM-2025)",
    summary: "包含物理 DDL 表结构 (客户表、预警合约表、导购负载表、反诈审计表、BOSS对账表) 与 OpenAPI 3.1 统一请求响应契约协议规范，确保0编译报错与模块单向依赖。",
    cmmiStage: "G3",
    deliverableType: "lld",
    filename: "03-lld-api.md",
    localPath: "projects/sys-yunnan-wecom/docs/cmmi/03-lld-api.md",
  },
  {
    projectId: "fdfd15b2-2417-4261-af4a-8f567c8a2b35",
    issueId: "33bea043-130d-453e-9a26-8c7f1f5b05f5", // XROA-5
    identifier: "XROA-5",
    title: "云南移动企微系统全栈测试与真机验收报告 (TEST-YN-WECOM-2025)",
    summary: "128 项端到端业务旅程与电信级异常注入测试用例 100% 通过验证，JMeter 压测达成 24,180 TPS，AI 反诈 99.8% 检出率及主库宕机毫秒级漂移测试存证。",
    cmmiStage: "G4",
    deliverableType: "test_report",
    filename: "04-test-report.md",
    localPath: "projects/sys-yunnan-wecom/docs/cmmi/04-test-report.md",
  },
  {
    projectId: "fdfd15b2-2417-4261-af4a-8f567c8a2b35",
    issueId: "5a1802e3-0e53-4c22-b9c7-a8d24ec33819", // XROA-6
    identifier: "XROA-6",
    title: "云南移动企微生产投产基线与秒级回滚SOP (SOP-YN-WECOM-2025)",
    summary: "不可变容器镜像 SHA-256 签名制品基线，生产 K8s 金丝雀渐进式流量发布 9 步标准法与 180 秒一键自动化回滚应急预案。",
    cmmiStage: "G5",
    deliverableType: "sop",
    filename: "05-deploy-sop.md",
    localPath: "projects/sys-yunnan-wecom/docs/cmmi/05-deploy-sop.md",
  },
  {
    projectId: "fdfd15b2-2417-4261-af4a-8f567c8a2b35",
    issueId: "0920c508-e9a8-4386-bb88-93625b0f5d1e", // XROA-7
    identifier: "XROA-7",
    title: "云南移动数智化企微底座工程客户终验核销单 (UAT-CERT-YN-WECOM-2025)",
    summary: "中国移动通信集团云南有限公司网络与信息化部、市场经营部、规划技术部与安全处联合签署，确认 G1-G5 五大门禁全面通过，准予正式终验结项并核销回款。",
    cmmiStage: "UAT",
    deliverableType: "uat_certificate",
    filename: "08-uat-signoff.md",
    localPath: "projects/sys-yunnan-wecom/docs/cmmi/08-uat-signoff.md",
  },

  // 产融数字供应链智居平台 (Project: b6e666cd-695f-47d8-ab96-fe7b42eb37a7)
  {
    projectId: "b6e666cd-695f-47d8-ab96-fe7b42eb37a7",
    issueId: "44a3076a-3f6b-40fa-87c1-0515756cc555", // XROA-9
    identifier: "XROA-9",
    title: "产融智居平台软件需求规格说明书 (SRS-JIUXIA-SMART-2025)",
    summary: "遵循 EARS 语法的全屋定制 3D CAD/DXF 图纸秒级解析拆单、板材二维下料运筹优化排样(出材率>=92.0%)、数控开料机 G 代码下发及在制品动态质押货值评估需求规格。",
    cmmiStage: "G1",
    deliverableType: "srs",
    filename: "01-srs.md",
    localPath: "projects/sys-jiuxia-smart/docs/cmmi/01-srs.md",
  },
  {
    projectId: "b6e666cd-695f-47d8-ab96-fe7b42eb37a7",
    issueId: "289acfdd-8bdd-4138-aabb-2a4729da4c34", // XROA-10
    identifier: "XROA-10",
    title: "产融智居全案定制平台概要设计说明书与DAR选型 (HLD-JIUXIA-SMART-2025)",
    summary: "云-边-端协同拓扑架构，混合列生成与 OR-Tools 启发式排样求解器 DAR 加权决策分析，工业边缘网关 EG-2000-X 与银行风控总账对接方案。",
    cmmiStage: "G2",
    deliverableType: "hld",
    filename: "02-hld.md",
    localPath: "projects/sys-jiuxia-smart/docs/cmmi/02-hld.md",
  },
  {
    projectId: "b6e666cd-695f-47d8-ab96-fe7b42eb37a7",
    issueId: "4e6fb881-ebec-472f-aa57-ce2b4300e524", // XROA-11
    identifier: "XROA-11",
    title: "产融智居制造与供应链对接OpenAPI契约 (LLD-JIUXIA-SMART-2025)",
    summary: "包含 CAD 图纸拆单表、BOM 分解表、二维排样解集表、质押台账 DDL 与统一 OpenAPI 3.1 接口契约协议规范。",
    cmmiStage: "G3",
    deliverableType: "lld",
    filename: "03-lld-api.md",
    localPath: "projects/sys-jiuxia-smart/docs/cmmi/03-lld-api.md",
  },
  {
    projectId: "b6e666cd-695f-47d8-ab96-fe7b42eb37a7",
    issueId: "2686d360-0e58-4570-aab3-34d20b0e7f46", // XROA-13
    identifier: "XROA-13",
    title: "九夏智居全案定制与产融质押客户终验核销单 (UAT-CERT-JIUXIA-SMART-2025)",
    summary: "九夏智居制造中心与国信产融供应链金融部联合签署，确认 500 套全屋定制图纸带料试产实测出材率达 92.4%，数控直达豪迈机床，在制品动态质押平账率100%，准予商业结项。",
    cmmiStage: "UAT",
    deliverableType: "uat_certificate",
    filename: "08-uat-signoff.md",
    localPath: "projects/sys-jiuxia-smart/docs/cmmi/08-uat-signoff.md",
  },
];

console.log("📦 准备同步数据包...");
const payload = [];

for (const d of DELIVERABLES) {
  const fullPath = path.resolve(process.cwd(), d.localPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ 文件不存在: ${fullPath}`);
    process.exit(1);
  }
  const content = fs.readFileSync(fullPath, "utf-8");
  const byteSize = Buffer.byteLength(content, "utf-8");
  const sha256 = crypto.createHash("sha256").update(content).digest("hex");

  payload.push({
    ...d,
    content,
    byteSize,
    sha256,
  });
  console.log(`  📄 载入: [${d.identifier}] ${d.filename} (${byteSize} 字节) - ${d.title.slice(0, 30)}...`);
}

const payloadPath = "/tmp/deliverables_bundle.json";
fs.writeFileSync(payloadPath, JSON.stringify(payload));
console.log(`\n💾 数据包已打包至 ${payloadPath} (${fs.statSync(payloadPath).size} 字节)`);
