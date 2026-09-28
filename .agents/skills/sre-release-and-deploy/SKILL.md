---
name: sre-release-and-deploy
description: >
  SRE / 发版 skill：App 发版 9 步链（release-app.sh）、version.json 被 rsync --delete 抹掉的
  血泪补偿、安全 rsync excludes 铁律、server 部署与初始化、OTA 纯 JS 补丁、journalctl 排障。
  适用于「要发版/上线」「部署 server」「线上出故障」「version.json 404 了」等场景。
  完整脚本见 docs-coolie/playbooks/sre-release-and-deploy.md。
---

# SRE / 发版 — App 发版链 + server 部署

**一句话职责**：把一个 commit 变成机器上真在跑的新版本，并留下可验证的指纹。

## 何时用

- 要发 App 新版本 / 部署 server / 发 OTA 补丁。
- 线上故障要重部署或回滚。

## 前置（硬门槛）

```sh
git status --porcelain            # 必须干净
git rev-parse --abbrev-ref HEAD   # 必须在 main
```

- 一版只动一个版本号。
- keystore 密码只在 gitignored `gradle.properties` / 环境变量，绝不 commit/echo。

## A. App 发版

```sh
bash scripts/release-app.sh 0.5.89 "wave128 ..."
```

脚本做的事（你要核的点）：
1. 前置检查（脏树 abort）。
2. 改 `app.json`（`expo.version`+`expo.android.versionCode`）+ `package.json`；
   **`android/app/build.gradle` 才是 gradle 直构建的版本来源**，脚本就地同步。
3. `CHANGELOG.md` 插新节。
4. commit（不 push），hash 写入 `version.json.commitSha`。
5. 断言原生 `EXPO_RUNTIME_VERSION == app.json` —— **漂移即拒绝发版**（"下了不装"根因）。
6. `./gradlew assembleRelease -x lint --no-daemon`；失败回退 commit，不上传。
7. `coscli cp` APK 到 COS。
8. 生成 `version.json` + `scp` + **`chmod 644`**（否则 Caddy 403，App 静默判无更新）。
9. `publish-ota.sh android`。
10. 联动 server 部署（跨端变更必须一起发，否则新按钮 404）。

### A2 version.json 被 rsync --delete 抹掉（血泪）

server 部署的 `rsync --delete` 会删掉 `ui/dist/version.json`（本地没有、只在远端）。
**每次 server rsync 后必须复核，必要时重推**：

```sh
curl -fsS -o /dev/null -w '%{http_code}\n' -m 8 https://xrobinai.cn/version.json   # 期望 200
```

### A3 OTA 纯 JS 补丁（不动原生）

不 bump app.json/runtimeVersion/versionCode/build.gradle，version.json 也不动：

```sh
cd clients/expo && bash scripts/publish-ota.sh android
```

验收：manifest `runtimeVersion` 不变、`createdAt` 前移、新 bundle URL 200、version.json 仍旧版。

## B. server 部署

```sh
bash scripts/deploy-tc-coolie-claw.sh [--skip-build]
```

安全 rsync excludes 铁律：`.env .env.* node_modules .git .claude .commandcode
screenshots data server/data clients/expo doc/plans ui/ota`。
整树同步（不是只同步改动目录）；部署要留一个**已初始化**实例；脏树默认拒绝。

```sh
curl -fsS -m 5 http://127.0.0.1:3100/api/health
curl -fsS -m 8 https://xrobinai.cn/api/health
```

## C. 排障

```sh
ssh tc-coolie-claw 'journalctl -u coolie -n 300 --no-pager | tail -60'
ssh tc-coolie-claw "sudo -u postgres psql coolie -tAc \"<SQL 真值>\""
curl -fsS https://xrobinai.cn/ota/manifest
curl -fsS https://xrobinai.cn/version.json
```

per-IP manifest 会按来源 IP 出不同内容；本机测试≠真机所见。

## 已知坑

1. 脏树发版 → 产物对不上任何 commit。
2. version.json 404 = rsync --delete 抹了。
3. native runtimeVersion ≠ app.json → App "下了不装"。
4. 跨端变更只发客户端 → 按钮 404。
5. 部分同步 → 服务挂。
6. 本机测到的是 TUN 脑裂结果 → 真机复核。

## 验收标准

1. 发版前干净、在 main、只动一个版本号。
2. badging 的版本与 version.json 一致；原生 runtimeVersion 与 app.json 一致。
3. APK 直链 200；`/version.json` 200 且版本正确（rsync 后复核）。
4. `/api/health` = ok（外部 + 远端本机）。
5. 部署后实例已初始化（非 `bootstrap_pending`）。

## 反例

- 跳过 typecheck/测试就发版。
- 只发客户端不发 server。
- version.json 只 scp 不验。

## 关联

- 发前测试 → `qa-humanlike-e2e`；发后验收 → `ceo-company-ops`
