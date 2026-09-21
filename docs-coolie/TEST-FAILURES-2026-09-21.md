# Coolie 验收真红记录 — 2026-09-21（wave1，cmd）

> 原则：真红就真红，不改断言、不 stub。以下每条都给出 root cause + 真实 stdout/证据。
> 跑手：cmd（门神）。Spec：`docs-coolie/FEATURE-ACCEPTANCE-LIST.md`。
> 被测面：h5 = `http://localhost:5173`（vite dev，`clients/h5` @ `7a077f42b`，工作树无改动）。

---

## F-15 — CodeDiffCard 行号 + 红绿（h5 未实现）

**结论：FAIL（h5 面不存在该组件）**

- 命令：`agent-device open http://localhost:5173` → 文本框贴
  `<code-diff file="x.ts" lang="ts">+added\n-removed</code-diff>` → 发送
- 真实观察：该标签**原样作为纯文本**渲染在气泡里（截图
  `/Users/mac/workspace/xaicd/coolie/clients/h5/replays/evidence/feat-15-code-diff.png`），
  没有语法高亮、没有行号、没有红绿。
- 真实 stdout（agent-device）：

```
=== find code-diff ===
Error (COMMAND_FAILED): find did not match any element
=== find +added ===
Error (COMMAND_FAILED): find did not match any element
```

**Root cause（root cause 是"没做"，不是"做坏了"）：**

- h5 的标签解析器只有两种标签：`<preview-url>` 与 `<preview-mvp>`
  （`clients/h5/src/components/board-inline/tagParser.ts:44,47`）。
  `<code-diff>` 不在其中 → 落回正文纯文本。
- 全仓 grep `code-diff|CodeDiffCard`：只在 `clients/expo`（`CodeDiffScreen.tsx` /
  `UnifiedDiffViewer.tsx`）命中，`clients/h5` 零命中。
- h5 wave1（`7a077f42b`）的 commit message 自己写明本波只交付
  `tagParser + InlinePreviewPanel + WorkspaceScreen（4 Tab）`，不含 CodeDiffCard。

**归属**：h5 未实现（expo 端有）。非回归。

---

## F-16 — InlineCodeEditor / CodeMirror 6（h5 未实现）

**结论：FAIL（h5 面不存在该组件）**

- 依赖 F-15：没有 CodeDiffCard，就没有它上面的 `[编辑]` 入口。
- 真实 stdout：

```
=== find 编辑 ===
Error (COMMAND_FAILED): find did not match any element
=== grep codemirror in h5 ===
(无输出)
```

**Root cause：**

- h5 无任何 CodeMirror 依赖/引用：`grep -rin "codemirror|cm6|@codemirror" clients/h5/src clients/h5/package.json`
  零命中。
- CM6 相关代码只在 expo：`clients/expo/src/components/codemirrorHtml.ts` +
  `clients/expo/assets/codemirror.html`。

**归属**：h5 未实现（expo 端有）。非回归。

---

## F-2 — 看额度（h5 面不存在"额度卡片"）

**结论：h5 面 FAIL；board UI(`:3100`) 面有"本月支出"卡片（非员工额度卡）**

- 按 brief 命令 `agent-device open http://localhost:5173` → 真实 stdout：

```
=== search 额度 on h5 surface ===
Error (COMMAND_FAILED): find did not match any element
=== grep h5 for 额度/本体/汇览 ===
(无输出)
```

**Root cause：**

- 全仓 grep `额度|汇览`：命中 `clients/expo`（`App.tsx` / `BoardChatScreen.tsx` /
  `DashboardScreen.tsx`）与 server/plugins，**h5 与 `ui/` 零命中**。
- h5 是"最小骨架"（只做 inline preview + workspace），没有汇览页。

**交叉验证（面不同，如实分列）：**

- board UI `http://localhost:3100/COO`（e2e 的 R0-R3 面）仪表盘渲染
  `@e17 "$0.00 本月支出 Unlimited budget"`（截图 `feat-2-quota-boardui.png`）。
  这是公司级月度支出卡，**不是** PRD 说的"员工额度卡片"（后者在 expo 汇览页）。

**归属**：h5/expo 面差异；h5 未实现。

---

## F-11 — 本体驱动（h5 面不存在本体页）

**结论：h5 面 FAIL（未实现）；board UI 面 PASS（7 域，复现 R1）**

- 按 brief 命令 `agent-device open http://localhost:5173` → 真实 stdout：

```
=== search 本体 on h5 surface ===
Error (COMMAND_FAILED): find did not match any element
```

**交叉验证（真跑，非截图模拟）：**

- 登录 board UI（`e2e-harness@coolie.local`）→ `http://localhost:3100/COO/ontology`，
  `agent-device snapshot -i` 真实输出 7 个域 + 关系过滤：

```
@e6  [combobox] "Fourth Coffee · v1"
@e37 [option] "Fourth Coffee · v1"
@e38 [option] "E-Commerce Platform · v1"
@e39 [option] "Banking & Finance · v1"
@e40 [option] "Healthcare System · v1"
@e41 [option] "Smart Manufacturing · v1"
@e42 [option] "University System · v1"
@e43 [option] "Zava Grove-to-Shelf · v1"
@e11 [button] "✨ 样例域"
@e75 [combobox] "按关系过滤"
```

  7/7 域命中 → 与 e2e R1（`A3-ontology-domain-count >= 7`）一致。截图
  `feat-11-ontology-boardui.png`。

**归属**：h5 未实现；本体页在 board UI / expo 端且工作正常。

---

## F-14（部分）— MvpPreviewCard 的 `meta` 行未渲染 + 外部占位图不可达

**结论：卡片本体 PASS（缩略图位 + 全屏工具条 + 标题）；brief 期望的 "meta 行" 未实现**

- 真跑：贴 `<preview-mvp title="测试" thumb="https://via.placeholder.com/150" meta='{"key":"val"}'></preview-mvp>`
  → 发送，agent-device diff 真实输出：

```
+ @e17~s469382 [button] "测试 图片加载失败 重试"
+ @e15~s469382 [button] "⤢ 全屏"
+ @e16~s469382 [button] "↗ 外链"
```

- **meta 行**：`tagParser.parseMeta()` 解析了 meta（`tagParser.ts:148`），但
  `MessageBubble` 只把 `url/imageUrl/title` 传给 `InlinePreviewPanel`，后者
  props 里根本没有 `meta`（`InlinePreviewPanel.tsx:46-59`）→ 不渲染。
  **expo 端同样不渲染**（`grep -n meta clients/expo/.../InlinePreviewPanel.tsx` 零命中），
  故这是全端一致的"未实现"，非 h5 单端回归。
- **缩略图**：`via.placeholder.com` 在本机不可达 → 卡片进入 `图片加载失败` 错误态
  （组件错误态本身工作正常；种子消息里 `picsum.photos` 的 mvp 图能正常加载，见
  `feat-14-mvp-preview-card.png`）。

**归属**：meta 渲染缺失（全端）；占位图 URL 是外部依赖不可达（非产品缺陷）。

---

## 未列红（诚实标注）

- `#12 工坊对话（SSE）`：按 brief 说明保持"本地真红"（本地不连生产后端），
  本波未重复跑，不另记。
- agent-device 的 `find text`/`wait text` 对**无 role 的裸 `<div>` 文本**不命中
  （如气泡正文"收到…"、终端输出行）。这是 AX 树暴露限制，**不是产品缺陷**；
  已用截图 + iframe/heading 节点（如 "Example Domain"）交叉确认渲染为真。
