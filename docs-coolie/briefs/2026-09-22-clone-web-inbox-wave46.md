# Brief: wave 46 — 1:1 抄 Coolie Web Inbox 到 Coolie工坊 App 端 (收件箱重写)

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 24:13 OOB 「收件箱, 功能不正常, 得把 web 版抄过来」

老板明确指令: **App 的收件箱功能不正常, 直接把 Coolie Web 的 Inbox 抄过来.**
不重设计, 不抽象 — 对齐 Web 的 tab / 过滤 / 行字段 / 阻塞视图 / 归档动作。

## 1. 已知现状 (PM 09-22 真查)

```
✅ Coolie Web 上游 Inbox 完整文件 (3325 行):
   ui/src/pages/Inbox.tsx  (服务器: /opt/coolie/ui/src/pages/Inbox.tsx)
   - Tab: mine / recent / unread / blocked / all (PageTabBar + Tabs)
   - 工具条: 搜索 + IssueFiltersPopover (status/priority/assignee/creator/label/
     project/workspace/liveOnly) + Group popover + IssueColumnPicker + Sort popover
   - 行: IssueRow (状态圆圈 + 标题 + 描述 + 状态徽章 + assignee + priority + 时间)
     + SwipeToArchive (quick archive) + InboxArchiveButton
   - 阻塞视图: BlockedInboxView (ui/src/components) —— 分组 (Blocker type/None)
     + 排序 (Most urgent / Most recent / Longest stopped) + blocked reason
   - 归档: 真后端端点 POST/DELETE /api/issues/:id/inbox-archive
     (server/src/routes/issues.ts:11374) + list 支持 inboxArchivedByUserId 过滤
   - 阻塞注意力字段: issue.blockedInboxAttention
     (server list 路由已返回: server/src/routes/issues.ts:3022)
   - 阻塞分组/排序纯函数: ui/src/lib/blockedInbox.ts (BLOCKED_GROUP_OPTIONS /
     BLOCKED_SORT_OPTIONS / buildBlockedInboxRows / groupBlockedInboxRows)
   - 过滤状态: ui/src/lib/issue-filters.ts (IssueFilterState / applyIssueFilters)

❌ App 端现状 (clients/expo/src/screens/InboxScreen.tsx, 341 行):
   - 只有 3 段聚合 (待审批 / 受阻 / @我), 来自 coolie.getInbox() 的 3 桶
   - SegmentedControl 4 档 (全部/待审批/受阻/@我) —— 不是 Web 的 tab 语义
   - **无** 状态圈行 (只用 8px 色点) / 无描述 / 无 assignee / 无 priority 徽章
   - **无** 过滤 (status/priority/assignee/project/date range)
   - **无** 阻塞分组 + 排序 + blocked reason
   - **无** 归档 (quick archive) —— Web 的 POST /issues/:id/inbox-archive 没接
   - 无快捷动作 (打开/归档/派活/跳工坊)

❌ h5 端 (clients/h5): 完全没有 Inbox 屏 (无 InboxScreen.tsx, App.tsx nav 无收件箱项)
```

## 2. 目标

**Coolie工坊 App 0.5.25** 收件箱 = Coolie Web Inbox 的 RN 适配版:
4 个 tab + 过滤 + 富信息行 + 阻塞分组视图 + 归档, 与 Web 同一套语义和字段。

**不做** 抽象重设计; **不** 逐字拷 React-DOM JSX (RN 跑不了);
用 RN 组件 (`Pressable`/`View`/`Text`/`Modal`) 重写同样的信息架构。

## 3. 任务 (8 步)

### 3.1 读 Web Inbox 全文, 提取 5 件事

`ui/src/pages/Inbox.tsx` (服务器 `/opt/coolie/ui/src/pages/Inbox.tsx`), 只读, 提取:
1. **Tab 语义** — all / mine / approvals / blocked
2. **过滤字段** — status / priority / assignee / project / date range
3. **行字段** — 状态圈 + 标题 + 描述 + 状态徽章 + assignee + priority + 时间
4. **归档** — SwipeToArchive → `POST /issues/:id/inbox-archive`
5. **阻塞视图** — 分组 (blocker type) + 排序 (urgency/recent/longest) + reason 文案

### 3.2 给 `clients/api-client` 补 3 个方法 (Web 端点已有, client 没接)

`clients/api-client/src/client.ts`:

```ts
/** POST /api/issues/:id/inbox-archive — 收件箱快捷归档 (Web InboxArchiveButton 同一端点) */
async archiveIssueFromInbox(issueId: string): Promise<{ id: string; archivedAt: string }> {
  return this.request("POST", `/api/issues/${encodeURIComponent(issueId)}/inbox-archive`, {});
}

/** DELETE /api/issues/:id/inbox-archive — 撤销归档 */
async unarchiveIssueFromInbox(issueId: string): Promise<{ id: string; archivedAt: string } | { ok: true }> {
  return this.request("DELETE", `/api/issues/${encodeURIComponent(issueId)}/inbox-archive`);
}

/** PATCH /api/issues/:id — 派活 (设/清 assignee), updateIssueSchema 接受 assigneeAgentId */
async setIssueAssignee(issueId: string, assigneeAgentId: string | null): Promise<unknown> {
  return this.request("PATCH", `/api/issues/${encodeURIComponent(issueId)}`, { assigneeAgentId });
}
```

`listIssues` 补 `inboxArchivedByUserId` 过滤 (排除已归档行, 与 Web 一致):

```ts
async listIssues(companyId, opts?: { status?: string; limit?: number; inboxArchivedByUserId?: string })
```

### 3.3 重写 `clients/expo/src/screens/InboxScreen.tsx`

保持既有 props 契约 (`company / onOpenSettings / onOpenIssue / onOpenApproval`),
**新增** `onOpenWorkshop?: () => void` (跳 ChatHome)。

**4 tab chip (全部 / @我 / 审批 / 阻塞)** — 用 `SegmentedControl`:
- 全部: `coolie.listIssues(companyId, { limit: 200 })` 全状态, 排除已归档
- @我: `coolie.getInbox().mentionedBy` (被 @ 的评论 → 跳对应任务)
- 审批: `coolie.getInbox().pendingApprovals` + `coolie.listApprovals(companyId)`
- 阻塞: `listIssues` 里 `blockedInboxAttention != null` 的任务

**过滤条 (filter popover → RN `Modal` sheet)**: 状态 / 优先级 / 负责人 / 项目 / 时间范围
- 多选 chips (状态用 ISSUE_STATUSES, 优先级用 ISSUE_PRIORITIES, 负责人用 agents, 项目用 listProjects)
- 时间范围: 全部 / 今天 / 近 7 天 / 近 30 天 (按 updatedAt)
- 过滤逻辑抄 `ui/src/lib/issue-filters.ts` 的 `applyIssueFilters` 语义 (本地过滤)

**富信息行** (替换 8px 色点):
```
[○ 状态圈] 标题 (2 行)
           描述 (1 行, muted)
           [状态徽章] [优先级徽章] · 负责人 · 相对时间
```
- 状态圈: 复用 `src/components/issue-status.ts` 的 `issueStatusColor`, done 实心勾
- 状态/优先级徽章: 复用 `src/ui/Pill.tsx`
- 负责人: `agentsApi`/`listAgents` 映射 agentId → name, 无则「未指派」
- 时间: `formatRelativeShort(updatedAt)`

**quick archive swipe**: RN 用 `PanResponder`/横向位移 (无 gesture-handler 依赖) 或
长按 action sheet 兜底 —— 左滑露出「归档」→ `coolie.archiveIssueFromInbox(id)` →
乐观移除 + 失败回滚。

**阻塞视图**: 抄 `ui/src/lib/blockedInbox.ts` 的分组/排序语义 (纯函数移植到本文件或
`src/lib/blockedInbox.ts`):
- 分组: Blocker type (needs_decision/stalled/needs_attention/recovery_required/external_wait/owner_paused) / None
- 排序: Most urgent (severity→stoppedSinceAt) / Most recent / Longest stopped
- 每行显示 blocked reason 文案 (中文映射) + 停止时长

**快捷动作** (长按行 → action sheet):
- 打开 → `onOpenIssue(issue)`
- 归档 → `archiveIssueFromInbox`
- 派活 → agent 选择器 → `setIssueAssignee`
- 跳 ChatHome → `onOpenWorkshop?.()`

### 3.4 `clients/expo/App.tsx` 接线

```tsx
<InboxScreen
  company={company}
  onOpenSettings={() => setSettingsOpen(true)}
  onOpenIssue={(issue) => { navigateTab("tasks"); setSelected(issue); }}
  onOpenApproval={(approvalId) => setFocusedApprovalId(approvalId)}
  onOpenWorkshop={() => navigateTab("chat")}
/>
```

### 3.5 h5 镜像 `clients/h5/src/screens/InboxScreen.tsx`

HTML 版 (用 `<div>`/`<button>`/`<select>`), 同一套 4 tab + 过滤 + 行 + 阻塞视图。
`clients/h5/src/App.tsx` nav 加一项 `{ key: "inbox", label: "收件箱", hash: "#/inbox" }`。

### 3.6 bump 0.5.24 → 0.5.25 (patch)

(wave45 完成后才是 0.5.24; 本波 patch bump 到 0.5.25, 不超)

### 3.7 Build APK + adb install + 模拟器验证

```
✅ 收件箱 4 tab 可切 (全部 / @我 / 审批 / 阻塞)
✅ 全部 tab 列表渲染 (状态圈 + 标题 + 描述 + 徽章 + 负责人 + 时间)
✅ 过滤弹层可开 + 选状态/优先级后列表收窄
✅ 阻塞 tab 分组 + 排序 + reason 可见
✅ 长按/左滑 → 归档 → 行消失
✅ 截图 /tmp/emu-evidence/wave46-0.5.25/
```

### 3.8 commit + push + 发版 0.5.25 + 上 COS

```bash
git add clients/expo clients/h5 clients/api-client docs-coolie/briefs/2026-09-22-clone-web-inbox-wave46.md
git commit -m "feat(clients): wave46 — 收件箱 1:1 抄 Web (4 tab + 过滤 + 富行 + 阻塞视图 + 归档)"
git push origin main

bash scripts/release-app.sh 0.5.25 "收件箱 1:1 抄 Web: 4 tab + 过滤 + 富信息行 + 阻塞分组 + 快捷归档"
```

## 4. Constraints

- ❌ DON'T 逐字拷 React-DOM JSX (RN 跑不了 `<div>`/`className`/lucide) — 用 RN 组件重写同款信息架构
- ❌ DON'T 触碰 server/ (端点已有: inbox-archive / list 的 blockedInboxAttention 已在响应里)
- ❌ DON'T 触碰 paperclip 上游 `ui/` (只读)
- ❌ DON'T bump 超过 0.5.25
- ✅ DO 复用 `@coolie/api-client` (issuesApi 语义) + `src/components/issue-status.ts` + `src/ui/*`
- ✅ DO 与 Web 同字段/同 tab 语义/同归档端点

## 5. Done definition

8 步全完 + 收件箱与 Web 同构 (4 tab / 过滤 / 富行 / 阻塞分组 / 归档) + 0.5.25 APK 装机
+ 模拟器验证 (4 tab + 列表渲染 + 归档) + commit + push + 发版 + 上 COS:

```
Coolie工坊 0.5.25: https://dls.xrobinai.cn/coolie/app/0.5.25/coolie-release.apk
```
