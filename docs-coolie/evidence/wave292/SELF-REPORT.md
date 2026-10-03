# wave292 SELF-REPORT — runtimeVersion 政策 appVersion → fingerprint

- 员工: 铁匠贰号 (forge-ii-core-swe)
- 日期: 2026-10-04 (UTC 17:0x 收尾)
- 状态: **C-1 DONE / C-2 DONE(带 1 项环境偏离) / C-3 BLOCKED (未发版, 未动生产)**
- 发版 commit: a8e7d868e (`feat(expo): wave292 — runtimeVersion 政策 appVersion→fingerprint`)
- tag: **无** (v0.6.26 未打未推 — C-3 未执行)

---

## C-1 政策改动 — DONE

`clients/expo/app.json` `expo.runtimeVersion.policy`: `"appVersion"` → `"fingerprint"`,
单行 diff, 已按派单规则 5 单独 commit (a8e7d868e, 未 push)。
完整 diff: `c1-policy-commit.diff`。

四版本源保持 0.6.25 / versionCode 625 未动 (bump 属 C-3 发版行为, C-3 未跑):
app.json.version / app.json.android.versionCode / package.json.version / build.gradle versionName+versionCode。

## C-2 expo-updates fingerprint 兼容验证 — DONE (1 项环境偏离如实记录)

SDK 支持证据 (全部来自本仓 node_modules, 非memory):
- expo-updates 0.27.5 CLI 自带 `fingerprint:generate` 与 `runtimeversion:resolve`
  (`node_modules/expo-updates/bin/cli.js --help` 实测)。
- `@expo/config-plugins/build/utils/Updates.js`: `runtimeVersion.policy === 'fingerprint'`
  返回哨兵 `file:fingerprint`, 由原生侧读取 (android `UpdatesConfiguration.kt`:
  读 `assets/fingerprint` 文件内容作为 runtimeVersion)。
- `@expo/fingerprint 0.11.11` 在本仓可计算、确定性成立、110 个哈希源。
  实证: `fingerprint-verification.md`。

**关键发现 (对 wave292 目标是决定性的)**: 版本字段默认**参与**哈希
(实证 A 口径哈希源含 "0.6.25", B 口径加 `SourceSkips.ExpoConfigVersions` 后消失,
A≠B)。即 stock 指纹口径下每次发版 bump 版本号都会改 runtimeVersion,
「OTA 跨 minor 自动拉」的目标落空。正确口径必须 skip 版本字段 +
ignore 本地 android//ios 构建目录 → 见 `proposed-wave292-toolchain.patch`
里的 `clients/expo/fingerprint.config.js`。另: fingerprint 哈希源不含应用 JS
源码 (Sourcer.js), 纯 JS OTA 不改 runtime, 符合政策语义。

`npx expo install expo-updates` — **报错, 属本地环境问题, 非兼容性问题** (偏离如实记录):
`ERR_PNPM_UNEXPECTED_STORE` — 本仓 node_modules 由 store v11 的 pnpm 链接,
expo spawn 的 pnpm 12.4.2 要用 store v3, 在做任何包解析之前就退出 (零文件改动,
package.json / pnpm-lock.yaml 均未动, 有 git 佐证)。语义兼容性用等价只读检查证明:
- `npx expo install --check`: **expo-updates 不在 mismatch 清单** (仅 react-native
  0.76.5→0.76.9 与 react-native-webview 14.0.1→13.12.5 两条存量漂移, HEAD 上就有,
  与本 wave 无关);
- expo 自己把 SDK 52 的目标版本解析为 `expo-updates@~0.27.5` = 已装版本 (幂等 add)。
日志: `expo-install-expo-updates.log` / `expo-install-check.log`。

修复环境 (改用与 store v11 匹配的 pnpm 重装依赖) 属全仓依赖重装, 超出本 wave 白名单, 未做。

## C-3 发 v0.6.26 — BLOCKED (未执行, 无任何占位 PASS)

`release-app.sh 0.6.26 ... --with-server-deploy --with-4-guard` **没有跑**。
两个独立阻塞, 任何一个都足以让发版失败:

**B1 (致命, 需白名单外文件改动)**: 仓内 runtime 口径单一来源
`clients/expo/scripts/runtime-version.mjs` 的 `resolveIntent()` 对
fingerprint 政策**显式 throw** (`不支持的 expo.runtimeVersion.policy: fingerprint`,
exit 1 实录: `runtime-version-blocker.log`)。四个消费方全部经它取值, 全部连带失败:
- `release-app.sh` step [5/9] (`EXPECTED_RUNTIME=$(... --app-json)`)
- `clients/expo/scripts/fix-android-manifest.sh` (line 22) — 且 [5/9] 在 gradle 之前,
  失败即中止, 不会出包
- `clients/expo/scripts/publish-ota.sh` (line 60) — OTA 发布通道同样不可用
- `clients/expo/scripts/verify-ota-runtime-consistency.mjs` (import resolveIntent)

改动本身很小 (runtime-version.mjs 加一个 fingerprint 分支 +
fingerprint.config.js 新文件 + verify 脚本一小段), **完整可 apply 的补丁已备好并验证**:
`proposed-wave292-toolchain.patch` (`git apply --check` OK, 语法 check OK, 核心调用
`fingerprint:generate` 实测 exit 0)。**但我收到的派单硬规则白名单不含这三个
clients/expo/scripts 文件** (硬规则 1 "违反即事故", 硬规则 4 "不动 scripts 逻辑"),
所以停手。

**白名单冲突, 需 PM 裁决**: 现场派工回执
`.coolie-local/dispatch/20261004-004750-wave292-forge-ii.json` 的 whitelist **确实包含**
`clients/expo/scripts/{runtime-version.mjs, fix-android-manifest.sh,
verify-ota-runtime-consistency.mjs}`, 且其 C-2 scope 写明「仓库 runtime-version
工具链最小适配」; 但我实际收到的派单消息白名单**不含**它们。两者同出 PM 之手的
记录冲突, 我按「收到的硬规则从严执行」处理: 未改任何白名单外文件。
若 PM 确认以回执 whitelist 为准, 补一句确认即可, 下轮按现成补丁 apply →
发版 0.6.26 → 4 护栏 → tag push, 一次跑完。

**B2 (阻塞任何发版预检)**: `release-app.sh` step [1/9] 要求全仓 tracked 无改动。
派单时刻工作区有并行在制 (`ui/src/components/IssuesList.tsx` 等), 派单规则 2 禁止我
碰/暂存/还原。注: 现场回执显示 PM 开了 `wave292-release-window` stash 窗口
(`git stash list` stash@{0} 在案), 该窗口与我的消息规则也不同 — 一并归入上面的裁决。
发版窗口期内该树仍非净 (OntologyDomainListScreen.tsx 等 wave293 在制文件持续出现),
[1/9] 会先于 B1 失败。

## 4 护栏 / tag / 生产 — NOT RUN (如实)

- 4 护栏 (version.json / ota manifest / apk-head / api health): **未跑** (发版未执行)。
- tag v0.6.26: 未打未推; 未 push 任何 branch / main。
- 生产状态 (发版窗口结束时实测, `production-state-untouched.txt`):
  version.json = 0.6.25 (commitSha 017a4ef5...), /ota/manifest runtimeVersion =
  "0.6.25" (旧 appVersion 口径), /api/health ok — **生产零改动**。
- G2 `pnpm -r typecheck`: **0 errors** (exit 0; 首跑 packages/db 报 tsx IPC EINVAL
  为沙盒 TMPDIR 环境问题, 按预案换 TMPDIR 重跑通过) — `typecheck.log`。

## 给下一轮的执行单 (PM 确认白名单后, 预计一次跑完)

1. `git apply docs-coolie/evidence/wave292/proposed-wave292-toolchain.patch`
   (新增 `clients/expo/fingerprint.config.js` + 改 `clients/expo/scripts/runtime-version.mjs`
   + 改 `clients/expo/scripts/verify-ota-runtime-consistency.mjs`), commit。
2. 冒烟: `node clients/expo/scripts/runtime-version.mjs --app-json` → 应输出 40 位 hex;
   同一版本号下跑两次哈希不变; 临时把 app.json.version 改成 9.9.9 再跑哈希**不变**
   (证明跨版本稳定), 还原。
3. 确认发版窗口 (树净), `AUTO_DEPLOY_EVIDENCE_DIR=$PWD/docs-coolie/evidence/wave292
   bash scripts/release-app.sh 0.6.26 "<发版说明>" --with-server-deploy --with-4-guard`。
4. 验收: 4 护栏全 PASS; `https://xrobinai.cn/ota/manifest` runtimeVersion = 40 位 hex
   (≠"0.6.26"); `node clients/expo/scripts/runtime-version.mjs --apk` == manifest 值;
   tag v0.6.26 推 origin (E.3 唯一授权)。

## 证据索引

| 文件 | 内容 |
|---|---|
| c1-policy-commit.diff | C-1 单行政策改动 (a8e7d868e) |
| runtime-version-blocker.log | B1 确定性失败实录 (exit 1) |
| fingerprint-verification.md | C-2 哈希机制实证 (版本字段默认参与哈希的证明) |
| fingerprint-generate-stock-skips.json | `fingerprint:generate` exit 0 实录 (stock 口径 hash) |
| expo-install-expo-updates.log | `npx expo install expo-updates` 的 ERR_PNPM_UNEXPECTED_STORE (环境) |
| expo-install-check.log | `npx expo install --check` (expo-updates 无 mismatch) |
| proposed-wave292-toolchain.patch | 备好的最小适配补丁 (git apply --check OK) |
| production-state-untouched.txt | 生产 0.6.25 零改动证明 |
| typecheck.log | G2 通过实录 |
