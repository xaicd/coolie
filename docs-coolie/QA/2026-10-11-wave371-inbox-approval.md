# wave371 测试工单 — 门神 cmd 核验「收件箱审批点击链路」

> **任务**: wave371 · 老板拍『cmd 干活』用 cmd 修 app 收件箱审批 (声称真 bug: 审批 tab 点卡片跳向不存在的 ApprovalDetailScreen)
> **执行员工**: 门神 (Guardian / `menshen-fdse`) · Palantir Delta 前线工程攻坚与全栈交付
> **调度中枢**: Hermes·Echo · `echo|Echo|业务战略|Hermes·Echo|local` · 宿主 local · 项目 Coolie 本地施工总社
> **底层引擎**: cmd · **工作仓库**: `/Users/mac/workspace/xaicd/coolie` · **分支**: `main` · **日期**: 2026-10-11
> **核验基线**: HEAD `9fd667881` (v0.6.54)

---

## 0. TL;DR (前线工程核验总评)

**结论: 简报所述 bug 在当前 HEAD 上已不存在, 无需修改代码。**

1. 简报声称「审批 tab 点卡片跳向不存在的 `ApprovalDetailScreen`, App.tsx 只 `setFocusedApprovalId` 但无对应渲染」——**该前提不成立**。
2. 真实链路: `InboxScreen` 审批 tab 点卡片 → `onOpenApproval(id)` → `setFocusedApprovalId(id)` → `App.tsx` L1028 **已渲染 `<ApprovalFocusDetail>`**, 其内部 L1430 完整复用 `<QuickApprovalCard>` (批准 / 驳回 + 驳回理由), 返回 / 左缘右滑闭环 (L847)。该路由由 `commit d1d350e1c` 补齐。
3. 全仓不存在任何 `ApprovalDetailScreen` 符号; 渲染目标是 `ApprovalFocusDetail`。简报引用的「对象名」本身就是错的。
4. `clients/expo` `pnpm exec tsc --noEmit` → **EXIT=0**, 基线干净。

**决议 (已向掌柜复核并获批): 不实施 B 方案。** 现有全屏 `ApprovalFocusDetail` 已完成裁决闭环; 若按 B 在审批 tab 再内嵌一份 `QuickApprovalCard`, 会造成同一审批出现**两条入口 / 两套 UI**, 违反老板总则 #1 (禁止重复功能入口) 与 #2 (零功能膨胀)。故本波次**不改代码、不提交**。

---

## 1. 简报前提逐条核验 (代码层实证)

| 简报断言 | 核验结果 | 证据 |
|---|---|---|
| `InboxScreen.tsx` L547-573 审批 tab 只渲染卡片, `onPress` 跳 `onOpenApproval` | ✅ 属实 | `InboxScreen.tsx` L556-574: `AppCard … onPress={() => onOpenApproval(item.id)}` + `›` chevron |
| 「App.tsx L1188 只 `setFocusedApprovalId`, 但没有对应渲染」 | ❌ **不成立** | `App.tsx` L1188 `onOpenApproval={(approvalId) => setFocusedApprovalId(approvalId)}` (BoardChat); **但** L1028 `focusedApprovalId ? <ApprovalFocusDetail …/>` 已渲染 |
| 「跳的 `ApprovalDetailScreen` 不存在」 | ❌ **对象名错误** | 全仓 grep `ApprovalDetailScreen` 无匹配; 真实渲染组件是 `ApprovalFocusDetail` (`App.tsx` L1371) |
| 结论: 点击后跳空 / 无反应 | ❌ **无法复现** | `focusedApprovalId` 分支 (L1028) 在三元链中先于 `notificationsOpen` (L1056) 与 `tab==="inbox"` (L1169) 求值, 点击必有落地屏 |

### 真实调用链 (HEAD 实证)

```
InboxScreen 审批 tab (L547-577)
  └─ AppCard onPress → onOpenApproval(item.id)
       ├─ App.tsx L1172-1174  (底部「收件箱」tab 内的 InboxScreen)
       ├─ App.tsx L1064-1066  (顶栏 🔔 → notificationsOpen 内的 InboxScreen)
       └─ App.tsx L1188       (工坊 chat 内)
            └─ setFocusedApprovalId(approvalId)
                 └─ App.tsx L1028  focusedApprovalId ? <ApprovalFocusDetail companyId approvalId onBack />
                      └─ App.tsx L1430  <QuickApprovalCard approval={approval} floating={false}
                                                  onResolved={handleResolved} onDismiss={handleDismiss} />
                      └─ App.tsx L1400  handleResolved → exportBoardEcho(批准/驳回) → onBack()
```

- `swipeBack` (L847) 与系统返回键 (L878) 均已覆盖 `focusedApprovalId` 出栈;
- `TabBar.onChange` (L1317) 切 tab 时一并 `setFocusedApprovalId(null)`, 无残留浮层。

---

## 2. 验证执行记录

| 步骤 | 动作 | 命令 / 位置 | 结果 |
|---|---|---|---|
| 1 | 读 `QuickApprovalCard` 完整 props | `clients/expo/src/components/QuickApprovalCard.tsx` L18-30 | props: `companyId` / `approval?` / `onResolved?` / `onDismiss?` / `style?` / `floating?` |
| 2 | 查 `setFocusedApprovalId` 用法 | grep `clients/expo` | L767 定义; L847 出栈; L942 hasSubHeader; **L1028 渲染**; L1065/1166/1173/1188 各方 `onOpenApproval`; L1317 切 tab 重置 |
| 3 | 查 `InboxScreen` 审批渲染 + prop | `InboxScreen.tsx` L547-577 / L130-142 | `onOpenApproval: (approvalId: string) => void`, 审批行 `AppCard onPress` 已接线 |
| 4 | 确认无重复/孤立组件 | grep `ApprovalDetailScreen` / `ApprovalFocusDetail` | 仅 `App.tsx` 一处 `ApprovalFocusDetail`; 无 `ApprovalDetailScreen` |
| 5 | 类型基线 | `cd clients/expo && pnpm exec tsc --noEmit` | **EXIT=0** (0 errors) |
| 6 | 溯源修复提交 | `git log -S "ApprovalFocusDetail" -- clients/expo/App.tsx` | 由 `d1d350e1c` (fix(expo): decouple screen navigation …) 引入 |

> 说明: 本波次为**只读核验 + 决议**, 未产生代码 diff; 故未做真机长跑 (无行为变更可验)。门神铁律「验证真实行为而非代码形状」——此处真实行为由可达的三元分支 + 已接线的 props 链 + 0 类型错误共同证明, 无需伪造真机通过截图。

---

## 3. 决议与依据 (Boss Commandments 对齐)

**决议: 不实施 B 方案, 维持现状。**

- **Boss 总则 #1 极简使用主义 / 禁止重复入口**: 已有全屏 `ApprovalFocusDetail` 承载 `QuickApprovalCard` 全能力裁决; 再内嵌一份 = 同一审批两条入口。
- **Boss 总则 #2 零功能膨胀**: 系统内生审批能力已 100% 打通 (点开→裁决→驳回理由→回写工坊流), 无需新增。
- **Boss 总则 #3 聚焦核心与质量**: 把工时投在真实缺陷上, 而非制造重复。

---

## 4. 顺带发现: 相邻真实缺陷 (wave370 已存证, 建议另派单)

> 来源: `docs-coolie/QA/2026-10-11-wave370-agy-visual-verify.md` (墨斗 agy 真机审计) —— 非本波次工作范围, 仅登记线索。

- **现象**: 顶栏 🔔 (`notificationsOpen`) 落地为 `<InboxScreen>` (`App.tsx` L1056), 而 `NotificationsScreen` 仅被 import、**从未被渲染** (孤立死代码)。
- **影响**: 铃铛「点开一个少一个」的未读递减 (`markRead`) 与 wave364/370 的已读/未读视觉强对比在真机永不生效。
- **建议**: 另开波次将 `notificationsOpen` 路由还原为 `NotificationsScreen`, 或按 wave370 §4 方案 B 合并通知流后删除死代码。

---

## 5. 遵守约束与执行边界

- **不调 sub-agent**: 100% 由直属员工【门神】独立完成。
- **不动 git / 不提交**: 未执行任何 commit / reset --hard / push; 本波次仅新增本核验报告。
- **无假证据**: 未伪造真机截图或通过结论; 结论均附可复现命令与行号。
- **单写者**: 仅本员工写入本报告文件, 未触碰无关脏文件。

---

## 6. 签字栏

| 角色 | 员工姓名 | 审查结论 / 签署时间 |
|---|---|---|
| **FDSE (前线工程攻坚 / 金标验证)** | 门神 (Guardian / `menshen-fdse`) | `[2026-10-11 · HEAD 9fd667881 · 核验: 审批点击链路已在 d1d350e1c 修复, 简报前提失效 · 决议: 不实施 B (避免重复入口) · tsc 0 errors · 无代码变更]` |
| **PM (业务战略中枢)** | Hermes·Echo (`Hermes·Echo·业务战略`) | `[wave371 调度核销]` |
