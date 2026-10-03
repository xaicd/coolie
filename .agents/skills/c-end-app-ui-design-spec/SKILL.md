---
name: c-end-app-ui-design-spec
description: 移动端 C 端 App (Flutter WebView / H5) 界面设计、流式贴顶、政府蓝色彩体系、反冗余大卡片、防底栏遮挡与安全区单一归属强制规范。在涉及 C 端 UI 页面设计、重构、样式审查或新增移动端功能时必须执行。
---

# 移动端 C 端 App 界面设计与规范约束 (代号: WLVN-C-END-UI-SPEC-V1)

**生效日期**: 2026-09-25 | **执行范围**: `src/app/(c-end)/**`、`src/modules/*/frontend/components/public/*`、移动端商户与 C 端通用组件

---

## 一、核心设计铁律（红线门禁，违者 PR 必拒）

### 1. 流式贴顶与状态栏一体化（Flow-Sticky Header）
- **核心理念**: 移动端用户进入页面第一视觉必须是干净、连贯、直达状态栏顶部的品牌导航栏。
- **强制使用**: 所有 C 端二级页面、频道页与功能页必须使用统一的 `PublicPageHeader` 组件（或全屏多媒体定制透明贴顶栏）：
  ```tsx
  import { PublicPageHeader } from "@/modules/shared/frontend/public/components/public/PageHeader"
  import { PageContainer } from "@/modules/shared/frontend/public/ui-system/PageContainer"

  <PageContainer maxWidth="md" withBottomNav className="min-h-screen bg-slate-50/70 pb-28">
    <PublicPageHeader title="乡村住宿" fallbackHref="/explore" actions={...} />
    <div className="px-3.5 pt-2">
      {/* 页面正文内容 */}
    </div>
  </PageContainer>
  ```
- **贴顶防断裂规则**: 当 `<PublicPageHeader>` 位于 `<PageContainer>` 内时，`<PageContainer>` **绝对禁止**在自身设置横向外内边距（如 `px-3.5`、`px-4`、`px-5`），否则会强行挤压流式顶栏导致左右留白断裂！横向间距必须包裹在 Header 下方的子级 `<div className="px-3.5 ...">` 容器内。

### 2. 严禁重复描述与占屏大卡片（No Redundant Giant Hero）
- **痛点根因**: 过去页面频繁出现“顶部已显示页面标题，下方又堆砌一个 200px 高度的暗黑色渐变大卡片，上面重复放相同的 `<h1>` 标题与假大空宣传文案”，严重浪费移动端首屏宝贵空间。
- **强制约束**:
  1. 页面已具备 `PublicPageHeader` 时，**严禁**紧接着塞入 >100px 的冗余巨型 Hero 容器。
  2. 如需展示特色/心智微提示，统一使用 **≤70px 的极简品质微条**：
     ```tsx
     <div className="px-4 pt-3.5 pb-1">
       <div className="rounded-2xl bg-gradient-to-r from-blue-950 via-blue-900 to-blue-950 p-3.5 text-white shadow-sm relative overflow-hidden">
         <div className="flex items-center justify-between">
           <div className="flex items-center gap-3">
             <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-sky-300">
               <BedDouble className="h-5 w-5" />
             </div>
             <div>
               <p className="text-xs font-black tracking-wide text-white">齐鲁山水 · 归园美宿</p>
               <p className="text-[11px] text-blue-200/80 mt-0.5">房态真实可订 · 智能无感开锁</p>
             </div>
           </div>
         </div>
       </div>
     </div>
     ```
  3. 首屏应第一时间展示：**搜索栏 + 核心分类/主题 Filter Pills + 真实列表第一屏**。

### 3. 色彩体系与政府蓝调和（Government Blue & Unified Palette）
- **官方基准色**: 乡村振兴综合服务平台采用“齐鲁政务蓝”为主基调：
  - 顶栏与核心卡片背景：`from-blue-950 via-blue-900 to-blue-950`
  - 主品牌动作按钮与激活态：`bg-primary-600 hover:bg-primary-700`、`text-primary-600`、`ring-primary-500/20`
- **严禁乱拼色**: 杜绝顶部蓝、底栏绿、中间卡片紫红的花哨拼装视觉。
- **语义色隔离**: 绿色 (`emerald`/`teal`) 仅允许用于认证绿标、生态农场徽章；黄色/金色 (`amber`) 仅用于品质星级与积分；警示色统一走 Design System 标准 Token。

### 4. 底部安全避让距离（Bottom Nav Safe Padding）
- **物理遮挡防线**: 移动端底层常驻 Flutter 原生 5-Tab 导航底栏（高约 56px + 底部安全区）。
- **强制门禁**: 所有带有 `withBottomNav` 的页面容器必须配置 `pb-24` 或 `pb-28`（如 `className="... pb-28"`），严禁因缺乏底部 padding 导致最后一项卡片或“立即购买/预订”按钮被底栏截断遮挡。

### 5. 顶底安全区单一归属（WLVN-SAFE-AREA-SINGLE-RESPONSIBILITY）
- **外壳责任**: 外层 `PublicLayoutClient` `<main>` 保持 `pt-0`。
- **页面责任**: 页面 Header 统一让出 `safe-top`，`PageContainer` 严禁重复开启 `withSafeAreaTop`。
- **原生壳责任**: Flutter 原生壳 `web_shell_page.dart` 严禁通过 JS 注入 `padding-top: 0 !important` 暴力修改 DOM。

---

## 二、标准化组件样板

### 1. 标准搜索与排序行
```tsx
<div className="mt-3.5 rounded-2xl border border-slate-200/80 bg-white/95 p-2.5 shadow-xs backdrop-blur-md">
  <div className="flex items-center gap-2">
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="搜索好物、农场、房型..."
        className="w-full h-9 rounded-xl bg-slate-100/90 pl-9 pr-8 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 border border-transparent focus:border-primary-400 transition-all"
      />
    </div>
  </div>
</div>
```

### 2. 标准横向滚动胶囊分类（Pill Tabs）
```tsx
<div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
  {categories.map((cat) => (
    <button
      key={cat.id}
      onClick={() => setActiveCategory(cat.id)}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
        activeCategory === cat.id
          ? "bg-primary-600 text-white shadow-xs"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200/80"
      }`}
    >
      {cat.label}
    </button>
  ))}
</div>
```

---

## 三、自动化检测与门禁命令

| 校验命令 | 涵盖范围 | 守护重点 |
|---|---|---|
| `npm run check:c-end-ui-spec` | `src/app/(c-end)/**` | 流式贴顶、反冗余大 Hero、PageContainer 贴顶不加 px、底部 pb-24/28 避让 |
| `npm run check:c-end-safe-area` | 壳层与页面安全区 | 杜绝 double safe-top 与 Flutter 暴力覆写 |
| `npm run check:no-fake-data` | 页面数据层 | 杜绝 mock/fake 假数据进入生产 |
