# Brief: wave 58 — 对话内容 Paperclip 替换 (boss '对话内容怎么出现 pageclip')

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: claude

## 0. Boss 09-22 24:45 OOB 「对话内容怎么出现 pageclip」

老板装 Coolie Web 0.6.4 paperclip-web 套壳, 在对话气泡看到 'Paperclip' 字样.

PM 真查上游:
- `IssueChatThread.tsx` L72: `const label = runAgentName ?? "Paperclip"` ← agent fallback 显示 'Paperclip'
- L75: `const label = authorName ?? runAgentName ?? "Paperclip"` ← 用户/agent fallback
- L99: 'Choose whether voted AI outputs can be shared with Paperclip Labs.' ← 设置文案
- L99 + L3678 + L5364 + L5574: `<Paperlip className=... />` ← lucide-react 图标 (icon 类名, 不是字面)

## 1. PM 老实盘点

```
'Paperclip' 字符串在对话气泡显示路径:
1. agent fallback name (L72) — "Paperclip" 当 runAgentName 是空
2. user fallback name (L75) — "Paperclip" 当 authorName + runAgentName 都是空
3. 设置文案 (L99) — "Paperclip Labs"

i18n PATCH MutationObserver 200ms debounce 自动扫 textContent 替换, 跟 wave57 同套路.
但 'Paperclip' 静态字符串 + agent 名字动态字符串 — i18n 字典只覆盖静态.

修法:
- A. 加 i18n PATCH: 'Paperclip' → 'Coolie' (静态)
- B. 删 fallback 'Paperclip' 字段: client-side 把 'Paperclip' 文本替换为 'Coolie' (用户/agent name 真返回后, fallback 失效)

PM 推荐 A + B.
```

## 2. 目标

**Coolie Web 0.6.6** 对话内容 Paperclip 替换:

A. i18n PATCH 字典加 4 条 (Paperclip / Paperclip Labs / Share with Paperclip / Paperclip fallback)
B. wave57 字典扩 10+ 条 → wave58 字典扩 4 条 (没覆盖的)
C. bump 0.6.5 → 0.6.6 + 模拟器真验对话气泡 0 Paperclip

## 3. 任务 (4 步)

### 3.1 找 i18n PATCH 字典位置

读 `clients/expo-paperclip-web/App.tsx`, 找 `I18N_PATCH: { ... }` 字典 (wave57 已加 ~10 条).

### 3.2 加 4 条

```ts
'I18N_PATCH': {
  // 之前 wave57 ~10 条...
  'Paperclip': 'Coolie',                                                    // L72 / L75 fallback
  'Paperclip Labs': 'Coolie',                                              // L99
  'Share with Paperclip Labs': '分享给 Coolie',
  'Allow Paperclip to upload this file to your OneDrive.': '允许 Coolie 上传此文件到你的 OneDrive。',  // server chat-teams-file-consent.ts
}
```

⚠️ 注意: 'Paperclip' 太短, 可能误伤 (如 'PaperclipAI' import 路径 / Paperclip class 名). 但 i18n PATCH 只改 textContent, 不改 import / class 名.

⚠️ 但 `<Paperclip>` 是 lucide-react 图标 (svg path), textContent 不会有 'Paperclip' 字面, 安全.

### 3.3 bump 0.6.5 → 0.6.6 + 真验

```bash
1. bump clients/expo-paperclip-web/app.json + package.json 0.6.5 → 0.6.6 (versionCode 5 → 6)
2. Build APK + adb install + 模拟器装
3. 真验: 进任意对话气泡, 检查 user-visible textContent 'Paperclip' 0 hit
4. grep APK strings: unzip -p ...coolie-release.apk strings.dex | grep -i paperclip | head -5
   (确认 'Paperclip' 字面字符串被 i18n 字典覆盖)
5. 上 COS: https://dls.xrobinai.cn/coolie/app/0.6.6-paperclip-web/coolie-release.apk
```

### 3.4 commit + push + 发版

```bash
git add clients/expo-paperclip-web/App.tsx
git -c user.email=hermes@nous.local -c user.name='Hermes PM' commit -m "fix(web-i18n): wave 58 — 对话内容 Paperclip 替换 (boss 24:45)"
git push origin main
```

## 4. Constraints

- ❌ DON'T 触碰 ui/ 上游
- ❌ DON'T bump 0.6.6 之外
- ✅ DO i18n 字典 4 条扩展
- ✅ DO 模拟器真验 'Paperclip' 0 hit

## 5. semver + PM-CHECKLIST

- 当前 0.6.5
- i18n 字典扩展 = patch bump → 0.6.6 ✅
- PM-CHECKLIST 32 项: J1-J3 + I1

## 6. Done definition

4 步全完 + i18n 字典 4 条 Paperclip 替换 + bump 0.6.5 → 0.6.6 + 模拟器真验 'Paperclip' 0 hit + commit + push + 发版 0.6.6 + 上 COS:

```
Coolie Web 0.6.6: https://dls.xrobinai.cn/coolie/app/0.6.6-paperclip-web/coolie-release.apk
i18n 字典: 250+ → 255+ 条
对话内容 'Paperclip' 0 hit (L72/L75/L99 fallback 全替换)
```