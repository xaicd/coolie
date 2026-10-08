# Coolie PM 派单流水 — 2026-09-20

按时间顺序记录 Hermes 派给门神 / 铁匠 / 墨斗的所有任务。每个任务记：
- **proc ID**（进程号，便于 ps 追溯）
- **匠人** + brief 路径
- **承接的活**（一句话）
- **结果**（commit hash / APK / version.json / 失败原因）
- **派单教训**（F1-F15 引用 PM-FAILURE-CASES.md）

时间戳用 CST (UTC+8)。

---

## 09:00 — 09:59

| 时间 | proc | 匠人 | 任务 | 状态 | 备注 |
|---|---|---|---|---|---|
| 09:00 | — | — | 重新连 0.3.4 上线前的工具链校验 | ✅ | health 200, version.json 0.3.4 |
| 09:02 | — | 门神 | 阶段 A 抽组件库 + BUG1 审批跳转 | ✅ `68bb5bba9` / `87367089d` | -841 LOC |
| 09:10 | — | 门神 | 阶段 B 本体重设计 | ✅ `fe07cfa33` | -85 LOC（低于预估 -620） |
| 09:18 | — | 门神 | 阶段 C 任务页重设计 | ✅ `e7c6f56b7` | App.tsx 2231 → ~350 |
| 09:25 | — | 门神 | prototype-sandbox 轻量直开 | ✅ `9e37bda77` | +124 行 |
| 09:32 | — | 门神 | 审批点击化 V1 | ✅ `67023cabb` | Dashboard→详情 |
| 09:40 | — | 门神 | 审批点击化 V2 气泡内嵌 | ✅ `1c67e2d09` | 气泡+深链 |
| 09:55 | — | 门神 | v0.3.1 发版 | ✅ `fd99bdcf5` | 招商+OTA |

## 10:00 — 10:59

| 时间 | proc | 匠人 | 任务 | 状态 | 备注 |
|---|---|---|---|---|---|
| 10:08 | — | 门神 | v0.3.2 语音录音停止修复 + 0.3.2 发版 | ✅ `4b8708d9f` / `5aec7285b` | max-turns 60 跑完 |
| 10:25 | — | 铁匠 | UI 体检报告 | ✅ `bf40dbafb` | 7 件套 PM 文档第一份 |
| 10:45 | — | 门神 | v0.3.3 + 阶段 A + 原型沙箱 + BUG1 | ✅ `68bb5bba9` `9e37bda77` `87367089d` `ae0530748` | -841 + 3 个 fix |

## 11:00 — 11:59

| 时间 | proc | 匠人 | 任务 | 状态 | 备注 |
|---|---|---|---|---|---|
| 11:05 | — | 门神 | 插件 plugin-multimodal 安装 | ✅ 直接 SQL/接口 | ASR 待配密钥 |
| 11:18 | — | 门神 | 7 个本体域种子数据注入 | ✅ Promise.all | 91 节点 / 98 边 |
| 11:35 | — | 门神 | 腾讯 ASR 密钥落库 + plugin 配置引用 | ✅ `company_secrets` 表 | A 方案（复用 COS） |
| 11:55 | — | 铁匠 | 4 活串行（perf+keystore / e2e / 安全 / build）| ⛔ 卡 sandbox | F2 命中 |

## 12:00 — 12:59

| 时间 | proc | 匠人 | 任务 | 状态 | 备注 |
|---|---|---|---|---|---|
| 12:03 | — | 门神 | 阶段 B 本体重设计 | ✅ `fe07cfa33` | -85 LOC |
| 12:08 | — | 门神 | 阶段 C 任务页重设计 | ✅ `e7c6f56b7` | App.tsx 2231 → ~350 |
| 12:11 | — | 门神 | prototype-sandbox 轻量直开 | ✅ `9e37bda77` | 排队 |
| 12:14 | — | 门神 | release/0.4.0 分支 | ✅ 创建 | 阶段 B + C |
| 12:25 | — | 门神 | 阶段 A 抽组件库 | ✅ `68bb5bba9` | +3 个 fix commit |
| 12:30 | — | 门神 | APK 瘦身调研 | ✅ `/tmp/apk-size-report.md` | 77→18MB 理论 |

## 13:00 — 13:59

| 时间 | proc | 匠人 | 任务 | 状态 | 备注 |
|---|---|---|---|---|---|
| 13:05 | — | 门神 | 4 活全派（性能/e2e/build/安全）| ⛔ cmd 撞 F1 | 速率限制全挂 |
| 13:08 | — | 门神 | 性能 + keystore | ⛔ | F1 撞限 |
| 13:18 | — | 门神 | 4 活 / cli 全 reset | ⛔ | F1 反复撞 |
| 13:25 | — | 门神 | 性能 + keystore | ⛔ | "Unable to connect" |
| 13:30 | — | 门神 | build orchestrator | ⛔ | SIGKILL exit -9 |
| 13:32 | — | 门神 | e2e | ⛔ | 撞 sandbox + Rate limit |
| 13:33 | — | 门神 | build orchestrator | ⛔ | 撞 sandbox |
| 13:42 | — | 门神 | cmd 升级 | ⛔ | npm install 不生效 |
| 13:55 | — | 门神 | v0.3.5 keystore + 重签 | ✅ `99b2bcf3e` `24baece6f` | 撞错分支但门神自纠 |
| 13:58 | — | 门神 | v0.3.6 voice Object fix | ✅ `bf6dafd80` `2023ae59e` | 语音修 |

## 14:00 — 14:59

| 时间 | proc | 匠人 | 任务 | 状态 | 备注 |
|---|---|---|---|---|---|
| 14:01 | — | 门神 | 0.3.6 chat 热修 1 | ⛔ | 找不到 bug 拒发（合理） |
| 14:05 | — | 门神 | 0.3.6 chat 热修 2 | ⛔ | 找不到 bug 拒发（合理） |
| 14:08 | — | 门神 | 0.3.6 chat 热修 3 | ⛔ | heredoc 炸 zsh |
| 14:10 | — | 铁匠 | 4 活串行 | ⛔ | sandbox 拦 |
| 14:13 | — | 铁匠 | 4 活重试（briefs/ 在仓库）| ⛔ | 未识别模型 id（HERMES 模型）|
| 14:18 | — | 门神 | 派活节奏入系统 | ⛔ | cmd 限速 |
| 14:23 | — | 铁匠 | pacing + dispatch-pacing | ✅ `0df489620` | 干成了 |
| 14:25 | — | 门神 | keystore + 0.3.4 重发 | ✅ `99b2bcf3e` | 撞分支门神自纠 |
| 14:25 | — | 铁匠 | DS 学习报告 | ✅ `343b13b75` | docs-coolie/ds-learn/ |
| 14:25 | — | 门神 | v0.5.0 发版（撞 PATH 3）| ✅ `8a9e984a5` | main 上 |
| 14:34 | — | 铁匠 | finalize untracked | ⛔ | max-turns 30 不够 |
| 14:36 | — | Hermes | spec workflow commit | ✅ `6092653a9` | 21 文件 / +2790 行 |
| 14:38 | — | Hermes | PM-FAILURE-CASES.md | ✅ `f91b12da1` | 15 失败 + 复盘 |
| 14:42 | — | Hermes | PM-RELEASE-CHECKLIST.md | ✅ `101bd2b6c` | 24 项 gate |

## 关键教训沉淀

**派单节奏问题（F1 + F12）：**
- 13:00-13:45 一波连派 4 个 cmd 任务 → 全部撞限速 → 浪费 4 次派单
- 修法已落 Coolie 系统：`pacing rules (0df489620)`，cmd 180s / claude 30s 自动冷却

**简报边界问题（F5 + F6）：**
- "0.3.6 chat" 派单 3 次被门神拒（拒得对），因为没真 bug 信号
- 修法：`PM-DISPATCH-RULES.md` 强制 7 要素

**commit 责任问题（F15）：**
- Hermes 替 commit 6092653a9（spec workflow 大批）和 f91b12da1 / 101bd2b6c（PM 文档）
- 例外清单写进 PM-DISPATCH-RULES.md

## 实战数据（截至 14:42）

| 指标 | 数 |
|---|---:|
| 总派单 | ~40 次 |
| 成功 commit | 21 个（main 上）|
| 失败拒发 | 4 次（合理拒）|
| F1 撞限 | 5 次 |
| F2 sandbox | 3 次 |
| F3 heredoc | 2 次 |
| F6 错位 | 3 次 |
| F7 turns | 4 次 |
| v0.5.0 APK | 77.59 MB 已发 |
| PM 文档 | 4 件套 + 2 审计 = 6 件 |

## 未做（老板待拍板）

- 0.3.6 chat 真根因（要 logcat）
- 0.5.0 APK 老板实测 build 模式 + 反馈
- release/0.4.0 分支合回 main（避免积压）
- keystore 密码轮换（coolie-keystore-2026 已泄露到 transcript）