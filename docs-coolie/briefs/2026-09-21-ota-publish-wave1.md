# Brief: OTA 发布 0.5.0 → 0.5.1 JS bundle（不动 APK）

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: claude（铁匠 claude-glm 或 claude-mm）

## 0. 任务

把今天累计的 JS-only 改动（ChatHome 抄作业 expo 版 10 文件 + h5 版 11 文件 + 阶段 B/C 组件库 + 5 角色 skill 范本）通过 OTA 发到生产：

- **app.json version 保持 0.5.0**（runtimeVersion policy: appVersion）
- **OTA manifest runtimeVersion 保持 0.5.0**
- 但 **bundle 内容新**（expo export 重打）
- App 端 runtimeVersion 不变 = expo-updates 接受新 bundle 作为 patch
- 但新 bundle 里有 ChatHome 预览 + 工作空间 → 用户开 App → 自动拉 → 看到新功能

## 1. 不要做的事

- ❌ 不要 bump version / versionCode / runtimeVersion（**保持 0.5.0 不动**）
- ❌ 不要重打 APK（不需要）
- ❌ 不要 bump android/app/build.gradle
- ❌ 不要 push version.json 0.5.1（version.json 是 APK 用，OTA 不动它）

## 2. 跑前预检

```bash
export DEVELOPER_DIR=/Library/Developer/CommandLineTools
cd ~/workspace/xaicd/coolie

# 1. 仓库干净
git status --short

# 2. 当前生产 OTA 版本
curl -s https://xrobinai.cn/ota/manifest | python3 -c 'import json,sys; m=json.load(sys.stdin); print("runtimeVersion =", m.get("runtimeVersion"))'

# 3. 当前生产 version.json
curl -s https://xrobinai.cn/version.json | python3 -c 'import json,sys; v=json.load(sys.stdin); print("version =", v["version"], "versionCode =", v["versionCode"])'

# 4. app.json 当前值
cat clients/expo/app.json | python3 -c 'import json,sys; a=json.load(sys.stdin); print("expo.version =", a["expo"]["version"]); print("updates.runtimeVersion =", a["expo"]["updates"]["runtimeVersion"])'
```

## 3. 跑发布

```bash
bash scripts/publish-ota.sh android
# 或 all：
# bash scripts/publish-ota.sh
```

脚本会：

1. `expo export --platform android` 打 JS bundle
2. rsync 到 `tc-coolie-claw:/opt/coolie/ui/ota/`
3. 服务端再生成 manifest

## 4. 跑后验

```bash
# 1. 拉新 manifest
curl -s https://xrobinai.cn/ota/manifest | python3 -c 'import json,sys; m=json.load(sys.stdin); print("runtimeVersion =", m.get("runtimeVersion")); print("createdAt =", m.get("createdAt")); print("bundle =", m["launchAsset"]["url"])'

# 2. 验 bundle 200
curl -sI https://xrobinai.cn/ota/_expo/static/js/android/index-*.hbc 2>&1 | head -3
# 或具体路径（从 manifest 拿）

# 3. version.json 不动
curl -s https://xrobinai.cn/version.json
# version 仍是 0.5.0（OTA 不动 version.json）
```

## 5. 完成定义

- [ ] publish-ota.sh 跑通，无错
- [ ] 新 manifest.createdAt > 跑前时间
- [ ] bundle URL 200
- [ ] runtimeVersion 仍是 0.5.0
- [ ] version.json 仍是 0.5.0（不动）
- [ ] 没改 app.json version
- [ ] 没改 gradle
- [ ] 没 commit 任何生产版本号
- [ ] weixin 报老板「OTA 已发，App 重启或下次打开自动更新到 0.5.1 patch」
```

## 6. 输出报告

```
## OTA 0.5.1 patch — 发布结果

### 跑前预检
- 当前 OTA: runtimeVersion=0.5.0, createdAt=...
- 当前 APK: version=0.5.0, versionCode=500
- app.json: version=0.5.0, runtimeVersion=0.5.0

### 发布过程
- 命令: scripts/publish-ota.sh android
- 跑时: ~X 分钟
- bundle 大小: XX kB
- rsync: tc-coolie-claw:/opt/coolie/ui/ota/ (XX kB 上传)

### 跑后验
- 新 manifest.createdAt: ...
- bundle URL 200
- runtimeVersion 仍是 0.5.0
- version.json 不动

### 老板 App 看到的
- 装 0.5.0 的老板手机
- 重启 / 下次打开
- expo-updates 自动检查 → 拉新 bundle → 看到 ChatHome 预览 + 工作空间
```

## 7. 注意

- 老板手机**没装新 APK** = 仍是 0.5.0 原生壳，但 JS 跑了新 bundle = 看到 0.5.1 patch 内容
- 想看「版本号变成 0.5.1」= 必须 bump version.json + APK + 重装（**这次不做**）

不要 bump version。**只发 JS bundle。**