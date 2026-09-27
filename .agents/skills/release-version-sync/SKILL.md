---
name: release-version-sync
description: 发版必须同步四处版本号：app.json / expo/package.json / android/app/build.gradle 由 release-app.sh 自动改，仓库 version.json 需单独 chore commit。Use when APK 内嵌 versionCode 或线上 version.json 与仓库不一致 → OTA 拒绝 / 版本号落后。
---

# Release Version Sync — 四处版本号必须一致

## 1. 老板 2026-09-21 撞过的坑 (0.5.2)

门神 release 0.5.2 时发现：
- `app.json` 已 bump 到 0.5.2 / 502
- `android/app/build.gradle` 还是 0.5.1 / 501（脚本没改）
- APK 内嵌了 `versionCode=501 versionName="0.5.1"`
- OTA runtimeVersion = 0.5.2 (跟 app.json 走)
- **不一致 → 老板装机 OTA 拒绝接受**

门神**修了脚本** + 重新 build + 重新上传 — 但这是 hotfix，不是预防。

## 2. 四处版本号必须一致

```
clients/expo/app.json            (expo.version + expo.android.versionCode)  ← 脚本改
clients/expo/package.json        (version)                                  ← 脚本改
clients/expo/android/app/build.gradle (versionCode + versionName)           ← 脚本改
version.json                     (version + versionCode)                    ← 脚本【不】改
```

任何一处漏改 → APK 内嵌/对外不一致 → OTA 拒绝或装机混乱。最后一行是最容易漏的，见 §3。

## 3. 谁负责改哪一处（**脚本不改 version.json**）

`scripts/release-app.sh` 只自动改 **三处**：
`clients/expo/app.json`(expo.version + android.versionCode)、
`clients/expo/package.json`(version)、
`clients/expo/android/app/build.gradle`(versionCode + versionName，gitignored，脚本就地同步)。

**仓库根 `version.json` 脚本不碰。** 它只在 step [8/9] 被生成到 `mktemp` 临时文件，然后
`scp` 到 `$SSH_TARGET:$REMOTE_VERSION_JSON`（默认 `/opt/coolie/ui/dist/version.json`，Caddy
以它直出 `https://xrobinai.cn/version.json`）。仓库里那份需要**单独再提一个 chore commit**：

```
chore(release): version.json <version> → <release-commit-sha>
```

**为什么必须单独一次提交**：`version.json.commitSha` 指向的就是发版 commit 自己，而发版
commit 在被创建的当下还不存在（脚本 step [4/9] 提交 → step [8/9] 才拿到 hash）。所以它
**结构上不可能**和发版 commit 同批提交。这不是遗漏，是顺序决定的。

历史实证：`0a77ad31b`(0.5.67)、`932505a5d`(0.5.77) 都是这个 chore commit。

⚠️ **反面教训**：本文档旧版声称脚本"自动改 3 处（含 version.json）"，于是 0.5.68 → 0.5.76
都没人补这个 chore commit，仓库 `version.json` 一路停在 **0.5.67** —— 比线上落后 10 个版本，
而 skill 自己列的"三处一致"表面上还成立。别信"脚本会改"；发版后必须跑 §4 核对仓库那份。

## 4. 防装错验证 (release 后跑)

```bash
# APK 内嵌 versionCode 必须跟 version.json 一致
APK="https://dls.xrobinai.cn/coolie/app/$NEW_VERSION/coolie-release.apk"
mkdir -p /tmp/coolie-check && cd /tmp/coolie-check && rm -rf * && \
  curl -fsS "$APK" | unzip -p assets/app.config | python3 -c "
import json,sys
d = json.load(sys.stdin)
print('embedded version=', d['version'], 'versionCode=', d['expo']['android']['versionCode'])
"
# 期望: embedded version= 0.5.2 versionCode= 502

curl -fsS https://xrobinai.cn/version.json | python3 -c "
import json,sys
d = json.load(sys.stdin)
print('version.json version=', d['version'], 'versionCode=', d['versionCode'])
"
# 期望: version.json version= 0.5.2 versionCode= 502
# 两个必须相等

# ⚠️ 最容易漏的一处：仓库根 version.json 也必须跟上（线上对了不代表仓库对了）
python3 -c "
import json
print('repo version.json=', json.load(open('version.json'))['version'])
"
# 期望: 与上面两个相等；不相等 → 补 §3 的 chore commit
```

## 5. 与 release-flow 协同

`release-flow` skill §5.2 (APP client 发布) 应引用本 skill 四处同步（含仓库 version.json 的 chore commit）。