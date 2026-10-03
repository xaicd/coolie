// wave292 — runtimeVersion policy=fingerprint 的哈希口径（唯一声明处）。
//
// @expo/fingerprint 的 normalizeOptionsAsync 会自动加载本文件并合并进每一次
// 计算（Options.js: loadConfigAsync → ...config → 显式参数覆盖），所以仓库内
// 所有计算路径（runtime-version.mjs 经 expo-updates CLI fingerprint:generate、
// 以及未来任何原生侧路径）拿到的都是同一口径 —— 单一口径正是本模块存在的意义。
module.exports = {
  // version / android.versionCode / ios.buildNumber 不参与哈希 —— 否则每次发版
  // bump 版本号都会改变 runtimeVersion，「装一次 0.6.26、之后 v0.6.x 全走 OTA」
  // 的目标落空（实证见 evidence/wave292：无 skip 时哈希源含 "0.6.25"，加 skip 后
  // 消失，且 A≠B 证明两口径确实不同）。
  // ExpoConfigRuntimeVersionIfString：runtimeVersion 字符串自引用不参与。
  sourceSkips: [
    "PackageJsonAndroidAndIosScriptsIfNotContainRun", // 库默认 skip，保留
    "ExpoConfigVersions",
    "ExpoConfigRuntimeVersionIfString",
  ],
  // 本地 android/ 是 gitignore 的 gradle 直构建目录（versionCode/manifest 每次
  // 发版都被脚本就地改写），属于构建噪声，不代表运行时兼容性变化。
  ignorePaths: ["android/**/*", "ios/**/*"],
};
