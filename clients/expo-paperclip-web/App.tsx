import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { WebView, type WebViewNavigation } from "react-native-webview";

/**
 * react-native-webview@14 的根 `index.d.ts` 把组件声明成
 * `class WebView<P = undefined> extends Component<WebViewProps & P>`；P 默认到
 * undefined，于是 `WebViewProps & undefined` 直接塌成 `never`，任何 `<WebView/>`
 * JSX 都会报 20+ 条 overload（`tsc --noEmit` 实测）。clients/expo 也是靠同一次
 * cast 绕开的（见 src/components/board-inline/InlinePreviewPanel.tsx 的 SafeWebView）。
 * 事件类型用宽松的本地结构类型，避免再 import `lib/WebViewTypes` 造出第二条模块身份。
 */
type WebViewLike = React.ComponentType<any>;
const SafeWebView = WebView as unknown as WebViewLike;

type WebViewErrorEvent = { nativeEvent?: { description?: string } };
type WebViewLoadProgressEvent = { nativeEvent: { progress?: number } };

/**
 * Coolie Web — paperclip PC web 的 native 壳。
 *
 * 老板决策 (wave 9)：把 `https://www.xrobinai.cn/XROA` 完整 PC web 直接包成
 * 一个单屏 App，与现有 Coolie 驾驶舱 (cloud.coolie.app) 并存 (本包
 * cloud.coolie.app.web)。App 自身不做登录 —— 登录、cookie、sessionStorage
 * 全部是 web 站自己的事，壳只提供 返回/刷新/前进 + 地址显示。
 */

/** 目标站点：paperclip 上游完整 PC web (会议室 / Agent Feed / 12 项导航)。 */
const PAPERCLIP_WEB_URL = "https://www.xrobinai.cn/XROA";

/**
 * 老板 (2026-09-21 反馈)：Coolie Web 装机后 web UI 默认英文。
 * paperclip 上游 i18n 通过 `localStorage.coolie.locale` 决定语言。
 * 在页面脚本执行前注入 zh-CN localStorage + 全局钩子，让 i18next 立刻取中文 bundle。
 * 同时设置 `document.documentElement.lang` 让无障碍 / 浏览器提示也对。
 */
const ZH_CN_INJECTION = `
try {
  window.__COOLIE_DEFAULT_LOCALE__ = "zh-CN";
  localStorage.setItem("coolie.locale", "zh-CN");
  document.documentElement.lang = "zh-CN";
} catch (e) {}
`;

/**
 * Android 兜底：`injectedJavaScriptBeforeContentLoaded` 在 Android 上是在
 * 导航提交前求值的，此时 `localStorage` 还属于 about:blank 上下文，写入会抛错
 * 并被上面的 try/catch 吞掉（实测 0.6.0 装机后界面仍是英文）。
 * 这里在页面加载完成后（此时 origin 已提交）再补一次：仅当用户从未显式选过语言
 * （`coolie.locale` 不存在）时写入默认 zh-CN 并 reload 一次 —— reload 后该键已
 * 持久化，paperclip 的 i18n 初始化即可读到中文，且不会陷入循环，也不会覆盖
 * 用户在设置里手动选择的语言。
 */
const ZH_CN_ENSURE = `
(function () {
  try {
    if (!localStorage.getItem("coolie.locale")) {
      localStorage.setItem("coolie.locale", "zh-CN");
      window.location.reload();
    }
  } catch (e) {}
})();
true;
`;

/**
 * 老板 (2026-09-21)：「整个 web 的国际化还有很多问题」。
 *
 * paperclip 上游的 i18n 只覆盖 bundle 里登记的 key；大量**硬编码英文文案**直接写在
 * .tsx 里（登录页 / 详情弹窗 / 按钮 / placeholder），zh-CN bundle 覆盖不到。
 * 上游 `ui/` 是 fork-surface 保护目录（见 docs-coolie/FORK-SURFACE-AUDIT.md），
 * 不能改，所以在壳这一层做**运行时翻译补丁**：注入后在 DOM 层把命中的英文替换成中文。
 *
 * 约定：key 必须是页面里出现的「完整去空白文本」，或完整的 placeholder /
 * aria-label / title。值不得再命中其它 key（避免链式替换死循环）。
 */
const I18N_PATCH: Record<string, string> = {
  // —— 登录 / 注册 (pages/Auth.tsx) ——
  "Sign in to Coolie": "登录 Coolie",
  "Create your Coolie account": "创建您的 Coolie 账号",
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
  Home: "首页",
  "Recent Tasks": "最近任务",
  Tasks: "任务",
  "New Task": "新建任务",
  Agents: "智能体",
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
  "Create new agent": "新建智能体",
  "Create new project": "新建项目",
  "Search tasks, agents, projects...": "搜索任务、智能体、项目…",
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
  // New task 弹窗的状态选项也用 "Done" (NewIssueDialog 的 buildStatusOptions)。
  // 改成「已完成」会让 ExternalAgentInviteDialog / FolderControls / TeamCatalog
  // 三处「Done」确认按钮一起读成「已完成」—— 语义上偏一点, 但状态是这句话的
  // 主语境 (弹窗里那颗状态胶囊), 按 brief 取「已完成」。
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

  // —— 设置 / 组织 (CompanyAccess / InstanceGeneralSettings) ——
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

  // —— 新建任务弹窗 (NewIssueDialog): For [Assignee] in [Project] + Work Mode ——
  // 值是上游 workModeMetaList() 的原始 label, 逐字匹配整段文本节点。
  // 不写裸 "Auto"/"Plan"/"Code": 补丁是「整段文本全等」替换, 短词会误伤
  // 导航和其它页面里同名的按钮。
  Assignee: "被指派人",
  "No assignee": "不指派",
  Project: "项目",
  "No project": "无项目",
  "Work Mode": "执行模式",
  "Auto mode": "智能模式",
  "Plan mode": "规划模式",
  "Ask mode": "问答模式",
  "Skill test": "技能测试",

  // —— New task 弹窗: 标题栏 / 状态胶囊 / ⋯ 菜单 (wave25) ——
  // 都是「整段文本全等」替换, 所以只写独立成段的那几处:
  // 标题栏「New task」、状态选项 (Todo / In Progress / Done)、底部「Discard Draft」、
  // ⋯ 菜单的「Start date」「Due date」。
  // 「Tags」「Trust policy」「Markdown editor」按 brief 列的名字补上: 上游
  // NewIssueDialog 的 ⋯ 菜单实际只有 Start/Due date (Labels 胶囊在源码里是注释掉的
  // 占位), 这三条若截图里确实有就命中, 没有就是一次无害空转 —— 不写反而会漏。
  "New task": "新建任务",
  Todo: "待办",
  "In Progress": "进行中",
  "Discard Draft": "放弃草稿",
  "Start date": "开始日期",
  "Due date": "截止日期",
  Tags: "标签",
  "Trust policy": "信任策略",
  "Markdown editor": "Markdown 编辑器",

  // —— New task 弹窗: 复核/审批/看守 + 模型选项 + 执行工作区 (wave26) ——
  // 与 NewIssueDialog 的字段 label 一一对应, 补的是 wave25 之前没覆盖的那批。
  // 仍然是「整段文本全等」替换: 这里只收**多词或语义唯一**的句子, 不收裸
  // "Default" / "Low" / "Model" 这类短词 —— 它们会在设置页和其它表单里误命中。
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
  "Agent options": "智能体选项",
  "Execution workspace": "执行工作区",
  "Project default": "项目默认",
  "New isolated workspace": "新建隔离工作区",
  "Reuse existing workspace": "复用已有工作区",
  "Sub-task of": "子任务于",

  // —— 工作区 / 密钥 ——
  Workspaces: "工作区",
  "No workspace activity yet.": "暂无工作区活动。",
  Secrets: "密钥",
  Value: "值",
  Provider: "提供商",
  "Display name": "显示名称",
  "Coming soon": "即将推出",
  Disabled: "已停用",
  Missing: "缺失",

  // —— placeholder / 搜索框 ——
  "Header name": "Header 名称",
  "Search apps…": "搜索应用…",
  "Search agents…": "搜索智能体…",
  "Search teams": "搜索团队",
  "Search connectors": "搜索连接器",
  "Search inbox…": "搜索收件箱…",
  "Search files...": "搜索文件…",
  "Search users": "搜索用户",
  "Search labels…": "搜索标签…",
  "Search icons...": "搜索图标…",
  "Search tools…": "搜索工具…",
  "Search skills": "搜索技能",
  "Search discovered skills…": "搜索已发现的技能…",
  "Search activity…": "搜索活动…",
  "Search secrets": "搜索密钥",
  "Search artifacts": "搜索产物",
  "Search query": "搜索查询",
  "Search by name or email": "按名称或邮箱搜索",
  "Search by name, ARN, tag": "按名称、ARN 或标签搜索",
  "Paste path, GitHub URL, or skills.sh command": "粘贴路径、GitHub URL 或 skills.sh 命令",
  "Add a description...": "添加描述…",
  "Add a comment...": "添加评论…",
  "Write a comment…": "写评论…",
  "Add a tag…": "添加标签…",
  "Optional decision note…": "可选的决策备注…",
  "Why is this being rejected?": "为何驳回？",
  "Paste your token or credential": "粘贴您的令牌或凭据",
  "Paste your new key": "粘贴您的新密钥",
  "Ask anything about your organization...": "询问关于您组织的任何问题…",

  // —— 连接器 / 身份流程 (connection-dialogs / ConnectionSetupFlow) ——
  "Open sign-in in a new tab": "在新标签页打开登录",
  "Reconnect selected account": "重新连接所选账号",
  "Cancel repair": "取消修复",
  "Cancel setup": "取消设置",
  "Adopt Connections for this agent": "为此智能体采用连接",
  "Connect account": "连接账号",
  "Add application": "添加应用",
  "Select an application": "选择应用",
  "Select a connection": "选择连接",

  // —— 弹窗标题 ——
  "Chat with an agent": "与智能体对话",
  "Run routine": "运行例行任务",
  "Rename task": "重命名任务",
  "Delete comment?": "删除评论？",
  "Install Plugin": "安装插件",
  "Uninstall Plugin": "卸载插件",
  "Edit member": "编辑成员",
  "Remove member": "移除成员",
  "New pipeline": "新建流水线",
  "New card": "新建卡片",
  "New gateway": "新建网关",
  "Edit gateway": "编辑网关",
  "Add a skill source": "添加技能源",
  "Import a skill": "导入技能",
  "Remove skill": "移除技能",
  "Delete secret": "删除密钥",
  "Create new secret": "新建密钥",
  "Discard changes?": "放弃更改？",

  // —— 空状态 / 错误页 ——
  "No tasks yet.": "暂无任务。",
  "No cases yet.": "暂无案例。",
  "No types yet.": "暂无类型。",
  "No labels yet.": "暂无标签。",
  "None yet": "暂无",
  "Page not found": "页面未找到",
  "Organization not found": "未找到组织",
  "Not Found": "未找到",
  "This route does not exist.": "此路由不存在。",
  "Requested path:": "请求路径：",
  "Open dashboard": "打开仪表盘",
  "Go home": "回到首页",
  "Resume all": "全部恢复",
  "Resuming…": "正在恢复中…",
  "Unlimited budget": "无限预算",
  "Awaiting board review": "等待董事会审核",
  "You're the instance admin": "您是实例管理员",
  "Redirecting...": "正在跳转…",
  "Continue to dashboard": "继续前往仪表盘",
  "Finishing setup from the host": "正在从主机完成设置",
};

/**
 * 运行时翻译补丁。`injectedJavaScript*` 只接受字符串，所以脚本拼在这里。
 *
 * - 只在完整去空白的 text node / placeholder / aria-label / title 上做替换，
 *   保留原有缩进空白；替换值用函数形式避免 `$&` 之类的特殊替换序列。
 * - MutationObserver 监听整棵 DOM（React 重渲染后会重新扫），带 **200ms debounce**
 *   （spec §10：避免影响 React 性能）。
 * - `__COOLIE_I18N_PATCH_INSTALLED__` 幂等守卫：beforeContentLoaded + 页面加载后
 *   各注入一次，只装一个 observer。
 */
const I18N_PATCH_INJECTION = `
window.__COOLIE_I18N_PATCH__ = ${JSON.stringify(I18N_PATCH)};
(function () {
  if (window.__COOLIE_I18N_PATCH_INSTALLED__) return;
  window.__COOLIE_I18N_PATCH_INSTALLED__ = true;
  var PATCH = window.__COOLIE_I18N_PATCH__ || {};
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, CODE: 1, PRE: 1 };
  var ATTRS = ["placeholder", "aria-label", "title"];
  function translate(raw) {
    if (raw === null || raw === undefined) return null;
    var text = String(raw).trim();
    if (!text) return null;
    var hit = PATCH[text];
    if (typeof hit !== "string" || hit === text) return null;
    return String(raw).replace(text, function () { return hit; });
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
  function start() {
    apply(document.body || document.documentElement);
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

/** 驾驶舱 App 的深链 scheme (cloud.coolie.app，见 clients/expo/app.json)。 */
const COCKPIT_DEEP_LINK = "coolie://";

/**
 * 与驾驶舱 App 同一套 Linear 风格配色 (近黑三档背景 / 四级文字亮度 /
 * 品牌紫蓝 CTA)。这里是独立包，不依赖 clients/expo 的 token 模块。
 */
const C = {
  bg: "#08090A",
  panel: "#0F1011",
  surface: "#191A1B",
  ink: "#E6E6E6",
  ink2: "#9BA1A6",
  ink3: "#8A8F98",
  line: "rgba(255,255,255,0.08)",
  lineSubtle: "rgba(255,255,255,0.06)",
  accent: "#5E6AD2",
  err: "#EF4444",
};

type ToolbarButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  badge?: boolean;
};

function ToolbarButton({ label, onPress, disabled }: ToolbarButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [
        styles.toolbarBtn,
        disabled && styles.toolbarBtnDisabled,
        pressed && !disabled && styles.toolbarBtnPressed,
      ]}
    >
      <Text style={[styles.toolbarBtnText, disabled && styles.toolbarBtnTextDisabled]}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function App() {
  const webRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(PAPERCLIP_WEB_URL);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** 递增后作为 WebView 的 key，强制重挂载以重试加载。 */
  const [reloadNonce, setReloadNonce] = useState(0);

  const goBack = useCallback(() => {
    webRef.current?.goBack();
  }, []);

  const goForward = useCallback(() => {
    webRef.current?.goForward();
  }, []);

  const reload = useCallback(() => {
    setLoadError(null);
    setLoading(true);
    webRef.current?.reload();
  }, []);

  /** 弱网/加载失败时清空错误并重挂载，等价于重新进入站点。 */
  const retryFromScratch = useCallback(() => {
    setLoadError(null);
    setLoading(true);
    setReloadNonce((n) => n + 1);
  }, []);

  const openCockpit = useCallback(async () => {
    try {
      const supported = await Linking.canOpenURL(COCKPIT_DEEP_LINK);
      if (!supported) {
        Alert.alert(
          "未安装 Coolie 驾驶舱",
          "本机没有安装 cloud.coolie.app（Coolie 驾驶舱）。",
        );
        return;
      }
      await Linking.openURL(COCKPIT_DEEP_LINK);
    } catch (e) {
      Alert.alert("打开失败", String((e as Error)?.message ?? e));
    }
  }, []);

  // Android 物理返回键：优先在 WebView 历史里后退，退无可退才交给系统退出。
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack) {
        webRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [canGoBack]);

  const onNavigationStateChange = useCallback((nav: WebViewNavigation) => {
    setCanGoBack(nav.canGoBack);
    setCanGoForward(nav.canGoForward);
    if (nav.url) setCurrentUrl(nav.url);
  }, []);

  const onLoadStart = useCallback(() => {
    setLoading(true);
    setLoadError(null);
  }, []);

  const onLoadEnd = useCallback(() => {
    setLoading(false);
  }, []);

  const onError = useCallback((event: WebViewErrorEvent) => {
    setLoading(false);
    setLoadError(event?.nativeEvent?.description ?? "页面加载失败");
  }, []);

  const displayUrl = useMemo(
    () => currentUrl.replace(/^https?:\/\//, ""),
    [currentUrl],
  );

  return (
    <SafeAreaView
      style={[
        styles.shell,
        { paddingTop: Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 24) : 0 },
      ]}
    >
      <StatusBar style="light" />

      {/* 老板 (2026-09-21) 反馈：顶部 toolbar 看起来像浏览器不像 App, 改成原生 appBar: ← 标题 → [驾驶舱]。URL box 和 ⟳ 按钮去掉 (隐去浏览器特征)。*/}
      <View style={styles.appBar}>
        <Pressable
          onPress={goBack}
          disabled={!canGoBack}
          hitSlop={8}
          style={({ pressed }) => [
            styles.navBtn,
            !canGoBack && styles.navBtnDisabled,
            pressed && canGoBack && styles.navBtnPressed,
          ]}
        >
          <Text style={[styles.navBtnText, !canGoBack && styles.navBtnTextDisabled]}>←</Text>
        </Pressable>
        <Text style={styles.appBarTitle}>Coolie Web</Text>
        <Pressable
          onPress={() => void openCockpit()}
          hitSlop={8}
          style={({ pressed }) => [styles.cockpitBtn, pressed && styles.toolbarBtnPressed]}
        >
          <Text style={styles.cockpitBtnText}>驾驶舱</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressBar,
              { width: `${Math.max(progress * 100, 4)}%` as unknown as number },
            ]}
          />
        </View>
      ) : null}

      <View style={styles.content}>
        <SafeWebView
          key={reloadNonce}
          ref={webRef}
          source={{ uri: PAPERCLIP_WEB_URL }}
          style={styles.webview}
          // —— wave 9 spec §3.5 配置 ——
          // 老板 (2026-09-21) 要求默认中文：页面脚本执行前注入 zh-CN locale
          // wave 10.1：同一对钩子里再挂 i18n 运行时补丁（beforeContentLoaded 覆盖 iOS，
          // 页面加载后那次覆盖 Android —— 之前实测 Android 的 beforeContentLoaded 跑在
          // about:blank 上下文，localStorage/DOM 补丁都会丢，必须补一次）。
          injectedJavaScriptBeforeContentLoaded={ZH_CN_INJECTION + I18N_PATCH_INJECTION}
          injectedJavaScript={ZH_CN_ENSURE + I18N_PATCH_INJECTION}
          mixedContentMode="compatibility"
          allowsBackForwardNavigationGestures
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess={false}
          // 第三方登录偶发重定向，开 cookie 共享保证 sessionStorage/cookie 生效。
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          setSupportMultipleWindows={false}
          // —— 状态回调 ——
          onNavigationStateChange={onNavigationStateChange}
          onLoadStart={onLoadStart}
          onLoadEnd={onLoadEnd}
          onHttpError={onError}
          onError={onError}
          onLoadProgress={(e: WebViewLoadProgressEvent) => {
            const p = e?.nativeEvent?.progress;
            if (typeof p === "number" && Number.isFinite(p)) setProgress(p);
          }}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color={C.accent} />
              <Text style={styles.loadingText}>正在载入 Paperclip…</Text>
            </View>
          )}
        />

        {loadError ? (
          <View style={styles.errorOverlay}>
            <Text style={styles.errorTitle}>页面加载失败</Text>
            <Text style={styles.errorBody}>{loadError}</Text>
            <Pressable style={styles.retryBtn} onPress={retryFromScratch}>
              <Text style={styles.retryBtnText}>重试</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: C.bg,
  },
  // 老板 (2026-09-21) 要求：去掉浏览器样 toolbar, 换成原生 appBar（标题 + 右侧驾驶舱按钮）
  appBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
    backgroundColor: C.panel,
  },
  appBarTitle: {
    color: C.ink,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  navBtn: {
    minWidth: 36,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: C.line,
  },
  navBtnPressed: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  navBtnDisabled: {
    opacity: 0.35,
  },
  navBtnText: {
    color: C.ink,
    fontSize: 18,
    fontWeight: "500",
  },
  navBtnTextDisabled: {
    color: C.ink3,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSubtle,
    backgroundColor: C.panel,
  },
  toolbarBtn: {
    minWidth: 34,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: C.line,
  },
  toolbarBtnPressed: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  toolbarBtnDisabled: {
    opacity: 0.35,
  },
  toolbarBtnText: {
    color: C.ink,
    fontSize: 16,
    fontWeight: "500",
  },
  toolbarBtnTextDisabled: {
    color: C.ink3,
  },
  urlBox: {
    flex: 1,
    height: 32,
    borderRadius: 8,
    paddingHorizontal: 10,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1,
    borderColor: C.line,
  },
  urlText: {
    color: C.ink3,
    fontSize: 12,
  },
  cockpitBtn: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.accent,
  },
  cockpitBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  progressTrack: {
    height: 2,
    backgroundColor: "transparent",
  },
  progressBar: {
    height: 2,
    backgroundColor: C.accent,
  },
  content: {
    flex: 1,
    backgroundColor: C.bg,
  },
  webview: {
    flex: 1,
    backgroundColor: C.bg,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: C.bg,
  },
  loadingText: {
    color: C.ink3,
    fontSize: 13,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 32,
    backgroundColor: C.bg,
  },
  errorTitle: {
    color: C.ink,
    fontSize: 16,
    fontWeight: "600",
  },
  errorBody: {
    color: C.ink3,
    fontSize: 13,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: C.accent,
  },
  retryBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
});
