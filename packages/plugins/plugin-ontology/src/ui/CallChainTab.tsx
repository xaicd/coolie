import { useState, type ReactElement } from "react";

function isZh(): boolean {
  try {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem("coolie.locale") : null;
    const lang = (v || (typeof navigator !== "undefined" ? navigator.language : "") || "en").toLowerCase();
    return lang.startsWith("zh");
  } catch {
    return false;
  }
}

function t(zh: string, en: string): string {
  return isZh() ? zh : en;
}

interface StepNode {
  title: string;
  tag: string;
  tagClass: string;
  sub: string;
  desc?: string;
}

interface ChainItem {
  id: string;
  name: string;
  domain: string;
  steps: StepNode[];
  preconditions: string[];
  postconditions: { field: string; setValue: string }[];
  ruleExpression: string;
}

const SAMPLE_CHAINS: ChainItem[] = [
  {
    id: "CHAIN-01",
    name: "合同提交审批流转 (Contract_Submit)",
    domain: "contract",
    steps: [
      { tag: "MU 界面交互", tagClass: "bg-blue-900/60 text-blue-300 border-blue-700/50", title: "销售合同维护页", sub: "点击 [btnSubmit 提交审批]" },
      { tag: "M2 行为动作", tagClass: "bg-emerald-900/60 text-emerald-300 border-emerald-700/50", title: "Contract_Submit (COMMAND)", sub: "trigger: USER_ACTION" },
      { tag: "M3 业务规则", tagClass: "bg-amber-900/60 text-amber-300 border-amber-700/50", title: "RULE-CONTRACT-APPROVAL-LEVEL", sub: "金额>=100万总经办审批" },
      { tag: "M1 聚合跃迁", tagClass: "bg-purple-900/60 text-purple-300 border-purple-700/50", title: "SalesContract (AGG_ROOT)", sub: "status: 草稿 ➔ 待财务经理审批" },
      { tag: "M6 协同流程", tagClass: "bg-pink-900/60 text-pink-300 border-pink-700/50", title: "FLOW-CONTRACT-APPROVAL-001", sub: "进入 [A04 财务经理双签门禁]" },
    ],
    preconditions: ["contract.status == '草稿'", "付款阶段比例合计严格等于 100%"],
    postconditions: [{ field: "contract.status", setValue: "待财务经理审批" }],
    ruleExpression: "totalAmount >= 1000000 -> 需要总经理加签; ELSE -> 财务经理终审",
  },
  {
    id: "CHAIN-02",
    name: "开票登记与额度校验 (Invoice_Submit)",
    domain: "invoice",
    steps: [
      { tag: "MU 界面交互", tagClass: "bg-blue-900/60 text-blue-300 border-blue-700/50", title: "开票维护申请表单", sub: "点击 [btnSubmit 提交开票]" },
      { tag: "M2 行为动作", tagClass: "bg-emerald-900/60 text-emerald-300 border-emerald-700/50", title: "Invoice_Submit (COMMAND)", sub: "trigger: USER_ACTION" },
      { tag: "M3 业务规则", tagClass: "bg-amber-900/60 text-amber-300 border-amber-700/50", title: "RULE-PAYSTAGE-REMAIN-QUOTA", sub: "累计开票不得超阶段应付额" },
      { tag: "M1 聚合跃迁", tagClass: "bg-purple-900/60 text-purple-300 border-purple-700/50", title: "Invoice (AGG_ROOT)", sub: "status: 草稿 ➔ 待开票复核" },
      { tag: "M6 协同流程", tagClass: "bg-pink-900/60 text-pink-300 border-pink-700/50", title: "FLOW-CONTRACT-INVOICE-002", sub: "触发金税开票与待收款监听" },
    ],
    preconditions: ["对应合同已纳入管理且未归档", "本次分摊金额合计严格等于开票金额"],
    postconditions: [{ field: "invoice.approvalStatus", setValue: "待复核" }],
    ruleExpression: "historicalAllocation + currentAllocation <= stageAmount",
  },
  {
    id: "CHAIN-03",
    name: "企微导购大模型意图派发 (Wecom_Intent_Dispatch)",
    domain: "wecom",
    steps: [
      { tag: "MU 界面交互", tagClass: "bg-blue-900/60 text-blue-300 border-blue-700/50", title: "企微导购助手浮窗", sub: "导购点击 [发送智能推荐]" },
      { tag: "M2 行为动作", tagClass: "bg-emerald-900/60 text-emerald-300 border-emerald-700/50", title: "Wecom_DispatchIntent (COMMAND)", sub: "trigger: ASSISTANT_TRIGGER" },
      { tag: "M3 业务规则", tagClass: "bg-amber-900/60 text-amber-300 border-amber-700/50", title: "RULE-WECOM-RATE-LIMIT", sub: "客户触达单日频次防打扰上限" },
      { tag: "M1 聚合跃迁", tagClass: "bg-purple-900/60 text-purple-300 border-purple-700/50", title: "CustomerSession (AGG_ROOT)", sub: "touchCount: +1, state: ACTIVE" },
      { tag: "M6 协同流程", tagClass: "bg-pink-900/60 text-pink-300 border-pink-700/50", title: "FLOW-WECOM-TOUCH-PIPELINE", sub: "网格看板实时 WebSocket 推送" },
    ],
    preconditions: ["客户未退订且会话在服务窗口内", "导购持有当前网格服务许可"],
    postconditions: [{ field: "session.lastActiveTime", setValue: "NOW()" }],
    ruleExpression: "customer.daily_touch_count < 3 AND is_blacklisted == false",
  }
];

export function CallChainTab({
  companyId,
  domainId,
}: {
  companyId: string;
  domainId: string;
}): ReactElement {
  const [selectedChainId, setSelectedChainId] = useState<string>("CHAIN-01");
  const currentChain = SAMPLE_CHAINS.find((c) => c.id === selectedChainId) || SAMPLE_CHAINS[0];

  return (
    <div className="flex h-full w-full bg-[#090d16] text-slate-200 overflow-hidden">
      {/* 左侧选择器 */}
      <div className="w-80 border-r border-[#243354] bg-[#131b2e] flex flex-col">
        <div className="px-4 py-3 border-b border-[#243354] flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {t("时序业务因果链路", "Causal Call Chains")}
          </span>
          <span className="text-[10px] font-mono bg-sky-950 text-sky-400 border border-sky-800/60 px-1.5 py-0.5 rounded">
            7-Models
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {SAMPLE_CHAINS.map((chain) => {
            const active = chain.id === selectedChainId;
            return (
              <button
                key={chain.id}
                onClick={() => setSelectedChainId(chain.id)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  active
                    ? "bg-[#182238] border-sky-500 shadow-lg shadow-sky-950/40"
                    : "border-transparent hover:bg-slate-800/40 text-slate-300"
                }`}
              >
                <div className="text-xs font-semibold text-white leading-snug">{chain.name}</div>
                <div className="text-[10px] font-mono text-slate-400 mt-1 flex items-center gap-1.5">
                  <span className="text-sky-400">[{chain.domain}]</span>
                  <span>{chain.id}</span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="p-3 border-t border-[#243354] text-[11px] text-slate-400">
          💡 {t("点击任意交互动作，展开其全时序因果穿透链条", "Click an action to unfold its full causal call chain.")}
        </div>
      </div>

      {/* 右侧主工作台 */}
      <div className="flex-1 flex flex-col overflow-y-auto bg-[#0c1220] p-6 space-y-6">
        {/* 顶部标题与说明 */}
        <div className="flex items-center justify-between pb-4 border-b border-[#243354]">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>🔗 {currentChain.name}</span>
              <span className="text-xs font-normal text-slate-400">({currentChain.id})</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {t(
                "沿七模型严格穿透：从用户点击界面 (MU) 到底层微服务动作 (M2)、规则前置阻断 (M3)、实体状态变迁 (M1) 与后续协同流程 (M6)",
                "Penetrating 7-models: UI element (MU) -> Action (M2) -> Rule (M3) -> Object (M1) -> Flow (M6)",
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2.5 py-1 rounded">
              ✅ 0 逻辑黑盒
            </span>
          </div>
        </div>

        {/* 核心流水线因果节点 */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <span>⚡ 全时序因果流转拓扑 (Call-Chain Pipeline)</span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-3 pt-1">
            {currentChain.steps.map((st, sIdx) => (
              <div key={sIdx} className="flex items-center gap-2 flex-shrink-0">
                <div className="w-56 p-3.5 rounded-lg bg-[#182238] border border-[#243354] shadow-md hover:border-sky-500/80 transition-all">
                  <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded border mb-2 ${st.tagClass}`}>
                    {st.tag}
                  </span>
                  <div className="text-xs font-semibold text-white leading-tight">{st.title}</div>
                  <div className="text-[11px] text-slate-400 mt-1 font-mono">{st.sub}</div>
                </div>
                {sIdx < currentChain.steps.length - 1 && (
                  <div className="text-slate-500 font-bold text-sm px-1">➔</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 前置断言与后置赋值契约 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-[#131b2e] border border-[#243354] space-y-2">
            <div className="text-xs font-semibold text-sky-400 flex items-center justify-between">
              <span>📋 行为前置断言条件 (Preconditions)</span>
              <span className="text-[10px] text-slate-500">M2 Contract</span>
            </div>
            <div className="bg-[#080d1a] p-3 rounded border border-slate-800 font-mono text-xs text-emerald-300 space-y-1">
              {currentChain.preconditions.map((pre, pIdx) => (
                <div key={pIdx}>• {pre}</div>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-lg bg-[#131b2e] border border-[#243354] space-y-2">
            <div className="text-xs font-semibold text-purple-400 flex items-center justify-between">
              <span>🎯 实体状态后置变迁 (Postconditions)</span>
              <span className="text-[10px] text-slate-500">M1 Mutation</span>
            </div>
            <div className="bg-[#080d1a] p-3 rounded border border-slate-800 font-mono text-xs text-purple-300 space-y-1">
              {currentChain.postconditions.map((post, pIdx) => (
                <div key={pIdx}>
                  • {post.field} ➔ <span className="text-amber-300">"{post.setValue}"</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 声明式业务规则表达式 */}
        <div className="p-4 rounded-lg bg-[#131b2e] border border-[#243354] space-y-2">
          <div className="text-xs font-semibold text-amber-400 flex items-center justify-between">
            <span>🛡️ M3 声明式业务规则表达式 (Declarative Rule Assertion)</span>
            <span className="text-[10px] text-slate-500">Rule Engine Guard</span>
          </div>
          <div className="bg-[#080d1a] p-3 rounded border border-slate-800 font-mono text-xs text-amber-200">
            {currentChain.ruleExpression}
          </div>
          <div className="text-[11px] text-slate-500">
            * 规则引擎在动作触发前完成同步短路拦截，非纯函数无副作用计算，杜绝跨企业数据穿透与业务违规。
          </div>
        </div>
      </div>
    </div>
  );
}
