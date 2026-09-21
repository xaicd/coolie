# Spec: Coolie Web 翻译补丁层 (i18n patch layer) — wave 10.1

- 日期：2026-09-21
- 老板原话：「整个 web 的国际化还有很多问题」
- 优先级：P0
- PM：Hermes
- 状态：READY FOR DISPATCH

## 1. 背景

PM 2026-09-21 实查上游 paperclip i18n:
- zh-CN.json 144/144 keys 覆盖 = 100%
- 但 paperclip 上游**大量硬编码英文文案**:
  - 登录页: "Sign in to Coolie", "Email", "Password", "Forgot password"
  - 导航: "Recent Tasks", "Open Connectors", "Runner Inspector", "Execution Workspaces"
  - 设置: "Header name", "Search apps…"
  - 详情: "Adopt Connections for...", "Open sign-in in a new tab"
- 这些文案直接写在 .tsx 里，**不是 i18n key** → zh-CN 翻译文件覆盖不到

## 2. 老板的问题

老板用 Coolie Web App 看到:
- i18n chrome (nav/sidebar/部分 dashboard) 是中文 ✅
- 但许多详情页/弹窗/按钮/placeholder 仍是英文 ❌

## 3. 边界

- ❌ 不动 ui/ (paperclip 上游, fork-surface 限制)
- ❌ 不动 paperclip 上游任何代码
- ✅ 可以改 clients/expo-paperclip-web/App.tsx (Coolie fork 自己的)

## 4. 解法 — 运行时注入翻译补丁

### 4.1 在 Coolie Web App 加 PATCH dictionary

`clients/expo-paperclip-web/App.tsx`:
```ts
const I18N_PATCH: Record<string, string> = {
  "Sign in to Coolie": "登录 Coolie",
  "Email": "邮箱",
  "Password": "密码",
  "Forgot password?": "忘记密码？",
  "Sign in": "登录",
  "Create account": "创建账号",
  "Recent Tasks": "最近任务",
  "Open Connectors": "打开连接器",
  "Runner Inspector": "运行器检查",
  "Execution Workspaces": "执行工作空间",
  "Header name": "Header 名称",
  "Search apps…": "搜索应用…",
  "Open sign-in in a new tab": "在新标签页打开登录",
  "Reconnect selected account": "重新连接所选账号",
  "Cancel repair": "取消修复",
  "Cancel setup": "取消设置",
  // ... 至少 50 条覆盖最常见
};

const I18N_PATCH_INJECTION = `
window.__COOLIE_I18N_PATCH__ = ${JSON.stringify(I18N_PATCH)};

(function patchI18n() {
  const PATCH = window.__COOLIE_I18N_PATCH__ || {};
  function apply(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue?.trim();
      if (text && PATCH[text]) {
        node.nodeValue = PATCH[text];
      }
    }
  }
  if (document.body) apply(document.body);
  else document.addEventListener("DOMContentLoaded", () => apply(document.body));
  // 监听 DOM 变化 (React 重渲染后重新扫)
  const observer = new MutationObserver(() => apply(document.body));
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
})();
`;
```

### 4.2 WebView 注入

```ts
injectedJavaScriptBeforeContentLoaded={I18N_PATCH_INJECTION}
```

## 5. 真值采集流程（派活前先做）

PM/匠人先跑采集脚本:

```bash
# 1. 模拟器装机 0.6.1 + Coolie Web App
adb shell am start -n cloud.coolie.app.web/.MainActivity
sleep 5

# 2. 截屏每屏 (登录 / 主页 / 任务详情 / 本体 / 设置 / 智能体详情)
adb shell screencap -p /sdcard/01-login.png; adb pull /sdcard/01-login.png /tmp/i18n-evidence/
adb shell screencap -p /sdcard/02-home.png; adb pull ...
# 重复 6-10 屏

# 3. 提取每张截屏的 visible text (用 OCR 或 uiautomator dump)
adb shell uiautomator dump
adb pull /sdcard/window_dump.xml /tmp/i18n-evidence/
# grep text 节点
grep -oE 'text="[^"]*"' /tmp/i18n-evidence/window_dump.xml | sort -u
```

## 6. PATCH 字典采集后填充

收集 50-100 条最常见硬编码英文 → 加进 I18N_PATCH dictionary

## 7. 完成定义

1. I18N_PATCH dictionary 入库 ≥ 50 条
2. 模拟器装机 0.6.2-paperclip-web 截图对比翻译覆盖率 ≥ 80%
3. commit + push + rebuild 0.6.2 + 装机直链给老板

## 8. 不回签就停在哪

如果老板认为"运行时注入 MutationObserver 太 hack"，改方案：直接 patch paperclip 上游 ui/ 翻译文件 + 给上游 PR。我们不抽, 改用 MutationObserver。

## 9. 派单

第一波 (门神 cmd):
1. 实测采集硬编码英文 (采集脚本 + 跑 10 屏)
2. 加 I18N_PATCH dictionary 50 条
3. 注入 MutationObserver 逻辑
4. rebuild 0.6.2 + coscli upload
5. 装机模拟器验证
6. 截图证据

## 10. 派单阻塞

| 阻塞 | 解法 |
|---|---|
| 模拟器采集超时 | 手动跑 uiautomator dump (10 分钟内) |
| MutationObserver 影响 React 性能 | 加 debounce 200ms |
| PATCH 字典硬编码多 → 维护成本 | 后续可读 paperclip PR 慢慢迁移到 i18n key |