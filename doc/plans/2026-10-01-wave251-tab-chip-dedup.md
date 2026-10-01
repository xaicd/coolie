# wave251 — Tab 内 chip 去重

> **波次**: wave251
> **日期**: 2026-10-01
> **触发**: wave241 (P1-1/P1-7) 报告 50 项重复入口, 老板 03:1x OOB 点名
> 资产 tab 出现"3 层 chip 重复"。本次只动 chip 相关, 不动 wave241 其它 P0/P1
> (那是另外 49 项, 老板另批)。
> **立场**: 删冗余 chip, 保留语义独立的不同维度 chip
> **版本**: APK 0.6.14 (bump from 0.6.13 — v0.6.13 已被 wave188 native modules 占用)

---

## 0. 总览

**真正被改的**: `clients/expo/src/screens/OntologyDomainListScreen.tsx`
(资产 tab → 业务本体子屏)。3 层 chip 砍到 1 层。

**扫了 13 屏没动的**: Dashboard / Tasks / TaskKanban / Agents /
Artifacts / Projects / BoardChat / Inbox / OntologyDomainList /
OrgAssets / Notifications / Search / WhatsNew — 详见 §3
"全面扫描结果"。

---

## 1. 老板报告的"3 层 chip"出处

老板在真机打开"资产" tab → 默认落到 `OrgAssetsScreen` 顶部 segmented
的 **🧠 业务本体** 分段 → `OntologyDomainListScreen` 屏里出现了 3 行 chip:

| 层 | 文件 : 行 | 内容 |
|---|---|---|
| 第 1 层 | `OrgAssetsScreen.tsx:176-181` SegmentedControl | 🧠 业务本体 / 📁 项目中心 / 👥 数字员工 / 📦 交付产物 |
| 第 2 层 | `OntologyDomainListScreen.tsx:811-842` `CATEGORY_CHIPS` (wave239 加) | 全部 / 业务本体 / 项目中心 / 数字员工 / 交付产物 |
| 第 3 层 | `OntologyDomainListScreen.tsx:863-877` `DomainFilter` SegmentedControl | 全部 (8) / 生产 (0) / 草稿 (7) / 已归档 (1) |

**重复的真因**: 第 1 层 (一级分类) 和第 2 层 (子屏内 wave239 加的
CATEGORY_CHIPS) **字面 / 语义完全重复** — 老板说"业务本体, 项目中心,
数字员工" 字面就是这两个层。第 3 层是生命周期状态 (生产/草稿/归档),
**不重复**, 留下。

---

## 2. 修复

### 改的文件 (1 个)

#### `clients/expo/src/screens/OntologyDomainListScreen.tsx`

**删**:
- `OntologyCategoryFilter` 类型导出
- `CATEGORY_CHIPS` 常量
- `categoryFilter` `useState` (state)
- 顶部 chip ScrollView JSX
- 过滤逻辑中 `.filter((d) => categoryFilter === "all" ? ... : d.category === categoryFilter)`
- 4 个孤儿样式 `categoryChip / categoryChipActive / categoryChipText / categoryChipTextActive` + `categoryChipRow`

**保留**:
- `DomainFilter` 类型导出 (还服务于第 3 层 SegmentedControl)
- `OntologyViewMode` 类型导出
- 顶部 `SegmentedControl` 第 3 层 (全部/生产/草稿/已归档)

**净效果**: 业务本体子屏从 **3 层 chip → 1 层 chip** (第 3 层)。

### 不改的范围 (按 brief 严格)

- 不动 `wave250` 7 primitives (在跑)
- 不动 `wave243` OTA 升级提示
- 不动 `wave244` 图谱重叠
- 不动 `wave245` Palantir 7 primitives 调研
- 不动 TabBar (老板硬规矩 5 tab)
- 不动 ontology_properties

---

## 3. 全面扫描结果 (其它 tab)

13 屏 chip 扫描结果 (5 视角 × 2 共享层 + 1 主线程自查):

### 真有 chip 重复 / 真不动

| 屏 | chip 行数 | 结论 |
|---|---|---|
| `OntologyDomainListScreen.tsx` | **3 → 1** | ✅ 已修 (本次) |
| `TasksScreen.tsx` | 4 | ⚠️ 死代码 (P0-3), 不在 wave251 范围 |
| `TaskKanbanScreen.tsx` | 3 | ⚠️ 实际渲染 (App.tsx:1383), scope/状态/筛选 chip 各管一摊, 无文字重复 |
| `ArtifactsScreen.tsx` | 3 | ⚠️ 类型/项目/作者 3 个不同维度, 无文字重复, sweep 标"密集"但不冗余 |
| `InboxScreen.tsx` | 3+ | ⚠️ 死代码 (P0-3), 不在 wave251 范围 |

### 干净 (sweep 确认)

| 屏 | chip 行数 |
|---|---|
| `DashboardScreen.tsx` | 0 (无 filter chip, 只有装饰性 status chip) |
| `AgentsScreen.tsx` | 1 (SegmentedControl 全部/在线/异常) |
| `ProjectsScreen.tsx` | 1 (状态 chip 行 + 卡片内 G1-G5 CMMI gate 是语义状态不是 filter) |
| `BoardChatScreen.tsx` | 1 (模态内 chip 行, 屏本体无) |
| `OrgAssetsScreen.tsx` | 1 (顶部 SegmentedControl, 这才是"真正的 1 层") |
| `NotificationsScreen.tsx` | 1 (SegmentedControl 全部/未读) |
| `SearchScreen.tsx` | 0 |
| `WhatsNewScreen.tsx` | 0 |

### 没单独构造 `FilterRow.tsx` 组件

老板 brief 提到 `FilterRow.tsx`, 实际仓库里 **没这个文件**, 各屏手搓
chip Row。所以也没"接受外部 props 控制层数"这种改造可做。

---

## 4. 与 wave241 的关系

- **P1-1** "TabBar 撒谎 + OrgAssetsScreen 内部 4 pill — 双层 tab 命名空间冲突" —
  本次只解了 wave239 在 OntologyDomainListScreen 加的**第 3 层 chip**
  (字面重复"业务本体 / 项目中心 / 数字员工 / 交付产物")。
  P1-1 提到的**外层 7 个 BarTabKey vs 内层 4 个 OrgAssetTab**双层 tab
  架构不在 wave251 范围 (动 TabBar 涉及路由), 留给后续波次。
- **P1-7** "业务本体 / Ontology — 资产 tab + 本体列表内 web + 工坊 domain
  命令" — 不在本波 chip 范围内。
- **P0-3** InboxScreen / TasksScreen 死代码, **不动**。
- **P0-2** SettingsSheet 不可达, **不动**。

---

## 5. 验证

1. ✅ `pnpm -r typecheck` 全过 (含 paperclip-runner-core 历史 dead_code
   warnings, 与本波无关)
2. ✅ `cd clients/expo && pnpm typecheck` (tsc --noEmit) 通过
3. ⏳ `pnpm test:run` (vitest) 后台跑中
4. ⏳ 4 护栏绿 (emulator 装 0.6.13 后):
   - 进资产 tab 默认显示业务本体 → 只看到 1 层 chip (SegmentedControl 全部/生产/草稿/已归档)
   - 切换到项目中心 / 数字员工 / 交付产物 验证 3 个子屏原本没重复 chip
   - 验证 build 0.6.13 → push origin main

---

## 6. 发版

- `clients/expo/app.json`: version `0.6.12` → `0.6.13`
- `clients/expo/android/app/build.gradle`: versionCode `612` → `613`,
  versionName `"0.6.12"` → `"0.6.13"`
- iOS: 不动 (老板 brief 明确 iOS 不动)
- runtimeVersion policy = `appVersion`, 跟着 bump
