# wave292 发版收尾记录 — v0.6.26 (2026-10-04)

## 发版执行 (release-app.sh 0.6.26 --with-server-deploy --with-4-guard)

- 发版 commit: `56b93f92dcd7e907b292a1ebcded05f64b2f544e` (`release: v0.6.26 — runtimeVersion 政策 appVersion→fingerprint, 一次安装后 v0.6.x 全走 OTA`)
- 版本四处源: app.json.version=0.6.26 / android.versionCode=626 / package.json=0.6.26 / build.gradle versionCode 626 + versionName "0.6.26"
- 原生 runtimeVersion ([5/9] 断言通过): AndroidManifest EXPO_RUNTIME_VERSION = `59398d8c10ad4c5e23044387b1c9912920e63692`, strings.xml 同步
- OTA 发布 ([9/9]): runtimeVersion = `59398d8c10ad4c5e23044387b1c9912920e63692`, rsync 31 文件, [4/4] 远端校验一致
  (manifest id 4b468561-899e-4b82-a00e-f1ac1fa504dd, createdAt 2026-10-03T17:21:41.029Z)
- version.json (commitSha 56b93f92dcd7…): version 0.6.26 / versionCode 626
- server 联动部署 ([10/11]): 完成, 部署后健康探针为空 (应用尚在启动)

## 护栏时间线 (如实)

1. 发版内建护栏 ([11/11]): **version.json PASS / apk-head PASS / ota/manifest FAIL(502) / api/health FAIL(502)**
   → 脚本按设计拒绝确认发版成功并中止, **未执行 [12/12]**。
   根因: [10/11] 部署 systemctl restart 后应用仍在启动, 护栏立刻打过去撞上启动窗口
   (502 = Caddy 反代上游未就绪; 证据为当时的 api-health.json / ota-manifest.json, 现已被复跑 PASS 版覆盖, 502 实录见 release-app-run.log)。
2. 复跑 4 护栏 (同 lib 函数 ad_guard_4, 应用就绪后): **4/4 PASS**, exit 0。
3. 补打 [12/12] (release-app.sh 文档化补打方式): `git tag -a v0.6.26 -m "v0.6.26 release" 56b93f92d` + `git push origin v0.6.26`
   → origin `refs/tags/v0.6.26` = 23bf7fb0f1ce96c31b4aee6369eb96aa826a95c3 (tag 对象, 指向 56b93f92d)。

## 4 护栏最终结果 — 全 PASS

| 护栏 | 结果 | 说明 |
|---|---|---|
| version.json | PASS | version 0.6.26 / versionCode 626 / commitSha 56b93f92d… |
| ota/manifest | PASS | 200 + JSON (runtimeVersion 键在; 见下方动态分发说明) |
| apk-head | PASS | https://dls.xrobinai.cn/coolie/app/0.6.26/coolie-release.apk → 200 (206 range 探测, application/vnd.android.package-archive) |
| api/health | PASS | status ok |

## 远端 OTA manifest runtimeVersion 实际值

- **真实客户端路径 = `59398d8c10ad4c5e23044387b1c9912920e63692`**:
  /ota/manifest 是 wave86 动态分发 (Caddyfile: 反代 Express /api/ota/manifest, 按请求头
  `expo-runtime-version` 回写)。带 0.6.26 装机将发送的内嵌 runtime 头实测返回
  runtimeVersion=59398d8c…, bundle 同发版产物, createdAt 与磁盘 manifest 一致
  (ota-manifest-dynamic-dispatch.txt)。
- 裸 curl (无头) fallback 返回 runtimeVersion "0.6.26" — wave86 防搁浅策略对未匹配
  版本回显客户端版本, 本次未改 (服务器磁盘文件始终是哈希版, mtime 01:21:41 +0800)。

## 老板动作 (最后一次手装)

https://dls.xrobinai.cn/coolie/app/0.6.26/coolie-release.apk — 可达 (apkSha256
c0af1ab730b2515111eacf845be654e9fb2f647ff81adee651ba618c74087478)。装完本次后,
v0.6.27+ 只要不动原生依赖/插件, runtimeVersion 恒为 59398d8c…, 全走 OTA。

## 本 wave 全部 commit

- a8e7d868e feat(expo): wave292 — runtimeVersion 政策 appVersion→fingerprint
- 05beacd3b build(expo): wave292 — release 工具链支持 fingerprint 政策
- 53c1b926d docs(evidence): 工具链适配预验证
- 56b93f92d release: v0.6.26 (tag v0.6.26 → origin)
- ae1d4577f docs(evidence): 自述报告与阻塞证据
- (本收尾记录随最后一个 evidence commit 入库)
