---
name: app-release-pipeline
description: Coolie 平台全栈版本发布统一操作指南（打包、发布、Git Tag Push、OTA 增量触发与 7 处版本一致性守卫）。当用户或系统要求“发版”、“发布新版本”、“打包 APK”、“发布 OTA”、“推 tag”、“触发更新”时使用。
---

# Coolie 版本发布全流程规范与操作指南 (app-release-pipeline)

> **核心原则**：
> 1. **代码完成必提交，发版必须打 Tag**：每次发版版本号同步推一个 Git Tag，Tag 必须精准指向「发版完成」的那一笔 release commit。
> 2. **7 处版本号源必须绝对一致**：禁止任何单方篡改或漂移。
> 3. **不可变构建与指纹溯源**：严禁在未 Commit 的脏工作区发版，确保线上每一个 Bundle / APK 都能精确对应到 Git SHA。

---

## 1. 两种发布路径与决策矩阵

| 发布形态 | 适用场景 | 耗时 | 客户端行为 | 触发命令 |
| :--- | :--- | :--- | :--- | :--- |
| **A. 原生全量发版 (Full APK Release)** | 改动涉及原生模块、Android/iOS 配置、重大底层架构升级、Bump 版本号 | 约 3~5 分钟 | 用户打开 App 收到版本弹窗，下载 APK 覆盖安装 | `bash scripts/release-pipeline.sh app <版本号> "<更新说明>"` |
| **B. 增量热更新 (OTA JS Bundle Only)** | 纯 React Native / UI / 业务逻辑修复（未改动原生代码与 package 依赖） | 约 30 秒 | 用户下次启动 App 静默下载，重启即刻生效 | `bash scripts/release-pipeline.sh ota "<更新说明>"` |

---

## 2. 7 处版本一致性铁律 (Single Source of Truth)

每次原生发版必须保证以下 7 处版本号逐字一致：
1. `clients/expo/app.json` (`expo.version` 与 `expo.android.versionCode`)
2. `clients/expo/package.json` (`version`)
3. `clients/expo/android/app/build.gradle` (`versionName` 与 `versionCode`)
4. `clients/expo/CHANGELOG.md` (顶部首个 `## v<version>` 节)
5. 远端 `https://xrobinai.cn/version.json` (`version` 与 `versionCode`)
6. 远端 `https://xrobinai.cn/ota/manifest` (`runtimeVersion`)
7. Git Tag (`v<version>`)

一键校验命令：
```bash
bash scripts/release-pipeline.sh check [版本号]
```
退出码 `0` 表示校验完全通过。

---

## 3. 标准发版操作 SOP

### 场景一：原生全量发版 (Bump 版本 + APK + OTA + Server + Tag)

当需要正式推进新版本（如从 `0.6.24` 到 `0.6.25`）时：

1. **确认功能代码已提交**：
   ```bash
   git status  # 必须干净无未跟踪代码
   ```
2. **执行统一发布流水线**：
   ```bash
   bash scripts/release-pipeline.sh app 0.6.25 "重构任务新建交互与看板流式分页"
   ```
   *流水线会自动依次完成：*
   - [1/12] 校验前置环境与工作区干净度
   - [2/12] 自动化 Bump `app.json`、`package.json`、`build.gradle`
   - [3/12] 自动更新 `CHANGELOG.md`
   - [4/12] 生成标准 release commit：`release: v0.6.25 — 重构任务新建交互与看板流式分页`
   - [5/12] 检查 AndroidManifest 与 runtimeVersion 防漂移
   - [6/12] Gradle 编译生成 `app-release.apk`
   - [7/12] 上传 APK 至腾讯云 COS (`cos://gzbucket/coolie/app/`)
   - [8/12] 生成包含 `commitSha` 的 `version.json` 并推送到生产 Web 根目录
   - [9/12] 自动导出并发布匹配的 OTA Bundle 与 Hash Manifest
   - [10/12] 联动部署云端生产 Server 服务
   - [11/12] 运行 4 护栏自动化拨测 (version.json / ota / APK / health)
   - [12/12] **自动打标注 Git Tag `v0.6.25` 并推送至 `origin`**

---

### 场景二：纯 JS 逻辑快速修复 (OTA 增量发版)

当仅修复 UI 交互 Bug，无需重新编译 APK：

1. **提交代码到 Git**（严禁脏工作区发布）：
   ```bash
   git commit -m "fix(ui): 修复看板列拖拽异常"
   git push origin main
   ```
2. **执行 OTA 发布**：
   ```bash
   bash scripts/release-pipeline.sh ota "修复看板列拖拽异常"
   ```
   *发布会自动完成：*
   - 导出 JS Bundle
   - 计算 Assets 和 Bundle Hash 写入 Manifest（防 Caddy 兜底路由与老缓存污染）
   - Rsync 部署至生产 `/opt/coolie/ui/ota/`

---

### 场景三：补打或推送漏掉的 Git Tag

如果发版过程中因网络抖动导致 Tag 未成功推送到 GitHub：

```bash
bash scripts/release-pipeline.sh tag-push [版本号]
```
脚本会自动定位标题为 `release: v<version>` 的 commit，创建本地 annotated tag 并推送到远端。

---

## 4. 常见陷阱与避坑指南 (血泪总结)

1. **Tag 必须指向 release commit，不要指向后续的 docs commit**：
   - 正确：Tag 绑在 `release: v0.6.24 — ...` 这一笔提交上。
   - 错误：发版后写了总结文档，把 Tag 打在后续的 docs 提交上。
2. **Docker 容器沙箱与 Mac 宿主机工具链隔离**：
   - Gradle Android 编译、`coscli` 上传依赖 Mac 宿主机的 Homebrew 与 JDK 17 环境。
   - `scripts/release-pipeline.sh` 会自动检测 Docker 环境并通过 `host-exec.sh` 穿透执行，避免误报环境缺失。
3. **OTA Caddy 兜底路由陷阱**：
   - 生产 Caddy 配了 SPA 兜底路由，如果 OTA manifest 缺失或路径不对，会被回落成 HTML，导致 App 端 `expo-updates` 静默解析崩溃。发版后务必确认 `curl https://xrobinai.cn/ota/manifest` 返回合法 JSON。
4. **version.json 被 rsync 抹掉陷阱**：
   - 部署前端静态资源时，严禁使用盲目的 `rsync --delete` 将根目录下的 `version.json` 覆盖删除。发布流水线内建了安全保护。
