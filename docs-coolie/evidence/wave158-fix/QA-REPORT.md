# wave158-fix — 撤销错误邀请 + 邀 boss 真实 iPhone 账号

- 日期: 2026-09-30 ~13:35–13:40 (+08:00)
- 一句话: **internal 测试组 "coolie" 里 `robinschen1990@gmail.com` 已移出（204）；`robinschen1989@gmail.com` 的团队邀请无法用本 API Key 删除（403，受 ASC 权限限制），标记为自然过期 2026-10-03；boss 真实 iPhone Apple ID `waj_615@qq.com` 本来就已经是 ASC 团队成员（ACCOUNT_HOLDER+ADMIN）且已在 internal 组里（INVITED），无需再加。build 600 / app 记录未动。**
- 授权方式: App Store Connect API Key **WUSVUS3H3L**（Issuer `2e48ed69-3c55-4ccd-b991-49037b312da2`, ES256, 私钥 `~/secure/asc_key.p8`）。所有真值见 `asc-api/curl-transcript.txt`。

## 0. 结论速览

| 任务 | 结果 | 证据 (HTTP) |
|---|---|---|
| A1 从 internal 组移除 `robinschen1990@gmail.com` | ✅ 已移除 | `DELETE /v1/betaGroups/2fe78acd…/relationships/betaTesters` → **204** (`op1-remove-1990-from-group.txt`) |
| A2 删除 `robinschen1989@gmail.com` 团队邀请 | ❌ API 不能删（key 无权）→ 自然过期 | `DELETE /v1/userInvitations/d1aa530b…` → **403 FORBIDDEN_ERROR** (`op2-delete-1989-invite.txt`) |
| A2b 对照探针：不存在的邀请 | — | `DELETE /v1/userInvitations/0000…` → **404 NOT_FOUND** (`op2-probe-random-uuid.txt`) ⇒ 403 是「权限」不是「路由」问题 |
| B1 `waj_615@qq.com` 是否 ASC 团队成员 | ✅ 是（ACCOUNT_HOLDER+ADMIN） | `GET /v1/users` → **200** (`users-after.json`) |
| B2 把 `waj_615@qq.com` 加进 internal 组 "coolie" | ✅ 已在组内（INVITED），无需操作 | `GET …/betaTesters` → **200**, total=1 (`betagroup-testers-after.json`) |
| B3 TestFlight 邀请链接 (deep link) | ⚠️ internal 组没有公开邀请链接 | betaGroup `publicLink=null` (`betagroups-after.json`) |
| C 不动 build 600 / app record | ✅ 未动 | build `version=600 processingState=VALID expired=false` (`build-c6f5a5fb-after.json`) |

> 诚实更正：任务书写「wave158 误加 `robinschen1990` + `robinschen1989`，两个都是 3 天有效邀请」。实际是 **两种不同的东西**：
> - `robinschen1990@gmail.com` 是 **internal 组测试员邀请**（TestFlight 邀请，`betaTesters.state=INVITED`）。它同时还是一个**早已存在的 ASC 团队 ADMIN**（不是本波加的）。
> - `robinschen1989@gmail.com` **从未进过 internal 组**（组里只有 2 个测试员：1990 和 waj615）。它唯一的足迹是一条 **ASC 团队用户邀请**（`userInvitations`, role DEVELOPER, 3 天有效）。

## 1. 动手前真值（before）

- 团队用户 (`GET /v1/users`): `waj_615@qq.com`(ACCOUNT_HOLDER,ADMIN) / `robinschen1990@gmail.com`(ADMIN)
- 待接受团队邀请 (`GET /v1/userInvitations`): `runze66@163.com`(ADMIN, 已过期 2026-09-10) / `robinschen1989@gmail.com`(DEVELOPER, 到期 2026-10-02T22:06:57-07:00)
- internal 组 "coolie" `2fe78acd-…` (`isInternalGroup=true`, `publicLink=null`) 测试员 (**before**, total=2):
  - `ac2d519f-4f0e-43eb-882f-707571b069d8` `robinschen1990@gmail.com` INVITED
  - `3155a0ed-e682-4e4f-b4cc-d07275383c6b` `waj_615@qq.com` INVITED

（快照: `user-invitations-before.json`, `betagroup-testers-before.json`, `betagroups-before.json`）

## 2. A) 撤销错误邀请 — 实际做了什么

### A1 `robinschen1990@gmail.com` — ✅ 已从 internal 组移出

```
DELETE /v1/betaGroups/2fe78acd-8eb1-489b-a351-a18b797dd2a5/relationships/betaTesters
body: {"data":[{"type":"betaTesters","id":"ac2d519f-4f0e-43eb-882f-707571b069d8"}]}
→ HTTP 204  (保留该 key 的团队权限不变；仅移除 TestFlight 测试员关系)
```

复核 (`betagroup-testers-after.json`, total=**1**): 组内只剩 `waj_615@qq.com`。
**未删** `robinschen1990@gmail.com` 的 ASC 团队 ADMIN 身份（它是团队真实账号，非本波产物，任务未授权删除）。

### A2 `robinschen1989@gmail.com` — ❌ API 不能删，标记为自然过期

- 该邮箱**不在** internal 组（组里从来没有它），所以「从组里移除」不适用。
- 其唯一足迹是一条 **ASC 团队用户邀请** `d1aa530b-220f-4c00-aa78-fbeeca331f84` (DEVELOPER)。
- 尝试删除:

```
DELETE /v1/userInvitations/d1aa530b-220f-4c00-aa78-fbeeca331f84
→ HTTP 403 FORBIDDEN_ERROR
  "The API key in use does not allow this request"
```

- **对照探针**（证明是权限而非路由）:

```
DELETE /v1/userInvitations/00000000-0000-0000-0000-000000000000
→ HTTP 404 NOT_FOUND  ("There is no resource of type 'userInvitations' with id ...")
```

  即：不存在的邀请 → 404；存在的邀请 → 403。⇒ 端点可达，但**本 API Key 的角色不允许删除用户邀请**（删除团队邀请通常需要 Account Holder 级别的 key）。

- **处置**: 该邀请将**自然过期**，到期时间 `2026-10-02T22:06:57-07:00` = **2026-10-03 13:06:57 (+08:00)**。
- **建议（boss 手动，1 步）**: 登录 App Store Connect → *Users and Access* → *Invitations*（或 Pending 的 *Users* 行）→ 找到 `robinschen1989@gmail.com` → 点 × 撤销。这是唯一能在到期前主动清掉的方式。

## 3. B) boss 真 iPhone 账号 `waj_615@qq.com`

1. **是不是 ASC 团队成员？** 是。`GET /v1/users` → id `2659b62b-ec01-4c0b-af92-1c42db36b835`，roles **`[ACCOUNT_HOLDER, ADMIN]`**，`allAppsVisible=true`（即最高权限）。⇒ **不需要**再发邀请。
   - 更正任务书里的查法：`GET /v1/users?filter[email]=…` **不是合法查询**（返回 `400 PARAMETER_ERROR.INVALID: 'email' is not a valid filter type`）。正确做法是 `GET /v1/users` 后在结果里按 `username` 匹配（本报告即如此）。
2. **加进 internal 组 "coolie"？** 已在组内：`betaTesters` 里 `waj_615@qq.com`（id `3155a0ed-…`）`state=INVITED`，`hasAccessToAllBuilds=true`。⇒ **不需要**再操作。
3. **TestFlight 邀请链接 (deep link)** — 见下节，**internal 组没有公开链接**。

## 4. TestFlight 邀请链接的真实情况（重要）

`GET /v1/betaGroups/2fe78acd-…` → `isInternalGroup=true`，`publicLink=null`，`publicLinkId=null`，`publicLinkEnabled=null`。

**internal（内部）测试组不存在可分享的公开邀请链接**。Apple 规则：

- **Internal 组**：测试员用邮箱被邀请，TestFlight 邀请发到**该 Apple ID 对应的邮箱**；没有 `https://testflight.apple.com/join/<code>` 这种短链。
- **External 组**：才有 `publicLink`（形如 `https://testflight.apple.com/join/<id>`），且需通过 TestFlight 审核。

所以本波能给出的「入口」只有：

- 邀请已发往 Apple ID `waj_615@qq.com` 的邮箱（IMAP 侧即 **QQ 邮箱**），让 boss 在 **QQ 邮箱**里找 TestFlight 邀请邮件。
- TestFlight App 下载（App Store）: `https://apps.apple.com/app/testflight/id899247664`
- App Store Connect 里该 app（boss 账号可见）: `https://appstoreconnect.apple.com/apps/6817620959/testflight/ios`
- App 记录（未来商店页，非 TestFlight 短链）: `https://apps.apple.com/app/id6817620959`

若 boss 坚持要一个「可转发的 TestFlight 链接」：需要**新建 external 组 + 开 Public Link**——那会新增生产配置，超出本波授权（本波不改生产配置），故**未做**，标记为需另开一波。

## 5. boss iPhone 操作步骤

1. App Store 搜 **TestFlight** → 安装（或点 `https://apps.apple.com/app/testflight/id899247664`）。
2. iPhone 的 **App Store 登录 Apple ID = `waj_615@qq.com`**（设置 → 顶部 Apple Account；或 App Store 个人头像）。⚠️ 只认这个 Apple ID，别的账号收不到邀请。
3. 打开 **QQ 邮箱**（waj_615 的邮箱），找来自 **TestFlight** 的邀请邮件（标题含 "invited to test Coolie工坊"）→ 点 **View in TestFlight / Accept**。
   - 若没收到：邮件可能在垃圾箱；或直接在 TestFlight App 内用 `waj_615@qq.com` 登录，会自动列出邀请。也可打开 ASC 链接 `https://appstoreconnect.apple.com/apps/6817620959/testflight/ios` 看测试员状态。
4. TestFlight 里找到 **Coolie工坊**，版本 **0.6.0 (build 600)** → **Install**。
   - build 状态真值：`processingState=VALID`，`expired=false`（`build-c6f5a5fb-after.json`）。

## 6. 未做 / 边界（诚实标注）

- **未**删除 `robinschen1989@gmail.com` 的团队邀请——API Key 403 无权，改由「自然过期 2026-10-03 13:06 (+08)」+ 建议 boss 在 ASC 网页手动撤销。
- **未**触碰 `robinschen1990@gmail.com` 的团队 ADMIN 身份（那是既有真实账号）。
- **未**动 build 600、**未**动 app 记录 `6817620959`、**未**动 bundle id、**未**重新上传/打包。
- **未**改 `server/`、`ui/`、`packages/`、`clients/` 任何业务代码；**未**改 `version.json`；**未**启停 dev 进程。
- internal 组无公开链接，故**无**可转发的 TestFlight deep link 产出（原因见 §4）。
- 除 internal 测试组成员外，**未**改任何生产配置。

## 7. 证据文件清单

- `asc-api/curl-transcript.txt` — 改动后全部 GET 的原始 curl + HTTP 码（team users / invitations / testers / betaGroup / build）
- `asc-api/op1-remove-1990-from-group.txt` — A1 `DELETE …/betaTesters` → 204
- `asc-api/op2-delete-1989-invite.txt` — A2 `DELETE /v1/userInvitations/…` → 403
- `asc-api/op2-probe-random-uuid.txt` — 对照探针 → 404
- `asc-api/users-after.json`, `user-invitations-after.json`, `betagroup-testers-after.json`, `betagroups-after.json`, `build-c6f5a5fb-after.json`, `apps-after.json` — 改动后真值
- `asc-api/*-before.json` — 改动前真值（users/invitations/testers/groups）
- `asc-api/user-waj615.json` — `filter[email]` 400 反证

## 8. 关键 ID 速查

- ASC app: `6817620959` (Coolie工坊, cn.xrobinai.app) — 未动
- Build: `c6f5a5fb-7f2b-4a60-90e7-bc2f9f6eceaa` (ver 600, VALID) — 未动
- internal 组 "coolie": `2fe78acd-8eb1-489b-a351-a18b797dd2a5` — 现仅 1 测试员
- 保留测试员: `3155a0ed-e682-4e4f-b4cc-d07275383c6b` = `waj_615@qq.com` (INVITED)
- 已移除测试员: `ac2d519f-4f0e-43eb-882f-707571b069d8` = `robinschen1990@gmail.com`
- 待过期团队邀请: `d1aa530b-220f-4c00-aa78-fbeeca331f84` = `robinschen1989@gmail.com` (DEVELOPER, 到期 2026-10-03 13:06 +08)
- boss 团队用户: `2659b62b-ec01-4c0b-af92-1c42db36b835` = `waj_615@qq.com` (ACCOUNT_HOLDER, ADMIN)
