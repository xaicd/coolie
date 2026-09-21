# Coolie App 装机 + 诊断指南 — 2026-09-21

> 老板「0.5.0啥也没有」诊断专用。解决路径 4 步。

## 1. 装新版 APK（解决 80% 「啥也没有」问题）

**链接（最新生产 v0.5.0）：**
```
https://dls.xrobinai.cn/coolie/app/0.5.0/coolie-release.apk
```
- 大小：**77,587,218 字节（77.5 MB）**
- 验证：浏览器打开 → 应弹下载

**装机步骤：**

```
1. 手机「设置 → 安全」开「未知来源」（允许装第三方 APK）
2. 用手机 Chrome / 系统浏览器打开上面链接
3. 下载完成后系统会问是否安装，点「安装」
4. 安装完成后打开 Coolie App
5. App 会自动检查 OTA → 拉到新版 JS bundle（指数 0.5.0 → 0.5.1 patch）
```

**装完之后重启 App：**

```
任务列表 → 杀后台 Coolie 进程
重新打开 Coolie App
等 ~30 秒（首次启动要初始化 + 检查 OTA + 拉 bundle）
```

## 2. 装完如果「啥也没有」诊断

### 2.1 看版本号

```
App 左上角 / 设置 → 关于 → 版本号
应该看到: 0.5.0 (500)
如果看到 0.3.x / 0.5.0 (304) → APK 装错了，重装 0.5.0
```

### 2.2 看「Workspace」入口位置

```
底部 5 Tab: 汇览 / 员工 / 工坊 / 任务 / 本体
↓
点「工坊」(第3个)
↓
进 BoardChatScreen (工坊对话流)
↓
看右上角有 [Workspace] 按钮 (App.tsx:841 onOpenWorkspace)
↓
点 [Workspace] 弹 Modal
↓ 4 Tab 切换: 对话 / 预览 / 文件 / 终端
```

**如果「工坊」tab 进去是空的（没有对话流）= 没登录 = 看 §3**

### 2.3 看 expo-updates 状态

```
App → 设置 → 关于 → Updates
应该看到: latest = 0.5.1 patch (2026-09-21)
如果看不到 = OTA 失败，看 §4
```

## 3. 登录 / 注册

如果 App 装完打开是登录页（默认已登录 stub 不在生产）：

```
1. 注册 / 登录账号（用 weixin 同样的手机号）
2. 进默认公司 / 建公司
3. 进工坊 tab
4. 才能看到 Workspace 按钮
```

## 4. OTA 失败的兜底

如果 §2.3 Updates 显示「latest = 没找到」或 stale：

```
方案 A（手动）：
1. 卸载 App
2. 重装 0.5.0 APK（链接同 §1）
3. 第一次打开 App 时确保 WiFi/4G 通
4. 等待 ~30 秒

方案 B（彻底重置）：
1. 卸载 App
2. 清理 Expo Cache（如果用 Expo Go）
3. 重装 0.5.0 APK

方案 C（求助 PM）：
1. weixin 发掌柜 app logcat
2. 掌柜排查
```

## 5. 老老板的 5 个 APK 版本(送别)

老板的手机里可能装了老版本（这页最关键）：

| 版本 | 发布 | OTA ENABLED | 有「Workspace」按钮 |
|---|---|---|---|
| 0.5.0 (500) | 2026-09-20 | ✅ true | ✅ 有 |
| 0.5.0 (304) | 2026-09-19 | ✅ true | ❌ **没有**（修过 OTA 但 UI 还没 Workspace 组件）|
| 0.3.5 | 2026-09-15 | ❌ **false** | ❌ 没有 |
| 0.3.4 | 2026-09-14 | ❌ false | ❌ 没有 |
| 0.3.3 | 2026-09-13 | ✅ true | ❌ 没有 |

**老板如果不确定装的是哪个：**
1. 卸了
2. 重新装 0.5.0 (500)
3. 第一次启动 + 等30秒

## 6. 文件证据

```
生产 APK:  https://dls.xrobinai.cn/coolie/app/0.5.0/coolie-release.apk
生产 version.json:  https://xrobinai.cn/version.json
生产 OTA manifest:  https://xrobinai.cn/ota/manifest
生产后端 health:    https://xrobinai.cn/api/health
```

## 7. 老板的指南发到 weixin 后的下一步

老板重装之后：
1. 装完 + 重启 + 等 30 秒
2. 进「工坊」tab
3. 看右上角有没有 [Workspace] 按钮
4. 如果有 → 点开 → 看到 4 Tab → 反馈
5. 如果没有 → weixin 给掌柜反馈 → 排查