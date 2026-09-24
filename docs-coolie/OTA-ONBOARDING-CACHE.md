# OTA 一次性 onboarding cache (wave66 P2 文档化)

> 老板 09-23 25:15 「派」wave64 audit P2 排期第 4 件 —— 把 "Task descriptions
> and personas are snapshots" 这个一次性 onboarding 缓存机制独立成一份给老板 /
> PM / 后续接管者看的运维手册, 免得反复追问 "为啥我改了 `greeting.md` 但新公司
> 看到的还是旧文案" / "为啥老 first-task 还是 0.5.30 那份 brief"。

---

## 1. 一句话总览

`server/src/onboarding-assets/first-task/` 里那几个 markdown / json 文件 (greeting
/ opening question / brief / chief-of-staff persona / first-task skill) 是**板
> 下一次性快照**:

- 文件改了 → **新公司** 看到新文案 (因为 server 在「创建公司」「雇佣第一个
  agent」「创建第一个 task」的瞬间读盘把它烤进 DB / Issue description / agent
  的入口 instruction)。
- 文件改了 → **已存在的公司 / agent / task 不变**。它手上那份是创建时拷过去的
  快照, 不会反向同步。

这条不变量在原仓库的 `server/src/onboarding-assets/first-task/README.md` 里的
"Updates" 节已经写过一句 "Task descriptions and personas are snapshots", 但藏在
具体模块里没人看, 而且 PM-BRIEF 反复问。本份把它单独拎出来 + 加老板 / 运营会真
用到的覆盖 / 验证步骤。

---

## 2. 哪些资产是一次性的 (按层分)

文件位置: `server/src/onboarding-assets/first-task/` (构建期被 `cp -R` 进
`dist/onboarding-assets/`, server 在 dist 上运行)。

| 资产 | 一次性边界 | 谁持有快照 | 怎么查 |
|---|---|---|---|
| `greeting.md` | 「雇佣第一个 agent 时」 | `agents.entry_instructions` (DB 列) | `select entry_instructions from agents where id='<first-agent>';` |
| `chief-of-staff/AGENTS.md` | 同上 (作为 entry instructions 的种子) | 同上 | 同上 |
| `opening-question.json` | 「创建公司」 | `instances.flags` / `task.description` (卡片在 brief 里被引用) | 看公司首个 task 的 description |
| `brief.md` | 「创建第一个 task 时」 | `issues.description` | `select description from issues where title='First task';` |
| `skills/first-task/SKILL.md` | **非一次性**, 跟随 bundler 走 | agent 的 assigned skills (`unpinned` 模式) | agent 页 → 技能清单 |

只有 `skills/first-task/SKILL.md` 例外: 它是 unpinned skill, 跟随 `paperclipai/
paperclip/first-task` 的最新版本自动刷新, **不会**被一次性烤进任何字段。

---

## 3. 老板/PM 实际场景怎么办

### 3.1 想让一个新公司看到新 greeting

什么都不用做。改 `greeting.md` → 重启 server / OTA 发版 → 下一次「创建公司」 /
「hiring first agent」会读新文件。

### 3.2 已经存在的公司想换成新 greeting

**不会自动跟上**。两条路:

1. **手工覆盖** (适合单条单次, 不影响其它字段):
   ```bash
   # SSH 进 server, 在 psql 里改 agent 的入口 instruction
   sudo -u postgres psql -d coolie \
     -c "update agents set entry_instructions = '$(cat path/to/new-greeting.md | sed "s/'/''/g")' \
         where id = '<agent-uuid>';"
   ```
   或者更稳: 走 UI 的 agent 编辑面板 → Instructions 字段直接粘贴新文本。

2. **批量 / 结构性重写** (新一波 release 时):
   - 在 release notes 里写明「老板 / PM 需要重置 first agent 的 instructions」
   - 配套一个一次性脚本 `scripts/refresh-onboarding-snapshots.ts`, 走 DB 把所有
     「第一个 agent」 的 `entry_instructions` 重写成新模板
   - 先在 dry-run 跑一遍 (`--dry-run` → 打印 diff), PM 审核后 `--apply`

### 3.3 怀疑改了的 `greeting.md` 没生效

按下面 4 步定位:

1. **看 server 是不是真的读了你刚改的版本**:
   ```bash
   ssh tc-coolie-claw \
     'sudo cat /opt/coolie/server/dist/onboarding-assets/first-task/greeting.md | head -20'
   ```
   这一份才是 server 在跑的内容。`dist/` 是构建时 `cp -R` 的产物, source 改
   了 dist 不会自动跟随。

2. **看 build 流程有没有把 source 拷进 dist**:
   `server/package.json` 的 `build` 里有这一段:
   ```
   cp -R src/onboarding-assets/. dist/onboarding-assets/
   ```
   发版/重启前要 `pnpm build`, 否则 dist 不会更新。

3. **看是不是新公司才能看到**:
   - 新公司: 走 onboarding 流程, 第一个 task 评论流里应该有 greeting 卡片
   - 已有公司: 永远不会自动追上, 见 3.2

4. **看 server log 有没有警告**:
   onboarding 创建路径在文件校验失败时 `console.warn` 然后继续创建 task, 不
   会 abort。如果 warning 里出现「missing field X」, 说明 `opening-question.json`
   的 option id / `freeText` 被改坏了, server 会拒绝/退化。

---

## 4. 别混的三件事

| 概念 | 在哪 | 一次性吗 | 谁触发刷新 |
|---|---|---|---|
| OTA 增量更新 (JS bundle) | `clients/expo/scripts/publish-ota.sh` | 否, 按 runtimeVersion 持续下发 | PM 跑脚本 |
| Onboarding 资产 (本文件主题) | `server/src/onboarding-assets/first-task/` | **是**, 创建时烤一份 | release / 重启 / 单条手工 |
| 公司级 instance settings (`enableFirstTaskPlanProposal`) | `instance_settings.flags` | 否, 改一次所有公司同步 | UI / API |

OTA 走的是 `clients/expo/scripts/`, onboarding 走的是 `server/src/onboarding-assets/`,
两者路径完全独立。

---

## 5. 老板最常问的 3 个问题 (FAQ)

**Q1: 我改了 `greeting.md` 为什么线上没生效?**
A: 没 `pnpm build` → `dist/onboarding-assets/` 还是旧版。即使 build 了,
已存在的公司也**不会**追上, 见 3.2。

**Q2: 我能用 OTA 推 greeting 吗?**
A: 不能。OTA 只推 `clients/expo/dist/` (JS bundle), server 的
`dist/onboarding-assets/` 是构建时 `cp -R` 进去的, 路径完全独立。要刷新得
改 server → build server → 重启 / release。

**Q3: 我能让「所有老公司」一次性看到新文案吗?**
A: 技术上可以, 但**默认不做** —— 改 entry instructions 是侵入式更新, 会覆盖
老板 / PM 之前手工调过的内容。当前约定: 想覆盖就照 3.2 走手工或一次性脚本,
**不要**写一个「每次 server 重启就全表 update」的逻辑, 那会反复丢数据。

---

## 6. 老板 / PM 自检清单 (动手前先看一遍)

- [ ] 我改的是 source (`server/src/onboarding-assets/...`) 还是 dist?
      source 改了 build 才进 dist; dist 是构建产物, 改 dist 重启会丢。
- [ ] 我这次是要影响「新公司」还是「已有公司」?
      新公司 → 改 source + build + restart 就够。
      已有公司 → 走 3.2 的覆盖路径, **不要**期望自动同步。
- [ ] 我改的是 `skills/first-task/SKILL.md` 还是其它 markdown/json?
      只有 skill 文件会跟随 unpinned skill 刷新; 其它一律一次性快照。
- [ ] 我确认 server 已经重启 / 发版, 不是 source 改了没构建?
      `systemctl restart coolie` 之后 `sudo cat /opt/coolie/server/dist/
      onboarding-assets/first-task/greeting.md | head` 看一下。

---

## 7. 相关文件 / 链接

- `server/src/onboarding-assets/first-task/README.md` — 原仓库内嵌的开发者说明
  (本文件把它翻译成 PM/老板可读 + 加了「怎么办」章节)
- `server/src/services/onboarding-first-task-assets.ts` — 烤快照的代码
- `server/src/services/onboarding-greeting.ts` — greeting 的具体读盘路径
- `server/src/onboarding-assets/ceo/` — CEO persona 的镜像, 同一份一次性逻辑
- `clients/expo/scripts/publish-ota.sh` — OTA 增量, 与 onboarding 无关, 别混
- `docs-coolie/OTA-PUBLISHED-WAVE35.md` 之类 — 历史 OTA 流水

---

## 8. Testing (`scripts/test-onboarding-cache.sh`)

`scripts/test-onboarding-cache.sh` 是老板 09-23 26:24 「派」wave72 Sprint 1.1
配的烟测脚本。一次性跑过三件事:

1. **源资产断言** — `server/src/onboarding-assets/first-task/` 下:
   - `greeting.md` / `chief-of-staff/AGENTS.md` / `skills/first-task/SKILL.md`:
     既含 `Coolie` 也不含 `Paperclip`(wave61 已替换)
   - `brief.md` / `opening-question.json`: 不含 `Paperclip`(brand-neutral 文件)
2. **端到端真验** — 建一个新公司 → 建 agent → `POST /api/companies/<id>/issues`
   带 `onboardingFirstTask: true` → `GET /api/issues/<id>/comments` 拿到一条
   agent-authored greeting comment, 验证内容是「欢迎来到 Coolie 工坊」(Coolie
   化), 不是「Welcome to Paperclip」。
3. **snapshot 不迁移断言** — ssh 进 prod 查 `issue_comments` 里既有公司的 agent
   comment 不被 source 改动反向同步(默认不动数据, 只读验)。

跑法(默认本地 dev, `local_trusted`, 无需登录):

```bash
bash scripts/test-onboarding-cache.sh
```

跑线上(prod `authenticated`, 用 cookie-jar 走 Better Auth):

```bash
COOLIE_API_BASE=https://xrobinai.cn \
  COOLIE_COOKIE_JAR=/tmp/coolie.jar \
  COOLIE_EMAIL=... COOLIE_PASSWORD=... \
  bash scripts/test-onboarding-cache.sh
```

环境变量:

- `COOLIE_API_BASE` — base URL (默认 `http://localhost:3100`)
- `COOLIE_COOKIE_JAR` — 走 `local_trusted` 模式可留空; 线上 `authenticated`
  模式必须给, 脚本会先用 `POST /api/auth/sign-in/email` 把 cookie 烤进 jar
- `COOLIE_SOURCE_DIR` — 源资产目录 (默认 `server/src/onboarding-assets/first-task`)
- `COOLIE_PROD_HOST` — ssh 别名 (默认 `tc-coolie-claw`), 用于第 3 步
  snapshot 不迁移断言

退出码: 0 = 全过, 非零 = 任一步失败。

---

## 9. Manual Test Plan (老板 / PM 手测 5 步)

老板想自己手测一次 onboarding cache 替换效果, 按这 5 步走:

1. **确认 source 已是 Coolie** —
   `cat server/src/onboarding-assets/first-task/greeting.md`, 看是不是「欢迎来
   到 Coolie 工坊」开头。
2. **确认 prod 已 sync** —
   `ssh tc-coolie-claw 'sudo cat /opt/coolie/server/src/onboarding-assets/first-task/greeting.md'`
   (注意 prod 跑 src, 不是 dist — `tsx` 直接读源), 跟 source 对一下。
3. **建一个全新公司** — UI 上点「新建公司」或
   `curl -X POST https://xrobinai.cn/api/companies -H 'x-paperclip-api-key: ...'
   -d '{"name":"manual-test"}'`, 不要碰任何已有公司。
4. **建第一个 task** — UI 上点「Get started」(等价于
   `POST /api/companies/<new-id>/issues { onboardingFirstTask: true }`),
   打开 task 详情页, 第一条 comment 应该是「欢迎来到 Coolie 工坊」开头的
   agent bubble, 不是右对齐 user。
5. **不动旧公司** — 不要对任何 wave61 之前建的公司跑 SQL UPDATE, 老板 / PM 之
   前手工调过的内容会被覆盖(详见 3.2)。如果非要看效果, 跟 3.2 走手工覆盖或一次
   性脚本。

跑完 5 步, 老板就能独立判断「源改了 + 新公司看到新文案」这条链路是通的; 老公
司的快照按约定不动, 不需要也不应该被脚本碰。
