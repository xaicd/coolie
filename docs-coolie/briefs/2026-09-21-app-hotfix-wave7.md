# Brief: App hotfix — boss 模拟器真值诊断 3 个 bug

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Background (boss 2026-09-21 模拟器实测真值)

Boss 在 Android 模拟器 (Pixel6, GPU enabled) 装 0.5.2 APK 看到:
- WhatsNewScreen 没弹 ❌
- 登录按钮无响应 ❌
- 「改用 API Key 登录」按了不动 ❌

PM (Hermes) 实测日志 + grep 源码发现 3 个真 bug 如下:

## Bug 1: WhatsNewScreen 永远不弹

File: `clients/expo/App.tsx` line 669-684:
```ts
function HomeScreen(...) {
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  useEffect(() => {
    void shouldShowWhatsNew().then((show) => {
      if (show) setWhatsNewOpen(true);
    });
  }, []);
  ...
}
```

`shouldShowWhatsNew()` 在 **HomeScreen** 里调用。HomeScreen **只在登录后才渲染**。

**新用户路径: Launch → Login 页 → 没 HomeScreen → WhatsNewScreen 永远没机会弹。**

Fix: 把 `whatsNewOpen` state + `shouldShowWhatsNew` effect 提到 App.tsx 顶层，在 Login 渲染前就先检查。先弹 WhatsNewScreen, 用户 [我知道了] 再进 Login。

## Bug 2: 登录按钮 disabled 看起来"无响应"

File: `clients/expo/App.tsx` line 566:
```ts
const ready = useToken
  ? token.trim().length > 0
  : email.trim().length > 0 && password.length > 0;
```

如果 user 已切到 [改用 API Key 登录] (useToken=true) 但忘了填 token → ready=false → 按钮 disabled。

Boss 截图 03 显示他意外点了密码框位置 → useToken 切到 true → token 空 → 按钮 disabled → 看起来"无响应"。

Fix:
1. 当 useToken 切换时清空 token / email / password
2. 加 toast: "请输入 API Key" 或 "请输入邮箱和密码" (user 才知道为什么 disabled)
3. ready 状态显示文案提示 (现在 disabled 时按钮颜色变灰, user 不知道为什么)

## Bug 3: "改用 API Key 登录" 按不动 (实际是视觉+状态机)

Root cause 1: Pressable 在 line 633-639, 渲染时按钮位置可能不在 (540, 1470) 那个坐标。
Root cause 2: 切换时不清空 token / email / password。

Fix:
1. 切 useToken 时清空 token / email / password
2. 验证 Pressable 的 hit slop 足够大

## Tasks

1. Fix WhatsNewScreen to show FIRST (before login)
2. Fix useToken state machine (clear inputs on toggle)
3. Add visual hint when disabled
4. Run `bash scripts/release-app.sh 0.5.3 "hotfix: WhatsNewScreen 首弹 + 登录按钮 ready 状态机"`
5. Rebuild APK + install on emulator + verify with screenshots

## Constraints

- DO NOT touch ChatHome / 5 Tab / build orchestrator / server
- ONLY fix login screen + WhatsNewScreen logic
- Stay within --max-turns 100
- 1 commit per fix + 1 release commit

## Verification

- [ ] Install 0.5.3 on emulator
- [ ] First launch shows WhatsNewScreen
- [ ] [我知道了] → Login page
- [ ] Email + password filled → 登录 button enabled
- [ ] Click 登录 → fetch fires (check logcat)
- [ ] [改用 API Key 登录] toggles state + clears inputs
- [ ] Take 5 screenshots in /tmp/emu-evidence/
- [ ] commit + push

## Done definition

3 bugs fixed + 0.5.3 release + screenshots + commit + push. PM installs on emulator + verifies.