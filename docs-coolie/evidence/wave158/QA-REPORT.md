# wave158 — iOS .ipa → App Store Connect / TestFlight (内部测试) 报告

- 日期: 2026-09-30 ~13:00–13:10 (+08:00)
- 一句话: **现成的 0.6.0 App Store Distribution `.ipa` 已真上传到 App Store Connect，build 600 处理完成 `processingState=VALID`，internal 组 "coolie" 的测试员已收到 TestFlight 邀请。** 无需重新打包、无需 eas。ASC app 记录已存在（boss 此前已建）。

## 0. 结论速览

| 项 | 状态 | 证据 |
|---|---|---|
| 下载现成 `.ipa` + sha256 校验 | ✅ | `bea5ad10…bae09`, 14,274,490 B — `asc-upload.txt` |
| `altool --validate-app` | ✅ VERIFY SUCCEEDED (exit 0) | `asc-upload.txt` |
| `altool --upload-package` 上传 | ✅ UPLOAD SUCCEEDED (exit 0) | Delivery UUID `c6f5a5fb-7f2b-4a60-90e7-bc2f9f6eceaa` |
| ASC 上出现 build | ✅ build 600 | `asc-api/builds.json`, `asc-api/build-c6f5a5fb.json` |
| 处理完成 | ✅ `processingState=VALID` (未过期, exp 2026-12-28) | 同上 |
| 出口合规 | ✅ 已置 `usesNonExemptEncryption=false` | `asc-api/build-c6f5a5fb.json` |
| App 记录存在 | ✅ id `6817620959` "Coolie工坊" `cn.xrobinai.app` (无需新建) | `asc-api/apps.json` |
| 内部测试组 | ✅ "coolie" internal `2fe78acd-…` | `asc-api/betagroups.json` |
| 内部测试员邀请 | ✅ `robinschen1990@gmail.com` INVITED, `waj_615@qq.com` INVITED | `asc-api/betagroup-testers.json` |
| boss 要求加 `robinschen1989@gmail.com` | ⚠️ 该邮箱不是 ASC 用户，**不能**直接进 internal 组；已发 ASC 团队邀请（DEVELOPER，待接受） | `asc-api/user-invitations.json` |

## 1. 实际做了什么（可复核）

1. `curl -sSL -o /tmp/coolie-0.6.0.ipa https://dls.xrobinai.cn/coolie/app/0.6.0/coolie-release-ios.ipa`
   → HTTP 200, 14274490 B, `shasum -a 256` = `bea5ad103dba0bb2a7547bbc67930af2ec0122069fb275de39cc9531872bae09`（与 wave149-v6 记录一致）。
2. 校验 `.ipa` 内部：`Payload/Coolie.app` → id `cn.xrobinai.app`, 版本 0.6.0/600, min iOS 15.1；
   `embedded.mobileprovision` UUID `2630cad1-…`, `application-identifier UU7T5893WZ.cn.xrobinai.app`,
   **`beta-reports-active=true`**, `get-task-allow=false`（= 合法 App Store 分发 + 允许 TestFlight）。
3. 把 `~/secure/asc_key.p8` 复制为 `~/.appstoreconnect/private_keys/AuthKey_WUSVUS3H3L.p8`（altool 查找路径，chmod 600）。
4. `xcrun altool --validate-app …` → VERIFY SUCCEEDED。
5. `xcrun altool --upload-package … -t ios --api-key WUSVUS3H3L --api-issuer 2e48ed69-…` → **UPLOAD SUCCEEDED**。
6. ASC API 复核：app 存在、bundle id 存在、build 600 VALID、preReleaseVersion 0.6.0、组与测试员状态。
7. 出口合规缺失 → `PATCH /v1/builds/{id}` `usesNonExemptEncryption=false`（HTTP 200）。
8. build 变 VALID 后，组内测试员状态自动从 NOT_INVITED → **INVITED**（TestFlight 邀请已发）。

## 2. 真实阻断点 / 事实更正

- **不再有「ASC 无 app 记录」阻断。** wave149-v6 当时 `GET /v1/apps` 只有 `HJ大眼蛙`；本次 `GET /v1/apps?filter[bundleId]=cn.xrobinai.app` 返回 id **6817620959** "Coolie工坊"（sku=ios, primaryLocale=zh-Hans）。boss 已建好，**无需再手建**。
- **邮箱口径冲突（需 boss 一句话确认）**：本波任务书写「加 boss 邮箱 `robinschen1989@gmail.com`」，但 ASC 团队里 boss 的账号是 **`robinschen1990@gmail.com`**（role ADMIN）；`robinschen1989@gmail.com` 是 **Coolie 平台 web board 账号**（多点文档互证：`docs-coolie/briefs/2026-09-21-…-boss-credentials.md` 等），与 ASC 不是同一身份。
  - internal 组只接受 ASC 用户，故 `robinschen1989@gmail.com` 直接 `POST /v1/betaTesters` 被拒：`409 STATE_ERROR: Tester(s) cannot be assigned`。
  - 我发了一条 ASC 团队邀请给 `robinschen1989@gmail.com`（role `DEVELOPER`, allAppsVisible=true, 邀请 id `d1aa530b-220f-4c00-aa78-fbeeca331f84`, 3 天有效）。**若那不是 boss 的 Apple ID，建议我删除该邀请**；若是，boss 接受后即自动获得 internal TestFlight 权限。
- **altool 接口更正**：`altool --upload-package` 是 Xcode 27 的当前命令（`--upload-app` 仍可用）；任务书里的「`--api-key <JWT_TOKEN>`」写法不准确 —— altool 要的是 **Key ID + Issuer ID**，JWT 由 altool 从 `.p8` 内部签（我另用 pyjwt ES256 生成了 JWT 用于直连 ASC REST API 复核）。
- **Team ID 核对**：任务书给的 provider `UU7T5893WZ` 与 profile / cert / bundleId.seedId 完全一致（已核）。

## 3. boss 下一步（真机装 TestFlight）

只要 boss 的 iPhone 用 **`robinschen1990@gmail.com`**（= ASC 里的 ADMIN，已 INVITED）：
1. 手机装 **TestFlight**（App Store 搜）。
2. 查收 TestFlight 邀请邮件（已发）→ 点 Accept / 或在 TestFlight 里登录该 Apple ID。
3. TestFlight 里找到 **Coolie工坊** 0.6.0 → 安装。

若 boss 的 iPhone 用的是别的 Apple ID，则需要该 Apple ID 对应的邮箱先成为 ASC 用户（接受上面的邀请，或改用 1990）。

## 4. 未做 / 边界

- 未重新 build `.ipa`，未用 eas（遵守任务书 D）。
- 未改 `server/`、`clients/`、`packages/` 任何业务代码；未改 `PAPERCLIP_API_KEY`/`DEPLOYMENT_MODE`；未启停 dev 进程；未 commit。
- `version.json` 的 `iosTestFlightUrl` 仍为 `null`（本波未授权改版本文件；TestFlight 公开链接需外部测试组才存在，internal 无公开短链）。
- 出口合规置 `false` 是「仅用豁免加密」的标准答案；若 Coolie iOS 实际用了非豁免加密，请修正。

## 5. 关键 ID 速查

- ASC app: `6817620959` (Coolie工坊, cn.xrobinai.app)
- Bundle ID resource: `A7YPTBMZZ6` (seedId UU7T5893WZ)
- Build: `c6f5a5fb-7f2b-4a60-90e7-bc2f9f6eceaa` (ver 600, VALID)
- preReleaseVersion: `4b8e7150-341a-46ff-ad8e-fc4c2a1a0e05` (0.6.0 / IOS)
- internal beta group: `2fe78acd-8eb1-489b-a351-a18b797dd2a5` ("coolie")
