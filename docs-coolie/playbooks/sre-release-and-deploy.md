# Playbook: SRE / 发版 — App 发版链 + server 部署

> 角色:SRE/发版(门神)。定位:把一个 commit 变成一台机器上真正在跑的新版本,并留下可验证的指纹。
> 对应 skill:`.agents/skills/sre-release-and-deploy/SKILL.md`
> 素材来源:`scripts/release-app.sh`、`scripts/deploy-tc-coolie-claw.sh`、`scripts/publish-ota.sh`、
> `ota-*` skills、wave84–127 发版实录。

## 触发条件

- 要把改动发出去(App 新版本 / server 部署 / OTA 补丁)。
- 线上出故障要重部署或回滚。

## 前置(硬门槛)

```sh
git status --porcelain            # 必须干净:脏树 → 发出去的产物对不上任何 commit
git rev-parse --abbrev-ref HEAD   # 必须在 main
```

- **一版只动一个版本号**,不碰别人已发的版本。
- keystore 密码**只在 gitignored `gradle.properties` / 环境变量里**,绝不 commit、绝不 echo。
- 发版机需要 JDK 17 + 命令行工具链(`release-app.sh` 默认设 `JAVA_HOME`)。

## A. App 发版(一条命令,`scripts/release-app.sh`)

```sh
bash scripts/release-app.sh 0.5.89 "wave128 全角色E2E工作脚本"
```

脚本 9 步(它自己会做,这里是你必须知道它做了什么、以及要核什么):

1. **前置检查**:`clients/expo` 无改动 + 全仓 tracked 无改动(脏即 abort)+ 版本号合法且非当前。
2. 改 `clients/expo/app.json`(`expo.version`、`expo.android.versionCode`)+ `package.json`。
   注意:**`android/app/build.gradle` 才是 gradle 直构建的真正版本来源**(本仓 `android/` 是
   gitignore 的本地预构建目录,走 gradle 直构建、不跑 prebuild),脚本会就地同步它。
3. `CHANGELOG.md` 顶部插入新版本节。
4. `git add` + `git commit`(不 push);该 commit hash 记入 `version.json.commitSha`。
5. 修 `AndroidManifest`、断言原生 `EXPO_RUNTIME_VERSION == app.json 意图`;**漂移即拒绝发版**
   ("下了不装"的根因)。
6. `./gradlew assembleRelease -x lint --no-daemon`;失败 → `git reset --hard` 回退,不上传任何产物。
7. `coscli cp` APK 到 COS。
8. 生成 `version.json` 并 `scp` 到生产,**并 `chmod 644`**(否则 Caddy 直出变 403,App 静默判"无更新")。
9. `publish-ota.sh android` 发 OTA。
10. **联动 server 部署**(`deploy-tc-coolie-claw.sh --skip-build`)—— 跨端变更必须随客户端一起部署,
    否则 App 点了新按钮会 404。

### A2. version.json 被 `rsync --delete` 抹掉的血泪(必须补做)

server 部署的 `rsync --delete` 会把步骤 8 scp 上去的 `ui/dist/version.json` **删掉**
(本地 `ui/dist` 不含它,只在远端存在)。0.5.75 实证于是 404。所以**每次 server rsync 之后,
必须复核 version.json 并在需要时重推**:

```sh
curl -fsS -o /dev/null -w '%{http_code}\n' -m 8 https://xrobinai.cn/version.json   # 期望 200
curl -fsS -m 8 https://xrobinai.cn/version.json | head -c 120                      # 版本号对得上吗
```

`release-app.sh` 第 10 步末尾已内置这个补偿(`scp` 重推 + `chmod 644`);手工部署时要自己做。

### A3. OTA 补丁(纯 JS 改动,不动原生)

JS-only 改动**不 bump** `app.json`/`runtimeVersion`/`versionCode`/`build.gradle`,
`version.json` 也不动,只跑:

```sh
cd clients/expo && bash scripts/publish-ota.sh android
```

验收:OTA manifest `runtimeVersion` 不变、`createdAt` 前移,新 bundle URL 200,
`version.json` 仍是旧版本号(手机留旧原生壳、跑新 bundle = 预期,不是 bug)。

## B. server 部署(`scripts/deploy-tc-coolie-claw.sh`)

```sh
bash scripts/deploy-tc-coolie-claw.sh            # 本地构建 UI → rsync → 远端构建 → 重启 → 健康
bash scripts/deploy-tc-coolie-claw.sh --skip-build
```

**安全 rsync excludes(铁律,防 `--delete` 抹掉生产配置/资产)**:

```
--exclude '.env'  --exclude '.env.*'  --exclude 'node_modules'  --exclude '.git'
--exclude '.claude'  --exclude '.commandcode'  --exclude 'screenshots'
--exclude 'data'  --exclude 'server/data'  --exclude 'clients/expo'
--exclude 'doc/plans'  --exclude 'ui/ota'
```

- **整树同步,不是只同步改动目录**。部分同步(新 `server/src` 配旧 `shared`)会把服务搞挂。
- 部署要留一个**已初始化**的实例(首次管理员 + 默认内容),停在 `bootstrap_pending` 不算部署完。
- 部署必须对应一个**可识别的 commit**(脏树默认拒绝;`--allow-dirty` 是逃生口不是常态)。
- 健康判据:重启后真发一个请求拿到 `status:ok`,不是 systemd 的 "active"。

```sh
curl -fsS -m 5 http://127.0.0.1:3100/api/health          # 远端本机
curl -fsS -m 8 https://xrobinai.cn/api/health            # 外部
```

## C. 排障(线上抓真凶)

```sh
ssh tc-coolie-claw 'journalctl -u coolie -n 300 --no-pager | tail -60'
ssh tc-coolie-claw "sudo -u postgres psql coolie -tAc \"<SQL 真值>\""     # DB 真值 vs 投影层
curl -fsS https://xrobinai.cn/ota/manifest                 # 驾驶舱 manifest
curl -fsS https://xrobinai.cn/ota/paperclip-web/manifest   # 另一个 OTA 根(路径前缀不同)
curl -fsS https://xrobinai.cn/version.json
```

- **per-IP manifest**:OTA manifest 可能按来源 IP 出不同内容,用本机 curl 测到的不等于真机看到的。
- **代理脑裂**:本机 TUN 会把模拟器流量吸进本地 clone(见 `qa-humanlike-e2e.md` §7);
  判断是环境还是线上,要看真机/外部直连。

## 验收标准

1. 发版前工作区干净、在 `main`、版本号合法且只动这一个。
2. `aapt2 dump badging` 的 versionCode/versionName 与 `version.json` 一致;原生
   `EXPO_RUNTIME_VERSION` 与 app.json 一致(**O 漂移即拒绝**)。
3. APK 直链可下载(200);`/version.json` 200 且版本号正确(**rsync 后复核**)。
4. `/api/health` 返回 `status:ok`(外部 + 远端本机都测)。
5. 部署后实例已初始化(不是 `bootstrap_pending`)。
6. OTA 补丁:manifest `runtimeVersion` 不变、`createdAt` 前移;纯 JS 补丁不动原生版本。

## 失败分支

| 编号 | 症状 | 原因 | 处置 |
|---|---|---|---|
| F1 | 发版脚本 abort:脏树 | 有未提交改动 | 先提交;`--allow-dirty` 只在明白代价时用 |
| F2 | gradle 失败 | 版本/工具链/JDK | 脚本已回退 commit;修根因再发 |
| F3 | version.json 404 | rsync --delete 抹了 | 重推 + `chmod 644`;检查是否内置补偿 |
| F4 | App "下了不装" | native runtimeVersion ≠ app.json | 脚本第 5 步会拦;别绕过 |
| F5 | 按钮 404 | 跨端变更只发了客户端 | 联动 `deploy-tc-coolie-claw.sh` 部署 server |
| F6 | 部分同步把服务搞挂 | 只同步了改动目录 | 整树同步 + 检查哪个包 stale 需重建 |
| F7 | 本机测到的是脑裂结果 | TUN 代理 | 用真机/外部直连复核,再下结论 |

## 关联

- 发前必须过测试 → `qa-humanlike-e2e.md`;发后验收 → `ceo-company-ops.md`
