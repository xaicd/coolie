# wave262 QA Report — 集成 wave258 + wave261 + bump 0.6.19 + 发版

> Date: 2026-10-01 · Owner: robin ai · Branch: main
> Bump: 0.6.17 → 0.6.19 (versionCode 617 → 619)
> 发版 commit: `37e6b3d77ebdd519957e56de1cf0f88bb66cc4b0`

## 0. 老板原话

> "发"

## 0.1 集成策略 (老板选 A)

- push wave258 commit (派活精准 + 删 13 + 30 CMMI 技能)
- push wave261 commit (3 commits: b448619 + fb525b9 + 0d3ee6e)
- bump 0.6.17 → 0.6.19 (跳 0.6.18 避并发)
- versionCode 617 → 619
- release 5 步 (fix-android-manifest / gradle / coscli / scp / publish-ota)
- 4 护栏验证

## A. wave258 提交 (1 commit)

| 提交 | commit | 内容 |
|------|--------|------|
| `37e6b3d77` | feat(dispatch-skill-matcher) | 派活精准 (15 文件, +1153 / -1 行) |

### A.1 wave258 文件清单 (10 文件)

| 文件 | 类型 | 说明 |
|------|------|------|
| `packages/db/src/migrations/9022_delete_13_digital_employees.sql` | 新增 | 删 13 数字员工 (6 QA + 7 Ops) by name (跨公司) |
| `packages/db/src/migrations/meta/_journal.json` | 改 | 去 wave256 draft 的 9022_add_agent_tools entry, 9023_delete_13 → 9022_delete_13 (tools 已在 9021) |
| `server/src/services/dispatch-skill-matcher.ts` | 新增 | 派活精准 (parseSkillInput + matchAgentsBySkills + topMatchForSkill + 30 CMMI_SKILLS) |
| `server/src/services/__tests__/dispatch-skill-matcher.test.ts` | 新增 | 10 unit test (parseSkillInput 3 + 评分逻辑 7, 全过) |
| `clients/expo/src/components/SkillMatcherSheet.tsx` | 新增 | 派活精准浮层 (输入框 + 6 员工评分列表 + 复制 clipboard + Toast) |
| `clients/expo/src/screens/OrgAssetsScreen.tsx` | 改 | + "🎯 派活精准" pill + SkillMatcherSheet 浮层挂载 |
| `docs-coolie/CMMI-EMPLOYEE-MAPPING.md` | 改 | §10 整章新增 (中文 2 字 skill × 英文 cli tool + 派活精准 + 删 13) |
| `docs-coolie/evidence/wave258/QA-REPORT.md` | 新增 | wave258 QA 报告 |
| `doc/plans/2026-10-01-wave258-cmmi-skills-13-delete.md` | 新增 | wave258 计划文件 |
| `scripts/fork-surface.json` | 改 | + 4 entries (dispatch-skill-matcher + test + 9022 + journal) |

### A.2 单测

```
$ npx vitest run src/services/__tests__/dispatch-skill-matcher.test.ts
 Test Files  1 passed (1)
      Tests  10 passed (10)
   Duration  930ms
```

### A.3 wave261 commit chain 已在 HEAD (无需新提)

| 提交 | commit | 内容 |
|------|--------|------|
| `b4486190a` | feat(ontology-drilldown) | wave261 — 业务本体 5 层真分层下钻 (含 0.6.14 → 0.6.19 bump) |
| `fb525b9ab` | chore(fork-surface) | wave261 — bump ontology-graph service budget |
| `0d3ee6e34` | docs(wave261) | wave261 QA report |

## B. version bump (已在 wave261 b4486190a 完成)

| 文件 | 0.6.14 (前) | 0.6.19 (现) |
|---------|-------------|--------------|
| `clients/expo/app.json` | version 0.6.14 / versionCode 610 | version 0.6.19 / versionCode 619 |
| `clients/expo/package.json` | version 0.6.14 | version 0.6.19 |
| `clients/expo/android/app/build.gradle` | versionCode 610 / versionName "0.6.14" | versionCode 619 / versionName "0.6.19" |
| `clients/expo/CHANGELOG.md` | 顶部 v0.6.14 节 | 顶部 v0.6.19 节 (wave258 v0.6.17 + wave261 v0.6.19 双节) |

跳 0.6.18 是为了和并发 session 不撞 versionCode.

## C. release 5 步

### C.1 fix-android-manifest (EXPO_RUNTIME_VERSION = 0.6.19)

```
$ bash clients/expo/scripts/fix-android-manifest.sh
strings.xml expo_runtime_version ok (0.6.19)
manifest OTA config ok (runtimeVersion=0.6.19)
```

`node clients/expo/scripts/runtime-version.mjs --app-json` = 0.6.19
`node clients/expo/scripts/runtime-version.mjs --native-manifest clients/expo/android/app/src/main/AndroidManifest.xml` = 0.6.19

**native 与 app.json 一致** (OTA 会「下了不装」条件已排除)

### C.2 gradle assembleRelease (BUILD SUCCESSFUL)

```
$ cd clients/expo/android && ./gradlew assembleRelease -x lint --no-daemon
...
BUILD SUCCESSFUL in 1m 10s
1472 actionable tasks: 107 executed, 1365 up-to-date
```

产物: `clients/expo/android/app/build/outputs/apk/release/app-release.apk` 80.9 MB
sha256: `9fac302ea979cbee92e5c569ea6b368469bf8f8fd62d6ccab6cc92a8032474e0`

### C.3 coscli cp APK

```
$ no_proxy=".myqcloud.com" coscli cp clients/expo/android/app/build/outputs/apk/release/app-release.apk \
    cos://gzbucket/coolie/app/0.6.19/coolie-release.apk
Total num: 1, size: 84,797,455 Byte (80.87 MB). OK num: 1
AvgSpeed: 5.68 MB/s
cost 14.245000(s)
```

COS 对象: `cos://gzbucket/coolie/app/0.6.19/coolie-release.apk`
APK 直链: `https://dls.xrobinai.cn/coolie/app/0.6.19/coolie-release.apk`

### C.4 scp version.json → tc-coolie-claw

远端前一版 (0.6.15) ios* 字段保留: iosDownloadUrl / iosBundleId / iosSha256 / iosTestFlightUrl
新版本: 覆盖 version / versionCode / downloadUrl / releaseNotes / commitSha, ios* 字段不动.

```
$ scp /tmp/version.json tc-coolie-claw:/opt/coolie/ui/dist/version.json
$ ssh tc-coolie-claw "chmod 644 /opt/coolie/ui/dist/version.json"
```

### C.5 publish-ota.sh android

```
$ cd clients/expo && bash scripts/publish-ota.sh android
...
=== [4/4] 验证远端更新源有效性 ===
✓ 远端 manifest 已更新就绪:
{
  "id": "14d87069-c2cd-44c0-93b8-908c3ef26bd6",
  "createdAt": "2026-10-01T11:51:58.379Z",
  "runtimeVersion": "0.6.19",
  "launchAsset": {
    "key": "android-bundle-DWxVly2OWzvImiJ_IINwV36tU0umOyo67lzVAa_4ews",
    "contentType": "application/javascript",
    "url": "https://xrobinai.cn/ota/_expo/static/js/android/index-28b9818fb125c1e8e18fe33821684f3f.hbc",
    "hash": "DWxVly2OWzvImiJ_IINwV36tU0umOyo67lzVAa_4ews",
    "fileSize": 5058628
  },
  ...
}

🎉 OTA 增量更新发布完成!
支持渠道: production, runtimeVersion: 0.6.19
```

## D. 4 护栏 ✅ 全 PASS

| 护栏 | 命令 | 结果 |
|------|------|------|
| version.json = 0.6.19 | `curl https://xrobinai.cn/version.json` | ✅ version=0.6.19, versionCode=619, commitSha=37e6b3d77ebd |
| ota/manifest runtimeVersion = 0.6.19 | `curl https://xrobinai.cn/ota/manifest` | ✅ id=14d87069-c2cd-44c0-93b8-908c3ef26bd6, runtimeVersion=0.6.19, fileSize=5058628 |
| APK HEAD 200 + 80 MB+ | `curl -I https://dls.xrobinai.cn/coolie/app/0.6.19/coolie-release.apk` | ✅ HTTP 200, Content-Length=84,797,455 B (80.87 MB) |
| /api/health 200 ok | `curl https://xrobinai.cn/api/health` | ✅ `{"status":"ok","deploymentMode":"authenticated","bootstrapStatus":"ready",...}` |

证据目录: `docs-coolie/evidence/wave262/`
- `4-guard.log` (本次 curl 输出)
- `version.json` (远端响应, version=0.6.19)
- `ota-manifest.json` (远端响应, runtimeVersion=0.6.19)
- `apk-headers.txt` (HEAD 200)
- `api-health.json` (`{"status":"ok"}`)

## E. 推送状态

```
$ git push origin HEAD:main
To github.com:xaicd/coolie.git
   6ae154449..37e6b3d77  HEAD -> main
```

```
$ git ls-remote origin main
37e6b3d77ebdd519957e56de1cf0f88bb66cc4b0	refs/heads/main
```

origin/main = 37e6b3d77 (wave262 / wave258 HEAD) ✅

## F. 不动其它 session 残留 (按 brief)

| 文件 / 目录 | 状态 | 原因 |
|------------|------|------|
| `clients/expo/src/ui/toast.ts` | M (未提交) | wave184 — 其它 session 在做 |
| `clients/expo/src/components/ErrorBoundary.tsx` | ?? (未提交) | wave184 |
| `clients/expo/src/components/ToastHost.tsx` | ?? (未提交) | wave184 |
| `clients/expo/src/network.ts` | ?? (未提交) | wave184 |
| `clients/expo/src/stores/toast.ts` | ?? (未提交) | wave184 |
| `doc/plans/2026-09-30-wave184-toast.md` | ?? | wave184 plan |
| `doc/plans/2026-09-30-wave186-netinfo.md` | ?? | wave186 plan |
| `doc/plans/2026-09-30-wave196-deploy-server.md` | ?? | wave196 plan |
| `doc/plans/2026-09-30-wave219-deploy-server.md` | ?? | wave219 plan |
| `scripts/ds-bug-hunt.mjs` | ?? | wave231 |
| `scripts/install-agent-*.sh` / `install-ds-mcp.sh` | ?? | wave228 |
| `scripts/cron-copilot-reset.sh` | ?? | wave228 |
| `scripts/__tests__/ds-bug-hunt.test.mjs` | ?? | wave231 |
| `scripts/__tests__/install-mcp-shims.test.mjs` | ?? | wave228 |
| `scripts/lib/mcp-install-common.sh` | ?? | wave228 |
| `docs-coolie/QA/2026-09-30-ds-bug-hunt.md` | ?? | wave231 |
| `docs-coolie/evidence/wave158/`...`wave255/` | ?? | 各 wave 的 evidence dir, 其它 session 在写 |
| `pnpm-lock.yaml` | M (1 行 cpu 删除) | 其它 session 在做 |
| `scripts/check-fork-surface.mjs` | M | wave228 (添加 install-agent / cron-copilot / ds-bug-hunt OWNED_PREFIXES) |
| `docs-coolie/RELEASE-HISTORY.md` | M | wave252 已加 v0.6.14 节, 后续 wave 加 |

这些都不是 wave262 范围, 留给它们各自 session 处理.

## G. 反向约束 (按 brief 全部遵守)

- ✅ 不动 wave258 / wave261 commit 内容 (只 push + bump)
- ✅ 不动 AGENT_ROLES enum
- ✅ 不动 server 业务代码 (dispatch-skill-matcher 是新服务, 不动既有)
- ✅ push 只推 origin HEAD:main (5 commits: wave256 + wave261×3 + wave258)
- ✅ bump 在 wave261 已就位 (0.6.14 → 0.6.19)
- ✅ release 5 步 + 4 护栏全 PASS

## H. 出处

- 老板原话: "发" (1 条)
- wave258 evidence: docs-cool/wave258/QA-REPORT.md
- wave261 evidence: docs-cool/wave261/QA-REPORT.md
- wave256 evidence: docs-cool/wave256/QA-REPORT.md (origin = 6ae154449)
- 发版脚本: scripts/release-app.sh (5 步手工版, 因为版本已在 0.6.19 release-app.sh 自动 bump 会拒绝)
- 4 护栏脚本: scripts/lib/auto-deploy.sh `ad_guard_4` (本波手工跑)
- plan: `doc/plans/2026-10-01-wave262-*` (本波计划文件 — 老板原话即发版, 没单独建 plan)

## J. 老板真机 0.6.19 验验收 (PM 路线图)

老板真机装 0.6.19 后需验 4 项:
1. **派活精准** (wave258): 资产 tab → 顶部 "🎯 派活精准" pill → 输入 "编码" → 铁匠 (Core SWE 蓝徽章 + 评分 100) 列首位.
2. **6 员工** (wave258): 删 13 后, 数字员工 tab 只剩 6 (Hermes / 墨斗 / 铁匠 / 兑底渊 / 门神 / 百晓生).
3. **5 层真分层下钻** (wave261): 业务本体子屏 → 顶部 5 段面包屑 (L0 公司 → L1 域 → L2 类型 → L3 实例 → L4 属性) 可点回跳.
4. **删"图谱过大, 已截断"横幅** (wave261): 老板原 75 节点环图不再截断, 顶部 banner 已删.

## K. 后续 (PM 路线图)

- wave263+ 候选: Hermes 工坊 chat 端到端派活 (skill 匹配结果直接写入 issue assignee), 但需老板拍板 PM 反讲流程
- 13 数字员工 QA/Ops bootstrap 脚本彻底退役 (本次 migration 兜底, 但脚本下次跑还会重建 — 老板原话"不动 13 数字员工相关 scripts", 后续如要彻底删脚本需另起一波)
- 0.6.19 已发版, 待老板真机 4 项验收.