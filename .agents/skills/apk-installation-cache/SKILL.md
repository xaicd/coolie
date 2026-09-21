---
name: apk-installation-cache
description: APK 装机避免 WeChat / 浏览器缓存装错版本。Use when boss 安装新版本后看到"老界面"或"开发调试环境 OTA 未启用"。Fix: 无痕浏览器 + URL 后加 ?v=timestamp 强制 fresh fetch。
---

# APK Installation — 避免缓存装错版本

## 1. 老板 2026-09-21 撞过的坑

老板下载 `https://dls.xrobinai.cn/coolie/app/0.5.1/coolie-release.apk` 后看到：
- App 内嵌 manifest："当前运行在开发调试环境，OTA 热更新未启用"
- 看到的还是 0.5.0 老界面

**真因：老板在 WeChat 对话里点链接下载 → 微信下载管理器**缓存了之前下载的旧 APK** → 装的是 0.5.0 (304)，不是 0.5.1 (501)。**

## 2. 防装错 4 步

```
1. 卸载旧 App
2. 手机浏览器「无痕模式」(Chrome → 新建无痕标签页)
3. URL 末尾加 ?v=<commit-sha 或 timestamp> 强制 fresh fetch
   例: https://dls.xrobinai.cn/coolie/app/0.5.1/coolie-release.apk?v=abc123
4. 下载后立刻装，不要走"下载管理"
```

## 3. URL 加 timestamp 模板

```bash
TS=$(date +%s)
URL="https://dls.xrobinai.cn/coolie/app/0.5.2/coolie-release.apk?v=$TS"
echo $URL
```

## 4. 装机自检

装完打开：
- 设置 → 关于 → 版本号 → 应该 = **新版本号 (如 0.5.2 / 502)**
- 第一次启动 → 应该看到 **WhatsNewScreen** (0.5.2+ 有)
- 不应该看到 "当前运行在开发调试环境，OTA 热更新未启用"

如果以上任一项失败 → 重新走 §2。

## 5. 老板装机直链 (always-fresh URL 模板)

```
https://dls.xrobinai.cn/coolie/app/<version>/coolie-release.apk?v=<sha-or-timestamp>
```

## 6. 与其他 skill 协同

- `release-flow` —— 老板装新版必跑
- `ota-cache-busting` —— 改 bundle hash 才能让旧用户强制拉新
- `release-version-sync` —— APK 内嵌的 versionCode 必须跟 version.json 一致