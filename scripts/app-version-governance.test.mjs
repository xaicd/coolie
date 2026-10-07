import test from "node:test";
import assert from "node:assert/strict";

// 提取与 AppVersion.ts 等价的纯函数逻辑进行高精度断言
const FINGERPRINT_RE = /^[0-9a-f]{40}$/i;
function isFingerprint(val) {
  return typeof val === "string" && FINGERPRINT_RE.test(val.trim());
}

function cmpVersion(a, b) {
  const pa = a.split(".").map((x) => parseInt(x, 10) || 0);
  const pb = b.split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

function isNativeAheadOfManifest(nativeRuntime, manifestRuntime) {
  if (!nativeRuntime || !manifestRuntime) return false;
  if (nativeRuntime.trim() === manifestRuntime.trim()) {
    return true;
  }
  if (isFingerprint(nativeRuntime) || isFingerprint(manifestRuntime)) {
    return false;
  }
  return cmpVersion(nativeRuntime, manifestRuntime) >= 0;
}

function evaluateUpdateDecision({
  info,
  localCode,
  localVer,
  nativeRuntime,
  manifestRuntime,
  updatesEnabled,
}) {
  // 1. 本地原生 versionCode 已大于等于远端发布包 versionCode
  if (typeof info.versionCode === "number" && localCode >= info.versionCode) {
    return { updateAvailable: false, forceUpdate: false, reason: "NATIVE_ALREADY_UP_TO_DATE" };
  }

  // 2. 远端强制最低版本限制
  if (
    typeof info.minSupportedVersionCode === "number" &&
    localCode < info.minSupportedVersionCode
  ) {
    return { updateAvailable: true, forceUpdate: true, reason: "FORCE_UPGRADE_REQUIRED" };
  }

  // 3. 远端版本号字符串比对
  const newerByJson = cmpVersion(info.version, localVer) > 0;
  if (!newerByJson) {
    return { updateAvailable: false, forceUpdate: false, reason: "VERSION_STR_ALREADY_CURRENT" };
  }

  // 4. 若启用了 OTA，优先检查远端 OTA manifest 能否覆盖此次更新
  if (updatesEnabled) {
    if (typeof manifestRuntime === "string") {
      const otaCapable = isNativeAheadOfManifest(nativeRuntime, manifestRuntime);
      if (otaCapable) {
        return { updateAvailable: false, forceUpdate: false, reason: "SILENT_OTA_HANDLED" };
      }
    }
  }

  // 5. OTA 未启用或运行时断代
  return { updateAvailable: true, forceUpdate: false, reason: "APK_DOWNLOAD_REQUIRED" };
}

test("isNativeAheadOfManifest — fingerprint 对齐时必须判定为兼容", () => {
  const fp1 = "93a7aafcc943650c832b79c1f69cd72a287eaeea";
  const fp2 = "93a7aafcc943650c832b79c1f69cd72a287eaeea";
  assert.equal(isNativeAheadOfManifest(fp1, fp2), true);
});

test("isNativeAheadOfManifest — fingerprint 漂移时必须判定为断代需要整包升级", () => {
  const fp1 = "93a7aafcc943650c832b79c1f69cd72a287eaeea";
  const fp2 = "1234567890abcdef1234567890abcdef12345678";
  assert.equal(isNativeAheadOfManifest(fp1, fp2), false);
});

test("isNativeAheadOfManifest — 传统 semver 版本号半序比较", () => {
  assert.equal(isNativeAheadOfManifest("0.6.10", "0.6.8"), true);
  assert.equal(isNativeAheadOfManifest("0.6.8", "0.6.8"), true);
  assert.equal(isNativeAheadOfManifest("0.6.8", "0.6.10"), false);
});

test("evaluateUpdateDecision — 用户刚装了新包 (localCode >= info.versionCode) 绝对不弹升级", () => {
  const res = evaluateUpdateDecision({
    info: {
      version: "0.6.51",
      versionCode: 651,
      downloadUrl: "https://dls.xrobinai.cn/coolie/app/0.6.51/coolie-release.apk",
    },
    localCode: 651,
    localVer: "0.6.50", // 假设由于缓存仍读到老 bundle 版本字符串
    nativeRuntime: "93a7aafcc943650c832b79c1f69cd72a287eaeea",
    manifestRuntime: "93a7aafcc943650c832b79c1f69cd72a287eaeea",
    updatesEnabled: true,
  });

  assert.equal(res.updateAvailable, false);
  assert.equal(res.reason, "NATIVE_ALREADY_UP_TO_DATE");
});

test("evaluateUpdateDecision — 老 APK 运行时与远端一致时由静默 OTA 接管，绝不弹整包 APK 下载", () => {
  const res = evaluateUpdateDecision({
    info: {
      version: "0.6.51",
      versionCode: 651,
      downloadUrl: "https://dls.xrobinai.cn/coolie/app/0.6.51/coolie-release.apk",
    },
    localCode: 650,
    localVer: "0.6.50",
    nativeRuntime: "93a7aafcc943650c832b79c1f69cd72a287eaeea",
    manifestRuntime: "93a7aafcc943650c832b79c1f69cd72a287eaeea",
    updatesEnabled: true,
  });

  assert.equal(res.updateAvailable, false);
  assert.equal(res.reason, "SILENT_OTA_HANDLED");
});

test("evaluateUpdateDecision — 原生代码发生断代 (fingerprint 不一致) 时必须弹出整包升级卡片", () => {
  const res = evaluateUpdateDecision({
    info: {
      version: "0.7.0",
      versionCode: 700,
      downloadUrl: "https://dls.xrobinai.cn/coolie/app/0.7.0/coolie-release.apk",
    },
    localCode: 651,
    localVer: "0.6.51",
    nativeRuntime: "93a7aafcc943650c832b79c1f69cd72a287eaeea",
    manifestRuntime: "ffffffffffffffffffffffffffffffffffffffff", // 新包引入了新原生模块，哈希改变
    updatesEnabled: true,
  });

  assert.equal(res.updateAvailable, true);
  assert.equal(res.reason, "APK_DOWNLOAD_REQUIRED");
});

test("evaluateUpdateDecision — 强制最低版本门禁触发 forceUpdate", () => {
  const res = evaluateUpdateDecision({
    info: {
      version: "0.8.0",
      versionCode: 800,
      minSupportedVersionCode: 700,
      downloadUrl: "https://dls.xrobinai.cn/coolie/app/0.8.0/coolie-release.apk",
    },
    localCode: 651,
    localVer: "0.6.51",
    nativeRuntime: "93a7aafcc943650c832b79c1f69cd72a287eaeea",
    manifestRuntime: "93a7aafcc943650c832b79c1f69cd72a287eaeea",
    updatesEnabled: true,
  });

  assert.equal(res.updateAvailable, true);
  assert.equal(res.forceUpdate, true);
  assert.equal(res.reason, "FORCE_UPGRADE_REQUIRED");
});
