# Spec: Coolie Workspace-as-Company 脚手架（palantir 5 角色 + 开发基座）

- 日期：2026-09-21
- 老板：chenwei（weixin）
- PM：Hermes（掌柜）
- 状态：DRAFT（需要老板校对一次设计）→ 派门神搭脚手架
- 修订：2026-09-30（wave157）

> **修订 (2026-09-30, wave157) — 现行决定：**
> 底座从「`ruoyi-all-next` 全栈 **15 域**子模块」改为 **Coolie 开发基座**
> （`templates/workspace-skel/`）：**空壳 + 5 个默认模块（system / infra / member /
> audit / api），不含任何业务域**。业务（bpm / pay / report / mp / mall / crm / erp /
> wms / mes / im）按**项目标书在该基座上快速定制**，不预装。
> 下述 §1.4 / §3.1 / §3.5 / §5 / §6 / §7 中「ruoyi-all-next 全栈 15 域」的旧表述，
> 一律按本节修订理解；新增 §10「5 默认模块 vs 15 全栈域」与 §11「按标书定制开发」。


## 1. 背景

老板原话：「用 coolie 按照 palantir 本体岗位角度方式组建项目开发完整团队，每个角色的员工运行的环境、CLI、大模型、skills 先预装好，用到的框架模板也预装好 ruoyi-all-next，每个公司就是一个项目，项目的 workspace 空间目录就是代码目录，里面有各个角色用到的 skills 以及功能 spec 文档」。

**诉求拆解（5 个 1 句话）：**
1. 角色 = Palantir 5 个本体岗位（FDA / Core SWE / PRE-SRE / FDSE / DS）
2. 员工 = 每个角色在 Coolie 平台里挂一个 agent，`role` 字段对应
3. 环境预装 = 仓库自带 `.agents/skills/<role>/` + `cli/` + `models.yaml`
4. 框架预装 = **开发基座**（`templates/workspace-skel/`：5 默认模块 + 角色入口），
   clone 仓库后立即可开发 —— 基座**不含业务域**，业务按标书定制（修订 2026-09-30）
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
  - `acme/.agents/skills/<role>/SKILL.md` 存在（按需加入时）
  - `acme/models.yaml` 写好（5 角色主备 CLI / 模型映射）
  - `acme/modules/{system,infra,member,audit,api}/` 5 个默认模块齐全
  - 退出码 0 表示全齐（**不含业务域**，业务按标书定制）
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

### 3.5 开发基座预装（修订 2026-09-30）

> 原为「ruoyi-all-next 全栈 15 域子模块」，现改为**开发基座**：

- workspace 自带 `modules/{system,infra,member,audit,api}/` 5 个默认模块（骨架 + README）
- 可选的轻量底座代码（`coolie-base-1.0` tag，仍**不含业务域**）由
  `scripts/new-company.sh` 按需 `git clone --depth 1 --branch coolie-base-1.0`
  到 `coolie-base/`；拉取失败不阻断立项
- （已删除）`.gitmodules` + `scripts/import-ruoyi.sh` 子模块路径
- **业务域不预装**：bpm / pay / report / mp / mall / crm / erp / wms / mes / im
  按项目标书在基座上新建模块（见 §11）

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

> 修订 (2026-09-30)：骨架最终落在主仓 `templates/workspace-skel/`（不再单建
> `coolie-template/` 仓库），并已按「开发基座」重写：5 默认模块，删除
> `.gitmodules` / `import-ruoyi.sh` / ruoyi 子模块。

```
templates/workspace-skel/          # 开发基座（本项目实际位置）
├── README.md                      # 基座说明（5 默认模块, 不含业务域）
├── models.yaml                    # 5 角色主备 CLI / 模型映射
├── docs/
│   ├── README.md                  # 文档目录约定
│   └── ARCHITECTURE.md            # 架构 + 扩展点 + 按标书定制开发指南
├── modules/                       # 5 个默认模块（骨架, 每个含 README）
│   ├── system/  infra/  member/  audit/  api/
├── cli/
│   ├── fda.sh  core-swe.sh  pre-sre.sh  fdse.sh  ds.sh   # 骨架（空函数 + TODO）
├── scripts/
│   └── bootstrap.sh               # 自举：校验 5 角色 + 5 默认模块
├── specs/.gitkeep
└── .agents/skills/.gitkeep
```

一键立项脚本在主仓：`scripts/new-company.sh`。

## 6. 验收 gate

- [ ] `templates/workspace-skel/` 为「开发基座」：5 默认模块 + 无业务域
- [ ] `scripts/new-company.sh acme` 跑通（创建 platform company + workspace + 5 agent）
- [ ] `templates/workspace-skel/scripts/bootstrap.sh` 跑通，5 个 cli + 5 个默认模块就位
- [ ] `cli/*.sh` 为骨架（空函数 + TODO），不含业务实现
- [ ] `docs/ARCHITECTURE.md` 含「5 默认模块 vs 15 全栈域」对比表与按标书定制开发 playbook
- [ ] `new-company.sh` 拉轻量底座 `coolie-base-1.0`（拉不到不阻断），**不预装业务域**
- [ ] `git status` 主仓干净

## 7. 当前最关键的设计决定（PM 提议）

1. **模板骨架放主仓** `templates/workspace-skel/`（修订 2026-09-30：不再单建 `coolie-template` 仓库）
2. **5 角色 = Palantir 5 岗位**，不重新发明
3. **匠人池路由照抄** `ai-workshop-dispatch`（GLM 同池串行 / 降级 cmd > claude > agy）
4. **DS 是验收一票否决**（任何 company 投产前必走 DS 业务旅程探路）
5. **基座 = 空壳 + 5 默认模块，不含业务域**（修订 2026-09-30，取代原「ruoyi-all-next 全栈 15 域」）；
   业务按标书在基座上快速定制

## 8. 派单准备

PM（掌柜）要做：

1. 等老板对设计校对一次（5 角色 + 仓库位置 + ruoyi 集成深度）
3. 等老板校对完，派门神按 spec 搭 coolie-template 骨架（最小可跑：5 cli + 5 skill 范本 + new-company.sh stub + bootstrap.sh）
4. 门神跑通 `new-company.sh acme`，掌柜把 `acme` 立成示例项目
5. 老板回签

## 9. 不回签就停在哪

如果老板认为设计不对（任何一项），本 spec 立刻修订，不开工。

## 10. 5 默认模块 vs 15 全栈域（修订 2026-09-30）

旧的「全栈 15 域」底座把 10 个业务域也一起预装了。现有决定只保留 5 个默认模块。

| 维度 | 5 默认模块（开发基座） | 15 全栈域（旧） |
|---|---|---|
| 自带模块 | system / infra / member / audit / api | 上述 5 + bpm / pay / report / mp / mall / crm / erp / wms / mes / im |
| 业务语义 | **无**（真·空壳） | 强（大量用不上的表 / 菜单） |
| 首次启动 | 快 | 慢（全量编译 / 迁移 / 菜单树） |
| 交付节奏 | 拿到标书即可定制 | 先删域，再开发 |
| 需求不符时 | 直接加 | 改别人的业务实现 |
| 适用 | **任何项目**（按标书定制） | 只有刚好命中那 10 个域的项目 |

**为什么这样选：** 一个交付项目命中全部 15 域的概率极低；预装的 80% 是负担 ——
占启动时间、迁移时间、菜单空间，且当「需求与预装实现不一致」时反而变成改造负担。
基座保持空壳、业务按标书快速定制，是净收益。

## 11. 按标书定制开发（playbook）

基座交付后的标准动作：

1. **读标书 → 落 spec。** 标书/需求文档放 `specs/`，走仓库 spec workflow
   （需求 → 设计 → 任务），产出可追踪的需求条目。
2. **定领域与边界。** 用 FDA 角色 skill 画死隔离 / 领域 / 权限 / 守恒边界；
   明确哪些落在 5 个默认模块内，哪些新建模块。
3. **默认模块直接用，不重造。** 认证、权限、存储、代码生成、通知、定时任务来自基座。
4. **业务模块按需引入。** 标书要的域（审批流 / 商城 / …）在 workspace 内实现，
   可复用成熟开源实现；不要求与主仓或其他项目一致。
5. **门禁收口。** 按 CMMI 门禁（G1 需求 → G2 架构 → G3 编译 → G4 验收 → G5 投产）逐关收口。
6. **交付物留痕。** 交付产物、审计、验收记录按项目约定归档。

详见 `templates/workspace-skel/docs/ARCHITECTURE.md` §4。