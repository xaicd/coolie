# Brief: wave 25 — composer 补齐 NewTaskDialog 同款所有功能

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 OOB 「这个页面上的所有功能要都有」

老板装 Coolie Web 0.6.2 看 NewTaskDialog 截图, 要求 Coolie工坊 App composer 包含**截图上所有功能** (不是 wave24 的 4 字段, 是所有字段).

## 1. 已知现状 (wave24 已做)

```
✅ For [Assignee] in [Project] ⋯ (wave24)
✅ Add description (wave24)
✅ Mode [Auto/Plan/Ask mode] chip (wave24)
✅ Upload 附件 (wave24)
✅ [Create Task] (已有)
✅ 优先级4选 (已有)

❌ 标题「XROA › New task」+ 全屏 ↗ + ✕ — 应跟 NewTaskDialog 同款
❌ ●Todo 状态切换 (todo/in-progress/done) — wave24 没做
❌ ⋯ 更多按钮 — 缺
❌ [Discard Draft] 按钮 — wave24 没做
```

## 2. 目标

**Coolie工坊 0.5.14 App** composer 跟 NewTaskDialog 截图功能完全 1:1:

```
┌─────────────────────────────────────────┐
│ [XROA] › New task              ↗  ✕     │  ← 标题栏 (全屏 ↗ + ✕ 关闭)
├─────────────────────────────────────────┤
│ Task title 大输入框                       │
│                                          │
│ For [Assignee ⋯]  in [Project ⋯]   ⋯    │  ← 3 列 (For/Assignee/in/Project/⋯)
│                                          │
│ Add description... (Markdown)            │
│                                          │
│ [●Todo] [📎 Upload] [🔨 Auto mode] [⋯]   │  ← 状态+附件+模式+更多 (4 chip)
│                                          │
│ Discard Draft    [Create Task]            │  ← 双按钮
└─────────────────────────────────────────┘
```

## 3. 任务 (5 步 — 复用上游不重写)

### 3.1 标题栏重构 (跟 NewTaskDialog 同款)

`clients/expo/src/screens/compose/ComposeOverlay.tsx` (新建) 或 App.tsx `composeOverlay` 改:

```tsx
<View style={styles.composeHeader}>
  {/* 跟 NewTaskDialog 同款 */}
  <Pressable onPress={openFullscreen}><Ionicons name="expand-outline" /></Pressable>
  <Text style={styles.composeTitle}>XROA › New task</Text>
  <Pressable onPress={() => setComposeOpen(false)}><Ionicons name="close" /></Pressable>
</View>
```

### 3.2 状态切换 (Todo / In Progress / Done)

```tsx
const [status, setStatus] = useState<IssueStatus>('todo');

<View style={styles.chipsRow}>
  <StatusChip value="todo" active={status === 'todo'} onPress={setStatus} />
  <StatusChip value="in_progress" active={status === 'in_progress'} onPress={setStatus} />
  <StatusChip value="done" active={status === 'done'} onPress={setStatus} />
</View>
```

新建 `clients/expo/src/components/composer/StatusChip.tsx`. 用上游 `IssueStatus` 类型 (从 `@paperclipai/shared` import).

### 3.3 ⋯ 更多 (展开二级菜单)

```tsx
const [moreOpen, setMoreOpen] = useState(false);

<Pressable onPress={() => setMoreOpen(!moreOpen)}>
  <Ionicons name="ellipsis-horizontal" />
</Pressable>

{moreOpen && (
  <View style={styles.moreMenu}>
    {/* 二级菜单项: 标签 / 截止日期 / 信任策略 / Markdown 编辑器切换 / 上传附件等 */}
    <MenuItem icon="pricetag" label="标签" />
    <MenuItem icon="calendar" label="截止日期" />
    <MenuItem icon="shield-checkmark" label="信任策略" />
    <MenuItem icon="document-text" label="Markdown 编辑器" />
  </View>
)}
```

(参考 NewIssueDialog.tsx 的 ⋯ 菜单有哪些项.)

### 3.4 Discard Draft 按钮

```tsx
const [draft, setDraft] = useState<Partial<IssueDraft>>({});

<Pressable onPress={handleDiscardDraft} style={styles.discardBtn}>
  <Text>Discard Draft</Text>
</Pressable>
```

`handleDiscardDraft` 清空 draft state + close overlay + toast 「草稿已丢弃」.

### 3.5 i18n 字典扩展 (Coolie Web 同款)

`clients/expo-paperclip-web/App.tsx` I18N_PATCH 加:

```
'New task' → '新建任务'
'Todo' → '待办'
'In Progress' → '进行中'
'Done' → '已完成'
'Discard Draft' → '放弃草稿'
'Tags' → '标签'
'Due date' → '截止日期'
'Trust policy' → '信任策略'
'Markdown editor' → 'Markdown 编辑器'
```

## 4. 模拟器验证

```bash
1. bump 0.5.13 → 0.5.14 (release-app.sh runtimeVersion drift fix from wave16)
2. Build APK + adb install + 启动
3. 进 [任务] tab → 点 [+] → composer 浮层打开:
   ✅ 标题栏「XROA › New task」+ ↗ + ✕
   ✅ Task title 输入框
   ✅ For [Assignee ⋯] in [Project ⋯] ⋯
   ✅ Add description...
   ✅ [●Todo] [📎 Upload] [🔨 Auto mode] [⋯]
   ✅ 点 ⋯ 展开二级菜单 (标签/截止日期/信任策略/Markdown)
   ✅ [Discard Draft] [Create Task]
4. 填 "wave25 测试" + Assignee + Mode + Status + 点 Create Task → 201
5. 点 Discard Draft → draft 清空 + overlay 关 + toast
6. 截图 /tmp/emu-evidence/wave25-0.5.14/
```

## 5. Constraints

- ❌ DON'T 触碰 paperclip 上游 (ui/)
- ❌ DON'T 重写整个 composer — 只在 wave24 基础上增量加
- ✅ DO 复用 @paperclipai/api-client + @paperclipai/shared (IssueStatus 类型)
- ✅ DO 复用 NewIssueDialog 上游 ⋯ 菜单字段 (不要自创)

## 6. Done definition

5 步全完 + 0.5.14 APK 装机 + 模拟器验证 (NewTaskDialog 同款全功能) + commit + push + 发版 + 上 COS:

```
Coolie工坊 0.5.14: https://dls.xrobinai.cn/coolie/app/0.5.14/coolie-release.apk
```