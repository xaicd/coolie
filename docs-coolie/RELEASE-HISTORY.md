# Release History

Git 里程碑 tag 流水。自 **v0.5.97** 起建立本文件；此前的 0.5.x 发版只改 `version.json` /
`clients/expo`，未打 git tag（`git tag -l` 为空即历史事实）。

| Tag | Date | Version | Commit | Notes |
|---|---|---|---|---|
| v0.5.97 | 2026-09-29 | 0.5.97 | bc48b1e80 | wave142: WBS 任务自动路由 + 沙箱附件真渲染 + 启动链路端到端可观察 |

约定: tag 指向该版本「发版完成」的提交（含 `chore(release): version.json …` 这一步），
注释写本波主题。推送方式 `git push origin <tag>`（本仓库 push 需绕本地代理）。

## v0.5.98 — 已发起, 未发出 (blocked)

wave148 按 boss 拍板发起 `scripts/release-app.sh 0.5.98`, 在 `[1/9] 前置检查`
被拦下: 另一条并发工作线在 `clients/expo` 下有未提交的 tracked 改动
(`App.tsx` / `app.json` / `AppVersion.ts` / `PrototypeSandboxScreen.tsx`, 像是
iOS 发版在飞)。release-app.sh 拒绝为「对不上任何 commit」的产物出包, 而本波
纪律不允许提交别人未提交的仓区 —— 因此 **没有** v0.5.98 tag / APK / OTA。

wave144 修复 (`078923ead`) 与 wave148 全部改动已在 `main` 提交。工作区一干净即可
一条命令发出 (gradle → COS → version.json → OTA android → 联动部署 server):

```sh
bash scripts/release-app.sh 0.5.98 "wave144 工坊对话修复 + wave148 工坊多对话(新建/切换/重命名/归档)"
```

详见 `docs-coolie/evidence/wave148/QA-REPORT.md` §3B。

## v0.6.1 — 未发起 (本波未发版)

wave147 的 spec-driven 开发链（requirement/bugfix → design → task）代码已全部落 `main`，但**本波没有发版**:

- 目标版本按 brief 为 0.6.1，前提是 wave146 先发 0.6.0；实际 `version.json`/`app.json`
  仍是 **0.5.97**，wave146 的 0.6.0 未落地，wave148 的 0.5.98 也因 `clients/expo`
  有他人未提交改动被 `release-app.sh` 拦下（上节）。此时 bump 0.6.1 会跨版本、并冲撞
  其它并发工作线的发版 —— 违反「一波一版本、不动他人发版」。
- 出 APK 还需 Android 工具链且要五面对齐（version.json / OTA / sha256 / app.json / APK badging）。

→ 待 0.6.0/0.5.98 之一落地、`clients/expo` 工作区干净后，再出 0.6.1。
详见 `docs-coolie/evidence/wave147/QA-REPORT.md`。
