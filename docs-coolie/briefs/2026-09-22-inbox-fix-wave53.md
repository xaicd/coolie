# Brief: wave 53 — 修 InboxScreen 真数据加载 (boss 24:35 '收件箱咋又搞坏了')

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 24:35 OOB 「收件箱咋又搞坏了」+ 「继续」

老板装 0.5.30 (含 wave46 InboxScreen 仿 Coolie Web + wave51 TaskDetail 在 tab 内 + wave52 签名修) 后, 收件箱坏.

## 1. 已知现状 (PM 09-22 真查)

```
✅ /api/inbox 端点存在 (server/src/routes/inbox.ts)
✅ /api/agents/me/inbox/mine 端点存在 (server/src/routes/agents.ts)
✅ InboxScreen.tsx 路由对 (App.tsx tab='inbox' → InboxScreen)
✅ 4 tabs + filter sheet 仿 Coolie Web 都有
⚠️ InboxScreen.tsx L1-80 真值: 还没看到 useEffect fetch data — 可能 mock 数据或 fetch URL 错
⚠️ wave46 报告说 emulator 跑通了 5 场景, 但 boss 真机 0.5.30 验收件箱失败
```

## 2. 目标

**Coolie工坊 0.5.31 App** 修 InboxScreen 真数据加载 + 验证:

A. 找 InboxScreen.tsx 现状 (mock 还是真 fetch?)
B. 修 fetch 到正确的 server 端点
C. emulator 真验 (4 tabs 切 + 列表渲染 + 归档)

## 3. 任务 (5 步)

### 3.1 找 InboxScreen 数据加载代码

```bash
grep -n "useEffect\|fetch\|coolie\.\|inbox\|archive\|unarchive" clients/expo/src/screens/InboxScreen.tsx | head -20
```

期望: 找 fetch URL — 看是不是 GET /api/inbox 或 GET /api/agents/me/inbox/mine.

### 3.2 看 coolie.ts client API

```bash
grep -n "inbox\|getInbox\|inbox/mine\|inbox-archive" clients/expo/src/coolie.ts packages/api-client/src/*.ts | head -20
```

期望: coolie API client 有 listInbox / archiveIssue / unarchiveIssue 函数.

### 3.3 修 fetch (如果错)

如果 InboxScreen 是 mock data 或 fetch 错 URL, 改为真 server 端点:

```ts
useEffect(() => {
  let cancelled = false;
  void coolie.listInbox({ companyId: company.id })
    .then((rows) => {
      if (!cancelled) setInboxRows(rows);
    })
    .catch(() => {
      if (!cancelled) setInboxRows([]);
    });
  return () => { cancelled = true; };
}, [company.id]);
```

### 3.4 老板截图真值 (关键!)

看老板 24:35 发的 Inbox 截图:
- 收件箱 tab 真值是空白 / loading / 数据错 / UI 错?
- 老板具体看到啥?

**PM 等老板具体反馈后再决定修法**.

如果老板看到的是:
- 空白 → fetch 错或 mock
- loading 一直转 → fetch hang (server 端点有问题)
- 数据错 (404/500 错误) → server 端有问题
- UI 渲染坏 → InboxScreen 自身有 bug

### 3.5 bump 0.5.30 → 0.5.31 + 模拟器验证

```bash
1. bump 0.5.30 → 0.5.31 (release-app.sh, J1-J3 gate)
2. Build APK + adb install
3. 验证 (4 tabs 切 + 列表渲染 + 归档):
   - 进 [收件箱] tab → 列表真渲染 (boss 老板账号真 issue)
   - 点 issue → 详情 (5 tab 底部 nav 还在)
   - 归档 issue → 列表移除
4. 截图 /tmp/emu-evidence/wave53-0.5.31/
5. commit + push + 发版 0.5.31 + 上 COS
```

## 4. Constraints

- ❌ DON'T 改其他屏幕
- ❌ DON'T 触碰 paperclip 上游
- ❌ DON'T bump 0.5.31 之外
- ✅ DO 修 InboxScreen 真数据
- ✅ DO 真验 boss 账号有真 issue 显示

## 5. semver + PM-CHECKLIST

- 当前 0.5.30
- 修 UI 数据 = patch bump → 0.5.31 ✅
- PM-CHECKLIST 32 项: J1-J3 + I1

## 6. Done definition

5 步全完 + InboxScreen 真数据 + 模拟器验证 + commit + push + 发版 0.5.31 + 上 COS:

```
Coolie工坊 0.5.31: https://dls.xrobinai.cn/coolie/app/0.5.31/coolie-release.apk
```