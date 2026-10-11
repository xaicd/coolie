// scripts/create-ontology-linked-tasks.mjs
// Creates the 4 CMMI WBS tasks (开发 ➔ 测试 ➔ 运维 ➔ 上线) linked to the evolved ontology

const API_BASE = "https://xrobinai.cn";
const COMPANY_ID = "4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e";
const PROJECT_ID = "e6253f6b-2713-428c-b36c-9e8fc7e17352"; // 九夏智居
const TOKEN = "pcp_board_3c3ff167183504a1a848f5c1e5902a5873942431797a41fa";

const tasks = [
  {
    title: "[开发] 板材算料开料优化算法与数控开孔代码编码",
    description: "【本体联动契约: mat-enf-blum ➔ cnc-drill-sheet-01】\n根据九夏智居本体演进的《板材五金规约》(material_hardware)与《数控加工图纸》(fabrication_drawing)，为文彬 128.66㎡ 户型玄关收纳柜实现板材排版优化利用率算法与 32mm 系统打孔孔位坐标生成，输出完整数控开料代码清单。",
    assigneeAgentId: "95069d63-2221-4500-9e17-25a472c5a921", // 铁匠 (Core SWE)
    priority: "critical",
    status: "in_progress",
  },
  {
    title: "[测试] 3D交互设计室板材五金装配真机四态验证",
    description: "【本体联动契约: cnc-drill-sheet-01 ➔ pdf-html-dual-kit】\n在 Android 模拟器与移动真机上对 Jiuxia_Home_Preview (1).html 进行四态（加载/空态/交互/错误）验证，重点检验玄关收纳柜开合动画、五金阻尼导轨展开与开料板件三维尺寸精确渲染，保障 0 假死、0 遮挡。",
    assigneeAgentId: "5de33aed-2ed3-443d-ad2e-51085a158a36", // 门神 (FDSE)
    priority: "high",
    status: "todo",
  },
  {
    title: "[运维] 数控加工代码生成引擎与图纸导出SOP基线发布",
    description: "【本体联动契约: G5 投产基线发布】\n配置生产服务器板材开料生成服务与图纸导出流水线，实施不可变制品指纹校验（SHA-256 会签），固化数控生产文件秒级导出与配置回滚应急 SOP。",
    assigneeAgentId: "3e3dbce1-d8cb-47bd-af68-2872200ac509", // 兑底渊 (PRE-SRE)
    priority: "medium",
    status: "todo",
  },
  {
    title: "[上线] 业主首套收纳柜全流程数字孪生上线验收",
    description: "【本体联动契约: 业务闭环与业主交付】\n联合业主现场核验文彬 128.66㎡ 户型全流程交付物：从户型几何 ➔ 柜体空间 ➔ 板材五金 ➔ 数控加工 ➔ PDF施工深化册与 HTML 3D 设计室，完成交付会签并固化不可变证据链。",
    assigneeAgentId: "a6911d32-83cb-49e0-bd0f-cb12a14cd583", // 百晓生 (DS)
    priority: "high",
    status: "todo",
  },
];

async function main() {
  console.log(`🚀 开始为九夏智居根据本体语义演进创建 [开发 ➔ 测试 ➔ 运维 ➔ 上线] 全链路任务...`);

  for (const task of tasks) {
    const res = await fetch(`${API_BASE}/api/companies/${COMPANY_ID}/issues`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId: PROJECT_ID,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        assigneeAgentId: task.assigneeAgentId,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`❌ 创建任务失败: ${task.title} - ${res.status}: ${errText}`);
      process.exit(1);
    }

    const created = await res.json();
    console.log(`✅ [${created.identifier}] ${created.title} (负责人: ${task.assigneeAgentId ? "已指派" : "待派"}, 状态: ${created.status})`);
  }

  console.log(`🎉 4 项本体联动 WBS 任务已成功在 Prod 创建完成！`);
}

main().catch(err => {
  console.error("执行异常:", err);
  process.exit(1);
});
