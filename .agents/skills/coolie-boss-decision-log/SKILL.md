---
name: coolie-boss-decision-log
description: 记录老板今天拍板的决策点。Use when PM 拍板 / 老板说"你定" / 跨班次交付时需要对齐决策历史。给下一班 PM 接手时无缝用。
---

# Coolie Boss Decision Log

## 老板 2026-09-21 拍板的决策（按时间）

### 决策 1: 项目边界

> 老板原话："coolie 这个系统要具备我说的功能" + "coolie 平台 APP 中对话过程如何预览 mvp，且能编辑代码"
> + "新开发的功能要 app,pc都能用" + "coolie 底层框架是 pageclip,dsh, 咱们主要是开发 app、本体插件、一些新功能接口"

**拍板：Coolie fork 边界**
- 不动：`paperclip` + `dsh` + `ui/` + `db/` + `adapters/` + 上游其他
- Coolie fork 自己：`clients/expo/` + `clients/h5/` + `server/` + `packages/{plugins,ontology-core,templates,agents}/` + `packages/shared/`

### 决策 2: ChatHome 默认走 / plugin-chat opt-in

> 老板："pluginchat 不如咱们的 chathome 吧" + "咱们默认开启自己的 chathome"

**拍板：**
- App + h5 / server 都默认走 ChatHome (Coolie fork 自己写的对话)
- plugin-chat 移到 `_deprecated/`，只有 `COOLIE_USE_PLUGIN_CHAT=true` 才加载
- 服务端 boot log 显式声明默认走 ChatHome

### 决策 3: 5 角色接 API + DS 否决

> 老板原话："5 角色 + DS 否决" + "咱们 chathome 放哪个 plugin 了"

**拍板：**
- 5 角色 = Palantir Foundry（FDA / Core SWE / PRE-SRE / FDSE / DS）
- ChatHome **不放在任何 plugin** 里 = 主仓核心能力
- DS 是**唯一**有权说"可以交付"的角色 → `release-app.sh` 必须 `requireDsApproval`，没 DS go 拒绝 release
- wave6 commit `2fe5f930a` + `3222d3b8c`

### 决策 4: 版本命名要 strict semver

> 老板："为啥每个版本名称都一样"

**拍板：从 0.7.0 起严格 semver 三段**
- patch (0.5.2 → 0.5.3): hotfix / 修 bug
- minor (0.5.x → 0.6.0): 新功能模块（5 角色 / ChatHome）
- major (x.0.0 → (x+1).0.0): breaking change

历史回顾：
- 0.3.0 → 0.3.5: patch series ✅
- 0.5.0 → 0.5.1 → 0.5.2: 跳过了 0.4.0 + 0.6.0（不当）
- 已发不能改 → 以后严格

### 决策 5: ChatHome 两端都要

> 老板："新开发的功能要 app,pc 都能用"

**拍板：**
- expo App + h5 PC web 双端并行交付
- 共享逻辑可重复（不抽 packages/inline-board/，第二批再说）

### 决策 6: 本地 e2e 跑测试

> 老板："测试就在开发机器本地跑就行" + "agent-device 验证"

**拍板：**
- 不依赖 CI
- `agent-device` web 模式跑 h5 + 真机模式跑 expo
- 截图本地（不入 git）
- `scripts/e2e-local.sh` + `clients/h5/replays/*.ad` + `clients/expo/replays/*.ad`

### 决策 7: 装机遇到的事

> 老板："算了我他么的发" + "白搭还是一样" + "啥也没有"

**拍板：**
- WhatsNewScreen 强制显示（不藏老界面）
- coolie://workspace 深链一键打开
- INSTALL-GUIDE.md + INSTALL-CHECK.md 双文档
- 装机 URL 加 ?v=timestamp 强制 fresh fetch
- 老板在无痕浏览器下载，不走微信下载管理

## PM 自我纪律

老板定的：
- **PM 只派活 + 验收 + 写文档，不写代码**
- 紧急修复也是匠人干，PM 派活
- 每 2 分钟汇报一次进度（任务跑着时）
- 报告格式："Xxx 完成了 Y；A 正在干 B"

## PM 跑过的踩坑（2026-09-21）

1. **5 次反复方向**：抄 ChatHome / ChatHome + Workspace / ChatHome + 4 Tab / 强制 ChatHome + Workspace / app+pc 都行
   → 教训：写 spec 前先和老板对 5 项决策
2. **派 claude 撞 model catalog** 200 turns 浪费 → 改 cmd
3. **release-app.sh 不 bump gradle** → 门神 hotfix + 写 sync skill
4. **deploy 漏 symlink** → 生产挂 → 门神手补 + 写 symlink skill
5. **截图入 git** → 违反 fork 政策 → 加 .gitignore + 改 brief

## 给下一班 PM 的提示

- 老板可能反复改方向 → 写完 spec 不直接派，先确认 5 项决策
- cmd 是唯一靠谱的 CLI，不要派 claude 跑 MiniMax-M3
- 装机直链永远带 ?v=timestamp
- OTA bundle hash 必须随发版变
- 部署后必须建 workspace symlinks
- dev 端口 3100 ≠ 生产端口 3100，别混淆