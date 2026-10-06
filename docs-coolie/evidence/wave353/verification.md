# wave353 验证证据 (铁匠 forge-core-swe)

date: 2026-10-06
base: b667db791 (v0.6.48)

## 任务

接 OntologyGraphCanvas (wave347 恢复的 RN 原生图谱, 584 行组件) 进
OntologyDomainListScreen 顶部; 参考 15 天前 pattern 并保留其全部功能面。
单线 1 改 1 文件。

## 1. typecheck (clients/expo)

```
$ npx tsc --noEmit
TSC_EXIT=0   (0 errors)
```

## 2. 治理守卫

```
$ pnpm check:governance
GOV_EXIT=0   (全面管局审计全绿通过 — 含两字按钮契约: 图谱/列表/新建/注入/解锁)
```

完整输出见同目录 `governance.log`。

## 3. diff 规模 (vs HEAD b667db791)

```
1 file changed, 904 insertions(+), 85 deletions(-)
clients/expo/src/screens/OntologyDomainListScreen.tsx  (总 2007 行)
```

## 4. 图谱挂载点

- 顶部 `SegmentedControl` 列表/图谱 双档切换 (默认图谱);
- 图谱档 = `OntologyGraphCanvas` 组件直嵌 (不再嵌整个 OntologyGraphWorkbenchScreen,
  全屏工作台保留 App.tsx 独立路由不动);
- 取数: `getOntologyGraph(companyId, { view: "project_tree", depth: 2 })`
  (与工作台「项目主线」同源);
- 守护: >120 节点截断 + 悬空边过滤 + 截断提示 (Canvas 契约: 提示由父层负责);
- 点节点 → 高亮关联连线 + 底部节点信息卡 (类型/关联数/key)。

## 5. 15 天前功能面保留清单

| 功能 | 状态 |
| --- | --- |
| 业务域列表 (生命周期徽标 + 前5域快照计数预取) | ✅ 恢复 |
| 域卡片快速熔断 (EmergencyKillSwitch compact, 活跃域) | ✅ 恢复 |
| 域详情抽屉 (基础信息/快照摘要4指标/类型分布/高危闸门) | ✅ 恢复 |
| 域解锁恢复 (二次确认) | ✅ 恢复 |
| 示例域注入 (骨架 + 逐域补种实例, 空态「注入」按钮) | ✅ 恢复并接线 |
| 创建 modal (目录接入/手动定义) | ✅ 原样保留 |
| 实体分类 → 实例列表 → 实例详情抽屉 | ✅ 原样保留 |
| 实例搜索 | ✅ 原样保留 |
| 5 tab 底栏 / App.tsx / server / scripts / 7 工具池 | ✅ 未动 |

## 6. 并发事故与处置

开工后工作树被并发会话 (wenlv-next-ba, idle) 删除了
`components/OntologyGraphCanvas.tsx` 与 `screens/OntologyGraphWorkbenchScreen.tsx`
(未暂存)。因 wave353 依赖前者、HEAD App.tsx 依赖后者, 已 `git checkout HEAD --`
恢复两文件 (与 HEAD 零 diff, 不进本波提交), 并向该会话发送协调通报。
`components/OntologyGraphView.tsx` 确认零引用, 删除状态未动, 留对方处置。

## 7. 提交

仅 1 文件: `clients/expo/src/screens/OntologyDomainListScreen.tsx`。
