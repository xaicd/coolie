# Brief: wave 39 — 评估 Coolie Web 并入 Coolie工坊 App 可行性 (boss 23:55 OOB '为啥一定要独立包')

Repo: `~/workspace/xaicd/coolie` (main)
PM: Hermes
Worker: cmd

## 0. Boss 09-22 23:55 OOB 「为啥一定要独立包」

老板装 Coolie工坊 0.5.18 看到弹窗「未安装 Coolie Web (cloud.coolie.app.web)」, 问: 为什么 Coolie Web 要独立 APK 包? 能不能并入 Coolie工坊 一个 APK?

PM 老实盘点当前架构:
- Coolie工坊 App: `clients/expo/` (RN 自研, 包名 cloud.coolie.app)
- Coolie Web (paperclip-web 套壳): `clients/expo-paperclip-web/` (RN + Paperclip 上游 React, 包名 cloud.coolie.app.web)
- h5 web: `clients/h5/` (Vite + React, 部署到 xrobinai.cn/h5/)

## 1. 已知现状

```
✅ Coolie工坊 0.5.18 + Coolie Web 0.6.4 + h5 web 0.6.2 三独立产物
✅ 互跳 deep link: coolieweb:// / coolie://workspace / coolie://chat/build
✅ 不同 bundle identifier (cloud.coolie.app / cloud.coolie.app.web / 无)
✅ 不同发布脚本 (release-app.sh / publish-ota-paperclip-web.sh / publish-h5.sh)
❌ 老板装 Coolie工坊, 弹窗「未安装 Coolie Web」 (独立包体验差)
```

## 2. 目标

**只评估, 不动代码**. 出 `docs-coolie/CONSOLIDATION-ASSESSMENT.md` 报告:

- 当前架构 (3 包 / 4 类资产)
- 并入方案 (3 选项 + 优劣对比)
- 实施成本估算 (人天 / 风险 / 收益)
- 推荐方案 + 老板拍板

## 3. 任务 (4 步)

### 3.1 盘当前架构

读:
- `clients/expo/app.json` (Coolie工坊 App 配置)
- `clients/expo-paperclip-web/app.json` (Coolie Web 配置)
- `clients/h5/package.json` (h5 web 配置)
- `scripts/release-app.sh` / `scripts/publish-ota-paperclip-web.sh` / `scripts/publish-h5.sh`
- `docs-coolie/FORK-SURFACE-AUDIT.md` (fork 边界)

整理架构图: 3 包, 各自 build 路径, 各自 deploy 链路.

### 3.2 评估并入 3 方案

**方案 A: 完全合并 (1 个 APK 含 webview)**

```
clients/expo/ (Coolie工坊 RN 自研)
  ↓ 内嵌 webview (Coolie Web 作为 webview 入口)
  ↓ 发布: 1 个 APK (含 webview)
```

优劣:
- ✅ 一个 APK, 不用装 2 个
- ✅ 资源复用 (字体 / 图标 / token / i18n)
- ❌ 体积大 (webview JS + RN bundle + 1 GB+ native libs)
- ❌ webview 里是 React-DOM (paperclip 上游), 跟 RN 调试栈不同
- ❌ 不能装 Coolie Web 独立版 (硬编码 cloud.coolie.app/webview)
- ❌ fork 边界模糊 (fork 仅含 App, 吞 Web = 边界重定义)

**方案 B: 渐进合并 (Coolie工坊 含 webview, Coolie Web 仍独立)**

```
clients/expo/ (Coolie工坊 RN 自研 + WebView 页)
  ↓ 启动时检查 Coolie Web 是否装
  ↓ 装: 深链 coolieweb:// 打开
  ↓ 没装: 显示 "未安装 Coolie Web" 提示 + 安装按钮 (apk 下载)
```

优劣:
- ✅ 渐进, 不破坏现有 (老板可继续装 Coolie Web 独立版)
- ❌ "未安装" 提示仍存在
- ❌ 实现复杂 (webview 检测 + 下载引导)

**方案 C: 维持 3 包独立 (不动)**

```
3 包不变, 只优化弹窗体验
  - 「未安装 Coolie Web」 改成 「安装 Coolie Web (可选)」 + 下载链接
  - 加 "跳过" 按钮
```

优劣:
- ✅ 最稳, 改动最小
- ❌ 老板看到 3 个 APK 仍觉得多

### 3.3 实施成本估算

| 方案 | 人天 | 风险 | 收益 |
|---|---|---|---|
| A 完全合并 | 6-8 人天 (webview 嵌入 + 体积优化 + 调试) | 高 (fork 边界变) | 中 |
| B 渐进 | 3-4 人天 (webview 检测 + 下载引导) | 中 | 低 |
| C 维持 | 0.5 人天 (改弹窗文案) | 极低 | 极低 |

### 3.4 出 docs-coolie/CONSOLIDATION-ASSESSMENT.md

报告结构:

```markdown
# Coolie 包架构合并评估 (PM 2026-09-23)

## 1. 当前架构
[3 包架构图]

## 2. 3 方案对比
| 维度 | A 完全合并 | B 渐进 | C 维持 |
| --- | --- | --- | --- |
| 装几个 APK | 1 | 2 (可选 1) | 2 |
| 体积 | 大 | 中 | 中 |
| fork 边界 | 模糊 | 清晰 | 清晰 |
| 人天 | 6-8 | 3-4 | 0.5 |
| 风险 | 高 | 中 | 极低 |
| 收益 | 中 | 低 | 极低 |

## 3. PM 推荐
- 短期 (本周): 方案 C (改弹窗文案 + "跳过" 按钮)
- 中期 (下季度): 评估方案 B (渐进合并)
- 长期: 不推荐方案 A (体积/边界风险大)

## 4. 等老板选
短期选 C / 中期选 B / 不动 / 自定义
```

## 4. Constraints

- ❌ DON'T 改代码 (只评估)
- ❌ DON'T 合并 Coolie Web 进 Coolie工坊
- ✅ DO 出报告 + 3 方案对比
- ✅ DO 推荐短期方案 C (改弹窗文案)

## 5. Done definition

4 步全完 + docs-coolie/CONSOLIDATION-ASSESSMENT.md 入档 + commit + push + 报告给老板:

```
docs-coolie/CONSOLIDATION-ASSESSMENT.md (新文件)
```