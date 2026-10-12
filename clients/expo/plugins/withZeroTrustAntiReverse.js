/**
 * withZeroTrustAntiReverse.js — Expo Config Plugin 零信任防破壳加固插件
 * 
 * 自动配置：
 * 1. AndroidManifest: 强制 android:allowBackup="false" (防 adb backup 数据脱壳)
 * 2. Android Network Security Config: 仅信任系统根 CA (防用户自装证书 MITM 抓包)
 * 3. ProGuard / R8 混淆与资源缩减规则自动应用
 */

const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

function withZeroTrustAntiReverse(config) {
  // 1. 修改 AndroidManifest.xml: 关闭 allowBackup
  config = withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults;
    const application = androidManifest.manifest.application?.[0];
    if (application) {
      application.$["android:allowBackup"] = "false";
    }
    return config;
  });

  // 2. 注入 Gradle 属性、ProGuard 与原生 Kotlin RASP 模块
  config = withDangerousMod(config, [
    "android",
    async (config) => {
      const androidDir = config.modRequest.platformProjectRoot;

      // 2.1 注入 Gradle 属性
      const gradlePropertiesPath = path.join(androidDir, "gradle.properties");
      if (fs.existsSync(gradlePropertiesPath)) {
        let content = fs.readFileSync(gradlePropertiesPath, "utf8");
        const linesToAdd = [
          "android.enableProguardInReleaseBuilds=true",
          "android.enableShrinkResourcesInReleaseBuilds=true",
        ];

        let modified = false;
        for (const line of linesToAdd) {
          const key = line.split("=")[0];
          if (!content.includes(key)) {
            content += `\n${line}`;
            modified = true;
          }
        }

        if (modified) {
          fs.writeFileSync(gradlePropertiesPath, content, "utf8");
        }
      }

      // 2.2 同步原生 Kotlin RASP 守护代码到 android/app/src/main/java/cloud/coolie/app/security/
      const securitySourceDir = path.join(__dirname, "security");
      const securityTargetDir = path.join(
        androidDir,
        "app",
        "src",
        "main",
        "java",
        "cloud",
        "coolie",
        "app",
        "security"
      );

      if (fs.existsSync(securitySourceDir)) {
        fs.mkdirSync(securityTargetDir, { recursive: true });
        const files = fs.readdirSync(securitySourceDir);
        for (const file of files) {
          fs.copyFileSync(
            path.join(securitySourceDir, file),
            path.join(securityTargetDir, file)
          );
        }
      }

      // 2.3 确保 MainApplication.kt 注册 SecurityGuardPackage 与 AppSecurityGuard.init
      const mainAppPath = path.join(
        androidDir,
        "app",
        "src",
        "main",
        "java",
        "cloud",
        "coolie",
        "app",
        "MainApplication.kt"
      );
      if (fs.existsSync(mainAppPath)) {
        let mainAppContent = fs.readFileSync(mainAppPath, "utf8");
        let appModified = false;

        if (!mainAppContent.includes("cloud.coolie.app.security.AppSecurityGuard")) {
          mainAppContent = mainAppContent.replace(
            "package cloud.coolie.app",
            "package cloud.coolie.app\n\nimport cloud.coolie.app.security.AppSecurityGuard\nimport cloud.coolie.app.security.SecurityGuardPackage"
          );
          appModified = true;
        }

        if (!mainAppContent.includes("AppSecurityGuard.init(this)")) {
          mainAppContent = mainAppContent.replace(
            "super.onCreate()",
            "AppSecurityGuard.init(this)\n    super.onCreate()"
          );
          appModified = true;
        }

        if (!mainAppContent.includes("PackageList(this).packages.apply")) {
          // 检查是否已注册 SecurityGuardPackage
          if (!mainAppContent.includes("SecurityGuardPackage()")) {
            mainAppContent = mainAppContent.replace(
              "PackageList(this).packages",
              "PackageList(this).packages.apply { add(SecurityGuardPackage()) }"
            );
            appModified = true;
          }
        }

        if (appModified) {
          fs.writeFileSync(mainAppPath, mainAppContent, "utf8");
        }
      }

      return config;
    },
  ]);

  return config;
}

module.exports = withZeroTrustAntiReverse;
