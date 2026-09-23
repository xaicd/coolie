# Brief: wave 48 — BoardChatScreen 精简 + 改标题 (boss 24:18 OOB '这个工坊对话要再精简, 别叫驾驶舱智能问答')

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 24:18 OOB 「这个工坊对话要再精简, 别叫 驾驶舱智能问答」

老板要求 BoardChatScreen:
- 精简 (太多 UI 元素)
- 改标题 (不要叫「驾驶舱智能问答」)

## 1. 已知现状 (PM 09-22 真查)

```
clients/expo/src/screens/BoardChatScreen.tsx:
- L1163: <Text style={styles.topTitle}>驾驶舱智能问答</Text>  ← 改
- L1171: {sending ? 'Hermes Concierge 思考中…' : '全双工双向流式对话'}  ← 副标题改
- L1404: placeholder='询问工坊运行、额度、员工负荷或审批…'  ← 改 (精简)

当前 5 tab 底部 nav (汇览/任务/+/员工/收件箱) - 不动
```

## 2. 目标

**Coolie工坊 0.5.26 App** BoardChatScreen 精简:

A. **改标题**: 「驾驶舱智能问答」 → 「工坊」 (精简, 一目了然)
B. **改副标题**: 「全双工双向流式对话」 → 「驱动 5 角色员工」(短)
C. **改 placeholder**: 「询问工坊运行、额度、员工负荷或审批…」 → 「派个活, 或问点什么」(精简)
D. **删冗余 UI**:
   - 删「历史」/「设置」/「刷新」按钮 (老板截图看到 3 个多余按钮)
   - 删 Quick chips (工坊今日花销/员工都在忙啥/有哪些待审批/本周) — 跟 [+] composer 重复
   - 删 连接状态绿点 (副标题已有) / 删 StatusDot
   - 留 mic 按钮 + 发送按钮 (核心)

## 3. 任务 (4 步)

### 3.1 改标题 + 副标题 + placeholder

读 `clients/expo/src/screens/BoardChatScreen.tsx`:

```tsx
// 当前
<Text style={styles.topTitle}>驾驶舱智能问答</Text>
// 改
<Text style={styles.topTitle}>工坊</Text>

// 当前
{sending ? "Hermes Concierge 思考中…" : "全双工双向流式对话"}
// 改
{sending ? "思考中…" : "驱动 5 角色员工"}
```

### 3.2 改 placeholder

```tsx
// 当前
placeholder="询问工坊运行、额度、员工负荷或审批…"
// 改
placeholder="派个活, 或问点什么"
```

### 3.3 删冗余 UI

读 `clients/expo/src/screens/BoardChatScreen.tsx`, 删:

1. **历史 / 设置 / 刷新 三按钮** (L约 1150-1180 区域):
```tsx
<Pressable onPress={...}><Text>历史</Text></Pressable>
<Pressable onPress={...}><Text>设置</Text></Pressable>
<Pressable onPress={...}><Text>刷新</Text></Pressable>
```

2. **Quick chips** (L约 1200-1230):
```tsx
<QuickActionsRow actions={[
  { icon: '💬', label: '工坊今日花销' },
  { icon: '💬', label: '员工都在忙啥' },
  ...
]} />
```

3. **StatusDot 绿点** (在 titleRow 里):
```tsx
<StatusDot status={...} size={6} color={...} />
```

4. **styles.topTitle / subtitle / quickActionsRow** (对应样式删)

### 3.4 bump 0.5.25 → 0.5.26 + 模拟器验证

```bash
1. bump 0.5.25 → 0.5.26 (release-app.sh, J1-J3 gate)
2. Build APK + adb install
3. 测试场景:
   a. 进 BoardChatScreen → 看到「工坊」(短标题)
   b. 副标题「驱动 5 角色员工」
   c. placeholder 「派个活, 或问点什么」
   d. 无历史/设置/刷新 三按钮 (空)
   e. 无 Quick chips (空)
   f. mic + 发送按钮还在
   g. 5 tab 底部 nav 不动
4. 截图 /tmp/emu-evidence/wave48-0.5.26/
5. commit + push + 发版 0.5.26 + 上 COS:
   https://dls.xrobinai.cn/coolie/app/0.5.26/coolie-release.apk
```

## 4. Constraints

- ❌ DON'T 改其他屏幕 (Tasks / Dashboard / Inbox / etc)
- ❌ DON'T 改底部 5 tab
- ❌ DON'T 改 mic / 发送按钮逻辑
- ❌ DON'T 删 chat 流 (用户/助手气泡)
- ✅ DO 精简 UI (删冗余)
- ✅ DO 改 3 个字符串 (topTitle / subtitle / placeholder)

## 5. semver + PM-CHECKLIST

- 当前 0.5.25
- UI 精简 = patch bump → 0.5.26 ✅
- PM-CHECKLIST 32 项: J1 git status clean / J2 commit hash / J3 push / I1 patch bump

## 6. Done definition

4 步全完 + BoardChatScreen 精简 + 改 3 个字符串 + 模拟器验证 + commit + push + 发版 0.5.26 + 上 COS:

```
Coolie工坊 0.5.26: https://dls.xrobinai.cn/coolie/app/0.5.26/coolie-release.apk
```