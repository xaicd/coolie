# Brief: wave 52 — 修 APK 签名 (boss 装 0.5.27 失败 '该安装包未包含任何证书')

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 24:30 OOB (真值: 老板截图)

老板装 Coolie工坊 0.5.27 APK 失败:
- "安装失败"
- "失败原因: 该安装包未包含任何证书"
- "处理建议: 请使用官方版本进行安装"

## 1. 已知现状 (PM 09-22 真查)

```
❌ release.keystore 不存在 (clients/expo/android/app/ 或仓库根都没有)
✅ clients/expo/android/app/build.gradle 检测逻辑:
   - def releaseKeystoreFile = findProperty('KEYSTORE_FILE') ?: 'release.keystore'
   - def hasReleaseSigning = releaseKeystorePassword != null && file(releaseKeystoreFile).exists()
   - hasReleaseSigning = false (没 keystore + 没 KEYSTORE_PASSWORD)
   → release build 走 debug.keystore (default fallback)
   → debug.keystore 签名 cert = Android SDK 自带, 不被 Android 12+ 信任
   → 安装失败 "未包含任何证书"
```

## 2. 目标

**Coolie工坊 0.5.30 App** APK 签名修复:

A. 生成 release.keystore (boss 决定: 沿用旧 0.3.4 release.keystore 路径 或 新生成)
B. 配置 KEYSTORE_FILE + KEYSTORE_PASSWORD + KEYSTORE_KEY_PASSWORD
C. rebuild + resign APK (v1 + v2 + v3 签名)
D. 真验: aapt dump badging 看 certificate
E. 老板装 0.5.30 验证不报"未包含任何证书"

## 3. 任务 (5 步)

### 3.1 找旧 release.keystore

```bash
# 仓库内
find . -name "release.keystore" -o -name "*.jks" 2>/dev/null | head

# /Users/mac 本机 (boss 之前可能放过)
ls -la /Users/mac/.keystore /Users/mac/keystore /Users/mac/Documents/keystore 2>&1 | head
find /Users/mac -name "release.keystore" 2>/dev/null | head
```

期望: 找到 0.3.4 时用的 release.keystore (RSA 4096).

### 3.2 找不到则生成新 release.keystore

```bash
keytool -genkeypair -v \
  -keystore clients/expo/android/app/release.keystore \
  -alias coolieapp \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -storepass $(openssl rand -hex 32) \
  -keypass $(openssl rand -hex 32) \
  -dname "CN=Coolie Fork, O=XRobinAI, C=CN"
```

存密码到 ~/.coolie-secrets/keystore.env (不进 git):

```
KEYSTORE_FILE=clients/expo/android/app/release.keystore
KEYSTORE_PASSWORD=<generated>
KEYSTORE_KEY_PASSWORD=<generated>
```

### 3.3 gradle.properties 加 keystore 引用

读 `clients/expo/android/gradle.properties`:

```properties
# 新增 (boss 给 / 或用 ~/.coolie-secrets/keystore.env)
KEYSTORE_FILE=../app/release.keystore
KEYSTORE_PASSWORD=<from keystore.env>
KEYSTORE_KEY_PASSWORD=<from keystore.env>
```

⚠️ KEYSTORE_PASSWORD 不能入 git (.gitignore).

### 3.4 rebuild + 真验

```bash
cd clients/expo
./android/gradlew -p android assembleRelease 2>&1 | tail -10

# 真验签名
$ANDROID_HOME/build-tools/*/apksigner verify --print-certs \
  clients/expo/android/app/build/outputs/apk/release/app-release.apk 2>&1 | head

# 期望: "Verified using v2 scheme (APK Signature Scheme v2)" + cert subject
```

### 3.5 bump 0.5.27 → 0.5.30 + release-app.sh

```bash
# release-app.sh 已修 gradle bump bug (wave4)
# 但 KEYSTORE_PASSWORD 环境变量需传给 release-app.sh
export KEYSTORE_PASSWORD=...
export KEYSTORE_KEY_PASSWORD=...
bash scripts/release-app.sh 0.5.30 "修 APK 签名 (release.keystore + v1+v2+v3 签名)"
# → 0.5.30 APK 上 COS
```

## 4. Constraints

- ❌ DON'T 把 KEYSTORE_PASSWORD 入 git
- ❌ DON'T 用 debug.keystore 签 release APK
- ❌ DON'T bump 0.5.30 之外的版本
- ✅ DO 用 release.keystore (v1+v2+v3 签名)
- ✅ DO 验证签名 + 上 COS
- ✅ DO 老板装 0.5.30 验 "未包含任何证书" 错误消失

## 5. semver + PM-CHECKLIST

- 当前 0.5.27
- 修签名 = patch bump → 0.5.30 ✅ (0.5.28 留给 wave50, 0.5.29 留给 wave51)
- PM-CHECKLIST 32 项: J1-J3 + I1

## 6. Done definition

5 步全完 + release.keystore 生成/找 + gradle.properties 配 + rebuild + 真验签名 + bump 0.5.30 + 上 COS + 老板装 0.5.30 验:

```
Coolie工坊 0.5.30: https://dls.xrobinai.cn/coolie/app/0.5.30/coolie-release.apk
APK 签名: Verified using v2 scheme (APK Signature Scheme v2) + cert subject CN=Coolie Fork
老板装 0.5.30 → 不再 "该安装包未包含任何证书" 错误
```

## 7. 若找不到旧 keystore 又不能新生成怎么办?

老板拍板:
- A. PM 自生成新 release.keystore (默认密码写 ~/.coolie-secrets/keystore.env)
- B. 老板给旧 0.3.4 release.keystore 文件路径 (boss 已知)
- C. 老板重新装 Coolie工坊 用 0.3.4 旧版本 (回滚)

PM 推荐 A.