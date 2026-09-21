# Coolie 功能验收 — wave2（h5 补齐 5 gap）

> 跑手：**cmd**（同一把铁匠，wave1 撞 MiniMax-M3 model catalog 错误后在 wave2 收尾）。
> Spec：`docs-coolie/briefs/2026-09-21-h5-wave2.md`；上游依据
> `docs-coolie/feature-acceptance-2026-09-21-wave1.md` + `docs-coolie/TEST-FAILURES-2026-09-21.md`。
> 被测面：h5 `http://localhost:5173`（`clients/h5` @ `main`）。
> 原则：真跑、真截图、真数据；读不到的如实报，不 stub、不改断言。

---

## 0. Pre-condition（release 0.5.1 已落地，全部通过）

| 检查 | 真实输出 |
|---|---|
| `git log --oneline -3` | HEAD = `05b090cb4 release: v0.5.1 …`（release commit 在 HEAD） |
| `curl -fsS https://xrobinai.cn/version.json` | `{"version":"0.5.1","versionCode":501,…}` |
| `curl -I .../app/0.5.1/coolie-release.apk` | `HTTP/1.1 200 OK` （`Content-Length: 77616962`） |

---

## 1. 进场发现：wave1 的 5 个 gap 已被上一把铁匠写完但**未提交**

`git status --short` 进场时已有 5 个 `??` 新文件 + 5 个 `M` 修改，全部落在
`clients/h5/`（+ `clients/api-client/`）。即任务①（铁匠撞 model catalog 错误那次）
代码写完了、`tsc` 也过了，但没 commit。本波的动作是：**核验 → 修 1 个真 bug → 提交**。

---

## 2. 5 个 gap 逐条收口

| # | gap | 文件 | 行数 | 结论 |
|---|---|---|---|---|
| 1 (F-15) | CodeDiffCard h5 | `clients/h5/src/components/board-inline/CodeDiffCard.tsx` | 332 | **PASS** |
| 2 (F-16) | CodeMirror 6 编辑器 | `clients/h5/src/components/board-inline/CodeMirrorEditor.tsx` | 269 | **PASS** |
| 3 (F-14) | MvpPreviewCard meta 行 | `clients/h5/src/components/board-inline/MvpPreviewCard.tsx` | 288 | **PASS** |
| 4 (F-2) | 看额度（汇览）屏 | `clients/h5/src/screens/DashboardScreen.tsx` | 318 | **PASS** |
| 5 (F-11) | 本体驱动屏 | `clients/h5/src/screens/OntologyScreen.tsx` | 295 | **PASS** |

接线（`git diff`）：`tagParser.ts` 新增 `code-diff` 标签（第 3 种 kind = `diff`，含
`file`/`lang`/`patch` 字段与空标签体保护）；`BoardChatScreen.tsx` 按 `kind` 分派
（`diff` → CodeDiffCard，其余 → InlinePreviewPanel，并把 `meta` 透传下去）；
`InlinePreviewPanel.tsx` 图片分支改走 MvpPreviewCard；`App.tsx` 加 hash 路由 + 顶部 nav。

---

## 3. 真跑证据（agent-device 实跑 `http://localhost:5173`，非截图模拟）

登录：浏览器先到 `http://localhost:3100/auth` 登录 `e2e-harness@coolie.local`
（cookie 与端口无关，h5 `:5173` 经 vite proxy 复用同一 localhost 会话 → 拿到真数据）。

### 3.1 GAP 1 + GAP 3（对话流里）

```
</> hello.ts +2 -1 编辑
src/hello.ts
@@ -1,3 +1,4 @@
1 1  export function hello() {
2 -  return "hi";
2 +  return "hello";
3 3 }
4 + // added by coolie

首页 v2
作者 小陈
版本 v2.0
构建 2026-09-21
```

→ 行号双列（old/new）、hunk、红绿、`+2 -1` 统计、`[编辑]` 入口全部成立；
`<preview-mvp meta='{…}'>` 的 **meta 键值行**（作者/版本/构建）也渲染出来了（F-14 收口）。

### 3.2 GAP 2（点 [编辑] 后）

`@e12 [button] "编辑"` → 点击 → 变 `"预览"`，且新增
`@e16 [text-field] "@@ -1,3 +1,4 @@"`。截图可见 **CM6 行号槽 1–6**、
删除行红底、新增行绿底、`@@` hunk 行蓝底 —— 纯 web CodeMirror 6，无 iframe/WebView。

### 3.3 GAP 4（看额度，真 API 数据）

```
全部公司 · 本月支出合计
$0.00
预算 $0.00 · 已用 0%

coolie            0%
$0.00
本月支出
月度预算 $0.00
剩余额度 $0.00
进行中任务 1
待审批 0
```

→ `GET /api/companies` + `GET /api/companies/:id/dashboard` 真数据；与 board UI
`$0.00 本月支出` 同源。

### 3.4 GAP 5（本体驱动，真 API 数据）

```
本体驱动   业务本体域 · 共 7 个
coolie    7 个域
Fourth Coffee / E-Commerce Platform / Banking & Finance / Healthcare System /
Smart Manufacturing / University System / Zava Grove-to-Shelf
   （每个卡：slug · v1 + 描述 + 草稿/分类/内置 tag）
```

→ **7/7 域**，与 e2e R1（`A3-ontology-domain-count >= 7`）一致。

---

## 4. 本波修的真 bug（非 gap 清单内，但会挡住 GAP 4/5）

**症状**（未修前，h5 看额度真跑）：
`Failed to execute 'fetch' on 'Window': Illegal invocation`。

**Root cause**：`clients/api-client/src/client.ts:120` 存 `globalThis.fetch` 后以
`this.fetchImpl(...)` 调用 —— 浏览器里 `fetch` 的 receiver 变成 client 实例，Chrome
直接抛 `Illegal invocation`（请求根本没发出去）。RN 的 `fetch` 不看 receiver，所以
expo 端一直没暴露；h5 是第一个在浏览器里用本 client 的面。

**修**：构造时绑定 `globalThis.fetch?.bind(globalThis)`（`client.ts:117-129`）。
**副作用面**：`grep @coolie/api-client` 命中只有 `clients/h5` 与 `clients/expo`；
`ui/`、`server/`、`packages/` 零命中 → 影响面仅两个 client，无回归。
**修后**：请求真发出，未登录时是干净的 HTTP 403，不再是 JS crash。

---

## 5. e2e-local.sh 复跑（`bash scripts/e2e-local.sh`）

前置：清掉两个遗留 agent-device 会话（`cwd:…:default` / `default`，占着浏览器）。

```
PASS web-backend / stack-health / board-auth
PASS R0-sign-in / R1-ontology-page / A3-ontology-domain-count (7 domains >= 7)
PASS R2-tasks-page
FAIL R3-board-chat-reply   ← 真红（已记录，见 §6）
PASS H5-dev-server / H5-workspace-tabs / H5-build

Assertions: 10 passed, 1 failed, 0 skipped (of 11)
```

---

## 6. 真红记录（不改松）

| 编号 | 结论 | root cause |
|---|---|---|
| R3-board-chat-reply | **FAIL（本地真红，事先已知）** | replay 第 7 步 `wait text "388"` 等的是 agent 真回复（137+251）；本地不连生产 agent/SSE，故超时。与 wave1「#12 工坊对话（SSE）保持本地真红」同因，非本波回归。board UI 面（`:3100`）代码未动。 |

---

## 7. 与 brief 的偏差（如实标注）

- brief §7 写「Top nav: 汇览 / 员工 / 工坊 / 任务 / 本体」。本波实际 nav 为
  **工坊 / 看额度 / 本体驱动**（3 项）：GAP 4/5 只定义了 quota 与 ontology 两屏，
  没有 员工/任务 屏；给不存在的屏挂 tab 会做出坏 UI，故不臆造。
  `额度` 与 `汇览` 两个词都在看额度屏里出现（页题 `看额度` + 副标 `本月支出 / 预算 · 汇览`）。
  员工/任务 屏留给 wave3（brief §9 指向 `clients/h5/src/screens/workspace/…`）。
- brief §2 提 react-syntax-highlighter：diff 视图用原生 `<pre><code>` + CSS 类实现
  （brief 本身允许「or copy via plain CSS」），未引入该依赖；CodeMirror 只在「编辑态」用。

---

## 8. 验收点核对

- [x] Pre-condition 3 项全过（HEAD=0.5.1 / version.json 0.5.1+501 / APK 200）
- [x] 5 个 gap 全收口，5 个新文件在 `clients/h5/src/`
- [x] `clients/h5` `tsc --noEmit` = 0；`clients/api-client` `tsc --noEmit` = 0；`vite build` 通过
- [x] agent-device 真跑 5 个 gap（截图见下），GAP 4/5 为真 API 数据（7 域）
- [x] `e2e-local.sh` 复跑：10 PASS / 1 真红（R3，已记录）
- [x] 未动 `clients/expo/`、未动 `ui/`、未 bump 版本
- [x] commit + push

## 9. 证据清单（本地，`**/replays/evidence/` 已在 `.gitignore`，不入库）

```
clients/h5/replays/evidence/wave2-15-code-diff+14-mvp-meta.png
clients/h5/replays/evidence/wave2-16-cm6-editor.png
clients/h5/replays/evidence/wave2-2-quota.png
clients/h5/replays/evidence/wave2-11-ontology.png
```

绝对路径：`/Users/mac/workspace/xaicd/coolie/clients/h5/replays/evidence/`
