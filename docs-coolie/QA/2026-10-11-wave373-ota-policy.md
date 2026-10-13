# Wave373 — 收件箱已读/未读「真 bug」修复：runtimeVersion policy fingerprint → appVersion

- 日期: 2026-10-11
- 波次: wave373
- 执行员工: 铁匠贰号 (forge-ii-core-swe) · Core SWE fallback (engine: cmd)
- 仓库: `/Users/mac/workspace/xaicd/coolie` · 分支: main
- 调度: Hermes·Echo (PM 掌柜) · 老板拍板方案 A（改 runtimeVersion policy）

## 1. 真 bug 定性

surface 现象：老板反馈「收件箱已读未读」问题（App 上 P0 修复不生效）。
根因（不是业务代码 bug，是 OTA 运行时对齐 bug）：

| 口径 | 修复前 | 说明 |
| --- | --- | --- |
| app.json 意图 (`runtimeVersion`) | `fingerprint` | wave292 引入，哈希口径被 `fingerprint.config.js` 固定为「原生状态稳定哈希」，跨发版**不变** |
| 装机 APK 内嵌 `EXPO_RUNTIME_VERSION` | `93a7aafcc943650c832b79c1f69cd72a287eaeea` | 即该稳定 fingerprint |
| 生产 `/ota/manifest` `runtimeVersion` | `93a7aafcc943650c832b79c1f69cd72a287eaeea` | 同一 fingerprint |

三处「表面一致」，但正因 fingerprint 跨发版恒定，v0.6.56 的 P0 9 件收件箱修复（wave372）
在 OTA/灰度链路上被老 bundle 阴住 → App 一直跑旧 bundle，**9 件修复根本没生效**。

## 2. 修法（老板拍 A）

`clients/expo/app.json` L28：`runtimeVersion.policy` `fingerprint` → `appVersion`（一行）。

改后 `runtimeVersion` = `expo.version`（版本号口径），每次发版随之变化，新 APK 与新 manifest
天然对齐，彻底消除「下了不装 / 跑旧 bundle」。

- 提交: `3ef445b46` 将 policy 变更纳入版本库（该笔同时含他人 roster 变更，见 §6 单写者说明）
- 文件 diff（唯一改动）:
  ```
  -      "policy": "fingerprint"
  +      "policy": "appVersion"
  ```

## 3. 发版 v0.6.57

命令（老板拍定）:
```sh
bash scripts/release-app.sh 0.6.57 'v0.6.56+改 runtimeVersion policy=appVersion (老板拍修收件箱已读未读 OTA 真生效)'
```

结果:
- 发版 commit: `e6d7232c5` `release: v0.6.57 — v0.6.56+改 runtimeVersion policy=appVersion …`
- APK: `https://dls.xrobinai.cn/coolie/app/0.6.57/coolie-release.apk`
- APK SHA256: `c6b6c743c872260220544aa7a5295ffc17bef626843444b07bf0d2216fa15c61`
- versionCode: 657
- `/version.json`: version 0.6.57, commitSha `e6d7232c59e11c477bc240e66fbf39fce7cd8122`
- gradle `BUILD SUCCESSFUL in 43s`
- git tag: `v0.6.57` → `e6d7232c5`，已推 origin（remote hash `824e289d`）

> 说明：release 脚本 [10/11] server 联动部署的 **web 段健康校验**瞬时返回 `HTTP 000`
> （主服务重启窗口），脚本 `set -e` 因此以 exit 1 收尾，跳过了 [12/12] 打 tag。
> 交完发版产物后**手工补打并推送了 tag**。复检：`https://xrobinai.cn/` = HTTP 200，
> `/api/health` = 200（commit=e6d7232c5），非真实故障。

## 4. 三处运行时版本对齐（核心验收）

发版后 `clients/expo/scripts/runtime-version.mjs --json`:
```json
{ "intent": "0.6.57", "apk": "0.6.57", "resolved": "0.6.57", "source": "apk", "agrees": true }
```

| 口径 | 值 |
| --- | --- |
| app.json 意图 | `0.6.57` |
| 源码 AndroidManifest `EXPO_RUNTIME_VERSION` | `0.6.57` |
| strings.xml `expo_runtime_version` | `0.6.57` |
| 装机 APK 内嵌（aapt2 dump） | `0.6.57` |
| 生产 `/ota/manifest` `runtimeVersion` | `0.6.57` |

`agrees: true` —— 漂移彻底归零，fingerprint 老值 `93a7aafc…` 全部退出。

## 5. 真机验收（emulator-5554，clean install）

装机：卸载旧 `0.6.51` → 安装 `0.6.57`（`versionCode=657`，清缓存排除老 OTA bundle 干扰）。

1. **装机自检屏**（agent-device `open cloud.coolie.app`）
   - APK 版本 `v0.6.57`
   - OTA 热更新 `已启用`
   - **OTA 运行时 `0.6.57`**（= manifest runtimeVersion）
   - 更新源 `已连通`
   - **当前运行 bundle `OTA 下发`** → 证明跑的是新 bundle，不再是老 OTA 包
2. **收件箱 P0-2 未读蓝点**（登录后点顶栏 🔔）
   - 收件箱新 UI（P0 系）在册：Tab `全部 / 与我 (26) / 审批 (0) / 阻塞 (0)`、`搜索收件箱…`、`过滤`、`全读`、`刷新收件箱`、`TODAY / YESTERDAY` 日期分段
   - 首行切换为未读后，**左侧出现 8×8 纯蓝圆点 `#3B82F6`**（P0-2 `unreadDotActive`）
   - 头部计数同步：`xrobinai · 任务 48 · 待办 26 · 未读 1`
   - 验毕已还原为已读（boss 收件箱状态无损）

证据截图（`docs-coolie/QA/wave373/`）:
- `s01-inbox-all-read.png` — 收件箱全读态（P0 新 UI 全貌）
- `s02-inbox-unread-blue-dot.png` — 未读蓝点 `#3B82F6` 真显示 + 未读计数 1

## 6. 过程记录与风险（纪律）

- **单写者告警**: 本仓存在并发写入者（cron `paperclip-runner-bridge` / Hermes 派单）。
  作业期间它连续提交 `3ef445b46` / `981012d51` / `51b620d3c`（roster & toolchain），
  其中 `3ef445b46` 用 `git add` 顺带把本次 app.json policy 变更纳入提交。**未丢改动**，
  但发版窗口内出现并发提交属单写者风险，已在此留痕。
- **脏工作区处理**: release 前置检查要求 tracked 干净。作业前仓内有 18 个**与本任务无关**的
  in-progress 变更（server/scripts 的去遗留 endpoint 清理）。按纪律**未 commit、未 reset**，
  以 `git stash push -- server/ scripts/ wiki/` 暂存，发版后原样 `git stash pop` 还原
  （无冲突）。全程无 `git reset --hard`。
- 未修改任何无关文件的**内容**；本任务唯一生产代码改动即 app.json 一行 policy。

## 7. 复验命令

```sh
# 运行时三处对齐
cd clients/expo && node scripts/runtime-version.mjs --json      # agrees: true, 0.6.57
# 生产 manifest
curl -s https://xrobinai.cn/ota/manifest | grep runtimeVersion  # 0.6.57
# 生产版本/健康
curl -s https://xrobinai.cn/version.json                        # 0.6.57 / 657
curl -s -o /dev/null -w '%{http_code}\n' https://xrobinai.cn/api/health   # 200
# tag
git ls-remote --tags origin refs/tags/v0.6.57
```

## 8. 结论

- 真 bug（OTA 运行时被 fingerprint 阴住）已按老板方案 A 修复并**发版 v0.6.57 真生效**。
- 三处运行时版本 100% 对齐 `0.6.57`，真机自检屏显示 `当前运行 bundle = OTA 下发`。
- 收件箱 P0-2 未读蓝点（`#3B82F6`）在真机**确凿显示**，P0 9 件收件箱修复随新 bundle 落地。
- Model Used: cmd (claude-mm / MiniMax-M3) via 铁匠贰号 forge-ii-core-swe。
