# Release History

Git 里程碑 tag 流水。自 **v0.5.97** 起建立本文件；此前的 0.5.x 发版只改 `version.json` /
`clients/expo`，未打 git tag（`git tag -l` 为空即历史事实）。

| Tag | Date | Version | Commit | Notes |
|---|---|---|---|---|
| v0.5.97 | 2026-09-29 | 0.5.97 | bc48b1e80 | wave142: WBS 任务自动路由 + 沙箱附件真渲染 + 启动链路端到端可观察 |

约定: tag 指向该版本「发版完成」的提交（含 `chore(release): version.json …` 这一步），
注释写本波主题。推送方式 `git push origin <tag>`（本仓库 push 需绕本地代理）。
