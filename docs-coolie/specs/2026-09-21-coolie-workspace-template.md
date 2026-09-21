# Spec: Coolie Workspace-as-Company 脚手架（palantir 5 角色 + ruoyi-all-next）

- 日期：2026-09-21
- 老板：chenwei（weixin）
- PM：Hermes（掌柜）
- 状态：DRAFT（需要老板校对一次设计）→ 派门神搭脚手架

## 1. 背景

老板原话：「用 coolie 按照 palantir 本体岗位角度方式组建项目开发完整团队，每个角色的员工运行的环境、CLI、大模型、skills 先预装好，用到的框架模板也预装好 ruoyi-all-next，每个公司就是一个项目，项目的 workspace 空间目录就是代码目录，里面有各个角色用到的 skills 以及功能 spec 文档」。

**诉求拆解（5 个 1 句话）：**
1. 角色 = Palantir 5 个本体岗位（FDA / Core SWE / PRE-SRE / FDSE / DS）
2. 员工 = 每个角色在 Coolie 平台里挂一个 agent，`role` 字段对应
3. 环境预装 = 仓库自带 `.agents/skills/<role>/` + `cli/` + `models.yaml`
4. 框架预装 = `ruoyi-all-next/` 作为子模块，clone 仓库后立即可开发
5. workspace 模板 = 一个 `workspace-template/` 仓库，clone 出去就是「一个项目=一个公司」

## 2. User Stories

- **作为老板**，我想「立项一个新公司/项目」是一行命令（`scripts/new-company.sh 客户名`），结果是在 Coolie 平台建一个 company + 拉起一份预装好的 workspace。
- **作为派单掌柜**，我给「FDA 张三 / FDSE 李四」派活时，简报里只需说「按你的角色 skill 干」，无需每次说明文件范围。
- **作为匠人**，我打开 workspace 目录就能看到自己的 `cli` 配好了、`models.yaml` 写好了、`.agents/skills/<my-role>/SKILL.md` 在那。
- **作为生产服务端**，每个 company 的员工技能清单可被工坊对话读取（用户问「FDSE 在哪」能答）。
- **作为 DS（业务验收角色）**，任何公司投产前必须经过 DS 的业务旅程探路（本地 E2E + 远程生产 curl 烟测）。

## 3. Acceptance Criteria (EARS)

### 3.1 模板仓库

- WHEN PM 跑 `scripts/new-company.sh acme`，THEN 系统 SHALL：
  - 在 Coolie 平台创建名为 `acme` 的 company（含 default company_owner）
  - 把 `workspace-template/` 内容复制到 `~/workspace/xaicd/acme/`（含 .agents/skills/, cli/, models.yaml, specs/, docs/）
  - 在新 workspace 注册 5 个 agent（每个角色一个，绑定对应 skill）
  - 输出「立项报告」含 company_id / workspace 绝对路径 / agent_ids
- WHEN worker 跑 `acme/scripts/bootstrap.sh`，THEN 应当：
  - `acme/cli/<role>.sh` 已 chmod +x
  - `acme/.agents/skills/<role>/SKILL.md` 存在
  - `acme/.agents/skills/<role>/models.yaml` 写好
  - `acme/ruoyi-all-next/` 已 submodule init + update
  - 退出码 0 表示全齐
- WHEN 任何角色打开自己的 workspace，THEN SHALL 看到「本角色指南」（`specs/<role>/README.md`）和「全栈 spec 入口」（`specs/YYYY-MM-DD-<feature>.md`）。

### 3.2 5 角色 skill 自带

- `.agents/skills/fda/SKILL.md` —— FDA 范本（领域模型 / RBAC / 隔离）
- `.agents/skills/core-swe/SKILL.md` —— Core SWE 范本（编译/静态门禁）
- `.agents/skills/pre-sre/SKILL.md` —— PRE-SRE 范本（环境指纹/灰度/拨测）
- `.agents/skills/fdse/SKILL.md` —— FDSE 范本（全栈交付/状态机/零死穴）
- `.agents/skills/ds/SKILL.md` —— DS 范本（业务旅程/探路/验收）

每个 skill 引 `references/` 给本地可执行的检查脚本。

### 3.3 CLI 预装

- `cli/fda.sh` → `claude --settings ~/.claude/settings.json --model glm-5.3 --role fda`
- `cli/core-swe.sh` → `claude --settings ~/.claude/settings.json --model glm-5.3 --role core-swe`
- `cli/pre-sre.sh` → `cmd -p "..." --yolo`
- `cli/fdse.sh` → `claude --settings ~/.claude/settings.json --model mm --role fdse`
- `cli/ds.sh` → `agy --dangerously-skip-permissions -p "..."`（本地）

匠人池路由规则：`~/.hermes/skills/autonomous-ai-agents/ai-workshop-dispatch` 的 GLM-5.3 同池串行规则照样遵守。

### 3.4 models.yaml

每个 role 一个 models.yaml，记录：

```yaml
role: fdse
primary: claude-glm        # GLM-5.3 同池，与掌柜/FDA串行
fallback: claude-mm        # 并行备胎
on_quota_exhausted: cmd    # 最后降级
large_context: agy         # 长上下文
```

### 3.5 ruoyi-all-next 预装

- workspace 根目录 `ruoyi-all-next/`（git submodule）
- `workspace/scripts/import-ruoyi.sh` —— `git submodule add https://github.com/your/ruoyi-all-next.git` 或拷贝
- 启动：`cd ruoyi-all-next && mvn spring-boot:run`（JAVA_HOME 需预检）
- 与 Coolie 平台账号打通：ruoyi-all-next 的 user 表对接 Coolie 的 user 表（先 stub，后扩展）

### 3.6 公司/项目=workspace 命名规则

| Coolie 平台 | 仓库路径 | Git 远端 |
|---|---|---|
| company `acme` | `~/workspace/xaicd/acme/` | `git@github.com:xaicd/acme.git` |
| company `manju` | `~/workspace/xaicd/manju/` | `git@github.com:xaicd/manju.git` |
| company `wenlv` | `~/workspace/townwenlv/wenlv-next/` | 已有 |

PM 写 `/etc/coolie/companies.json`（PM 内部映射），新公司自动加。

### 3.7 不动项

- Coolie 主仓 `xaicd/coolie` 不变（这是工坊本体）
- 每个公司仓库独立 main 分支
- 平台模型（FDA 张三 = User A）是 Soft-mapper，不是 hard-link

## 4. 边界 / Out of Scope

- ❌ 真把公司仓库建出来（PM 立项后才建；本 spec 只交付脚手架 + 一个示例项目 `acme`）
- ❌ 5 角色 skill 全部 200+ 行（先各 60-100 行范本，后续随项目丰富）
- ❌ ruoyi-all-next 完整集成到 Coolie user 表（仅 stub 文档 + 一个示例 controller）
- ❌ DS 本地 E2E 的 spec-driven 重写（用 Coolie 工坊已有的 `scripts/e2e-local.sh` 复用，不重写）

## 5. 文件范围（白名单）

新文件全部放新仓库 `~/workspace/xaicd/coolie-template/`（**新仓库，不在主仓**），主仓零改动：

```
coolie-template/
├── README.md
├── scripts/
│   ├── new-company.sh              # 一键立项
│   ├── bootstrap.sh                # worker 初始化
│   └── import-ruoyi.sh             # 拉 ruoyi-all-next
├── cli/
│   ├── fda.sh
│   ├── core-swe.sh
│   ├── pre-sre.sh
│   ├── fdse.sh
│   └── ds.sh
├── .agents/skills/
│   ├── fda/SKILL.md
│   ├── core-swe/SKILL.md
│   ├── pre-sre/SKILL.md
│   ├── fdse/SKILL.md
│   └── ds/SKILL.md
├── specs/
│   ├── 2026-09-21-coolie-workspace.md   # 本 spec
│   └── fda/README.md
├── docs/
│   ├── ARCHITECTURE.md
│   └── ROLE-MATRIX.md
├── models.yaml.example
├── .gitmodules.example
└── ruoyi-all-next/                # git submodule
```

主仓只加一份链接：`docs-coolie/COOLIE-WORKSPACE-TEMPLATE.md`（指 coolie-template repo）。

## 6. 验收 gate

- [ ] `coolie-template/` 新仓库创建 + push
- [ ] `scripts/new-company.sh acme` 跑通（创建 platform company + workspace + 5 agent）
- [ ] `coolie-template/scripts/bootstrap.sh` 跑通，5 个 skill + 5 个 cli + ruoyi 子模块就位
- [ ] 5 角色 skill 范本各 ≥ 50 行，引 `references/` 检查脚本
- [ ] `claude --model glm-5.3 -p "..."` 至少在 fdse 角色跑通一次 dummy
- [ ] ruoyi-all-next submodule init + 一条 `mvn compile` 跑通（或记录为「需 JAVA_HOME=17」挡）
- [ ] `docs-coolie/COOLIE-WORKSPACE-TEMPLATE.md` 主仓文档同步
- [ ] `git status` 主仓干净，coolie-template 仓库独立干净

## 7. 当前最关键的设计决定（PM 提议）

1. **模板仓库独立**（`xaicd/coolie-template`），不污染主仓 `xaicd/coolie`
2. **5 角色 = Palantir 5 岗位**，不重新发明
3. **匠人池路由照抄** `ai-workshop-dispatch`（GLM 同池串行 / 降级 cmd > claude > agy）
4. **DS 是验收一票否决**（任何 company 投产前必走 DS 业务旅程探路）
5. **ruoyi-all-next = 框架层，不绑死**（以后换若依/芋道/yudao 改一行 import）

## 8. 派单准备

PM（掌柜）要做：

1. 等老板对设计校对一次（5 角色 + 仓库位置 + ruoyi 集成深度）
3. 等老板校对完，派门神按 spec 搭 coolie-template 骨架（最小可跑：5 cli + 5 skill 范本 + new-company.sh stub + bootstrap.sh）
4. 门神跑通 `new-company.sh acme`，掌柜把 `acme` 立成示例项目
5. 老板回签

## 9. 不回签就停在哪

如果老板认为设计不对（任何一项），本 spec 立刻修订，不开工。