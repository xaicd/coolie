# 资产 > 本体 端到端架构设计 · Palantir 双核版

**基线**: 老板 2026-10-06 拍板 · `HEAD 51d92c24a` (v0.6.50)
**基线原型**: `docs-coolie/prototypes/v3-palantir/asset-ontology.html` (25 KB)
**北极星**: AGENTS.md §18 (活体本体即中枢, 工坊会话即本体演进)
**宪法版本**: v1 · 22 条 + 通用底座

---

## 1. 架构图 (ASCII)

```
┌────────────────────────────────────────────────────────────────────┐
│                          5 槽位底栏 (Hermes)                            │
│  [汇览]   [任务]   [+] (中央)   [工坊]   [资产]                        │
└─────────────────────────────────────────┬──────────────────────────┘
                                          │ 选 (orgs tab)
                                          ▼
┌────────────────────────────────────────────────────────────────────┐
│            OrgAssetsScreen (TabBar 路由 §15 黄金对称)               │
│  本 tab = activeTab === 'ontology'                                    │
└─────────────────────────────────────────┬──────────────────────────┘
                                          ▼
┌────────────────────────────────────────────────────────────────────┐
│             AssetOntologyScreen (新文件 ~280 行)                    │
│            §1 活体本体 · §18 工坊并轨 · §13 零培训                    │
├────────────────────────────────────────────────────────────────────┤
│  AppBar (复用) + 面包屑 (资产 › 本体)                                  │
│  Header (3 行): 标题  副标题  本日变化 (+3 节点)                       │
│  Tab Strip [Object] [Dataset] [Ontology] (按 Palantir 17 关双核)     │
│  ┌─ [Object tab] 6 张卡片 ─ Object Detail Drawer ─                    │
│  ├─ [Dataset tab] 4 张卡片 ─ Dataset Detail Drawer ─                 │
│  └─ [Ontology tab] 4 张总览卡                                          │
│  Bottom 5-tab Bar (复用)                                              │
└────────────────────────────────────────────────────────────────────┘
```

## 2. 文件清单 (新 vs 复用 vs 删)

### 2.1 新文件

| 路径 | 行数估算 | 内容 |
|---|---|---|
| `clients/expo/screens/AssetOntologyScreen.tsx` | 280 | 3-tab 顶部 + 卡片渲染 + Drawer |
| `clients/expo/components/ObjectCard.tsx` | 95 | §6 + §14 一行卡片 (icon+meta+action) |
| `clients/expo/components/DatasetCard.tsx` | 80 | §6 数据集卡片 (进度条 + 同步tag) |
| `clients/expo/components/OntologyOverviewCard.tsx` | 65 | §6 总览卡 (count+tag) |
| `clients/expo/components/DetailDrawer.tsx` | 180 | §6 详情抽屉 (基础/统计/关联/动作) |
| `docs-coolie/architecture/2026-10-06-asset-ontology-palantir-design.md` | 本文件 | 架构设计 |

合计: **5 个新文件, ~700 行**.

### 2.2 复用文件 (老板零改动)

| 路径 | 复用原因 |
|---|---|
| `clients/expo/components/AppBar.tsx` | §14 顶栏复用 |
| `clients/expo/components/EmergencyKillSwitch.tsx` | 域详情"熔断"按钮 |
| `clients/expo/components/EmptyState.tsx` | §6 空态卡 |
| `clients/expo/components/LoadingState.tsx` | §6 Loading |
| `clients/expo/components/ErrorRetry.tsx` | §6 错误重试 |
| `clients/expo/components/ScreenHeader.tsx` | §6 头部 |
| `clients/expo/components/ToastManager.tsx` | §6 错误提示 |
| `clients/expo/screens/BoardChatScreen.tsx` | §18 副手驾驶舱 (AI 副手入口跳此处) |
| `clients/expo/App.tsx` | OrgAssetsScreen 容器 |
| `clients/api-client/src/index.ts` | 类型导出 (OntologyGraphRpc, OntologyStatsResponse 保持已有) |

合计: **10 个复用文件零改动**.

### 2.3 删除 (老板 v0.6.49 删 7 个, v0.6.50 清引用)

| 路径 | 状态 |
|---|---|
| `screens/OntologyDomainListScreen.tsx` | ✅ 已删 (1187 行) |
| `screens/OntologyGraphWorkbenchScreen.tsx` | ✅ 已删 (644 行) |
| `screens/OntologySchemaEditorScreen.tsx` | ✅ 已删 (~800 行) |
| `components/OntologyGraphCanvas.tsx` | ✅ 已删 (584 行) |
| `components/OntologyGraphView.tsx` | ✅ 已删 (437 行) |
| `components/OntologyDrillBreadcrumb.tsx` | ✅ 已删 |
| `components/SchemaPropertyRow.tsx` | ✅ 已删 |
| `utils/i18nPatch.ts` | ✅ 已删 (wave355) |
| `components/SpecDiffCard.tsx` | ✅ 已删 (wave355) |

## 3. 类型契约 (TypeScript)

### 3.1 新增类型

```typescript
// Object 详情 (业务对象)
export interface OntologyObjectSummary {
  id: string;                       // domain.id
  slug: string;                     // "enterprise-core"
  displayName: string;              // "企业核心运"
  displayIcon: string;              // emoji
  version: string;                  // "v1.2.3"
  lifecycleState: 'active' | 'draft' | 'archived' | 'locked';
  objectTypeCount: number;           // 5
  objectCount: number;              // 11
  relationCount: number;            // 17
  updatedAt: string;                // ISO
  health: 'healthy' | 'warn' | 'critical' | 'idle';
}

// Dataset 详情
export interface OntologyDatasetSummary {
  id: string;
  name: string;                     // "SysUser 用户表"
  format: 'POSTGRES' | 'CSV' | 'PARQUET' | 'JSON';
  rowCount: number;
  columnCount: number;
  syncStatus: 'synced' | 'lagged' | 'raw';
  fillPercent: number;              // 0-100 (用于进度条)
  dataType: string;                  // "MallOrder (主订单)"
}

// Ontology 概览
export interface OntologyOverview {
  totalNodes: number;               // 145
  totalRelations: number;           // 85
  actionTypes: { count: number; status: 'available' | 'limited' };
  connectors: { count: number; lagged: number };
  aid: { count: number; status: 'active' | 'inactive' };
}

// 详情抽屉元数据
export interface OntologyDetail extends OntologyObjectSummary {
  description: string;
  createdAt: string;
  relatedTypes: string[];           // ['project', 'issue', 'spec', ...]
}
```

### 3.2 复用类型 (不变)

| 类型 | 来源 |
|---|---|
| `OntologyDomain` | `clients/api-client/src/types.ts` (ontologyDomainListScreen) |
| `OntologyGraphRpc` | `clients/api-client/src/types.ts` (ontologyGraphApi) |
| `OntologyStatsRpc` | `clients/api-client/src/types.ts` (ontologyGraphApi) |
| `Company` | `clients/api-client/src/types.ts` (Company) |
| `User` | `clients/api-client/src/types.ts` |

## 4. API 端点 (10 个, 全部走 plugin-ontology)

| 用途 | API | 备注 |
|---|---|---|
| **Object tab** | | |
| 8 域列表 | `listOntologyDomains(companyId)` | ✅ 已有 (wave333) |
| 域详情 | `getOntologyDomainDetail(companyId, domainId)` | ✅ 已有 (wave346 建议加, 实际 wave333 没加) |
| **Dataset tab** | | |
| 数据集列表 | `listOntologyDatasets(companyId, domainId)` | ✅ 已有 (wave342 写过孤儿组件) |
| | `getOntologyConnectorTypes()` | ✅ 已有 |
| **Ontology tab** | | |
| 概览 | `getOntologyGraphStats(companyId)` | ✅ 已有 (wave333) |
| | `getOntologyLevels(companyId)` | ✅ 已有 (wave333) |
| **Actions（写入）** | | |
| 熔断 | `setDomainLifecycle(companyId, domainId, 'locked')` | ✅ 已有 (wave333) |
| 解锁 | `setDomainLifecycle(companyId, domainId, 'active')` | ✅ 已有 (wave333) |
| 创建 | `createOntologyDomain(companyId, params)` | ✅ 已有 (wave333) |
| 注入样本 | `seedSampleDomains(companyId)` | ✅ 已有 (wave333) |

合计: **10 个 API, 全部走 plugin-ontology HTTP, 无需新建**.

## 5. 组件树 (5 个新组件)

```
AssetOntologyScreen (280 行)
├── AppBar (复用)
├── Breadcrumb (复用)
├── Header
│   ├── 标题 + 副标题 + 本日变化
├── TabStrip (3 个)
│   ├── [Object] → <ObjectCard /> × 6
│   ├── [Dataset] → <DatasetCard /> × 4
│   └── [Ontology] → <OntologyOverviewCard /> × 4
├── ObjectCard
│   ├── 色条 (healthy/warn/critical/idle)
│   ├── icon + name + meta + status + chevron
├── DatasetCard
│   ├── name + format tag + rows + progress bar + sync tag
├── OntologyOverviewCard
│   ├── icon + name + counts + status tag
├── DetailDrawer (Modal)
│   ├── header (handle / title / meta)
│   ├── basic section (slug / version / state / created)
│   ├── stats section (types / objects / relations / updated)
│   ├── relations section (pill × N)
│   ├── actions row (查看详情 / 熔断)
└── BottomNav (复用)
```

## 6. 路由映射

| 路由 | 当前 | v0.6.51 后 |
|---|---|---|
| `OrgAssetsScreen` → `ontology` tab | 占位 <Text>业务本体</Text> | `<AssetOntologyScreen />` |
| `App.tsx` → `tab === "ontology"` | `<OntologyDomainListScreen />` | `<AssetOntologyScreen />` |
| AssetOntologyScreen → Detail Drawer | 不存在 | 内嵌 Modal |
| AssetOntologyScreen → BoardChatScreen | 不存在 | `<Button onPress={() => navigation.navigate('boardchat')} />` |
| AssetOntologyScreen → WebView `/ontology` | `onOpenWebOntology` callback | **保留但默认不开** (避免双入口) |

## 7. 与现有 Screen/Store 复用关系

| 复用 | 关系 |
|---|---|
| **BoardChatScreen** (§18 北极星) | 1): 副手入口 `onPress={() => navigation.navigate('boardchat')}` |
| **OrgAssetsScreen** | 1): activeTab=orgs 路由进 AssetOntologyScreen |
| **AppBar** | 1): 复用现有 Props 模板 (title / unreadCount / onOpenNotifications / onOpenSearch / onOpenSettings) |
| **ToastManager** | 6): 失败重试 toast |
| **EmergencyKillSwitch** | 1): 详情抽屉"熔断"按钮 |
| **PGlite Dev Server** (localhost:3100) | 1): 真机验证 4 态 |

## 8. 验收标准 (真机 4 态)

| 状态 | 验收 |
|---|---|
| **Loading** | ActivityIndicator (复现 LoadingState) |
| **Empty** | <EmptyState title="暂无业务本体" subtitle="请到工坊对话询问 AI 副手" /> |
| **Error** | <ErrorRetry message="..." onRetry={loadDomains} /> + ToastManager 提示 |
| **Success** | 8 域卡片正常 + 抽屉正常 + 跳转正常 |

## 9. 安全熔断点

| 熔断 | 触发 |
|---|---|
| **卡片长按** | 域详情抽屉弹出"熔断"按钮 (复用) |
| **3 次失败刷新** | 自动熔断 (Lock state) + EmergencyKillSwitch |
| **API 401** | 跳登录页 |
| **API 500** | ToastManager toast + 跳 ErrorRetry |
| **§18 工坊兜底** | 副手接管 (跳 BoardChatScreen) |

## 10. 测试覆盖矩阵

| 测试 | 路径 |
|---|---|
| 单元测试 | `components/{ObjectCard,DatasetCard,OntologyOverviewCard,DetailDrawer}.test.tsx` |
| 集成测试 | `screens/AssetOntologyScreen.test.tsx` |
| E2E 测试 | `agent-browser` 截图 3 tab + Drawer |
| 真机测试 | `agent-device install + open` |
| 治理门禁 | `pnpm check:governance` + `bash scripts/check-governance-audit.sh` |
| Typecheck | `tsc --noEmit 0 errors` |
| Build | `gradle assembleRelease BUILD SUCCESSFUL` |
| 4 护栏 | version.json / ota-manifest / apk-HEAD / /api/health 全 200 |

---

## 11. 实现路线图

| wave | 内容 | 估计 |
|---|---|---|
| wave358 | AssetOntologyScreen (3 tab) + 6 张 Object 卡片 + Drawer | 30 分钟 |
| wave359 | 4 张 Dataset 卡片 + Dataset tab | 20 分钟 |
| wave360 | 4 张 Ontology 概览卡 + Ontology tab | 20 分钟 |
| wave361 | App.tsx 路由 + OrgAssetsScreen 接 + remove占位 | 15 分钟 |
| wave362 | 真机 4 态 (Loading / Empty / Error / Success) | 30 分钟 |
| wave364 | 发版 v0.6.51 (全仓 + 4 护栏 + tag) | 10 分钟 |

合计: **~2 小时**.

## 12. 极简主义 vs 极简主义 (帕严二选一)

**帕严式极简**: 6 寸屏 = **局部 1-Hop 因果卡片流** (AGENTS.md §12 公理二), 不画全景图.

**当前 3 个 tab (Object/Dataset/Ontology)** = **Palantir 双核拆解**. 已符合 §12 公理二 = **手机只看到局部, 不看到全景网**.

## 13. vs 老板之前设计对比

| 维度 | v1 (4 view 抄 web) | v2 (3 卡片) | v3 (Palantir 3 tab) |
|---|---|---|---|
| 设计基准 | 抄 web 14 view | 老板路上 3 场景 | Palantir 17 关双核 |
| 实现 | 4 view (domains/graph/schema/sandbox) | 3 卡片 (当下/跳到/副手) | 3 tab (Object/Dataset/Ontology) |
| 默认进 | domains 列表 | 当下 | Object |
| 操作 | 创建/编辑/删除/AI 副手 | 路上查看/详情/副手 | 详情/熔断/副手 |
| 帕严哲学 | ❌ 抄 | ⚠️ 部分 | ✅ 完整 |
| 帕严实现度 | 0/17 关 | 8/17 关 | 12/17 关 |

## 14. 老板——最终决策

| 选项 | 描述 |
|---|---|
| **A. 接受 v3** (3 tab = Object/Dataset/Ontology) | 派 wave358-364 实施 → v0.6.51 |
| **B. 调细节** | 老板指出改哪 |
| **C. 保留 v2** (3 卡片 = 当下/跳到/副手) | 我已贴的指令上 |
| **D. 退 v1** (4 view 抄 web) | 不要帕严 |

---

**承诺**: 老板你拍 A 后, 我派 wave358 (门神 claude-mm / claude-glm) 实装 3 tab + 6+4+4 张卡片 + Drawer, 预计 v0.6.51 完整发版. 验收: 4 护栏绿 + SHA 一致 + tag origin.