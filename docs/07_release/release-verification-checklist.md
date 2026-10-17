# Coolie AI 原生商业软件交付工厂控制面平台 · 投产上线发布走查清单 (Release Verification Checklist)

> **文档代号**: COOA-CHECKLIST (rev.2)  
> **适用基线**: v0.6.61 (versionCode 661)  
> **制定日期**: 2026-10-17 (rev.2 实测复核 2026-10-18)  
> **归属规范**: CMMI 07_release (TRANS) / .agents/skills/cmmi-immutable-release  
> **机检凭证**: `docs/07_release/artifact-fingerprints.json` (逐件 sha256 实测对账)

---

## 0. 勾选纪律 (Tick Honestly)

`[x]` 只代表**本清单声明人已在本基线实测通过并留有命令输出**；未实测项一律保留 `[ ]` 并附复跑命令。
禁止把"应当通过"写成 `[x]` —— 假勾选会直接摧毁 G5 投产门禁的信用（本文件 rev.1 即因此返工）。

---

## 1. 投产前硬门禁走查项 (Pre-Flight Gates)

- [x] **7 处版本源一致**: `bash scripts/VERSION-CONSISTENCY-CHECK.sh` → 实测 **7/7 PASS = 0.6.61 / versionCode 661**（2026-10-18 02:02 CST，含 app.json / package.json / build.gradle / CHANGELOG / 远端 version.json / 远端 OTA manifest / git tag v0.6.61）；
- [x] **制品不可变指纹对账**: `docs/07_release/artifact-fingerprints.json` → Android APK 本地 sha256 `6fdbbce3…76d7` 与 `version.json.apkSha256` 逐位一致；OTA launch asset 下载后 sha256(base64) `6bv8dYUe…oL8NE` 与 `ota/manifest.hash` 一致；
- [ ] **0 代码脏污**: `git status --porcelain` 必须为空（发布 commit 前复跑；共享工作区并发心跳期间会短暂非空，以发布快照时刻为准）；
- [ ] **增量编译 0 报错**: `pnpm -r typecheck`（发布前复跑，需把输出贴入工单）；
- [ ] **Pre-Commit 门禁全绿**: `node scripts/pre-commit-check.mjs` 期望 25/25 PASS；
- [ ] **活体本体形式化证明**: `node scripts/harness-ontology-audit.mjs` 期望 4 门禁 + 5 不变量全 PASS；
- [ ] **CMMI 资产反向穿透对账**: `pnpm cmmi:reverse-audit` 期望 33 处物理路径全部存在且可达。
- [ ] **iOS 分发字段死链/契约机检**: `pnpm check:ios-links`（`node scripts/check-ios-distribution-links.mjs`）→ 若 `version.json` 声明了 `ios*` 下载字段则对应 URL 必须 200/206，且不得残留 App 端不消费的嵌套 `ios` 对象（COOA-470 守卫；`scripts/release-ios-cos.sh --register` 已内置调用）。

---

## 2. 生产发布与割接复核 (Deployment Verification)

- [ ] **制品同步完成**: Rsync 排除 `data/`、`node_modules`、`dist/version.json`，服务端软链接建立完毕；
- [ ] **服务状态存活**: `ssh tc-coolie-claw 'systemctl is-active coolie.service'` == `active`；
- [x] **控制面 API 健康探测**: `curl -s https://xrobinai.cn/api/health` → 实测 `{"status":"ok","deploymentMode":"authenticated","commit":"1fb55f362b478f4b45eb8ddc763313c5d6ed17a5","databaseBackup":{"enabled":true,"status":"ok"}}`（2026-10-18 02:03 CST）；
- [x] **移动端 OTA 版本核实**: `curl -s https://xrobinai.cn/ota/manifest` → `runtimeVersion=0.6.61`，launch asset 哈希与字节数实测一致（5680950 bytes）；
- [ ] **Android 下载链路**: `curl -sI https://dls.xrobinai.cn/coolie/app/0.6.61/coolie-release.apk` == 200 且 `Content-Length` == 81282582（实测 200 / 81282582，待发布后复核 Last-Modified 推进）；
- [x] **iOS 下载链路（COOA-468 已清零 404 声明）**: 旧 `version.json.iosDownloadUrl`（`…/0.6.2/coolie-release-ios.ipa`）实测 **HTTP 404** —— 已于 2026-10-18 02:08 CST 从生产 `https://xrobinai.cn/version.json` 与仓库根 `version.json` **移除** `iosDownloadUrl`/`iosSha256`，`iosTestFlightUrl` 保持 `null`。App 端按「暂无 iOS 包」兜底隐藏下载按钮。**iOS 仍无可达制品，禁止对外宣称双端可下载**；待 Apple 签名窗口重出 0.6.61 IPA 后回填并复核。

---

## 3. 复核结论 (Verdict 2026-10-18 02:08 CST · COOA-468 修复后)

| 通道 | 结论 | 依据 |
|---|---|---|
| Android APK | PASS | 本地 sha256 == 线上声明，远端 200 + 字节数一致 |
| Android OTA | PASS | launch asset 哈希与 manifest 逐位一致 |
| 7 处版本源 | PASS | 7/7 = 0.6.61 / 661 |
| 控制面生产 | PASS | health ok，DB 备份 ok |
| iOS 分发 | **REMEDIATED** | COOA-468 清除指向 404 的残留声明；暂无可达制品属诚实空态。COOA-470 统一 `release-ios-cos.sh --register` 与 App 的 `version.json` 契约（顶层扁平 `ios*` 字段），并内置死链/契约机检守卫 `scripts/check-ios-distribution-links.mjs` |

结论：Android 侧 G5 指纹链完整可信；iOS 侧历史残留死链声明已由 COOA-468 清除（生产与仓库 `version.json` 现均无 `iosDownloadUrl`/`iosSha256`，`iosTestFlightUrl=null`）。iOS 暂无对外可用制品属诚实空态，**不得据此宣称 iOS 交付完成**，待 Apple 签名窗口重出包后回填复核。
