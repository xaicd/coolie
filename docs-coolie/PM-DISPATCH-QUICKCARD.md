# PM 派活速查卡 (wave278 全清版, 2026-10-02)

> **唯一目的**: 老板一句话 → PM 查本卡 → 立刻派对人/工具/任务。
>
> **整合源** (本卡 = wave222/225/227/228/229/234/236/245/258/272/276 全部派活规则的合订版, 不再单独查):
>
> **已吃 3 份 (被砍)**:
> - `HOW-TO-DELEGATE.md` (18K) → §A 项目信息 + §3 SOP + §B 老板视角 + §C 验收 + §11 反向约束
> - `PM-AGENTS.md` (8K) → §A 项目信息 + §D 文件地图 + §E 仓库纪律 + §F 故障树 + §G 老板说话
> - `PM-DISPATCH-RULES.md` (4K) → §6 brief 模板 + §H 反例/决策树 + §5.2 频率限制
>
> **保留 8 份权威 (跳转)**: `EMPLOYEE-OBJECTS.md` / `TEAM-MAPPING.md` / `CMMI-EMPLOYEE-MAPPING.md` / `EMPLOYEE-SKILLS.md` / `TOOLS.md` / `CMMI-ROLE-GOVERNANCE.md` / `ROLE-MAPPING.md` / `FIVE-ROLE-DISCIPLINE.md` (wave286 五角色强制技能纪律) / `PM-REPORTING-FORMAT.md`
>
> **索引**: [INDEX.md](INDEX.md)
>
> **不动**:
> - `server/src/services/agent-assign.ts` / `AGENT_ROLES` enum / `ROLE_MAPPING` (算法层)
> - wave270-277 在跑波次 / v0.6.20 tag
> - 上列 8 份权威文档 (本卡跳转, 不复制)

---

## A. 项目核心信息 (5 秒读完, ex PM-AGENTS §0)

| 项 | 值 |
|---|---|
| 项目名 | Coolie (paperclip fork) |
| 仓库 | github.com/xaicd/coolie |
| 主分支 | `main` |
| 包管理 | pnpm + monorepo |
| 客户端 | clients/expo (RN + Expo SDK 52) + clients/api-client + clients/h5 (WebView) |
| 服务端 | server/ (Express + tsx + ts-rest) |
| 数据库 | postgres (生产) / PGlite (dev, 不设 DATABASE_URL 自动) |
| 部署 | Docker + systemd + Caddy |
| 生产域名 | https://xrobinai.cn (Tencent Cloud CVM 62.234.59.180 代号 tc-coolie-claw) |
| OTA | xrobinai.cn/ota/manifest (JS-only, runtimeVersion 不变) |
| APK COS 桶 | gzbucket = sls-cloudfunction-ap-guangzhou-code-1258019043 |
| APK 下载 | https://dls.xrobinai.cn/<key> |
| 当前生产 | v0.6.20 (wave266, commit 49e86bde9) |
| 老板 | 陈伟 (xaicd GitHub 组织, xrobinai.cn 站长) |
| 老板微信 | o9cq80_tfu-U-ON3wZcJEw@im.wechat (不要猜) |
| PM | Hermes Agent (掌柜, 老板派单 + 验收 + 写文档) |
| 匠人池 | 门神 cmd / 铁匠 claude / 墨斗 agy / 兑底渊 copilot / 百晓生 mm |
| 时区 | CST (UTC+8) |
| 信任等级 | **老板严重要求: PM 只派活 + 验收, 不写代码** (紧急例外见 §I) |

### A.1 文件地图 (ex PM-AGENTS §4)

```
~/workspace/xaicd/coolie/
├── clients/expo/             React Native app
├── clients/api-client/      共享 TS 客户端
├── server/                   Express API + scripts/release-app.sh
├── packages/                 db / shared / adapters / plugins / ontology-core
├── ui/                       Web 看板
├── cli/                      paperclipai CLI
├── docs-coolie/              fork 自己的 PM 文档 + 审计 (本卡在这)
├── .agents/skills/           项目级 skill (gitignored, 加新 skill 必须 git add -f)
├── AGENTS.md                 上游 paperclip AGENTS (245 行, **不要覆盖**)
└── screenshots/              DS 截图 — 审计 DS 用
```

### A.2 仓库纪律 (ex PM-AGENTS §5)

- `/clients/expo/android/` gitignored — prebuild 输出, 手改 versionCode 后必须 `./gradlew assembleRelease`
- `/.agents/` gitignored — 加新 skill 必须 `git add -f`
- `/core` `/coscli.log` `/screenshots/` `/scripts/deploy-tc-coolie-claw.sh` 历史 untracked
- `tsc -p .` 必须 0 错误 (clients/expo + server 两个 tsconfig)
- commit message 引 spec 路径

---

## 0. 速记口诀 (老板能背, PM 派活一秒定位)

```
老板微信 → Hermes (PM, Hermes 自己) → 7 工具 / 5 员工 → 5 MCP → 跑完 5 字段回报

墨斗 agy 画原型    铁匠 glm 写代码    门神 cmd 跑命令
兑底渊 copi 部署    百晓 mm 验测盘    Hermes 自己拍板
```

---

## 1. 总表 — 6 老板团队 × 7 工具池 (一张图, 派活唯一入口)

| # | 员工 | 岗位 | 角色 | 默认工具 | 兜底工具 | 典型任务 (CMMI 阶段) |
|---|---|---|---|---|---|---|
| PM | **Hermes** | 掌柜 | — | **Hermes 自己** (PM 拍板) | — | 派活 / 验收 / 拍板 (Phase 1.5 / 5.5) |
| 1 | **墨斗** Inkstick | FDA 前线架构师 | `fda` | **agy-gemini3.8** | cmd 紧急 | Phase 1 立项全 (1.1/1.2/1.3/1.4) |
| 2 | **铁匠** Forge | Core-SWE 主力 | `core-swe` | **claude-glm** | claude-mm (铁匠贰号) | Phase 3+4 全 (1.5/2.2/2.3/2.4/3.1/3.2/3.3/4.1/4.2/4.4/5.4) |
| 3 | **铁匠贰号** Forge II | Core-SWE 副 | `core-swe` | **claude-mm** | — | 铁匠额度见顶时切, 同一员工换工具 |
| 4 | **门神** Guardian | FDSE 全栈交付 | `fdse` | **cmd `@commandcode/ai`** | — | Phase 4.3 代码审查 + 5.3 验收金标 + 派活 |
| 5 | **兑底渊** Operator | PRE-SRE 可靠性 | `pre-sre` | **copilot** | claude-mm (按量) | Phase 2.1 / 3.4 / 4.5 / 5.1 部署运维 |
| 6 | **百晓生** Sage | DS 数据决策 | `ds` | **claude-mm** | claude-glm (备用) → copilot (限) | **责任重大** Phase 2.5 / 3.5 / 5.2 / 5.3 / 5.5 |

**7 工具池真值** (wave272):
1. **agy-gemini3.8** (Antigravity CLI 1.2.14 + Gemini 3.8) — 墨斗主线, 按量充裕
2. **claude-mm** (MiniMax-M3 SDK) — 百晓生主线 + 铁匠贰号, 按量
3. **claude-glm** (BigModel GLM-5.3) — 铁匠主线, 2026-10-02 17:55 重置
4. **cmd** (`@commandcode/ai`) — 门神主线, 老板不亲自跑 (wave229)
5. **copilot** (GitHub Copilot CLI) — 兑底渊主线, 月度重置
6. **Hermes** (人即工具) — PM 调度
7. **kiro-cli** (AWS Kiro CLI) — 老板备用独立工具, 不归 Hermes 管

**已退出工具池**: claude-ds (配额紧, 仅百晓生 SRE 临时按量兜底, wave236)

---

## 2. CMMI 25 任务 × 5 员工派活路由 (派活唯一查表)

> 主任务数: 铁匠 11 / 门神 1 / 兑底渊 4 / 墨斗 3 / 百晓生 5 = 24, 加 Phase 1.3 双主 = 25 行覆盖

### Phase 1 立项
| 任务 | 主员工 | 默认工具 | 一句话关键字 |
|---|---|---|---|
| 1.1 业务目标 | 墨斗 | agy-gemini3.8 | "客户要 X / 访谈 / 业务目标" |
| 1.2 技术约束 | 墨斗 | agy-gemini3.8 | "架构选型 / 技术约束" |
| 1.3 License 合规 | 墨斗 + 百晓生 | agy + copilot | "License 扫 / 开源协议" |
| 1.4 选型研判 (DAR) | 墨斗 | agy-gemini3.8 | "选型 / 竞品对标 / 画原型 / 选 X vs Y" |
| 1.5 G0 选型门禁 | **铁匠 + Hermes 拍板** | claude-glm + Hermes 自己 | "立项门禁 / G0 拍板" |

### Phase 2 规划
| 任务 | 主员工 | 默认工具 | 一句话关键字 |
|---|---|---|---|
| 2.1 端口策略矩阵 | 兑底渊 | cmd + claude-mm | "端口 / 网络策略" |
| 2.2 WBS 拆解 | 铁匠 | claude-glm | "拆任务 / WBS" |
| 2.3 Spec 编写 | 铁匠 | claude-glm | "写 spec / Kiro spec" |
| 2.4 工时估算 | 铁匠 | claude-glm | "估工时 / 排期" |
| 2.5 风险评估 | **百晓生** | claude-mm | "风险预案 / 出险" |

### Phase 3 设计
| 任务 | 主员工 | 默认工具 | 一句话关键字 |
|---|---|---|---|
| 3.1 系统设计 | 铁匠 | claude-glm | "系统设计 / 架构 / 数据模型" |
| 3.2 API 契约 | 铁匠 | claude-glm | "API 契约 / REST / GraphQL" |
| 3.3 DB Schema | 铁匠 | claude-glm | "DB Schema / drizzle / 表结构" |
| 3.4 安全设计 | 兑底渊 | cmd + claude-mm | "鉴权 / RBAC / 安全设计" |
| 3.5 部署架构 | **百晓生** | claude-mm | "部署架构 / CI/CD / 网络策略" |

### Phase 4 开发
| 任务 | 主员工 | 默认工具 | 一句话关键字 |
|---|---|---|---|
| 4.1 编码 | 铁匠 | claude-glm | "写代码 / 改 bug / 实现 X" |
| 4.2 单元测试 | 铁匠 | claude-glm | "单测 / 单元测试" |
| 4.3 代码审查 | 门神 | cmd | "代码审查 / review / 互审" |
| 4.4 集成测试 | 铁匠 | claude-glm → claude-mm | "集成测试 / E2E / 端到端" |
| 4.5 性能优化 | 兑底渊 | cmd + claude-mm | "性能 / 优化 / 瓶颈" |

### Phase 5 部署
| 任务 | 主员工 | 默认工具 | 一句话关键字 |
|---|---|---|---|
| 5.1 部署执行 | 兑底渊 | cmd + claude-mm | "部署 / OTA / 发版" |
| 5.2 监控告警 | **百晓生** | claude-mm | "监控 / 告警 / 看监控" |
| 5.3 验收测试 | **百晓生** (老板金标仍走门神 cmd) | claude-mm | "验收 / 跑通 / 撞机 / E2E" |
| 5.4 发布说明 | 铁匠 | claude-glm | "写 changelog / release notes" |
| 5.5 复盘 | **百晓生 + Hermes 拍板** | claude-mm | "复盘 / 总结 / 老板拍板" |

---

## 3. 老板高频场景 — 一句话派活 (PM 直接照抄)

| 老板原话 | CMMI | 主员工 | 工具 | 紧急 → 切 |
|---|---|---|---|---|
| "修 X bug" / "写 X 代码" | 4.1 / 4.3 | 铁匠 | claude-glm | 门神 cmd |
| "画原型 / 选型 / 竞品图" | 1.4 / 3.1 | 墨斗 | agy-gemini3.8 | 铁匠 claude-glm |
| "选 X vs Y" / "调研" | 1.4 | 墨斗 | agy-gemini3.8 | 铁匠 claude-glm |
| "部署 / OTA / 发版 / 看 manifest" | 5.1 | 兑底渊 | cmd + claude-mm | 门神 cmd |
| "看监控 / 告警" | 5.2 | 百晓生 | claude-mm | 兑底渊 cmd |
| "测试 / 撞机 / 验收" | 5.3 | 百晓生 (金标门神 cmd) | claude-mm | 门神 cmd (老板金标) |
| "风险预案 / 数据分析" | 2.5 | 百晓生 | claude-mm | 墨斗 agy |
| "写 spec / 拆 WBS / 估工时" | 2.2/2.3/2.4 | 铁匠 | claude-glm | 门神 cmd |
| "复盘" | 5.5 | 百晓生 + Hermes 拍板 | claude-mm | 门神 cmd |
| "紧急 / 自动化 / 真机金标" | — | **门神** | **cmd** | — |

---

## 4. PM 派活 7 步 SOP (老板问需求 → PM 派单全流程)

```
1. 听老板说 → 关键字 → 查 §3 一句话派活表
2. 锁定 CMMI Phase + 任务 → 查 §2 25 任务路由表
3. 取"主员工" → 查 §1 工具真值
4. 写 brief 7 要素 (§6 模板)
5. 派活并轨: 调 bash scripts/hermes-boss-intent-dispatcher.sh "<老板需求>" 秒级建立 Dev Server (3100) 工单，由宿主机后台 Runner Bridge 自动认领执行 (严禁在 Hermes terminal 同步阻塞干等)
6. 查看进度: 通过 /api/companies/.../issues 或 cron 监控自动回读状态
7. 5 字段表回报老板 (§7)
```

---

## 5. 派单纪律 — 5 条硬规矩

| # | 规矩 | 来源 |
|---|---|---|
| 1 | 单匠人连发间隔: cmd ≥3min / claude ≥30s | Coolie pacing rules 0df489620 |
| 2 | brief 7 要素缺一 → cmd 拒接 | PM-DISPATCH-RULES §1 (已并入 §6) |
| 3 | 老板说"紧急" → 切门神 cmd, 老板不亲自跑 | wave229 修正 |
| 4 | 老板金标 = 1% 装真机 → 门神 cmd 跑通, 老板看 PM 截图/录屏 | wave229 |
| 5 | **派活通道并轨控制面**: 严禁在 Hermes 终端同步阻塞运行代码执行(必受180s超时强杀); 统一生成 Dev Server 工单, 由后台 Runner Bridge 异步调度消费 | wave297 架构方案 B |

### 5.1 PM 反向约束 (ex HOW-TO-DELEGATE §8)
- **PM 不在终端直接阻塞跑大活** — 微信终端工具仅限 0.5s 秒级派单/查询，工程执行交给后台 Runner
- **PM 不写代码** — 紧急例外见 §I
- **老板不直接派员工** — 老板只对 Hermes, 不直接 @员工 (wave229)
- **员工不互派** — 5 员工之间不直接派活, 都走 PM
- **不绕过 5 员工** — 老板要加新工具, PM 评估后挂到现有员工, 不增新员工
- **不入 git 仓库**: `~/.claude/settings.json` / `~/bin/*.sh` — 老板本地配置
- **不动 server/ui/clients** — 本 SOP 适用于老板 Mac 本地流程

### 5.2 频率限制 (ex PM-DISPATCH-RULES §5, 落 Coolie pacing rules 0df489620)

| 匠人 | 默认冷却 | 配置位置 |
|---|---|---|
| 门神 cmd | 180s | server/src/config/build-orchestrator.json |
| 铁匠 claude | 30s | 同上 |
| 兑底渊 copilot | ≥3min | PM 自约束 |
| 墨斗 agy | 充裕 | 按量不限 |
| 百晓生 mm | 充裕 | 按量不限 |

撞限后行为: BuildProgressCard UI 显示「等待速率限制冷却(剩 X 分 Y 秒)」, 匠人自动入队, 到 slot 释放。

---

## B. 老板视角: 怎么说话 (ex HOW-TO-DELEGATE §1)

### B.1 一句话模板
```
<动词> <对象> <约束> (可选: 跑哪个工具 / 哪个员工)
```

### B.2 老板不需知道的细节
- 不用记 5 员工名字 — PM 自己查表
- 不用记 CMMI 25 任务编号 — PM 自己识别
- 不用记工具配额 — PM 自己监控
- 不用写 brief — PM 写 brief 放进 `~/bin/dispatch-waveXXX.sh`

### B.3 老板需告诉 PM 的
- **做什么** (动词 + 对象)
- **急不急** (急 → 门神 cmd = commandcode.ai CLI 自动化; 不急 → 默认员工 + 默认工具)
- **在哪台跑** (老板 Mac → 本地员工; 部署到生产 → 兑底渊)
- **验收标准** (老板金标 vs PM 自动验真)

### G. 老板说话必落的 PM 文档 (ex PM-AGENTS §8)

| 老板说 | PM 必落 |
|---|---|
| 「做个 X」 | `docs-coolie/specs/YYYY-MM-DD-x.md` (requirements-capture + system-design-spec) |
| 「X 有 bug」 | `docs-coolie/specs/YYYY-MM-DD-x.md` (bug-fix-flow 三段 + PBT) |
| 「发版」 | `PM-RELEASE-CHECKLIST.md` 24 项 gate |
| 「加快/抓紧」 | `docs-coolie/briefs/` 写 brief + 派单 |

---

## C. 验收 SOP (ex HOW-TO-DELEGATE §7)

PM 派活后, 按这个流程验收:
```
1. monitor (~/bin/monitor-waveXXX.sh)
   ↓ 等员工跑完
2. PM 看 CLI 输出 (cat /tmp/waveXXX.log)
   ↓ 不通过 → 重派 / 让铁匠兑底渊互审
3. 老板金标 (1% 装真机)
   - 老板看 PM 截图 / 录屏 (wave229: 老板不亲自跑 cmd)
   - 或门神 cmd (`@commandcode/ai`) 跑通后报告
4. 回报老板
   - ✅ 完成: commit + push + 报告
   - ⚠️ 阻塞: 回报老板 + 等指示
   - ❌ 失败: 回报老板 + 改派 / 重试
```

### C.1 验收 checklist (掌柜自查)
- [ ] commit hash 已确认 (`git log --oneline -3`)
- [ ] tsc 0 errors (匠人报)
- [ ] 文件清单在白名单内
- [ ] APK URL (涉及发版时) curl 实测 200
- [ ] version.json 字段对齐
- [ ] OTA manifest runtimeVersion 对齐
- [ ] 没改其他分支 (`git diff main..release/0.5.0 --stat` 等)

### C.2 沟通模板 (给老板看)
```
⏱️ 进度 #N (H:M 派单/完工)

| 活 | 匠人 | 状态 |
|---|---|---|
| 阶段 A 抽组件库 | 门神 cmd | ✅ 68bb5bba9 |
| 阶段 D 性能 | 铁匠 claude | 🔨 proc_xxx |
| DS 学习 | 门神 cmd | ✅ 343b13b75 |

| 项 | 状态 |
|---|---|
| 0.3.3 OTA | ✅ |
| APK | https://dls.xrobinai.cn/coolie/app/0.3.3/coolie-release.apk |

老板下一步一句话: <选项>
```

---

## D. PM 启动检查 (ex PM-AGENTS §2, 每次开工必跑)

```bash
cd ~/workspace/xaicd/coolie
git status --short               # 应当为空 (除 untracked .commandcode / core / screenshots)
git log --oneline -5
git branch --show-current

curl -fsS https://xrobinai.cn/version.json | head -8
curl -fsS https://xrobinai.cn/ota/manifest | head -5
curl -fsS https://xrobinai.cn/api/health

ls docs-coolie/PM-*.md
ls docs-coolie/specs/

ssh tc-coolie-claw "sudo systemctl is-active coolie"
ps aux | grep -E "[c]md -p|[c]laude -p" | grep -v grep | head -5
```

如果某条卡住, 立刻告诉老板。

### F. 故障树 (ex PM-AGENTS §6)

| 症状 | 第一步查 | 第二步查 |
|---|---|---|
| 工坊对话无响应 | `ssh tc-coolie-claw sudo journalctl -u coolie --since '-10m' \| grep -iE 'board-chat\|transcription'` | 服务端 `hermes chat` |
| 语音派发失败 | plugin-multimodal `ready` 状态 | host secret + plugin config 引用 |
| App 装新版本失败 | `curl -I https://dls.xrobinai.cn/coolie/app/X.Y.Z/coolie-release.apk` | OTA manifest runtimeVersion |
| cmd 卡死 | `pkill -9 -f "cmd -p"` | 切 claude |
| claude sandbox 拦 | fallback 写进 brief | 改用仓库内路径 docs-coolie/briefs/ |
| 本地 App 验证红 | `bash scripts/e2e-local.sh` (ex PM-AGENTS §10) | `docs-coolie/LOCAL-E2E.md` 详档 |

### E. 版本管理 (ex PM-AGENTS §7)
- **OTA**: JS-only, runtimeVersion 不变
- **APK 重发**: 原生模块动 / keystore / gradle
- **大版本**: 跨多个 PR
- `android.versionCode` 必须 pin 到 `app.json`
- `release-app.sh` 自己 bump `expo.version` + 写 CHANGELOG
- 发版必打 tag: `git tag -a v<version> -m "v<version> release" <release-commit> && git push origin v<version>`

---

## H. PM 自我纪律 (ex PM-AGENTS §9)

- 派单间隔 ≥3min (撞 coolie pacing + 自约束)
- 不连环追匠人完工
- 验收有真信号 (tsc / curl / 用户实测) 不止 commit message
- 没 bug 不硬压发版
- 老板严重要求 PM 不写代码 (例外清单在 §I)

---

## I. PM 紧急例外 (写代码 / commit)

老板严重要求 PM 不写代码, **仅以下例外**:
1. **build orchestrator** (commit 1ad05c8be): 紧急 build 链路卡死, PM 临时打通
2. **PM-ROADMAP.md / 流程文档**: 文档类不算代码
3. **本文档及合订波** (wave278): 合订归档本身

其他场景一律派单给员工。

---

## 6. brief 7 要素模板 (派单必填, 缺一项 cmd 拒)

```
# waveXXX: <一行动词任务标题>

## 背景
<为何做 + 关联 commit / 文档 / 用户场景>

## 目标
<一句话可验收目标>

## 分支
<main / release/x.y / 新建分支名>

## 文件范围（白名单）
- path/to/file1.tsx
- path/to/file2.ts

## 步骤
1. git checkout <branch>
2. cd clients/expo && npx tsc --noEmit -p .
3. grep -rn "<key>" src/ | head -5
4. <fix 描述>

## 验收
- tsc 0 errors
- commit "fix(...): ..."
- output: <APK URL / file list / root cause>

## 规则
- NO PUSH（老板批次推）
- 不动 <其他文件>
- DO NOT 改动 <已知敏感区>

## 参考
- <docs-coolie/briefs/*.md 或 /tmp/cmd-brief-*.md 路径>
```

### 6.1 反例 (门神会拒, ex PM-DISPATCH-RULES §2)

- ❌ "修一下登录" — 无分支、无文件、无验收
- ❌ "把那个 bug 修了" — 没说哪个 bug、哪个 commit
- ❌ "重要紧急马上修" — 没文件范围就派, 门神不知道改哪里
- ❌ 派活时人在 release/0.5.0 但 brief 写「发 0.3.6」 — 版本号与分支错位
- ❌ 简报里写 heredoc 反引号 — zsh 会拆碎, 匠人 shell 退出
- ❌ "修一下" + 立刻跑 release-app.sh — 没确认 bug 真存在就发版

### 6.2 派单决策树 (ex PM-DISPATCH-RULES §3)

```
boss 说任务
  ↓
这活撞哪个分支?  ─ main ─ release/x.y ─ 新分支
  ↓               ↓        ↓             ↓
        OTA 紧急   重构收尾   DS 同款 build   大版本
  ↓
文件范围能列白名单吗? — 不能 → 重写 brief 或拆
  ↓ 能
执行 tsc 验证吗? — 不能(要沙箱权限) → 派铁匠 claude, 给 fallback
  ↓ 能
涉及 release-app.sh 发版吗? — 不 → 默认派门神
  ↓ 涉及
              → 派门神 max-turns 80+, 明写「不审 bug 不发版」
```

### 6.3 失败模式 (ex PM-DISPATCH-RULES §8)

1. **连环派单** — cmd 撞速率限制。修法: 每个匠人间隔 ≥3min
2. **brief 含反引号/双引号** — zsh 拆碎, 简报失败。修法: 用单行 + cat
3. **「修一下」级简报** — 匠人无从下手。修法: 7 要素全填
4. **错位发版** — main 标 0.3.6 + release/0.5.0 代码。修法: 简报必写 `git checkout <branch>`
5. **没验证就 push** — 错版上线。修法: gate 在「curl + OTA + tsc」全过
6. **老板截图只截了一半** — 匠人不知现场。修法: 追问「tab / 之前动作 / 错误原文」

---

## 7. PM 5 字段汇报表 (老板问"啥进展"必回, wave276)

| 员工 | 任务 | 多长时间 | 工具 | 状态 |
|---|---|---|---|---|
| Hermes | wave275 | 1h23m | Hermes 自己 | 跑 |
| 墨斗 | wave273 | 2h15m | agy-gemini3.8 | 跑 |
| 兑底渊 | - | - | copilot | 等派活 |
| 全员 | - | - | - | 等派活 |

**规则**: ETIME > 4h = 卡 (立即通知老板); cron 每 30 分钟自动推 (`scripts/cron-team-status.sh --print`)

---

## 8. 5 MCP 工具链 (每个员工默认装)

| MCP | 7 工具全装 | DS 专属 (百晓生) | 用途 |
|---|---|---|---|
| agent-device | ✅ | ✅ | 设备自动化 (iOS/Android/Web/macOS/TV) 跑测试/撞机 |
| agent-browser | ✅ | ✅ | 浏览器自动化 E2E/拖拽/验收 |
| system-monitor | — | ✅ | CPU/mem/disk/paperclip health |
| approval | — | ✅ | 任何变更走 approval gate |
| company-ops | — | ✅ | 运营 Coolie 工坊 (日报/配额/release driver) |

安装: `bash scripts/install-agent-device-mcp.sh --apply` + `install-agent-browser-mcp.sh --apply` + `install-ds-mcp.sh --apply`, 幂等

---

## 9. 反向约束 (派单 wave 不动清单)

1. **不动** `server/src/services/agent-assign.ts` (算法层 5 角色)
2. **不动** `AGENT_ROLES` enum (5 fork 角色 + 12 上游)
3. **不动** `ROLE_MAPPING` (wave222 25 行)
4. **不动** wave217/220 数字员工 (13 QA+Ops 已删 migration 兜底)
5. **不动** UI / clients/expo / Coolie 工坊系统
6. **不入 git**: `~/.claude/settings.json` / `~/bin/*.sh`

---

## 10. 出处 (本卡 = 8 份合订 + 3 份被砍, 不替代权威文档)

**被砍 3 份 (内容已并入本卡)**:
- HOW-TO-DELEGATE.md (历史, 18K) → §A + §3 + §B + §C + §11
- PM-AGENTS.md (历史, 8K) → §A + §D + §E + §F + §G
- PM-DISPATCH-RULES.md (历史, 4K) → §5.2 + §6 + §6.1 + §6.2 + §6.3

**保留 9 份权威 (跳转)**:
- [PM-ONE-PAGE.md](PM-ONE-PAGE.md) — 微信一屏卡 (3 KB)
- [EMPLOYEE-OBJECTS.md](EMPLOYEE-OBJECTS.md) — 7 员工 × 7 维度
- [TEAM-MAPPING.md](TEAM-MAPPING.md) — 6 老板团队档案
- [CMMI-EMPLOYEE-MAPPING.md](CMMI-EMPLOYEE-MAPPING.md) — 25 任务 × 5 员工
- [EMPLOYEE-SKILLS.md](EMPLOYEE-SKILLS.md) — 5 员工 × 72 skills
- [TOOLS.md](TOOLS.md) — 7 工具池 + MCP
- [CMMI-ROLE-GOVERNANCE.md](CMMI-ROLE-GOVERNANCE.md) — RACI + 治理门禁
- [ROLE-MAPPING.md](ROLE-MAPPING.md) — 算法层 25 任务 × 5 角色
- [PM-REPORTING-FORMAT.md](PM-REPORTING-FORMAT.md) — 5 字段 cron

**索引**: [INDEX.md](INDEX.md) — 10 份权威 + 5 份历史档案导航

**本波 (wave278) 变更摘要**:
- 15 份派活/团队文档 → 10 份权威 + 1 份导航 + 5 份历史档案 (PM-DISPATCH-LOG / PM-FAILURE-CASES / PM-ROADMAP / PM-RELEASE-CHECKLIST / PM-SPEC-WORKFLOW)
- 砍 5 份重复 (HOW-TO-DELEGATE / PM-AGENTS / PM-DISPATCH-RULES / CMMI-ROLE-CARDS / TOOL-USAGE)
- 合并 3 份进本卡 + 2 份进 TOOLS/GOVERNANCE
- 保留 2 份不动 (ROLE-MAPPING / PM-REPORTING-FORMAT)
- 省 ~70 KB / ~1 200 行
