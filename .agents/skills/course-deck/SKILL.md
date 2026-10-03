---
name: course-deck
description: 把教案或讲义做成课程课件——先出三个视觉方向定稿，再落成每页独立 HTML（1920×1080）的多文件 deck，最后导出矢量 PDF 与可编辑 PPTX。沉淀了导出静默丢字、内容溢出被裁、PDF 文字层康熙部首假象等实测坑与对应验证命令。适用于“把教案做成课件/PPT/幻灯片”“导出 PDF/PPTX”“做个课程课件”“把这讲做成可讲的页面”等场景。
---

# 课程课件生成

这条链的**第四环**。上游三环各自有技能，本技能只管「教案 → 课件」：

```
视频/音频 ──①──> 逐字稿 ──②──> 纠错讲义 ──③──> 教案 ──④──> 课件（HTML / PDF / PPTX）
          video-to-transcript   lecture-lesson-plan   ← 本技能
```

**产物是给人讲、给人改、给人存档的东西**，不是网页。所以取舍顺序是：
**能改 > 好看 > 花哨**。一页里观众 3 秒抓不到重点，就是这页写坏了。

---

## 🛑 三条硬门（顺序不可换）

### 门 1 · 先定架构：多文件，不是单文件

```
问：这份课件多少页？
├── ≤10 页、需要页间动画或跨页交互          → 单文件（<section> + deck_stage.js）
└── ≥10 页、讲座、课程、多 agent 并行        → 多文件 + 拼接器（默认走这条）
```

**默认走多文件**。它不是备选，是长 deck 的主路径。

| 维度 | 单文件 | 多文件 + 拼接器 |
|---|---|---|
| CSS 作用域 | ❌ 全局，一页的样式会串到所有页 | ✅ iframe 天然隔离 |
| 单独验证 | ❌ 要 JS `goTo()` 才能切页 | ✅ 双击单页文件就看得到 |
| 并行开发 | ❌ 一个文件，多 agent 必冲突 | ✅ 各页独立，零冲突 |
| 打印 PDF | ✅ | ✅ 拼接器内置 beforeprint |

单文件架构踩过的四个真实坑，根因都是**单一全局命名空间**：CSS 特异性覆盖导致所有页同时渲染叠加、Shadow DOM slot 规则被外层压制、localStorage + hash 导航竞态、每次截图都要 `page.evaluate(d => d.goTo(n))` 慢一倍还常报错。多文件从物理层面消除这些问题。

### 门 2 · 三方向硬门：先出三个视觉方向，用户选定才铺全篇

**任何新课件 100% 先出三个方向初稿**，指定风格/品牌也不豁免。

- 三版**并行**做，各出 **2 页代表页**真实 HTML（不是描述、不是 moodboard）
- 三版必须在**气质上**拉开，不能是同一套换个主色。例如：
  - 数据新闻编辑版式（FT / Economist：纸面底色、衬线大标题、严格横线、单一点缀色）
  - 学术讲义版式（近白、无衬线、编号章节、克制）
  - 现代产品版式（深色、大留白、卡片、渐变点缀）
- 三版各自截图后**摆在一起**给用户选，附一段说明每版适合什么样的课
- 选定后写 `direction-approved.md` 落档，说明**为什么选它**——日后换方向要回看这份

三版初稿**保留在 `d1/ d2/ d3/` 不要删**，日后换方向直接从里面捡。

### 门 3 · 内容先于样式：先做「教案 → 页码」映射

教案天然有结构，**先映射再画**。第 2 页必须是整份的支点（全讲最反直觉的那个数字或对比）。典型映射：

| 教案小节 | 页 | 页面职责 |
|---|---|---|
| 学习目标 | 1 | 封面 + 本讲要回答的问题 |
| 纠正的认知 | 2–3 | **支点页**：把最常见误解和真相并置 |
| 核心结论 | 3–4 | 结论先行，字少 |
| 关键概念 | 5 | 术语 + 一句话定义 |
| 分板块要点 | 6–9 | 每页一个板块，**一页只讲一件事** |
| 判断标准 / 关键问题 | 10–11 | 每条问题给「答到哪算懂」的门槛 |
| 自测 / 行动建议 | 12 | 可执行清单 |

页数**不要硬凑**。12 页是舒适区；结构撑不起 12 页就做 8 页，**别为凑页数注水**。

---

## 产物布局

```
<deck>/
  index.html            概览墙（复制 assets/deck_index.html，只改 MANIFEST）
  deck.css              共享样式 —— 换肤只改这一个文件
  slides/               每页独立 HTML，1920×1080，文件名带序号
    01-cover.html
    02-<支点>.html
    ...
  thumbs/               概览墙缩略图（见下方「为什么必须有」）
  d1/ d2/ d3/           三方向初稿（保留）
  shots/                验收截图（可再生产物，建议 gitignore）
  direction-approved.md 方向落档
  <name>.pdf            矢量 PDF
  <name>.pptx           可编辑 PPTX
  <name>-pptx-source.html   PPTX 导出源（由 slides/ 合成，勿手改）
  README.md
```

**`thumbs/` 为什么必须有**：概览墙如果用 12 个 `<iframe>` 直接嵌 12 页，会同时加载 12 份完整页面（含字体、SVG、渐变），首次打开明显卡顿。用缩略图做画廊，点进去才加载真页。

**可再生产物不要入库**：`shots/`、`thumbs/` 都能从 HTML 重新生成，`.gitignore` 掉。`<name>.pdf` 是矢量文档、`<name>.pptx` 是文本框，体积小且是交付物，**要入库**。

---

## 每页骨架

```html
<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<!-- 正文一律用 <p> / <h1>-<h6> 包住，且不带 background/border/shadow -->
<!-- 卡片底、色条、分隔线一律用独立 <div>，不要套在 <p> 上 -->
</head><body>
<div class="stage">        <!-- 固定 1920×1080，overflow:hidden -->
  ...
</div>
</body></html>
```

**字号按「最后一排也能看清」定**，不要按「屏幕上好看」定：正文 32–40px、页标题 64–96px、封面主标题 120–160px。课件不是网页，观众离屏幕远。

**中文字体必须显式声明**，否则 Chromium 在渲染时会降级成随机字形：

```css
@font-face{font-family:"SerifCN";src:local("Songti SC");}
@font-face{font-family:"SansCN"; src:local("PingFang SC");}
```

### 素材决策：数据型内容不要配图

- 内容是**数据/结构**（过关率、收入分布、专业分类、报考资格对比）→ **零图片**，用条、表、数字做。这类内容配图属装饰，不承载信息。
- 内容是**流程/空间关系**（设备链路、产业链）→ 用 SVG，矢量且可编辑。
- **忌造假标识**：校徽、企业 logo 这类品牌资产，若不在 svgl / simpleicons 覆盖范围内，favicon 又只有 16px（放大就是糊的）——**用诚实占位**（文字名 + 中性图形），**不要画一个近似 logo**。假标识比没有标识更糟。

---

## 导出：两条路，先选对

| 情况 | 走哪条 | 脚本 |
|---|---|---|
| HTML 还没写，且**确定要 PPTX 可编辑** | 从第一行就按 4 条硬约束写 | `scripts/export_pptx.mjs` |
| **HTML 已经写好且是视觉驱动的**（flex / 居中 / 渐变 / 背景图） | 读渲染后坐标，**零改造** | `scripts/pptx_from_rendered.py` |
| 只要 PDF（矢量、可搜索） | 任何 HTML 都能导 | `scripts/export_pdf.mjs` |

**课程课件默认走渲染坐标那条**——课件是视觉驱动的，几乎不可能满足硬约束。

```bash
# 1) 每页 HTML → 矢量 PDF
node scripts/export_pdf.mjs --slides slides --out deck.pdf

# 2) 合成 PPTX 导出源（所有页拼成一个 HTML）
python3 scripts/combine_deck.py slides -o deck-pptx-source.html

# 3) 渲染坐标 → 可编辑 PPTX
#    ⚠️ --selector .stage 必须带，理由见下方「12 页导成 16 页」
python3 scripts/pptx_from_rendered.py deck-pptx-source.html -o deck.pptx --selector .stage

# 4) 概览墙缩略图
node scripts/gen_deck_thumbs.mjs --slides slides --out thumbs
```

依赖：`npm i playwright pdf-lib sharp pptxgenjs` ＋ `pip install python-pptx Pillow`

> ⚠️ **脚本要放进 deck 项目目录再跑**。Node 的 ESM 从**脚本文件所在目录**往上找
> `node_modules`，不是从当前工作目录。所以直接在技能目录里执行会报
> `Cannot find package 'playwright'`。做法是把 `scripts/` 复制（或软链）进你的
> deck 项目——那里已经 `npm i` 过：
>
> ```bash
> cp -R <技能>/course-deck/scripts  ./deck-scripts
> cd <deck 项目> && npm i playwright pdf-lib sharp pptxgenjs
> node deck-scripts/verify_deck.mjs --slides slides
> ```
>
> `combine_deck.py` 只用标准库，可以原地直接跑。

---

## ✅ 验收清单（必做，别跳）

**导出前**

- [ ] 用 **1600px 高**视口逐页渲染，程序检查 1080 以下有无残留内容（见下方「溢出被静默裁掉」）
- [ ] 每页 3 秒内能抓到重点——抓不到就是这页写坏了
- [ ] 正文里的 `<p>`/`<h*>` 没有背景、描边、阴影（卡片底放外层 div）

**导出后**

- [ ] PDF **页数 = slides 页数**，且**文字层可搜索**（用 NFKC 归一化后再判，见下方假象坑）
- [ ] PPTX **页数 = slides 页数**（不等就是选择器匹配多了，见下方坑表）
- [ ] PPTX **文本框数量 > 0**（不是整页截图贴进去的）；抽 3 页双击改字确认能编辑
- [ ] PPTX 里**没有文字被吞**——逐页比对 HTML 与 PPTX 的文本内容
- [ ] 概览墙能打开、键盘翻页正常、单页双击能独立打开

```bash
node scripts/verify_deck.mjs --slides slides --height 1080   # 溢出，退出码 1 = 有裁切
python3 scripts/verify_render.py <产物>
```

---

## 计高预算：先算再画，别画完再挤

内容区高度 = **1080 − 76（stage 上内边距）** = 1004px，这是硬天花板。写每一页前先粗算：

| 块 | 典型高度 | 备注 |
|---|---|---|
| `.mast` 刊头 | 72 | 固定 |
| `h1` 页标题 | 约 166 | margin 44+18 + 82px 字 |
| `.lede` 导语 | 约 74 | 带下边框 |
| `.rows li` 一行 | 约 40–102 | `.tight` 12px / `.dense` 18px / 默认 23px 内边距 |
| `.kpi .n` 大数字行 | **234** | 132px 数字，一页只能用一次 |
| `.stats` 数字条 | 约 80 | 信息量相同时**优先用它** |
| `.foot` 页脚 | 约 63 | `margin-top:auto`，会自动被挤到页外 |

**一条经验**：一页同时放「左右对照表 + 132px 大数字行 + 页脚」几乎必定溢出（实测 1463px，超出 383px）。三者只能取二，数字改用 `.stats`。

---

## ⚠️ 已知坑（都是实测踩过的）

| 现象 | 真因 | 对策 |
|---|---|---|
| **PPTX 里某段文字凭空消失**，HTML 里好的 | 渲染坐标脚本的内联白名单是 `['em','b','i','strong','span','small','br','sup','sub','a','code','mark']`。用 `<s>` 当小标签（如把旧价划掉）→ 该元素被判为「非纯内联」→ 它**前面**的文字被丢 | 只用白名单内的标签。小标签用 `<span class="sl">` |
| **内容超出页面被裁，渲染不报错** | `.stage` 固定高 + `overflow:hidden`，超出的部分被静默裁掉；静态截图看不出 | 用 **1600px 高**视口渲染，程序检查所有元素 `getBoundingClientRect().bottom > 1080`。见 `scripts/verify_deck.mjs` |
| **12 页导出成 16 页，多出来的是页面里的零碎元素** | `pptx_from_rendered.py` 默认选择器是 `".slide, .s, section"`。**`.s` 这个类名太常见**——本站数字条 `.stats .s` 的每个 `<span>` 都被当成独立页；给页单位套 `<section class="page">` 会再叠一层 | 页单位只标在 `.stage` 上，导出**必须** `--selector .stage`。`combine_deck.py` 已按此生成 |
| **PDF 文字看着提取失败** | Chromium 会把部分汉字映射成**康熙部首码位**（`⼤` U+2F24 vs `大` U+5927），直接比对会误判 | 判定前做 **NFKC 归一化** |
| **PPTX 是图片，改不了字** | 走了截图贴图的路，或 HTML 不满足硬约束却用了 `export_pptx.mjs` | 课程课件走 `pptx_from_rendered.py`；导出后必须查文本框数量 |
| **概览墙首开卡顿** | 12 个 `<iframe>` 同时加载 12 页完整内容 | 用 `thumbs/` 缩略图做画廊，点进去才加载真页 |
| **中文显示成方框或随机字形** | 没显式声明字体，Chromium 渲染时降级 | 显式 `@font-face{src:local("PingFang SC")}` |
| **换视觉方向要改十几处** | 样式散落在各页 | 所有颜色/字体/间距收进 `deck.css` 的 `:root` 变量，每页只放结构类 |

---

## 和上游技能的关系

`course-deck` 是**自包含**的：`scripts/` 里那套 deck 工具链来自 huashu-design（MIT，见 `LICENSE-huashu-design`），已随本技能带入，不依赖外部 submodule。

上游 huashu-design 是**通用设计层**（能做原型、动画、视频、评审），本技能是它的**课程课件特化**——固定了「多文件 deck + PDF/PPTX」这条路径，并加了课程场景的验收清单与素材决策。

需要动画、讲解视频、品牌评审时再去看 huashu-design 的完整能力，不要在这里重造。

---

## 已知局限

1. **PDF 不可再编辑文字**——视觉 1:1 保真，代价是改字要回 HTML。要可编辑文字走 PPTX。
2. **PPTX 会丢 CSS 动画与渐变细节**——渲染坐标路径只翻译静态终态。有动画的页建议只出 PDF。
3. **`pptx_from_rendered.py` 把 SVG 截成 PNG**——图表拆成几百个矩形反而没法编辑，留图更实用；但如果你需要改图里的数字，得回 HTML。
4. **三方向门在时间紧时会显得慢**——但它拦住的返工远多于它花的时间。指定了品牌风格也要走，因为「按品牌色做」和「按品牌气质做」出来的东西差别很大。
