# Brief: wave 89 — 修 releaseNotes 写死 → 改读 version.json.notes 动态 (boss 27:26 OOB 'B')

PM: Jason
Worker: claude

## 0. Boss 09-23 27:26 OOB 「B」

老板选修法 B = `version.json` 加 `notes` 字段, App 拉 OTA 时读 `version.json.notes` 动态显示「本版更新」.

当前 WhatsNew 屏 `releaseNotes.ts:26` 写死 `title: "砍掉工作空间，工坊一件到底"` + 固定 content, 26 波 (wave42-88) 以来从未换过.

## 1. 目标

修 WhatsNew 屏动态从 `version.json` 读 `notes` 字段:

A. `version.json` 加 `notes` 字段 (CHANGELOG.md 当前版本段)
B. publish-app.sh 写 version.json 时, 自动从 CHANGELOG.md 抽当前版本的 ## vX.Y.Z 段填 `notes`
C. publish-ota.sh 发布 OTA 时也同步写 version.json notes
D. WhatsNewScreen 改读 version.json.notes (via OTA API 拉)
E. releaseNotes.ts 写 fallback (没拉到 notes 时用旧写死)
F. bump + 真发版 + commit + push

## 2. 真值盘点 (当前实现)

```
- clients/expo/src/releaseNotes.ts:26 title + content 写死
- clients/expo/src/screens/WhatsNewScreen.tsx:232 <Text>本版更新</Text>
- clients/expo/App.tsx 装配时硬读 releaseNotes.ts
- version.json 当前: {version, versionCode, commitSha, apkUrl, notes(空字符串)}
- publish-app.sh 写 version.json (apkUrl + commitSha + notes)
- version.json 生产: https://xrobinai.cn/version.json
```

## 3. 任务 (6 步)

### 3.1 看 releaseNotes.ts 当前实现

1. cd ~/workspace/xaicd/coolie
2. cat clients/expo/src/releaseNotes.ts | head -50
3. cat clients/expo/src/screens/WhatsNewScreen.tsx | grep -A 5 "本版更新"
4. cat scripts/publish-app.sh | grep -A 5 "version.json"
5. cat scripts/publish-ota.sh | grep -A 5 "version.json"

### 3.2 改 publish-app.sh + publish-ota.sh 自动从 CHANGELOG.md 抽 notes

1. scripts/publish-app.sh: 写 version.json 时, 跑 sed/awk 从 CHANGELOG.md 抽 `## vX.Y.Z` 段 → 写到 `notes` 字段
2. scripts/publish-ota.sh: 同样抽 notes
3. version.json schema 改: `notes: string` (markdown 内容)

### 3.3 改 releaseNotes.ts 提供动态 loader

1. clients/expo/src/releaseNotes.ts:
   - export default function loadReleaseNotes(version: string): {title, content} | null
   - 优先从 in-memory cache 读 (App 启动时 fetch /api/release-notes 或 /version.json)
   - fallback 旧写死数据
2. 暴露 `fetchReleaseNotes()` async fn

### 3.4 改 WhatsNewScreen + App.tsx 动态读

1. WhatsNewScreen: useEffect 启动时 fetch /version.json 或 /api/release-notes → 调 setReleaseNotes()
2. App.tsx: 启动时 fetchVersionJson() cache
3. 用 releaseNotes (动态) 而非 releaseNotes (静态)

### 3.5 h5 镜像

1. clients/h5/src/screens/WhatsNewScreen.tsx: 同样改读 /version.json

### 3.6 bump + 真发版 + commit + push

1. bump 0.5.62 → 0.5.63 (clients/expo/{app.json, package.json, CHANGELOG.md}, versionCode 562 → 563)
2. npx expo prebuild + gradle build
3. coscli 上传 0.5.63 APK
4. version.json: commitSha 当前 HEAD, notes 自动从 CHANGELOG.md 抽 ## v0.5.63 段
5. scp version.json → tc-coolie-claw
6. publish-ota.sh 真跑 (动态 notes)
7. adb 真验 WhatsNew 屏显示当前版本真值 (不再是 "砍掉工作空间" 写死)
8. git add + commit + push (SSH proxy bypass)

## 4. Constraints

- ❌ DON'T 用 agy
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.63 之外
- ❌ DON'T 改 boss Claude 23 commit / wave84-88 release
- ✅ DO 改 releaseNotes.ts 动态读
- ✅ DO 改 publish-app.sh + publish-ota.sh 抽 notes
- ✅ DO 用 zsh-safe single quotes

## 5. semver + PM-CHECKLIST

- 当前 0.5.62
- 修 WhatsNew 屏动态 = patch bump → 0.5.63
- PM-CHECKLIST 32 项: J1-J3 + I1 + I2

## 6. Done definition

6 步全完 + 改 releaseNotes.ts + 改 publish scripts + 改 WhatsNewScreen + bump 0.5.63 + APK 真发版 + coscli + version.json (notes 字段填真值) + publish-ota + adb 真验 WhatsNew 屏显示真值 (不再写死) + commit + push + 发版:

```
Coolie工坊 0.5.63: https://dls.xrobinai.cn/coolie/app/0.5.63/coolie-release.apk    ← NEW (WhatsNew 动态读 notes)
OTA manifest: runtimeVersion 0.5.63
```