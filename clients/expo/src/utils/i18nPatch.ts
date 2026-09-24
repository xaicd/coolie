/**
 * Coolie Web 移动端容器国际化运行时补丁层 (I18N Patch Layer)。
 *
 * 背景:
 * Paperclip Web 上游大量文案硬编码在 .tsx 组件里（非 i18n key），且上游只自带英文。
 * 此外，界面中频繁出现 "Paperclip"、"Paperclip Labs" 等需要统一重构为 "Coolie" 业务语境。
 *
 * 本补丁通过 WebView 注入脚本，在 DOM 渲染后执行以下动作：
 * 1. 设置 localStorage.coolie.locale = "zh-CN"，激活 i18next 官方中文包；
 * 2. 给 <html> 标记 .native-shell class，并通过 CSS 自动隐藏 Web 端自带的冗余底栏和控制栏；
 * 3. 运行 TreeWalker + MutationObserver 拦截 DOM 文本节点与属性（placeholder/aria-label/title），
 *    自动将硬编码英文和品牌名词无缝实时替换为中文。
 */

export const I18N_PATCH: Record<string, string> = {
  // —— 登录 / 注册 (pages/Auth.tsx) ——
  "Sign in to Coolie": "登录 Coolie",
  "Sign in to Paperclip": "登录 Coolie",
  "Create your Coolie account": "创建您的 Coolie 账号",
  "Create your Paperclip account": "创建您的 Coolie 账号",
  "Use your email and password to access this instance.": "使用邮箱和密码访问此实例。",
  "Create an account for this instance. Email confirmation is not required in v1.":
    "为此实例创建账号。v1 无需邮箱确认。",
  Email: "邮箱",
  Password: "密码",
  Name: "名称",
  "Forgot password?": "忘记密码？",
  "Sign in": "登录",
  "Sign In": "登录",
  "Sign up": "注册",
  "Create account": "创建账号",
  "Create Account": "创建账号",
  "Working…": "处理中…",
  "Working...": "处理中…",
  "Need an account?": "还没有账号？",
  "Already have an account?": "已有账号？",
  "Create one": "创建一个",
  "Enter your name.": "请输入名称。",
  "Enter your email address.": "请输入邮箱地址。",
  "Enter a valid email address.": "请输入有效的邮箱地址。",
  "Enter your password.": "请输入密码。",
  "Password must be at least 8 characters.": "密码至少 8 个字符。",
  "Authentication failed": "认证失败",

  // —— 导航 (MobileBottomNav / Sidebar / CommandPalette) ——
  Home: "仪表盘",
  "Recent Tasks": "最近任务",
  Tasks: "任务",
  "New Task": "新建任务",
  Agents: "员工",
  Inbox: "收件箱",
  Projects: "项目",
  Dashboard: "仪表盘",
  Goals: "目标",
  Costs: "成本",
  Activity: "活动",
  "Open Connectors": "打开连接器",
  "Runner Inspector": "运行器检查",
  "Execution Workspaces": "执行工作空间",
  "Quick filters": "快速筛选",
  Actions: "操作",
  Pages: "页面",
  "Create new task": "新建任务",
  "Create new agent": "新建员工",
  "Create new project": "新建项目",
  "Search tasks, agents, projects...": "搜索任务、员工、项目…",
  "Keyboard shortcuts": "键盘快捷键",

  // —— 账户菜单 (SidebarAccountMenu) ——
  Settings: "设置",
  "View profile": "查看资料",
  "Edit profile": "编辑资料",
  Documentation: "文档",
  "Sign out": "退出登录",
  "Signing out...": "正在退出…",
  "Share feedback": "分享反馈",
  "Open account menu": "打开账户菜单",
  Board: "看板",
  "Signed in": "已登录",
  "Local workspace board": "本地工作区看板",

  // —— 通用按钮 / 动作 ——
  Cancel: "取消",
  Save: "保存",
  "Save changes": "保存更改",
  "Save URL": "保存 URL",
  Delete: "删除",
  Remove: "移除",
  Create: "创建",
  Edit: "编辑",
  Done: "已完成",
  Confirm: "确认",
  Back: "返回",
  Continue: "继续",
  Close: "关闭",
  Retry: "重试",
  "Try again": "重试",
  Dismiss: "忽略",
  Clear: "清除",
  Refresh: "刷新",
  Search: "搜索",
  "Loading...": "正在加载…",
  "Loading…": "正在加载…",
  "No results found.": "未找到结果。",
  None: "无",

  // —— 设置 / 组织 ——
  General: "通用",
  "Deployment and auth": "部署与认证",
  "Organization Members": "组织成员",
  Role: "角色",
  Status: "状态",
  Action: "操作",
  Active: "活跃",
  Pending: "待处理",
  Suspended: "已停用",

  // —— 任务 / 用例 / 例行 ——
  Sort: "排序",
  Group: "分组",
  "All routines": "所有例行任务",
  Cases: "案例",
  Experimental: "实验功能",
  "No cases yet": "暂无案例",

  // —— 新建任务弹窗 (NewIssueDialog) ——
  Assignee: "被指派人",
  "No assignee": "不指派",
  Project: "项目",
  "No project": "无项目",
  "Work Mode": "执行模式",
  "Auto mode": "智能模式",
  "Plan mode": "规划模式",
  "Ask mode": "问答模式",
  "Skill test": "技能测试",
  "New task": "新建任务",
  Todo: "待办",
  "In Progress": "进行中",
  "Discard Draft": "放弃草稿",
  "Start date": "开始日期",
  "Due date": "截止日期",
  Tags: "标签",
  "Trust policy": "信任策略",
  "Markdown editor": "Markdown 编辑器",
  "Task title": "任务标题",
  "Add description...": "添加描述…",
  "Create Task": "创建任务",
  "Create Sub-Task": "创建子任务",
  "Creating...": "创建中…",
  "Failed to create task. Try again.": "创建任务失败, 请重试。",
  Reviewer: "复核人",
  "No reviewer": "不设复核人",
  Approver: "审批人",
  "No approver": "不设审批人",
  Watchdog: "看守",
  "Set watchdog": "设置看守",
  "No watchdog agent": "不设看守",
  "Watchdog agent": "看守智能体",
  "What should the watchdog watch for and how should it keep work moving?":
    "看守该盯什么、该怎么推动工作继续?",
  "Model lane": "模型通道",
  "Claude options": "Claude 选项",
  "Codex options": "Codex 选项",
  "OpenCode options": "OpenCode 选项",
  "Agent options": "员工选项",
  "Execution workspace": "执行工作区",
  "Project default": "项目默认",
  "New isolated workspace": "新建隔离工作区",
  "Reuse existing workspace": "复用已有工作区",
  "Sub-task of": "子任务于",

  // —— 多源代码仓库 (Multi-Source Repositories) ——
  "Repository": "代码仓库",
  "Repositories": "代码仓库",
  "Git URL": "Git 地址",
  "Local Directory": "本地目录",
  "GitHub OAuth": "GitHub 授权",
  "No Repository": "无仓库",
  "Connect repository": "连接代码仓库",
  "Add Repository": "添加代码仓库",
  "Repository URL": "仓库地址 (URL)",
  "Branch": "分支",
  "Default branch": "默认分支",
  "Commit": "提交",
  "Local path": "本地路径",
  "Clone URL": "克隆地址",
  "Personal Access Token": "个人访问令牌 (PAT)",
  "Private GitLab": "私有 GitLab",
  "Gitee": "Gitee 码云",

  // —— 项目中心 (Projects) ——
  "Project center": "项目中心",
  "Create Project": "创建项目",
  "New project": "新建项目",
  "Project name": "项目名称",
  "Target milestone": "目标里程碑",
  "Target goal": "目标",
  "Active projects": "活跃项目",
  "All projects": "所有项目",
  "Archived projects": "已归档项目",
  "No projects yet": "暂无项目",
  "Project settings": "项目设置",

  // —— 本体建模与设计器 (Ontology Studio) ——
  "Ontology": "本体",
  "Ontology Studio": "本体设计器",
  "Domain Model": "领域模型",
  "Object Types": "对象类型",
  "Relation Types": "关系类型",
  "Object Type": "对象类型",
  "Relation Type": "关系类型",
  "Add Object Type": "添加对象类型",
  "Add Relation Type": "添加关系类型",
  "Properties": "属性列表",
  "Property name": "属性名称",
  "Data type": "数据类型",
  "Cardinality": "基数关系",
  "Import Ontology": "导入本体",
  "Export Ontology": "导出本体",
  "Legacy Import Wizard": "历史数据导入向导",
  "Ontology Playground": "本体实验场",
  "Graph view": "图谱视图",
  "Tree view": "树形视图",
  "Save model": "保存模型",

  // —— 流水线 / 自动化页 (Pipelines) ——
  Pipelines: "流水线",
  Pipeline: "流水线",
  Automation: "自动化",
  Learnings: "经验",
  "In review": "评审中",
  "Move to stage": "移动到阶段",
  "Item preview": "条目预览",
  "No stages are set up for this pipeline yet.": "此流水线尚未配置阶段。",
  "Build your list, then submit it all at once": "先列清单，再一次性提交",
  "Add stage": "添加阶段",
  "Plan review": "Plan 评审",
  "Approve plan": "批准 Plan",
  "Stage": "阶段",
  "Stages": "阶段列表",

  // —— 收件箱页 (Inbox) ——
  Mine: "我的",
  Recent: "最近",
  Unread: "未读",
  Blocked: "已阻塞",
  All: "全部",
  "In Review": "评审中",
  Today: "今天",
  Yesterday: "昨天",
  Earlier: "更早",

  // —— 员工页 (Agents) ——
  "AGENTS": "员工",
  "智能体": "员工",
  "New Agent": "新建员工",
  Chat: "对话",
  "Invalid reporting chain": "汇报链无效",
  Join: "加入",
  Leave: "离开",
  "Joining...": "正在加入…",
  "Leaving...": "正在离开…",
  "View all runs": "查看全部运行",
  Notifications: "通知",
  "No linked task": "无关联任务",
  "Scheduled heartbeat": "定时心跳",
  "Active Agents": "活跃员工",
  "All agents": "所有员工",
  "Agent name": "员工名称",
  "Agent Chat": "员工对话",
  "Needs attention": "需关注",
  "Mark as read": "标记为已读",
  "Mark all as read?": "全部标记为已读？",
  "Archive from inbox": "从收件箱归档",
  "View details": "查看详情",

  // —— 品牌替换 (Paperclip -> Coolie) ——
  "Paperclip Labs": "Coolie",
  "Share with Paperclip Labs": "分享给 Coolie",
  "Paperclip Enterprise": "Coolie 企业版",
  "Paperclip Cloud": "Coolie 云",
  "Paperclip Runner": "Coolie 运行器",
  "Paperclip Developer Mode": "Coolie 开发者模式",
  "Paperclip Dev Mode": "Coolie 开发者模式",
  "Paperclip Board UI": "Coolie 看板",
  "Paperclip workspace": "Coolie 工作区",
  "Paperclip Run": "Coolie 任务",
  "Paperclip Instance": "Coolie 实例",
  "Paperclip Agent": "Coolie 员工",
  "Paperclip App": "Coolie 应用",
  "Paperclip CLI": "Coolie CLI",
  "Paperclip-managed": "由 Coolie 管理",
  "Paperclip managed": "由 Coolie 管理",
  "Managed by Paperclip": "由 Coolie 管理",
  "Managed by Paperclip Cloud": "由 Coolie 云管理",
  "Paperclip host": "Coolie 主机",
  "Paperclip template": "Coolie 模板",
  "Runs on this Paperclip host.": "运行在此 Coolie 主机上。",
  "Paperclip execution host": "Coolie 执行主机",
  "paperclip_managed": "coolie_managed",
  "Paperclip EE": "Coolie EE",
  "Get Paperclip EE.": "获取 Coolie EE。",
  "Restart Paperclip now?": "现在重启 Coolie？",
  "Approve Paperclip CLI access": "批准 Coolie CLI 访问",
  "A local Paperclip CLI process is requesting board access to this instance.":
    "本地 Coolie CLI 进程正在请求此实例的看板访问权限。",
  "The Paperclip CLI can now finish authentication on the requesting machine.":
    "Coolie CLI 现在可以在请求的机器上完成认证。",
  "Agent audit is a Paperclip Enterprise view": "员工审计是 Coolie 企业版视图",
  "Recorded by Paperclip — entries can't be edited. Sensitive values are never stored.":
    "由 Coolie 记录 — 条目不可编辑。敏感数据从不被存储。",
  "In Paperclip Cloud the switcher lists the signed-in user's stacks":
    "在 Coolie 云里, 切换器列出当前登录用户的栈",
  "Choose whether voted AI outputs can be shared with Paperclip Labs.":
    "选择已投票的 AI 输出是否可以分享给 Coolie。",
  "paperclip.com": "coolie.cloud",
  Paperclip: "Coolie",
};

export const I18N_PATTERNS: Array<[string, string]> = [
  ["^Finished (\\d+\\s*(?:s|m|h|d|w|mo)) ago$", "$1 前完成"],
  ["^no output for (\\d+\\s*(?:s|m|h|d|w|mo)) - still running$", "$1 无输出 · 仍在运行"],
  ["^(\\d+\\s*(?:s|m|h|d|w|mo)) ago$", "$1 前"],
  ["^in (\\d+\\s*(?:s|m|h|d|w|mo))$", "$1 后"],
  ["^(\\d+) agents?$", "$1 位员工"],
  ["^agents?$", "位员工"],
];

/**
 * 移动端容器原生沉浸样式补丁 (Native Shell CSS Patch)。
 *
 * 1. 隐藏 Web 端原有的底部导航 nav[aria-label="Mobile navigation"]（避免与 Expo 原生顶底栏重叠）；
 * 2. 隐藏 Web 端顶部的 StandaloneBrowserControls（刷新/分享/在浏览器打开，由 WebContainerScreen 原生接管）；
 * 3. 抹平 Web 端为 MobileBottomNav 预留的底部安全距离（如 pb-14 等），让界面沉浸满屏；
 * 4. 优化暗色模式底色与卡片半透明度。
 */
export const I18N_CSS_PATCH = `
/* 隐藏 Web 端自带的移动底部导航 */
nav[aria-label="Mobile navigation"] {
  display: none !important;
}

/* 隐藏 Web 端顶部的 standalone browser controls */
[data-standalone-browser] {
  display: none !important;
}

/* 消除 Web 页面主区域多余的底部内边距 */
body {
  padding-bottom: 0 !important;
}
main#main-content, main, [data-main-content] {
  padding-bottom: 1rem !important;
  min-height: 100dvh !important;
}
`;

/**
 * 页面加载前初始化脚本 (适合 iOS 和标准环境)。
 */
export const ZH_CN_INJECTION = `
try {
  window.__COOLIE_DEFAULT_LOCALE__ = "zh-CN";
  window.__COOLIE_NATIVE_SHELL__ = true;
  if (!localStorage.getItem("coolie.locale")) {
    localStorage.setItem("coolie.locale", "zh-CN");
  }
  document.documentElement.lang = "zh-CN";
  document.documentElement.classList.add("native-shell");
} catch (e) {}
`;

/**
 * Android 兜底：WebView 在 about:blank 时可能丢失 localStorage 写入，
 * 在页面加载后检查并确保 coolie.locale 存在。
 */
export const ZH_CN_ENSURE = `
(function () {
  try {
    window.__COOLIE_NATIVE_SHELL__ = true;
    document.documentElement.classList.add("native-shell");
    if (!localStorage.getItem("coolie.locale")) {
      localStorage.setItem("coolie.locale", "zh-CN");
      window.location.reload();
    }
  } catch (e) {}
})();
true;
`;

/**
 * 完整运行时翻译与沉浸式样式注入脚本。
 */
export const I18N_PATCH_INJECTION = `
window.__COOLIE_I18N_PATCH__ = ${JSON.stringify(I18N_PATCH)};
window.__COOLIE_I18N_PATTERNS__ = ${JSON.stringify(I18N_PATTERNS)};
window.__COOLIE_I18N_CSS__ = ${JSON.stringify(I18N_CSS_PATCH)};
(function () {
  if (window.__COOLIE_I18N_PATCH_INSTALLED__) return;
  window.__COOLIE_I18N_PATCH_INSTALLED__ = true;
  var PATCH = window.__COOLIE_I18N_PATCH__ || {};
  var PATTERN_SPECS = window.__COOLIE_I18N_PATTERNS__ || [];
  var PATTERNS = [];
  for (var p = 0; p < PATTERN_SPECS.length; p++) {
    try {
      PATTERNS.push([new RegExp(PATTERN_SPECS[p][0]), PATTERN_SPECS[p][1]]);
    } catch (e) {}
  }
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, CODE: 1, PRE: 1 };
  var ATTRS = ["placeholder", "aria-label", "title"];
  function translate(raw) {
    if (raw === null || raw === undefined) return null;
    var text = String(raw).trim();
    if (!text) return null;
    var hit = PATCH[text];
    if (typeof hit === "string" && hit !== text) {
      return String(raw).replace(text, function () { return hit; });
    }
    for (var i = 0; i < PATTERNS.length; i++) {
      var re = PATTERNS[i][0];
      if (!re.test(text)) continue;
      var out = text.replace(re, PATTERNS[i][1]);
      if (out !== text) return String(raw).replace(text, function () { return out; });
    }
    return null;
  }
  function apply(root) {
    if (!root) return;
    try {
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      var node;
      while ((node = walker.nextNode())) {
        var parent = node.parentNode;
        if (parent && SKIP[parent.nodeName]) continue;
        var next = translate(node.nodeValue);
        if (next !== null) node.nodeValue = next;
      }
    } catch (e) {}
    try {
      var els = root.querySelectorAll("[placeholder],[aria-label],[title]");
      for (var i = 0; i < els.length; i++) {
        for (var a = 0; a < ATTRS.length; a++) {
          var got = translate(els[i].getAttribute(ATTRS[a]));
          if (got !== null) els[i].setAttribute(ATTRS[a], got);
        }
      }
    } catch (e) {}
  }
  function schedule() {
    if (window.__COOLIE_I18N_PATCH_TIMER__) clearTimeout(window.__COOLIE_I18N_PATCH_TIMER__);
    window.__COOLIE_I18N_PATCH_TIMER__ = setTimeout(function () {
      window.__COOLIE_I18N_PATCH_TIMER__ = null;
      apply(document.body || document.documentElement);
    }, 200);
  }
  function installCss() {
    try {
      if (document.getElementById("__coolie_native_shell_css__")) return;
      var style = document.createElement("style");
      style.id = "__coolie_native_shell_css__";
      style.appendChild(document.createTextNode(window.__COOLIE_I18N_CSS__ || ""));
      (document.head || document.documentElement).appendChild(style);
    } catch (e) {}
  }
  function start() {
    installCss();
    apply(document.body || document.documentElement);
    var SWEEP_DELAYS = [300, 1000, 2500];
    for (var d = 0; d < SWEEP_DELAYS.length; d++) {
      setTimeout(function () {
        apply(document.body || document.documentElement);
      }, SWEEP_DELAYS[d]);
    }
    var target = document.documentElement;
    if (!target || !window.MutationObserver) return;
    new MutationObserver(schedule).observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
true;
`;
