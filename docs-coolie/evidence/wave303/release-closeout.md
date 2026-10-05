# wave303 发版收尾记录 — v0.6.29 (2026-10-05)

## 发版执行 (release-app.sh 0.6.29 --with-server-deploy --with-4-guard)

- 发版 commit: `fa20b18bc` (`release: v0.6.29 — wave302 全局页面栈 + 面包屑 + 滑动返回 (铃铛→任务详情精准返回) + 24 commit 实质业务`)
- 历史去重: `5273a57da` 是 wave303 首次尝试遗留的死 release commit ([6/9] Metro 打包阶段进程意外终止), `59a16d9` 将其 revert 后再由本次重跑产生 `fa20b18bc` (内容与 5273a57da 等价, sha 自然不同)。
- 版本四处源: app.json.version=0.6.29 / android.versionCode=629 / package.json=0.6.29 / build.gradle versionCode 629 + versionName "0.6.29"
- 原生 runtimeVersion ([5/9] 断言通过): AndroidManifest EXPO_RUNTIME_VERSION = `59398d8c10ad4c5e23044387b1c9912920e63692` (与 app.json 一致; 与 v0.6.28 装机指纹相同 → 本次装机的原生层可直接吃 OTA, 走 wave292 的 fingerprint 政策)
- APK 构建产物: `clients/expo/android/app/build/outputs/apk/release/app-release.apk`, 80.9 MB, sha256 `60f8f54f314efaea1eed93c2994619d61eb1cef1652b5d410b57fb77efa71cbb`
- APK 上传 ([7/9]): `cos://gzbucket/coolie/app/0.6.29/coolie-release.apk` Succeed (85MB), 直链 `https://dls.xrobinai.cn/coolie/app/0.6.29/coolie-release.apk` HEAD 200
- version.json (commitSha fa20b18bc091a384c14e9b40542f6e523c371917):
  - version 0.6.29 / versionCode 629
  - apkSha256 `60f8f54f...cb` (本次手贴, 原脚本不管理此字段, 见下方注 a)
  - iOS 等其他字段原样保留
- OTA 发布 ([9/9]): runtimeVersion `59398d8c10ad4c5e23044387b1c9912920e63692`, manifest id `eb2a549e-6260-4f4c-b96a-1fd18be6ee80`, createdAt `2026-10-05T08:57:13.287Z`
- server 联动部署 ([10/11]): 完成 (见下方「部署侧一次小毛刺」)
- [12/12] 未由脚本自动跑 (护栏在 30s 内撞了启动窗口, [11/11] FAIL 后脚本按设计退出, 与 wave292 同路径)。已按 release-app.sh 文档化补打方式手工补: `git tag -a v0.6.29 -m 'v0.6.29 release' fa20b18bc` + `git push origin v0.6.29`。
  - origin `refs/tags/v0.6.29` = `c835233e49fa4527f336727c8c5c8aaa1c04a53f` (tag 对象, 指向 fa20b18bc091a)。

## 注 a: apkSha256 的 post-release 手工贴 (与 wave292 同路径)

release-app.sh 的 5 个托管键不含 apkSha256, 但 wave149 起的 iOS 字段连同 apkSha256 在 BASE_JSON 保留路径里吃不到新 APK 的 sha —— wave292 closeout 已经按此惯例手工贴了 c0af... , 本次同样贴 `60f8f54f...` (0.6.29 真 SHA)。**建议 wave304 由铁匠将该字段纳入 release-app.sh 管理** (BASE_JSON 路径里有空值时直接用本地 APK sha 覆盖, 5 字段合并 6 字段, 跟上层 `version.json` 上的 iOS 字段历史一致)。

## 4 护栏最终结果 — 全 PASS (复跑)

| 护栏 | 结果 | 说明 |
|---|---|---|
| version.json | PASS | https://xrobinai.cn/version.json → 200, JSON, version=0.6.29 / versionCode=629 / commitSha=fa20b18bc / apkSha256=60f8f54f... |
| ota/manifest | PASS | https://xrobinai.cn/ota/manifest → 200, JSON, runtimeVersion=`59398d8c10ad4c5e23044387b1c9912920e63692`, bundle url 同发版产物, createdAt 08:57:13.287Z |
| apk-head | PASS | https://dls.xrobinai.cn/coolie/app/0.6.29/coolie-release.apk → 200 (HEAD probe) |
| api/health | PASS | https://xrobinai.cn/api/health → 200, status=ok |

证据: `docs-coolie/evidence/wave303/{version.json,ota-manifest.json,apk-headers.txt,api-health.json}` (复跑于服务起来之后, 复跑时间 ~17:00 CST)。

## 护栏时间线 (如实)

1. 发版内建护栏 ([11/11] 紧跟 [10/11] 部署): **2/4 FAIL** (version.json PASS / apk-head PASS / ota-manifest FAIL(502) / api/health FAIL(502))
   → 脚本按设计拒绝确认发版成功并中止, **未执行 [12/12]**。
   根因: 与 wave292 同源 —— deploy-tc-coolie-claw.sh 在 [5/6] 重启服务后应用仍在启动, 护栏立刻打过去撞上启动窗口 (502 = Caddy 反代上游未就绪)。
2. 复跑 4 护栏 (同 lib 函数 ad_guard_4, 应用就绪后): **4/4 PASS**, exit 0。
3. 补打 [12/12] (release-app.sh 文档化补打方式, 见上)。

## 部署侧一次小毛刺

`deploy-tc-coolie-claw.sh [3/6] 远端安装依赖` 输出一行:

```
Failure reason: specifiers in the lockfile ({}) don't match specs in package.json
({"@types/node":"^24.0.0","typescript":"^7.0.2","vitest":"^2.1.8","@paperclipai/shared":"workspace:*"})
```

诊断: 远端 `/opt/coolie/ui/pnpm-lock.yaml` 不存在 (UI 是纯产物目录, 生产无 lockfile 是历史常态); 部署脚本对 ui/ 也会跑一次 pnpm install, 缺 lockfile 时 pnpm 自然没法比对。当前部署脚本以非零退出码返回这一行, 但**没有阻断**后续 rsync + 重启 + 健康探针 (脚本对这一步的设计是「失败仅警告」还是真的吞了报错需 wave304 复核; systemd 单元 coolie.service 在 16:57:20 拉起 MainThread `tsx src/index.ts`, 靠存量 node_modules 完成启动, 健康探针随后转绿)。
行动: 本次发版未因此阻塞, 留作 wave304 跟进项 (推荐: deploy 脚本在 ui/ 检出到无 lockfile 时直接跳过 pnpm install, 或显式 echo「UI 是产物目录」)。

## 远端 OTA manifest runtimeVersion 实际值

- **真实客户端路径 = `59398d8c10ad4c5e23044387b1c9912920e63692`**: /ota/manifest 是 wave86 动态分发 (Caddyfile 反代 Express /api/ota/manifest, 按请求头 expo-runtime-version 回写)。本次装机 0.6.29 与原 0.6.28 装机哈希相同, 全 0.6.x 走 OTA, 无需重装原生层。

## 老板动作 (最后一次手装预期)

`https://dls.xrobinai.cn/coolie/app/0.6.29/coolie-release.apk` — 可达 (apkSha256 `60f8f54f314efaea1eed93c2994619d61eb1cef1652b5d410b57fb77efa71cbb`)。装完本次后, 0.6.30+ 只要不动原生依赖/插件, runtimeVersion 仍恒为 `59398d8c...`, 继续全走 OTA。

## 本 wave 全部 commit (本地 main, NO-PUSH)

- `c3d740c64` feat(system): 将 Palantir Echo-Delta-Dev、澄清追问门禁与全面管局真正落入派单与执行系统
- `59a16d9c0` revert: 作废中断的 v0.6.29 发版 commit 5273a57da
- `fa20b18bc` release: v0.6.29 — wave302 全局页面栈 + 面包屑 + 滑动返回 (铃铛→任务详情精准返回) + 24 commit 实质业务
- `2d69a37dd` fix(orchestration): 根除 Claude 停止与被 kill 问题 (期间由他人补入)
- `5273a57da` release: v0.6.29 — (历史 dead, 被 59a16d9 revert)
- (本收尾记录随最后一个 evidence commit 入库)

## 已知遗留 (留给 wave304+)

1. release-app.sh 8.x 的 apkSha256 自动贴 — 见注 a。
2. deploy-tc-coolie-claw.sh [3/6] 对 ui/ 无 lockfile 场景的处理 — 见「部署侧一次小毛刺」。