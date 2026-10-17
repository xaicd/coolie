# wave392 — Coolie App v0.6.61 OTA 强制重发与 4 护栏核销报告

> 波次: wave392  
> 执行员工: 铁匠贰号 (forge-ii-core-swe)  
> 底层引擎: cmd  
> 日期: 2026-10-16 (施工落地 2026-10-17)  
> 仓库: /Users/mac/workspace/xaicd/coolie @ main (映射至 /host-workspace/xaicd/coolie)  
> 任务来源: 老板拍 'v0.6.61 OTA runtime 还是 0.6.60' = 真因: version.json + APK 都升到 0.6.61, 但 ota/manifest runtimeVersion 还停在 0.6.60 (launchAsset hash 还是旧 winFwlnGmSm691K6yhOAiyrb7Jm9L3lD = 旧 bundle). 用户 OTA 检查 v0.6.60 != APK 0.6.61 = 拒绝更新! 强制手动执行 `publish-ota.sh android` 重发并核销 4 护栏。  
> 规则遵守: 不调 sub-agent、不 reset --hard、让工做完、4 护栏全绿。

---

## 0. 结论摘要 (一句话)

Coolie App **v0.6.61** 增量 OTA Bundle 已通过 `publish-ota.sh --4-guard android` 强制重新编译打包并全量推送到生产服务器 (`tc-coolie-claw`)；**远端 `ota/manifest` 运行时版本已严格确立为 `0.6.61`，新 launchAsset hash 为 `FwPXgi5UiIw0K_fzBwRqjLfP30yeQ2VmPZM7GlqBd_s`（彻底替代旧 hash `winFwlnGmSm691K6yhOAiyrb7Jm9L3lDUWvkUPV56Wk`），4 护栏全绿通过**。

- 线上 Manifest 地址: `https://xrobinai.cn/ota/manifest`
- 目标运行时版本: `0.6.61`
- 新 Bundle Hash: `FwPXgi5UiIw0K_fzBwRqjLfP30yeQ2VmPZM7GlqBd_s`
- 旧 Bundle Hash: `winFwlnGmSm691K6yhOAiyrb7Jm9L3lDUWvkUPV56Wk` (已作废)
- 4 护栏证据目录: `docs-coolie/evidence/wave392/` (全绿通过)

---

## 1. 真因复核与链路排查

### 1.1 `release-app.sh` 步骤与 OTA 触发关系
排查 `scripts/release-app.sh`：
- `step [9/9]`：调用 `cd clients/expo && bash scripts/publish-ota.sh android`，负责导出 JS Bundle 并上传 manifest；
- `step [10/11]`：调用 `scripts/deploy-tc-coolie-claw.sh --skip-build`，增量同步服务端并重启系统服务；
- `step [11/11]`：执行 `ad_guard_4` 拨测 4 护栏（验证 version.json, ota/manifest, APK HEAD, api/health）。

### 1.2 为什么此前会出现 `0.6.60` 与旧 hash `winFwlnGmSm6`
1. **后续单点提交重推覆盖**：在 wave391 发版（commit `1fb55f362b`）后，`018857a5c` 于 00:16 提交，随后通过单独的 OTA 动作生成了旧 bundle hash `winFwlnGmSm691K6yhOAiyrb7Jm9L3lDUWvkUPV56Wk`。
2. **服务端向后兼容与 IP 记忆机制 (`server/src/routes/ota-manifest.ts`)**：
   - 生产路由具备 `needsBackwardCompat` 策略：当老版本客户端（以 0.6.60 APK 运行）发起检查请求时，服务端为了防止旧原生层崩溃，会按客户端申报的 runtimeVersion 动态回写响应中的 `runtimeVersion: "0.6.60"`；
   - 并且通过 `clientMemory` 对该客户端 IP 进行了短时记忆。
   - 结果导致用户安装 0.6.61 APK 后，若本地或代理 IP 仍命中了先前的回写缓存，或者远端磁盘上的 bundle 仍滞留在 `winFwlnGmSm6`，用户客户端在比对 `v0.6.60 != APK 0.6.61` 时即判定不匹配并拒绝应用更新。

---

## 2. 实施记录：强制重发 OTA Bundle

通过宿主机执行标准增量发布命令：
```bash
AUTO_DEPLOY_EVIDENCE_DIR=/Users/mac/workspace/xaicd/coolie/docs-coolie/evidence/wave392 \
SSH_TARGET=tc-coolie-claw \
  bash scripts/publish-ota.sh --4-guard android
```

### 执行关键节点：
1. **Metro Bundler 构建**：
   - 平台: `android`
   - 模块数: 1331 modules (耗时 3283ms)
   - 产物: `_expo/static/js/android/index-9b9a3b5591c681e81a0a3b44f24a831a.hbc` (5.68 MB)
2. **安全守卫检查**：
   - 扫描 bundle 确认绑定生产域名 `xrobinai.cn`，通过 wave386/wave402 安全隔离。
3. **Manifest 生成与版本提取**：
   - `runtime-version.mjs` 解析确认: `runtimeVersion = 0.6.61`
   - 生成 `dist/manifest.android.json` 与 `dist/manifest`
   - 计算得到最新 LaunchAsset Hash: `FwPXgi5UiIw0K_fzBwRqjLfP30yeQ2VmPZM7GlqBd_s`
4. **增量同步至生产**：
   - 同步至 `tc-coolie-claw:/opt/coolie/ui/ota/`
   - 自动更新并校验远端 `version.json` (`commitSha: 20c6ce919a9f81dcc62490cc6d77c030569fd2ac`)
5. **远端即时生效验证**：
   - 远端 manifest 确认就绪，ID: `74d7fd6a-e750-4168-a8b5-6e856209b440`，runtimeVersion: `0.6.61`。

---

## 3. 4 护栏全绿验收证据对比

| 护栏项 | 检验目标地址 | 期望值 | 生产实测真值 | 判定 |
|---|---|---|---|---|
| **1. version.json** | `https://xrobinai.cn/version.json` | `version: 0.6.61`, `versionCode: 661` | `version: 0.6.61`, `versionCode: 661`, `commitSha: 20c6ce919a...` | ✅ PASS |
| **2. ota/manifest** | `https://xrobinai.cn/ota/manifest` | `runtimeVersion: 0.6.61`, hash != `winFwlnGmSm6...` | `runtimeVersion: 0.6.61`, hash: `FwPXgi5UiIw0K_fzBwRqjLfP30yeQ2VmPZM7GlqBd_s` | ✅ PASS |
| **3. APK HEAD 直链** | `https://dls.xrobinai.cn/coolie/app/0.6.61/coolie-release.apk` | HTTP 200, Content-Length 匹配 | HTTP 200, `81,282,582` 字节 | ✅ PASS |
| **4. api/health** | `https://xrobinai.cn/api/health` | HTTP 200, `status: "ok"` | HTTP 200, `status: "ok"` | ✅ PASS |

### LaunchAsset Hash 明确比对
- **旧 Hash（失效）**: `winFwlnGmSm691K6yhOAiyrb7Jm9L3lDUWvkUPV56Wk`
- **新 Hash（已上线）**: `FwPXgi5UiIw0K_fzBwRqjLfP30yeQ2VmPZM7GlqBd_s`
- **Hash 变更断言**: `launchAsset.hash !== oldHash` ➜ **TRUE (已变更)**

---

## 4. 交付凭据索引

所有测试证据已固化落盘在 `docs-coolie/evidence/wave392/`：
- `docs-coolie/evidence/wave392/ota-manifest.json`：生产更新源 manifest 证据
- `docs-coolie/evidence/wave392/version.json`：生产版本清单证据
- `docs-coolie/evidence/wave392/apk-headers.txt`：COS 安装包 HEAD 响应头证据
- `docs-coolie/evidence/wave392/api-health.json`：服务端健康状态证据
- `version.json`：根目录版本清单镜像同步更新
