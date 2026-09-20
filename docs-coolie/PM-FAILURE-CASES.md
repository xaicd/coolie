# Coolie PM 失败复盘 — 2026-09-20

记录 2026-09-18 到 2026-09-20 之间派活中真实撞过的失败 + 修法，给以后 PM 流程做参考。

## F1. cmd CLI 卡死 / Unable to connect

**症状：** `cmd -p ...` 启动后立即报 "Unable to connect to the API. Please check your network connection." 或子进程静默退出。
**原因：** cmd 1.58.0 撞自己的 API 端点速率限制（启动时 tlementry / health-check）。
**修法：**
- 不要连环派单（同一匠人间隔 ≥3 分钟）
- 撞后立即 `pkill -f "cmd -p.*yolo"` 清场，等 5 分钟重试
- 长期方案：升级 cmd 到 1.59.x（自带 retry），或者切铁匠 claude 默认

## F2. claude sandbox 拦 git / pnpm / gradle

**症状：** claude -p 跑 fine 但 commit 时弹 "approval required"，加 `--allow-dangerously-skip-permissions` 后部分能过，但 git commit / pnpm / npx tsc / keytool / gradle / scp / coscli 仍被拒。
**原因：** claude Code 默认 sandbox 限制写权限 + 部分工具有风险评分。
**修法：**
- 给铁匠的简报写到 `docs-coolie/briefs/*.md`（仓库内路径，铁匠能读）
- 不要让铁匠碰 keystore / 真发版（用门神 cmd 做）
- fallback 写进简报里："如果 sandbox 拦了，try A / otherwise B"
- 模型 id 不在 catalog 时：`CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT=1`

## F3. 简报含 heredoc / 反引号炸 zsh

**症状：** 简报执行时 `zsh: command not found` 或 `unexpected EOF`，命令在传 cmd 之前就崩。
**原因：** 用 cat <<'EOF'...EOF 写简报时，里面出现反引号或 `$` 会被 zsh 拆碎。
**修法：**
- 用 `cat > /tmp/brief.md <<'EOF' ... EOF` （单引号 EOF 防止变量展开）
- 或者纯单行 brief：`cmd -p "$(echo brief content here)"` 
- 简报里写代码示例用 ASCII 引号而不是弯引号

## F4. 简报边界不清，匠人乱动文件

**症状：** 匠人跑完 commit 里带了一堆任务外文件（自己的 WIP、其他模块改动）。
**原因：** 简报没写「文件白名单」，匠人按需 grep 找文件时扩大了范围。
**修法：**
- 简报必含 `## 文件范围（白名单）` 一节，列绝对路径
- 明确禁止项："不动 X / 跳过 Y"
- 验收时 `git diff HEAD~1 HEAD --stat` 复核文件清单

## F5. 「修一下」级简报，匠人无从下手

**症状：** 派单时只说「修一下登录 bug」，匠人回「找不到 bug 在哪 / 没文件 / 没法复现」。
**原因：** 老板描述不完整，缺少：哪个 tab / 之前做了什么 / 错误文字。
**修法：**
- 简报必含 7 要素：任务 / 背景 / 分支 / 文件范围 / 步骤 / 验收 / 规则
- 强制要求老板给：截图（带 URL）+ 错误原文（logcat / Alert 文案）+ 复现路径
- 复现失败的简报先存档 `docs-coolie/briefs/_failed-YYYY-MM-DD-*.md`，不要硬派

## F6. 派错分支 / 错版本

**症状：** 匠人在 release/0.5.0 分支跑，门神发版脚本准备标 0.3.6，导致版本号 down-grade 错位。
**原因：** 简报没显式 `git checkout <branch>`，或描述与分支实际位置不一致。
**修法：**
- 简报必含「## 分支」节，**显式**写 checkout 命令
- 涉及发版时，明写「如分支不对 abort，不发版」
- 门神拒发版是合理的，不要硬压（曾发生过两次 v0.3.6 拒发）

## F7. cmd max-turns 不够

**症状：** 门神中途报 "Reached maximum conversation turns (30). The response may be incomplete."
**原因：** 单次 max-turns 不够覆盖：发版脚本 + 打包（gradle ~10 分钟）+ 上传 COS + OTA + 验证 = 至少 50-80 步。
**修法：**
- 发版活给 max-turns **80-160**
- 普通改给小一些（30-50）
- 单文件小修可以 20

## F8. 没有 tsc 信号就敢发版

**症状：** 0.3.4 / 0.3.5 紧急发版时，tsc 只验过 clients/expo，没验 server/。结果 0.3.5 装上对话断（怀疑服务端）。
**原因：** 紧急派单跳过完整验收。
**修法：**
- 发版必跑 `pnpm -r typecheck`（整个仓库）
- 同时 `pnpm test:e2e` 跑 smoke（不要等老板报）
- 加 prod curl 烟测：`/api/board/chat/stream` SSE chunks 实测

## F9. keystore 密码泄露到 transcript

**症状：** `coolie-keystore-2026` 出现在命令 transcript 里 + gradle.properties（gitignored 但 session 历史仍有）。
**原因：** 简报里明文写密码 + 我 (Hermes) 把密码 echo 到外面。
**修法：**
- keystore 密码用 secret manager（1Password / Bitwarden / vault）
- gradle.properties 引用 `System.getenv("KEYSTORE_PASS")`，CI 从 secret 注入
- 发版活老板提前告诉我用哪个 secret，临时注入到环境变量
- 已泄露的密码轮换

## F10. release-app.sh 不更新 build.gradle versionCode

**症状：** 0.3.4 发布时 build.gradle 还停在 304，APK native manifest 和 app.json versionCode 对不齐，OTA runtimeVersion 错位。
**原因：** 脚本只管 expo.version，不管 build.gradle。
**修法：**
- 简报必含：「同步手改 android/app/build.gradle versionCode = X」
- 长期：发版前让 build.gradle 模板从 app.json 读 expo.version + 自动派生 versionCode
- 加 prebuild hook

## F11. cmd 升级失败

**症状：** `npm install -g command-code@latest` 报 Done in 9ms，但版本仍 1.58.0。
**原因：** npm 全局 install sandbox 限制 / 网络问题。
**修法：**
- 用 pnpm：`pnpm install -g command-code@latest`
- 或者从源码：`npm i -g https://github.com/commandcode/command-code.git`
- 临时 fallback：直接 git clone 到 `~/.hermes/hermes-agent/venv/bin/cmd`

## F12. 调度串行忙坏 / 没冷却

**症状：** 10 分钟内连派 4 个 cmd 任务（v0.3.4 → v0.3.5 → v0.3.6 → v0.5.0），全部撞速率限制或超时。
**原因：** PM 自己没节流。
**修法：**
- 单匠人连发：间隔 ≥3 min（cmd）或 ≥30s（claude）
- Coolie 系统内已经落 pacing rules（0df489620）— 系统强制
- PM 外部自约束：日上限 8 个派单（4 cmd + 2 claude + 2 manual review）

## F13. 派单没保留 receipt

**症状：** 老板问"进度如何"，PM 还要 grep git log 才答得出来。
**原因：** 没把"派单 + 完工 + 验收"链路落到文档。
**修法：**
- docs-coolie/dispatch-log-YYYY-MM-DD.md：每天一文件，记录派单 + 进度 + 完工
- 派单时记 `pid + proc + 匠人 + brief path + commit hash`
- 完工时补：`commit hash + APK URL + version.json + 老板验收反馈`

## F14. 仓库存了老板未提交的 WIP

**症状：** App.tsx + useRecorder.ts 一直 modify 着（voice 派发录音停止修复，老板之前的 WIP），没人敢 commit 也没人敢 stash。
**原因：** 跨多个派单，WIP 一直在叠加。
**修法：**
- 简报里明写「不动 voice WIP」+「用 git stash 暂存」
- 每隔 N 个版本合一次主分支：让 WIP 收敛
- 长期：让 WIP 立刻 commit 到 WIP 分支（feature/wip-voice-record）

## F15. PM 替匠人 commit

**症状：** Hermes 替匠人 commit 文档/PM 文档甚至代码（1ad05c8be 是 Hermes 替 commit 的）。
**原因：** 紧急时刻绕过「派活不写代码」规矩。
**修法：**
- 规矩：PM 只写 docs-coolie/** 和派单相关脚本，不碰代码
- 例外：build orchestrator（merge commit） + PM 文档（docs-coolie/PM-*.md）允许 PM 自 commit
- 例外清单写进 PM-DISPATCH-RULES.md 让所有人看得到

## 复盘统计（2026-09-20 当日）

- **派单总次数：** ~25
- **撞 F1（cmd 速率限制）：** 5 次
- **撞 F2（claude sandbox）：** 3 次
- **撞 F3（heredoc 炸 zsh）：** 2 次
- **撞 F5（描述不清）：** 2 次
- **撞 F6（分支错位）：** 3 次（v0.3.6 拒发两次 + 一次分支 switch 没听话）
- **撞 F7（max-turns 不够）：** 4 次
- **撞 F12（连环派单）：** 1 次（一次性派 4 个活把 cmd 撞挂）
- **撞 F14（WIP 累积）：** 整个会话持续

**预计下次改进：**
- 简报模板强制要求 7 要素齐备（自动校验）
- 派单间隔自动 sleep 3 分钟（cron-like）
- PM-FAILURE-CASES.md 自动累加新失败