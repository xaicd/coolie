---
name: release-version-sync
description: release-app.sh 必须同步 app.json + android/app/build.gradle + version.json 三处版本号。Use when 发现 APK 内嵌的 versionCode 跟 version.json 不一致 → OTA 拒绝。
---

# Release Version Sync — 三处版本号必须一致

## 1. 老板 2026-09-21 撞过的坑 (0.5.2)

门神 release 0.5.2 时发现：
- `app.json` 已 bump 到 0.5.2 / 502
- `android/app/build.gradle` 还是 0.5.1 / 501（脚本没改）
- APK 内嵌了 `versionCode=501 versionName="0.5.1"`
- OTA runtimeVersion = 0.5.2 (跟 app.json 走)
- **不一致 → 老板装机 OTA 拒绝接受**

门神**修了脚本** + 重新 build + 重新上传 — 但这是 hotfix，不是预防。

## 2. 三处版本号必须一致

```
app.json (expo.version + expo.android.versionCode)
android/app/build.gradle (versionCode + versionName)
version.json (version + versionCode)
```

任何一处漏改 → APK 内嵌/对外不一致 → OTA 拒绝或装机混乱。

## 3. release-app.sh 自动改 3 处（门神修了）

```bash
NEW_VERSION=$1  # e.g. 0.5.2

# 1. app.json
python3 -c "
import json
p = 'clients/expo/app.json'
d = json.load(open(p))
d['expo']['version'] = '$NEW_VERSION'
d['expo']['android']['versionCode'] = ${NEW_VERSION##*.}
json.dump(d, open(p, 'w'), indent=2)
"

# 2. android/app/build.gradle (gitignored, auto-bump in release script)
sed -i "s/versionCode [0-9]*/versionCode ${NEW_VERSION##*.}/" clients/expo/android/app/build.gradle
sed -i "s/versionName \".*\"/versionName \"$NEW_VERSION\"/" clients/expo/android/app/build.gradle

# 3. version.json
python3 -c "
import json
d = json.load(open('version.json'))
d['version'] = '$NEW_VERSION'
d['versionCode'] = ${NEW_VERSION##*.}
json.dump(d, open('version.json', 'w'), indent=2)
"
```

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
```

## 5. 与 release-flow 协同

`release-flow` skill §5.2 (APP client 发布) 应引用本 skill 三处同步。