# Coolie PM 发版 Checklist — 2026-09-20

发版前必跑 31 项 gate（26 项实列 + H1-H4 / I1 共 5 项加固）。任何一项 ⛔ 都**不发版**。PM 自己负责跑完签字。

## A. 代码质量（6 项）

- [ ] **A1** `pnpm -r typecheck` 0 错误（整个仓库，包含 server / clients/expo / packages / ui）
- [ ] **A2** `pnpm test` vitest 全过（cheap default）
- [ ] **A3** `pnpm test:e2e` 关键路径 5+ 项全过（auth / approval / chat stream / ontology / version）
- [ ] **A4** `pnpm build` server 编译 OK
- [ ] **A5** `pnpm --filter clients/expo export --platform android` Metro bundle 成功（撞 release/0.5.0+ 必备）
- [ ] **A6** 全部 spec workflow / build orchestrator 新代码有单元测试（覆盖率 ≥30%）

## B. 版本号（4 项）

- [ ] **B1** `clients/expo/app.json` 的 `expo.version` = 目标版本
- [ ] **B2** `clients/expo/app.json` 的 `android.versionCode` = 目标整数（且 ≥上一个版本）
- [ ] **B3** `clients/expo/package.json` 的 `version` = 目标版本
- [ ] **B4** `clients/expo/android/app/build.gradle` 的 `versionCode` + `versionName` 与 app.json 同步（gitignored 文件，门神必手改）

## C. Git 与分支（4 项）

- [ ] **C1** 当前分支与目标发布版本一致（main / release/x.y）
- [ ] **C2** `git log --oneline -5` 没有未 commit 的 WIP 应当被发版带进去（`.commandcode/` / `core` / `coscli.log` 等可忽略）
- [ ] **C3** 没 push 的 commit 在 origin 上没冲突（`git fetch origin` + `git status`）
- [ ] **C4** 不动 `release/0.4.0` 等过气分支（除非老板明确说）

## D. 安全（3 项）

- [ ] **D1** keystore 不在仓库 / transcript / untracked
- [ ] **D2** secrets (腾讯 ASR / etc.) 配在 host 密钥库 + plugin config 引用名，非明文落代码
- [ ] **D3** docs-coolie/security-audit-2026-09-20.md 旧 gap 已修或已记录到下一版

## E. 服务端烟测（4 项）

- [ ] **E1** prod 上 `curl https://xrobinai.cn/api/health` 返回 200
- [ ] **E2** prod 上 `curl https://xrobinai.cn/ota/manifest` runtimeVersion = 目标
- [ ] **E3** prod 上 POST `/api/board/chat/stream` SSE 收到 chunk（用伪造但合法的 session cookie + HMAC 签名）
- [ ] **E4** prod 上 GET `/api/companies/:id/dashboard` 返回 200（实测登录链路通）

## F. 上传与发布（3 项）

- [ ] **F1** APK URL curl 200，size 在合理范围（v0.5.0 ~ 77 MB）
- [ ] **F2** `xrobinai.cn/version.json` 三个字段对齐：version / versionCode / downloadUrl
- [ ] **F3** OTA runtimeVersion = 当前 `expo.version`

## G. 老板回签（2 项）

- [ ] **G1** 老板在 weixin 回 「收到 + 装新版本试」
- [ ] **G2** 老板实测工坊对话 + 审批 + 本体域 + build 触发 → 至少一个跑通

---

## H. 变更规范（4 项）— NEW

- [ ] **H1** `clients/expo/CHANGELOG.md` 顶部插入新版本节（发版前）
- [ ] **H2** `clients/expo-paperclip-web/CHANGELOG.md` 顶部插入新版本节（改 Coolie Web 时）
- [ ] **H3** `clients/h5/CHANGELOG.md` 顶部插入新版本节（改 h5 时）
- [ ] **H4** `docs-coolie/briefs/<date>-<name>.md` 包含 PM 拍板理由 + 受影响资产 + 装机直链

## I. 变更语义（1 项）— NEW（跟 VERSIONING.md 联动）

- [ ] **I1** version bump 符合 semver（patch=hotfix / minor=feature / major=breaking，见 `docs-coolie/VERSIONING.md`）

---

## 31 项速查表

| 类别 | 数 | 关键项 |
|---|---:|---|
| 代码质量 | 6 | tsc / vitest / e2e / build / Metro bundle / 覆盖率 |
| 版本号 | 4 | app.json + package.json + build.gradle 同步 |
| Git/分支 | 4 | 分支对 / 无 WIP / 不动过气分支 |
| 安全 | 3 | keystore / secrets / 旧 gap |
| 服务端烟测 | 4 | health / OTA / chat stream / dashboard |
| 上传/发布 | 3 | APK URL / version.json / OTA runtimeVersion |
| 老板回签 | 2 | weixin 回 / 至少一个功能实测 |
| 变更规范 | 4 | 3 个 CHANGELOG 更新 + brief 拍板理由 |
| 变更语义 | 1 | semver 三段（跟 VERSIONING.md）|

---

## 使用方式

PM 自己跑完一遍，**全 ✅ 才能发版**。

例：

```bash
# A1
cd ~/workspace/xaicd/coolie
pnpm -r typecheck 2>&1 | tee /tmp/preflight-A1.log

# A2
pnpm test 2>&1 | tee /tmp/preflight-A2.log

# A3
pnpm test:e2e 2>&1 | tee /tmp/preflight-A3.log

# A4
pnpm build 2>&1 | tee /tmp/preflight-A4.log

# A5
pnpm --filter clients/expo export --platform android 2>&1 | tee /tmp/preflight-A5.log

# B1-B4
grep version clients/expo/app.json clients/expo/package.json clients/expo/android/app/build.gradle

# C1-C4
git log --oneline -5 && git status --short

# E1-E4
curl -fsS https://xrobinai.cn/api/health
curl -fsS https://xrobinai.cn/ota/manifest | python3 -c 'import json,sys;print(json.load(sys.stdin)["runtimeVersion"])'
# E3: 用 fm91... 写个 node 脚本，签 cookie，POST 看 SSE
# E4: 实际登录链路手动验

# F1-F3
curl -fsSI https://dls.xrobinai.cn/coolie/app/$VER/coolie-release.apk
curl -fsS https://xrobinai.cn/version.json

# G1-G2: 微信回 + 实测
```

跑完贴 PM-LOG-YYYY-MM-DD.md 里。

---

## 升级到老板的一句话

> 老板，发版要 31 项 ⛔ 全过才发。我自己不再「老板说发就立刻发」了，跑完这表我签字再发。

以后 PM 流程 = 派单 + 派单前置 + 派单后置 + 本 checklist + 验收 + 推。**少一个不签字。**