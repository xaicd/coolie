# Coolie App 装机 + 诊断指南 — 2026-09-21 终版

> **当前生产版：**
> - **Coolie工坊** v0.5.5 (505) — 移动驾驶舱 (cloud.coolie.app)
> - **Coolie Web** v0.6.2 (3) — 完整 paperclip PC web 套壳 (cloud.coolie.app.web)
> **两个 App 共存**：可同时装在老板手机上互不冲突；appBar 右侧 [驾驶舱Web] / [驾驶舱] 互相跳转。

---

## 0. 装机前必做（30 秒，专治「装了没变化」）

老板之前装 0.5.0 / 0.5.1 / 0.5.2 都看到老界面，根因是 **在微信里点链接下载，微信下载管理器缓存/分发了旧 APK**。

```
1. ❌ 不要在微信对话里点链接下载 APK
2. ✅ 用浏览器「无痕模式」(Chrome: 新建无痕标签页) 打开下面 §1 / §2 的直链
3. ✅ 装之前先卸载旧版 Coolie（设置 → 应用 → Coolie / Coolie Web → 卸载）
```

## 1. 装 Coolie工坊 (驾驶舱 App) — v0.5.5

```
https://dls.xrobinai.cn/coolie/app/0.5.5/coolie-release.apk
```

- 包名：`cloud.coolie.app`
- 大小：约 77.6 MB (77,640,022 字节)
- versionCode：505

装机后应该看到的：

```
1. WhatsNewScreen 弹窗（Coolie 0.5.5 已就绪）
2. [我知道了] / [查看演示]
3. 进登录页（邮箱+密码 或 [改用 API Key 登录]）
4. 登录 → 主页
5. 顶部 appBar: 「Coolie工坊」+ 右侧 [驾驶舱Web]
6. 底部 tabBar: 汇览 / 任务 / [+] FAB / 员工 / 收件箱
7. 点 [驾驶舱Web] → 跳 coolieweb:// → 0.6.2 Coolie Web App
```

---

## 2. 装 Coolie Web (paperclip PC web 套壳 App) — v0.6.2

```
https://dls.xrobinai.cn/coolie/app/0.6.2-paperclip-web/coolie-release.apk
```

- 包名：`cloud.coolie.app.web`
- 大小：约 66 MB (66,076,606 字节)
- versionCode：3
- 应用名：Coolie Web

装机后应该看到的：

```
1. 启动 → 直接 paperclip PC web 加载
2. 顶部 appBar: 「← Coolie Web [驾驶舱]」
3. 中间: paperclip 完整 PC web (12 项导航 / 会议室 / Agent Feed / Agent Chat)
4. 默认中文 (zh-CN 自动注入 + i18n patch 层覆盖硬编码英文)
5. 登录后看到 dashboard + 智能体 + Routines / 审计 / 连接器
6. 点 [驾驶舱] → 跳 coolie:// → 0.5.5 驾驶舱 App
```

---

## 3. 两个 App 互跳

```
Coolie工坊 (0.5.5)  ── [驾驶舱Web] ──→  Coolie Web (0.6.2)
       ↑                                       │
       └──────── [驾驶舱] (顶部右) ──────────┘
```

实现：`Linking.openURL` + `coolie://` 或 `coolieweb://` 深链。

## 4. 装错版本诊断 (3 步强制自检)

```
1. 进 App → 设置 → 关于 → 确认版本号 (0.5.5 / 505 或 0.6.2 / 3)
2. 启动看 WhatsNewScreen 弹了吗? (0.5.5+ 强制弹)
   - 没弹 = 装错了 APK
3. 顶部 appBar 是否像 App 不像浏览器?
   - 像 (没有 URL 框/箭头) = 装对了
```

---

## 5. 老板历史撞过的坑 (避坑)

### 5.1 微信下载 APK 缓存装错版本

```
症状: 装 0.5.1 APK 后看到 0.5.0 老界面
原因: 在微信里点链接下载, 微信下载管理器缓存/分发了旧 APK
解决: 浏览器无痕模式下载
```

### 5.2 OTA 没真正工作

```
症状: 装新 APK 后 UI 没更新
原因: expo-updates 配置键名写错 (expo.modules.updates.UPDATE_URL 应是 EXPO_UPDATE_URL)
解决: 0.5.5 已修复 (commit 7cbc70306)
```

### 5.3 Login 按钮 disabled 看起来无响应

```
症状: 点 [登录] 无反应
原因: useToken 状态机切到 API Key 模式后, 旧输入没清空
解决: 0.5.5 已修 (commit 9638f8e97)
```

### 5.4 WhatsNewScreen 不弹

```
症状: 装机后直接进登录页, 没有 WhatsNewScreen
原因: WhatsNewScreen effect 在 HomeScreen 里调用, 登录前不渲染
解决: 0.5.5 已修 (commit 9638f8e97)
```

### 5.5 0.6.1 Coolie Web 之前显示英文

```
症状: 装机后 paperclip PC web 全英文
原因: 上游 zh-CN.json 144/144 keys 覆盖 100%, 但大量硬编码 EN 没走 i18n
解决: 0.6.2 加 I18N_PATCH dictionary (180 条) + MutationObserver 运行时替换
```

---

## 6. 故障排查表

| 症状 | 第一步 | 第二步 |
|---|---|---|
| 装 0.5.5 没看到 WhatsNewScreen | 看 App 设置 → 关于 → 版本号 (是否 505) | 浏览器无痕模式重装 |
| 登录按钮 disabled | 切到「改用 API Key 登录」会自动清空 inputs | 看屏幕底部 ready 提示文案 |
| 看不到顶部 appBar | 看 app icon 是不是 Coolie Web | 装的是 0.5.5 不是 0.6.2 |
| 0.6.2 Coolie Web 还是英文 | 杀后台 + 重开 App | 浏览器无痕模式重装 |
| 点 [驾驶舱Web] 没反应 | 装 Coolie Web App | 没装的话先装 §2 |
| App 启动崩 / 白屏 | `adb logcat | grep -i "coolie\|expo\|fatal"` | 看具体 exception |

---

## 7. 文件引用

```
生产 APK:          https://dls.xrobinai.cn/coolie/app/{version}/coolie-release.apk
生产 version.json:  https://xrobinai.cn/version.json
生产 OTA manifest:  https://xrobinai.cn/ota/manifest
生产后端 health:    https://xrobinai.cn/api/health
COS 桶:             gzbucket (sls-cloudfunction-ap-guangzhou-code-1258019043)
```

---

## 8. 真值采集 (PM 2026-09-21 实查)

| 资源 | version | versionCode | size | 真值源 |
|---|---|---|---|---|
| Coolie工坊 | 0.5.5 | 505 | 77,640,022 B | `https://xrobinai.cn/version.json` |
| Coolie Web | 0.6.2 | 3 | 66,076,606 B | `https://dls.xrobinai.cn/.../0.6.2-.../coolie-release.apk` |
| OTA runtime | 0.5.5 | - | 3.3 MB bundle | `https://xrobinai.cn/ota/manifest` |

---

## 9. 给下一班 PM 的提示

- 装机直链永远带 `?v=<timestamp>` 后缀避免 CDN 缓存
- 装机前永远让老板无痕浏览器下载
- 安装包签名沿用 0.3.4 release.keystore (RSA 4096)，未改
- 老板手机可同时装 0.5.5 + 0.6.2 两个 App（不同包名）
