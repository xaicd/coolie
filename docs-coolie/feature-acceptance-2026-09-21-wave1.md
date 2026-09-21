# Coolie 功能验收 — wave1（cmd 门神跑通记录）

> 跑手：**cmd**（门神，agent-device 1.58.1，已稳定跑过 h5 wave1）。
> 不要用 `claude` CLI —— MiniMax-M3 不在其 model catalog，`claude -p` 会
> `[claude-code:unrecognized_model]` 全废。
> Spec：`docs-coolie/FEATURE-ACCEPTANCE-LIST.md` §0-2。Repo：`~/workspace/xaicd/coolie` @ `df48b061c`（main）。
> 被测面：h5 `http://localhost:5173`（`clients/h5` @ `7a077f42b`，工作树无产品代码改动）。

---

## 跑前准备

| 检查 | 真实输出 |
|---|---|
| `git status --short` | 7 个 `M`（均为**上一轮遗留**：`clients/expo/package.json`、`clients/expo/pnpm-lock.yaml`、5 张 expo evidence PNG）+ 1 个 `??`（`docs-coolie/briefs/2026-09-21-board-inline-learn.md`）。**无产品代码改动**。 |
| `agent-device web doctor` | `Web backend is healthy.`（exit 0） |
| `curl :3100/api/health` | `health_http=200`，`{"status":"ok","deploymentMode":"authenticated",...,"commit":"df48b061ca231d81c2e3295127d8780b7fb3a416","bootstrapStatus":"ready"}` |
| h5 dev `:5173` | `h5_http=200`（`cd clients/h5 && pnpm dev`，`VITE v6.4.3`） |

> 注：跑前清理了一个上一轮遗留的 web 会话 `feat-test-001`（占着浏览器）；
> 其早前留下的 3 张碎图仍在 evidence 目录（`feat-2-quota-home.png` /
> `feat-5-prototype-iframe.png` / `feat-11-ontology-not-in-h5.png`），非本次产出。

---

## §1 PRD 12 项 — spot-check 3 条

| # | 项 | 结论 | 证据 |
|---|---|---|---|
| 2 | 看额度 | **FAIL（h5 面）** / 有公司级支出卡（board UI 面） | `/Users/mac/workspace/xaicd/coolie/clients/h5/replays/evidence/feat-2-quota.png`（h5 无额度卡）；`.../feat-2-quota-boardui.png`（`:3100` 仪表盘 `$0.00 本月支出 Unlimited budget`） |
| 5 | 看原型 | **PASS** | `.../feat-5-prototype.png` |
| 11 | 本体驱动 | **FAIL（h5 面）** / **PASS（board UI 面，7 域）** | `.../feat-11-ontology.png`（h5 无本体页）；`.../feat-11-ontology-boardui.png`（`:3100/COO/ontology` 7 域） |

**逐条真信号：**

- **#2**：`find text "额度"` on h5 → `did not match any element`；`grep 额度/汇览 clients/h5/src` 零命中。
  按 brief 的面（`:5173`）判 FAIL。交叉：board UI `:3100/COO` 仪表盘有
  `@e17 "$0.00 本月支出 Unlimited budget"`（公司级，非"员工额度卡片"）。
- **#5**：h5 工作空间「预览」Tab 真跑 → URL 输入框 `https://xrobinai.cn` + iframe
  实际加载出站点内容（`[heading] 小陈的技术分享` / `平台能力` / `开源项目`…）。
  含 [全屏]/[外链] 工具条。PASS。
- **#11**：h5 无本体页（`find text "本体"` 不命中；`clients/h5` 零命中）。
  board UI `:3100/COO/ontology` 真跑 → 7 个域 option 全命中 + 关系过滤
  （复现 e2e R1 `A3-ontology-domain-count >= 7`）。

---

## §2 ChatHome 8 项（h5 web 模式，全部实跑）

| # | 项 | 结论 | 证据 |
|---|---|---|---|
| 13 | InlinePreviewPanel URL 预览 | **PASS** | `.../feat-13-inline-preview-url.png` |
| 14 | MvpPreviewCard 缩略图 + Modal | **PASS**（meta 行未实现，见红表） | `.../feat-14-mvp-preview-card.png` |
| 15 | CodeDiffCard 行号 + 红绿 | **FAIL（h5 未实现）** | `.../feat-15-code-diff.png` |
| 16 | InlineCodeEditor (CM6) | **FAIL（h5 未实现）** | `.../feat-16-cm6-editor.png` |
| 17 | WorkspaceScreen 4 Tab | **PASS** | `.../feat-17-workspace-4-tabs.png` |
| 18 | FilesTab 文件树（5 层） | **PASS** | `.../feat-18-files-tree.png` |
| 19 | TerminalTab（`help`） | **PASS** | `.../feat-19-terminal-help.png` |
| 20 | PreviewTab（默认 URL） | **PASS** | `.../feat-20-preview-tab.png` |

**逐条真信号（agent-device 实跑，非截图模拟）：**

- **#13**：文本框贴 `<preview-url>https://example.com</preview-url>` → 发送 →
  diff 真实新增 `[iframe] "https://example.com"` + `[heading] "Example Domain"`
  （`find text "Example Domain" exists` → `Found: true`）。即标签被就地渲染成
  inline iframe，未跳走。PASS。
- **#14**：贴 `<preview-mvp title="测试" thumb="https://via.placeholder.com/150" meta='{"key":"val"}'></preview-mvp>`
  → 发送 → diff 新增 `[button] "测试 图片加载失败 重试"` + `[⤢ 全屏]` + `[↗ 外链]`。
  卡片/标题/全屏工具条成立；`meta` 行未渲染（全端一致，非 h5 单端）；缩略图 URL 外部不可达。
- **#15**：贴 `<code-diff file="x.ts" lang="ts">+added\n-removed</code-diff>` → 发送 →
  标签**原样纯文本**呈现，无高亮/行号/红绿。`find "code-diff"` / `find "+added"` 均不命中。
- **#16**：无 `[编辑]` 入口（`find text "编辑"` 不命中）；h5 无 CodeMirror 依赖/引用。
- **#17**：点 `▦ 工作空间` → 原生 `<dialog>` 弹出，`snapshot -i` 输出 4 个 tab：
  `[tab] "对话"` / `[tab] "预览"` / `[tab] "文件"` / `[tab] "终端"`（+ `⟳` 复位 / `✕` 关闭）。PASS。
- **#18**：切「文件」Tab → 嵌套文件树渲染 `templates → workspace-skel → specs → billing`，
  手动展开 `billing → v1` 后新增 `[button] "schema.md markdown"` / `"acceptance.md markdown"`
  （达 6 层嵌套）。折叠/展开交互真跑。PASS。
- **#19**：切「终端」Tab → 输入 `help` → 点 `↵` → 输出区真渲染 help 文本
  （`help/pwd/ls/cat <file>/clear/whoami`）；命令回显为
  `coolie@workspace:/$ help`。PASS。
- **#20**：切「预览」Tab → 地址栏默认 `https://xrobinai.cn`（`DEFAULT_PREVIEW_URL`），
  iframe 实际加载该站 + `[打开]`/`[重置 URL]`。PASS。

---

## 失败真实记录（真红，不改松）

完整 root cause + 真实 stdout：**`docs-coolie/TEST-FAILURES-2026-09-21.md`**。摘要：

| 编号 | 结论 | 一句话根因 |
|---|---|---|
| F-15 | FAIL | h5 标签解析器只支持 `preview-url`/`preview-mvp`，无 `<code-diff>`（expo 端另有 `CodeDiffScreen`） |
| F-16 | FAIL | h5 无 CodeMirror 依赖（CM6 只在 expo `codemirrorHtml.ts`） |
| F-2 | FAIL(h5) | h5 无汇览/额度卡；board UI 只有公司级"本月支出"卡 |
| F-11 | FAIL(h5) | h5 无本体页；本体页在 board UI/expo，board UI 侧 7 域 PASS |
| F-14 | PARTIAL | `meta` 解析但不渲染（全端）；占位图 URL 外部不可达 |

**关键判读**：F-2 / F-11 / F-15 / F-16 都是 **"h5 面未实现"**，不是"做坏了"。
h5 wave1（`7a077f42b`）的 commit message 自己写明只交付
`tagParser + InlinePreviewPanel + WorkspaceScreen` —— 这 4 项不在其 scope。
brief 把 §1/§2 的 4 项按"h5 已有"来映射，与实际不符；本报告如实分列 h5 面与
board UI 面结果，不掩盖、不改断言。

---

## 截图清单（本地证据，不入 git）

```
$ ls -la clients/h5/replays/evidence/
total 8424
drwxr-xr-x  18 mac  staff     576 Sep 21 12:34 .
drwxr-xr-x   3 mac  staff      96 Sep 21 11:27 ..
-rw-r--r--   1 mac  staff  215484 Sep 21 12:34 feat-11-ontology-boardui.png
-rw-r--r--   1 mac  staff  104246 Sep 21 11:29 feat-11-ontology-not-in-h5.png   ← 上轮遗留
-rw-r--r--   1 mac  staff  243241 Sep 21 12:32 feat-11-ontology.png            （h5 面无本体页）
-rw-r--r--   1 mac  staff  387485 Sep 21 12:27 feat-13-inline-preview-url.png
-rw-r--r--   1 mac  staff  523616 Sep 21 12:28 feat-14-mvp-preview-card.png
-rw-r--r--   1 mac  staff  368221 Sep 21 12:29 feat-15-code-diff.png
-rw-r--r--   1 mac  staff  368221 Sep 21 12:30 feat-16-cm6-editor.png
-rw-r--r--   1 mac  staff  296187 Sep 21 12:30 feat-17-workspace-4-tabs.png
-rw-r--r--   1 mac  staff  221389 Sep 21 12:31 feat-18-files-tree.png
-rw-r--r--   1 mac  staff  223687 Sep 21 12:31 feat-19-terminal-help.png
-rw-r--r--   1 mac  staff  161634 Sep 21 12:34 feat-2-quota-boardui.png
-rw-r--r--   1 mac  staff  104246 Sep 21 11:28 feat-2-quota-home.png           ← 上轮遗留
-rw-r--r--   1 mac  staff  243241 Sep 21 12:32 feat-2-quota.png                （h5 面无额度卡）
-rw-r--r--   1 mac  staff  359176 Sep 21 12:32 feat-20-preview-tab.png
-rw-r--r--   1 mac  staff  104246 Sep 21 11:29 feat-5-prototype-iframe.png     ← 上轮遗留
-rw-r--r--   1 mac  staff  359176 Sep 21 12:32 feat-5-prototype.png
```

**本地绝对路径**：`/Users/mac/workspace/xaicd/coolie/clients/h5/replays/evidence/`
**git 状态**：`clients/*/replays/evidence/` 已在 `.gitignore`（`git check-ignore` 命中），
截图不入库。本次 commit 只带 `.md`（报告 + 红表 + PM 节）。

---

## 验收点核对

- [x] 跑前准备 4 步全过（doctor healthy / health 200 / h5 200 / git 无产品改动）
- [x] §1 3 spot-check 全报（#5 PASS；#2/#11 h5 面 FAIL + board UI 面交叉）
- [x] §2 8 项全报（13/14/17/18/19/20 PASS；15/16 FAIL）
- [x] 11+ 张截图在本地（不入 git）
- [x] 失败写 `docs-coolie/TEST-FAILURES-2026-09-21.md`
- [x] commit + push
- [x] PM-AGENTS §10 加行
