/**
 * Module prefix table — ported from DigitalStaff
 * `_inferModuleGroupFromText` (LegacyImportService.js lines 1177-1254).
 *
 * Maps Chinese-language keyword patterns to canonical module names
 * used by the wizard when auto-grouping DDL/object types. The map is
 * a flat array of `[pattern, module]` pairs; the first matching
 * pattern wins. Patterns are matched against the lower-cased input.
 *
 * The wizard runs this when a domain carries no structural provenance of its
 * own (the typical case for SQL DDL, OpenAPI and doc ingest). When a scan *did*
 * record structure — a Java package, a proto package, a Maven module — that
 * beats a keyword guess and is used instead.
 */

export type ModulePrefix = string;

export interface ModulePrefixEntry {
  pattern: string;
  module: ModulePrefix;
  /** Optional English synonyms — matched in addition to the Chinese
   *  keyword so the table is reusable in EN-locale projects. */
  en?: string[];
}

const ENTRIES: ModulePrefixEntry[] = [
  // 订单 / 交易 / 支付 / 退款
  { pattern: "订单", module: "order", en: ["order", "orders", "trade"] },
  // 采购 — its own module in every ERP (Kingdee K3/PU, SAP MM). It used to be
  // swallowed by 订单's synonyms, so procurement tables grouped under orders.
  { pattern: "采购", module: "purchase", en: ["purchase", "procurement", "po"] },
  { pattern: "交易", module: "trade", en: ["transaction", "trading"] },
  { pattern: "支付", module: "payment", en: ["payment", "pay", "billing"] },
  { pattern: "退款", module: "refund", en: ["refund"] },
  // 仓储 / 库存 / 物流
  { pattern: "仓储", module: "wms", en: ["warehouse", "wms"] },
  { pattern: "库存", module: "inventory", en: ["inventory", "stock"] },
  { pattern: "物流", module: "logistics", en: ["logistics", "shipping"] },
  { pattern: "配送", module: "delivery", en: ["delivery", "dispatch"] },
  // 商品 / 类目 / SKU
  { pattern: "商品", module: "product", en: ["product", "products", "item"] },
  { pattern: "类目", module: "category", en: ["category", "categories"] },
  { pattern: "sku", module: "sku" },
  // 用户 / 客户 / 会员 / 账户
  { pattern: "用户", module: "user", en: ["user", "users"] },
  { pattern: "客户", module: "customer", en: ["customer", "customers", "client"] },
  { pattern: "会员", module: "member", en: ["member", "membership"] },
  { pattern: "账户", module: "account", en: ["account"] },
  // 营销 / 优惠券 / 活动 / 促销
  { pattern: "营销", module: "marketing", en: ["marketing", "campaign"] },
  { pattern: "优惠", module: "promotion", en: ["coupon", "discount", "promotion"] },
  { pattern: "活动", module: "campaign", en: ["activity", "event"] },
  { pattern: "促销", module: "promotion" },
  { pattern: "积分", module: "loyalty", en: ["points", "loyalty"] },
  // 内容 / 文章 / 评论 / 审核
  { pattern: "文章", module: "cms", en: ["article", "post"] },
  { pattern: "内容", module: "content", en: ["content"] },
  { pattern: "评论", module: "comment", en: ["comment", "review"] },
  { pattern: "审核", module: "moderation", en: ["audit", "moderation", "approval"] },
  // 权限 / 角色 / 组织
  { pattern: "权限", module: "rbac", en: ["permission", "rbac", "access"] },
  { pattern: "角色", module: "role", en: ["role"] },
  { pattern: "组织", module: "org", en: ["organization", "org", "department"] },
  // 通知 / 消息 / 推送 / 邮件
  { pattern: "通知", module: "notification", en: ["notification", "notice"] },
  { pattern: "消息", module: "message", en: ["message", "msg"] },
  { pattern: "推送", module: "push", en: ["push"] },
  { pattern: "邮件", module: "email", en: ["email", "mail"] },
  { pattern: "短信", module: "sms" },
  // 数据 / 报表 / 分析
  { pattern: "报表", module: "bi", en: ["report", "bi", "analytics"] },
  { pattern: "分析", module: "analytics", en: ["analytics", "metric"] },
  { pattern: "统计", module: "stats", en: ["stats", "statistics"] },
  { pattern: "指标", module: "metric", en: ["kpi", "metric"] },
  // AI / 推荐 / 搜索
  { pattern: "智能", module: "ai", en: ["ai", "ml", "intelligence"] },
  { pattern: "推荐", module: "recommendation", en: ["recommendation", "feed"] },
  { pattern: "搜索", module: "search", en: ["search", "elasticsearch"] },
  // 工作流 / 审批 / 流程 / 任务
  { pattern: "工作流", module: "workflow", en: ["workflow"] },
  { pattern: "审批", module: "approval", en: ["approval"] },
  { pattern: "流程", module: "process", en: ["process"] },
  { pattern: "任务", module: "task", en: ["task"] },
  // 项目 / 文档 / 文件
  { pattern: "项目", module: "project", en: ["project"] },
  { pattern: "文档", module: "document", en: ["document", "doc", "file"] },
  // 设备 / 物联网 / 传感器
  { pattern: "设备", module: "device", en: ["device", "iot"] },
  { pattern: "传感器", module: "sensor", en: ["sensor"] },
  // 财务 / 发票 / 报销 / 对账
  { pattern: "财务", module: "finance", en: ["finance"] },
  { pattern: "发票", module: "invoice", en: ["invoice"] },
  { pattern: "报销", module: "expense", en: ["expense", "reimburse"] },
  { pattern: "对账", module: "reconcile", en: ["reconcile", "reconciliation"] },
  // 客户关系 / 销售 / 线索 / 工单
  { pattern: "客户关系", module: "crm" },
  { pattern: "销售", module: "sales", en: ["sales"] },
  { pattern: "线索", module: "lead", en: ["lead"] },
  { pattern: "工单", module: "ticket", en: ["ticket"] },
  // 人事 / 招聘 / 考勤 / 薪资
  { pattern: "员工", module: "hr", en: ["hr", "employee"] },
  { pattern: "招聘", module: "recruit", en: ["recruit", "hiring"] },
  { pattern: "考勤", module: "attendance", en: ["attendance"] },
  { pattern: "薪资", module: "payroll", en: ["payroll", "salary"] },
  // 学习 / 课程 / 考试
  { pattern: "课程", module: "lms", en: ["course", "lms"] },
  { pattern: "考试", module: "exam", en: ["exam"] },
  { pattern: "学习", module: "learning", en: ["learning", "study"] },
  // 医疗 / 患者 / 处方 / 病例
  { pattern: "患者", module: "patient", en: ["patient"] },
  { pattern: "处方", module: "prescription", en: ["prescription"] },
  { pattern: "病例", module: "medical-record", en: ["medical-record", "ehr"] },
  // 房产 / 房源 / 楼盘 / 租约
  { pattern: "房源", module: "listing" },
  { pattern: "楼盘", module: "real-estate", en: ["real-estate"] },
  { pattern: "租约", module: "lease", en: ["lease"] },
];

export interface ModuleMatch {
  module: ModulePrefix;
  /** The Chinese keyword that matched — also usable as a display label. */
  pattern: string;
}

/**
 * Like `inferModuleFromText`, but reports whether anything matched at all.
 * Grouping a large type index needs that distinction: the `"core"` fallback
 * would otherwise drop every unmatched type into one meaningless bucket.
 */
export function matchModuleFromText(text: string): ModuleMatch | null {
  const lower = text.toLowerCase();
  for (const entry of ENTRIES) {
    if (lower.includes(entry.pattern.toLowerCase())) {
      return { module: entry.module, pattern: entry.pattern };
    }
    if (entry.en) {
      for (const syn of entry.en) {
        if (lower.includes(syn.toLowerCase())) {
          return { module: entry.module, pattern: entry.pattern };
        }
      }
    }
  }
  return null;
}

/**
 * Infer a module name from arbitrary text — DDL table names, column
 * comments, OpenAPI schema descriptions, or extracted document
 * language. The first matching pattern wins. Falls back to "core"
 * when nothing matches at all — the caller decides what that means.
 */
export function inferModuleFromText(text: string): ModulePrefix {
  return matchModuleFromText(text)?.module ?? "core";
}

/** Lookup the canonical module name for a single keyword. */
export function moduleFor(keyword: string): ModulePrefix | null {
  const hit = ENTRIES.find((e) => e.pattern === keyword);
  return hit?.module ?? null;
}

/** Total entries — useful for plan tracking and tests. */
export const MODULE_PREFIX_COUNT = ENTRIES.length;