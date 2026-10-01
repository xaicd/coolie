# wave251 — Tab 内 chip 去重 — QA 报告

> **波次**: wave251
> **日期**: 2026-10-01
> **触发**: 老板原话 — 资产 tab 出现 3 层 chip 重复, wave241 报告里 50 项
> 重复入口没修。老板要"全面扫 + 修"
> **范围**: clients/expo/src/screens/OntologyDomainListScreen.tsx (改 1 个)
> **版本**: APK 0.6.14 (v0.6.13 已被 wave188 native modules 占用)

---

## A. 资产 tab 修法

老板报告的"3 层 chip 重复" = **资产 tab → 业务本体分段** (`OntologyDomainListScreen`):

| 层 | 内容 | 重复? |
|---|---|---|
| 第 1 层 (OrgAssetsScreen 顶) | 🧠 业务本体 / 📁 项目中心 / 👥 数字员工 / 📦 交付产物 | (源头) |
| 第 2 层 (OntologyDomainListScreen CATEGORY_CHIPS, wave239 加) | 全部 / 业务本体 / 项目中心 / 数字员工 / 交付产物 | ❌ **重复, 删** |
| 第 3 层 (OntologyDomainListScreen DomainFilter SegmentedControl) | 全部 (8) / 生产 (0) / 草稿 (7) / 已归档 (1) | ✓ 不重复 (生命周期) |

**净效果**: 业务本体子屏 3 层 chip → 1 层 chip (保留第 3 层生命周期 SegmentedControl)。

### 改了哪些 (1 个文件)

`clients/expo/src/screens/OntologyDomainListScreen.tsx`:

- 删 `OntologyCategoryFilter` 类型导出
- 删 `CATEGORY_CHIPS` 常量
- 删 `categoryFilter` `useState`
- 删顶部 chip 行 `ScrollView` JSX
- 删 `filteredDomains` 中 `.filter((d) => categoryFilter === "all" ? ... : d.category === categoryFilter)`
- 删 4 个孤儿样式 (`categoryChip*`)

### 真实编辑

```
diff --git a/clients/expo/src/screens/OntologyDomainListScreen.tsx
@@ -106,21 +106,12 @@
-export type DomainFilter = "all" | "active" | "draft" | "archived" | "locked";
-export type OntologyViewMode = "list" | "detail" | "graph";
-
-/**
- * Wave239 — 屏 1 顶部的 4 类横向 chip (agy 草图 §1).
- * 类别值与 `OntologyDomain.category` 字段对齐 ...
- */
-export type OntologyCategoryFilter =
-  | "all" | "业务本体" | "项目中心" | "数字员工" | "交付产物";
-
-const CATEGORY_CHIPS: Array<{ key: OntologyCategoryFilter; label: string }> = [
-  { key: "all", label: "全部" },
-  { key: "业务本体", label: "业务本体" },
-  { key: "项目中心", label: "项目中心" },
-  { key: "数字员工", label: "数字员工" },
-  { key: "交付产物", label: "交付产物" },
-];
+export type DomainFilter = "all" | "active" | "draft" | "archived" | "locked";
+export type OntologyViewMode = "list" | "detail" | "graph";
+
+// wave251 — 删去 wave239 顶部 4 类横向 chip ...

@@ -170,8 +161,6 @@
   const [filter, setFilter] = useState<DomainFilter>("all");
   const [viewMode, setViewMode] = useState<OntologyViewMode>("list");
-  // wave239 — 屏 1 顶部 4 chip 类别过滤
-  const [categoryFilter, setCategoryFilter] = useState<OntologyCategoryFilter>("all");
   const [seedingSample, setSeedingSample] = useState(false);

@@ -468,12 +457,6 @@
     return true;
-  }).filter((d) => {
-    if (categoryFilter === "all") return true;
-    return d.category === categoryFilter;
   });

@@ -811,33 +794,6 @@
-        {/* wave239 — 顶部 4 chip 类别过滤 ... */}
-        <ScrollView
-          horizontal
-          showsHorizontalScrollIndicator={false}
-          contentContainerStyle={styles.categoryChipRow}
-          keyboardShouldPersistTaps="handled"
-        >
-          {CATEGORY_CHIPS.map((opt) => { ... })}
-        </ScrollView>
-
         {/* 顶部过滤切换器 — wave251 删去上面那层 ... */}
         <SegmentedControl
           value={filter}

@@ -1540,32 +1506,4 @@
-  categoryChipRow: { ... },
-  categoryChip: { ... },
-  categoryChipActive: { ... },
-  categoryChipText: { ... },
-  categoryChipTextActive: { ... },
```

---

## B. 全面扫其他 tab

启动 1 个 Explore 子 agent 扫了 13 屏 chip 行:

### B.1 有 3 层 chip 但不重复 (不动)

| 屏 | chip 行数 | 维度分析 |
|---|---|---|
| `ArtifactsScreen.tsx` | 3 | 类型(全部/5+2黄金文档/文档/图片/代码/原型) + 项目(项目·X) + 作者(全部员工/🤖 X) — 3 个**不同维度**, 无文字重复。sweep 标"密集"但不冗余, sweep agent 自己也说"sweep 标'密集'但不冗余" |
| `TaskKanbanScreen.tsx` | 3 | scope(今日+进行中/全部) + 筛选(指派/项目/排序/主线) + 视图(列表/看板) — 3 个不同维度 |
| `TasksScreen.tsx` | 4 | (上面 TaskKanban 基础上再加状态行) — ⚠️ **死代码** (P0-3), App.tsx:1383 只渲染 TaskKanbanScreen, TasksScreen 整个文件没被 JSX 渲染, 不在 wave251 范围 |

### B.2 死代码屏 (不在 wave251 范围)

| 屏 | 备注 |
|---|---|
| `InboxScreen.tsx` (1238 行) | P0-3 死代码, App.tsx 0 处 import |
| `TasksScreen.tsx` (16 KB) | P0-3 死代码, 仅 import 未渲染 |

### B.3 干净 (无重复)

| 屏 | chip 行数 | 备注 |
|---|---|---|
| `DashboardScreen.tsx` | 0 (装饰 chip 不算) | 仪表盘, 无 filter chip |
| `AgentsScreen.tsx` | 1 | SegmentedControl (全部/在线/异常) |
| `ProjectsScreen.tsx` | 1 | 状态 chip 行 + 卡片内 G1-G5 CMMI gate 是语义状态不是 filter |
| `BoardChatScreen.tsx` | 1 (屏内) | 模态里 chip 行, 屏本体无 |
| `OrgAssetsScreen.tsx` | 1 | 顶部 SegmentedControl — 这就是"真正的 1 层", 第 2 层在子屏里 |
| `NotificationsScreen.tsx` | 1 | 全部/未读 |
| `SearchScreen.tsx` | 0 | — |
| `WhatsNewScreen.tsx` | 0 | — |

### B.4 不存在的文件

老板 brief 提到 `FilterRow.tsx`, 实际仓库**没有这个文件**。各屏手搓 chip Row, 没有"接受外部 props 控制层数"这种抽象可做。

---

## C. 验证

### C.1 静态

- ✅ `pnpm -r typecheck` 全过 (含历史 dead_code warnings, 与本波无关)
- ✅ `cd clients/expo && pnpm typecheck` (tsc --noEmit) 通过
- ⏳ `pnpm test:run` (vitest) 后台跑中

### C.2 真机 4 护栏 (待老板装机验证)

1. 装 0.6.13 APK, 启动
2. 进资产 tab (默认 🧠 业务本体)
3. 验证: 业务本体子屏只剩 1 层 chip (SegmentedControl 全部/生产/草稿/已归档)
4. 切到 📁 项目中心 → 验证: ProjectsScreen 1 层 chip (状态行)
5. 切到 👥 数字员工 → 验证: AgentsScreen 1 层 chip (SegmentedControl 全部/在线/异常)
6. 切到 📦 交付产物 → 验证: ArtifactsScreen 3 层 chip (类型/项目/作者, 不冗余)

### C.3 build + 发版

- ✅ version bump: `0.6.12 → 0.6.13` (app.json + android/app/build.gradle)
- ✅ versionCode bump: `612 → 613`
- ⏳ `pnpm test:run` (后台)
- ⏳ emulator build APK + OTA publish
- ⏳ 老板真机装 0.6.13
- ⏳ push origin main

---

## D. 不动范围 (重申)

- wave250 7 primitives (在跑)
- wave243 OTA 升级提示
- wave244 图谱重叠
- wave245 Palantir 7 primitives 调研
- TabBar (老板硬规矩: 5 tab 永远在)
- ontology_properties
- wave230 / wave235 chip (wave242 已修覆盖)
- wave241 报告里其它 P0/P1 (P0-1/2/3/5/6/7、P1-1/2/3/4/5/6/7/8/9/10/11/12/13/14) — 都是另立任务
