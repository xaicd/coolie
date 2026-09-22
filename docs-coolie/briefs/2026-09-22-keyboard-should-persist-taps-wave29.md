# Brief: wave 29 — 修 login/register ScrollView 缺 keyboardShouldPersistTaps

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 23:20 OOB 「修」

boss 让修门神 wave28 披露的 login/register ScrollView 缺 keyboardShouldPersistTaps bug.

## 1. 已知现状 (门神 wave28 披露)

```
✅ 0.5.17 已发版 (wave27+28 完成)
❌ login/register ScrollView 缺 keyboardShouldPersistTaps
   = 用户在 input 打字后, 点其他 button (不是 input), tap 被吞掉
   = 体验: 打了密码再点 [登录] 按钮没反应, 必须先 tap input 失焦再点 [登录]
```

## 2. 目标

**Coolie工坊 0.5.18 App** login/register ScrollView 加 `keyboardShouldPersistTaps="handled"`:

- input 失焦时 tap 其他 button 也立即触发 (不打字时行为不变)
- 打字后 tap 其他 button 不再被吞 (input 失焦 + tap button 一次完成)

## 3. 任务 (4 步)

### 3.1 找 login/register 页面 ScrollView

读 `clients/expo/src/screens/` 找 login / register / auth 相关 screen:

```bash
find clients/expo/src -iname "*login*" -o -iname "*auth*" -o -iname "*register*" -o -iname "*signin*"
```

读所有找到文件,找 ScrollView 缺 keyboardShouldPersistTaps 的地方.

### 3.2 改 ScrollView 加 keyboardShouldPersistTaps="handled"

```tsx
<ScrollView
  keyboardShouldPersistTaps="handled"  // 新增
  contentContainerStyle={styles.container}
>
  ...
</ScrollView>
```

(React Native `keyboardShouldPersistTaps` 接受 'always' | 'never' | 'handled')

- 'never' (默认): 第一次 tap 触发键盘 dismiss, 不响应 button
- 'handled': 键盘仍 dismiss, 但 button tap 也被处理 (RN 推荐值)
- 'always': tap 永不 dismiss 键盘

**用 'handled' 是 RN 文档推荐**.

### 3.3 扫描其他 ScrollView 缺 keyboardShouldPersistTaps 的地方

```bash
grep -rln "ScrollView" clients/expo/src/ | while read f; do
  grep -L "keyboardShouldPersistTaps" "$f"
done
```

把所有 ScrollView 没设 keyboardShouldPersistTaps 的全补上 (防类似 bug).

### 3.4 bump 0.5.17 → 0.5.18 + 模拟器验证

```bash
1. bump 0.5.17 → 0.5.18 (release-app.sh runtimeVersion drift fix from wave16)
2. Build APK + adb install
3. 测试场景:
   a. 进 login 页 → 邮箱/密码 input 打字 → 点 [登录] 按钮 → 按钮立即响应 (不要先 tap input 失焦)
   b. 进 register 页 → 重复 a
   c. 任意 ScrollView 含 input 的页面 (composer / board chat / task detail 等) → 验类似
4. 截图 /tmp/emu-evidence/wave29-0.5.18/
```

## 4. Constraints

- ❌ DON'T 触碰 paperclip 上游 (ui/)
- ❌ DON'T 改 ScrollView 行为 (只加 1 个 prop)
- ✅ DO 扫所有 ScrollView (不只是 login/register)
- ✅ DO 用 'handled' 值 (RN 文档推荐)

## 5. Done definition

4 步全完 + 0.5.18 APK 装机 + 模拟器验证 (login/register + 其他 ScrollView 都正确响应) + commit + push + 发版 + 上 COS:

```
Coolie工坊 0.5.18: https://dls.xrobinai.cn/coolie/app/0.5.18/coolie-release.apk
```