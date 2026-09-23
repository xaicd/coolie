# Brief: wave 50 — BoardChatScreen 删所有描述 (boss 24:25 '工坊 5 角色员工描述都去掉')

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 24:25 OOB 「工坊 5 角色员工描述都去掉」

老板装 0.5.26 真机截图看到:
- ❌ 「驱动 5 角色员工」副标题
- ❌ 任何描述性文案 (副标题/placeholder hints/status text/empty state 解释等)

老板要 BoardChatScreen 完全删描述/副标题 — 只留核心标题 + 输入框 + 发送按钮 + mic.

## 1. 已知现状 (wave48 已发 0.5.26)

```
✅ 标题 '工坊' (改对)
✅ 副标题 '驱动 5 角色员工' ← boss 嫌
✅ placeholder '派个活, 或问点什么' ← 老板可能也嫌 (信息)
✅ 删了 3 按钮 + Quick chips + StatusDot
❓ 还有其他描述 (empty state 解释, Quick chip label, status text 等)
```

## 2. 目标

**Coolie工坊 0.5.28 App** BoardChatScreen 完全删描述:

A. 删副标题 '驱动 5 角色员工' (顶栏下大字下面那行)
B. 删 placeholder '派个活, 或问点什么' → 空 (或更短 '...')
C. 删 sending 态文字 '思考中…' → 删 (无文字)
D. 删 empty state 欢迎语 (如果有)
E. 删所有 modal/toast 的描述文字 (留按钮)

## 3. 任务 (4 步)

### 3.1 删副标题 + placeholder + sending 文字

读 `clients/expo/src/screens/BoardChatScreen.tsx`:

```tsx
// 当前 (L1163-1171)
<Text style={styles.topTitle}>工坊</Text>
<StatusDot ... />
{sending ? "思考中…" : "驱动 5 角色员工"}

// 改
<Text style={styles.topTitle}>工坊</Text>
{sending ? "" : ""}  // 全删
```

### 3.2 删 placeholder

```tsx
// 当前 (L1404)
placeholder="派个活, 或问点什么"
// 改
placeholder=""  // 或删 placeholder prop
```

### 3.3 删 empty state / modal 描述

```bash
grep -n "// \|const \|/\*\|/\*\*" clients/expo/src/screens/BoardChatScreen.tsx | grep -E "Text|Hint|Help|Empty" | head
```

读匹配行, 删 / 简化所有描述性 Text 组件.

### 3.4 bump 0.5.27 (或 0.5.28) + 模拟器验证

```bash
1. bump 0.5.27 → 0.5.28 (release-app.sh, J1-J3 gate)
2. Build APK + adb install
3. 测试场景:
   a. 进 BoardChatScreen → 顶部只有 '工坊' 大字, 无副标题
   b. 输入框 placeholder 空 (或 '...')
   c. sending 态无文字
   d. empty state 无欢迎语
   e. mic + 发送按钮还在
4. 截图 /tmp/emu-evidence/wave50-0.5.28/
5. commit + push + 发版 0.5.28 + 上 COS:
   https://dls.xrobinai.cn/coolie/app/0.5.28/coolie-release.apk
```

## 4. Constraints

- ❌ DON'T 删功能 (mic, 发送, chat 流, 5 tab)
- ❌ DON'T 改其他屏幕
- ❌ DON'T bump 0.5.28 之外
- ✅ DO 删所有描述/副标题/欢迎语/提示
- ✅ DO 保留按钮 + 输入框 + 标题

## 5. semver + PM-CHECKLIST

- 当前 0.5.27 (待 wave49 发版, 但 wave49 跟 wave50 串行)
- 删文案 = patch bump → 0.5.28 ✅
- PM-CHECKLIST 32 项: J1-J3 + I1

## 6. Done definition

4 步全完 + BoardChatScreen 删所有描述 + 模拟器验证 + commit + push + 发版 0.5.28 + 上 COS:

```
Coolie工坊 0.5.28: https://dls.xrobinai.cn/coolie/app/0.5.28/coolie-release.apk
```