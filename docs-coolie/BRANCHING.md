# 分支与开发规范 (BRANCHING)

> 先读这一页再动手。这里写的是**这个 fork 怎么工作**,不是上游 Paperclip 的贡献流程
> (那是 `CONTRIBUTING.md`,属于上游,别改)。任何与本页冲突的历史说法,以本页为准。

## 1. 两条分支,分工不同

| 分支 | 属于谁 | 用途 | 能不能推我们的东西 |
|---|---|---|---|
| **`main`** | **我们自己** | 唯一开发分支。所有功能、修复、文档都提交到这里 | **是**,`git push origin main` |
| **`master`** | **官方上游** | 专门用来**同步官方功能**的镜像 | **否**。never commit, never push |

判定依据(实测,不是约定俗成的记忆):

- `main` 上的提交作者是 `robin ai`;比上游多 **228 个提交**(ontology 插件、i18n、npc-factory、chat、workflow、clients…)。
- `git log origin/master --author="robin ai"` **返回空** —— 上游镜像里没有一个我们的提交。
- `origin/master` 的最近提交来自 `Dotta` / `Tonio` / `Devin Foley`(paperclip 官方),最新 `13368c518`(2026-09-13)。
- `origin/HEAD -> origin/master`:fork 的默认分支仍指着上游那条,所以"PR base 通常是 master"这类提示说的是**上游**,不是我们的工作分支。
- 本地 `master` 是 2026-09-10 的旧快照,**落后 `origin/master` 96 个提交** —— 它当前没有用处,只是同步用的落脚点。

**`main` 完全包含 `origin/master`**:我们是从上游 master 长出来的,不是分叉后另起一条线。
所以合上游是"把 master 往前拉,再并进 main",不是反向。

## 2. 同步官方功能(这是 `master` 存在的唯一理由)

**当前没有配置 `upstream` remote** —— 只有 `origin`(你自己的公开 fork `xaicd/coolie`)。
也就是说现在**没有取上游的通道**,`origin/master` 只是个快照。要同步,先建通道:

```sh
# 一次性
git remote add upstream https://github.com/paperclipai/paperclip.git

# 每次同步
git fetch upstream
git checkout master
git merge --ff-only upstream/master      # 只快进;本地 master 有本地改动说明状态不对,先查清楚
git push origin master                   # 让 fork 的镜像跟上

# 再并进我们的分支(冲突都在这一步暴露)
git checkout main
git merge master
```

并完先看**分歧面有没有超预算**,再决定要不要继续加东西:

```sh
node scripts/check-fork-surface.mjs --cumulative
```

它列出我们改动过的上游文件与额度。**注意它的盲区**(实测):它只遍历
`scripts/fork-surface.json` 里**列出的**文件,所以**新增或未列出的上游文件它看不见** ——
`pnpm-lock.yaml` 与 `scripts/check-testing-defenses.mjs` 被我们改过而它仍报 PASS。
也就是说:它能防"某个已知文件被越改越大",**不能**证明"上游面没被动过"。

## 3. 东西该写在哪

**我们自己的树**(随便改,合上游时不会被冲):

- `packages/ontology-core/`、`packages/ontology-mcp/`
- `packages/plugins/plugin-ontology/`、`packages/plugins/plugin-ops-console/`
- `doc/plans/`(仓库内的计划文档,命名 `YYYY-MM-DD-slug.md`)
- `docs-coolie/`(本目录:术语表、迁移计划、合规、本页)
- `.agents/skills/`(我们的技能库)

**上游拥有的树**(改之前先想清楚,改动越小越好):

- `server/`、`ui/`、`cli/`、`scripts/`、`packages/shared/`、`packages/db/`、根 `package.json`、`pnpm-lock.yaml`

改上游文件时:改动尽量小且可加(additive),并在提交信息里**点名**这是上游文件、
以及为什么不能放进我们自己的树。当前总分歧面是 **66 行 / 0.2%**。

## 4. 提交与推送

- **在每个逻辑检查点提交**,不要攒到最后一次性提交。
- 提交信息写清"为什么",以及**运行时才发现的坑**(假库/单元测试看不到的那类)——
  下一个读的人靠它少走一次弯路。协作者 trailer 用 `Co-authored-by: CommandCodeBot <noreply@commandcode.ai>`。
- **推送是攒批的**:默认留在本地并每轮报告未推送数量;等明确说推(通常是"推送,并且继续干活")
  再一次性推 `main`。**永远不要推 `master`**,也不要 `--force`。
- 这个 fork 是**公开**的(`xaicd/coolie`,实测 `visibility: public`),推上去就是公开。
  涉及上游可复现缺陷的分析,先想清楚顺序(先告诉上游,还是先公开)。
- 适配器/运行时代码**不许** `git push`(有 `scripts/check-no-git-push.mjs` 在守)。

## 5. 交接前跑什么

按改动范围从窄到宽:

```sh
# 单个包
pnpm --filter @paperclipai/<pkg> typecheck && pnpm --filter @paperclipai/<pkg> test

# 插件改动(先构建,再让宿主重载;重建不等于重载)
pnpm --filter @paperclipai/plugin-<name> build
#   然后 disable/enable 该插件,或见 .agents/skills/paperclip-create-plugin/SKILL.md

# 仓库级(会跑全量 typecheck,较慢;必要时后台跑)
pnpm -r typecheck && pnpm test:run

# 四行闸门:它会如实区分 verified / NOT VERIFIED / NOT RUN
pnpm test:defenses
```

**绿不等于验证过**:四行闸门默认只有 2/4 行会跑(另外两行需要实例/Playwright 开关),
嵌入式 Postgres 相关套件在运行时缺失时会**静默 skip 成绿**,`--cumulative` 那个 fork 闸门有第 2 节说的盲区。
报"通过"之前先确认那一行**真的执行了**。

## 6. 已废弃的东西

- **`feature/*` 远端分支**(约 50 条:ontology O0→O6、i18n、plugins、clients…)是历史化石,
  内容都已并入 `main`。**不要**基于它们开新分支,也不要往里合并。
- 旧的 `COOLIE-LOCAL-DEV.md` 里写过"定开分支 `coolie/customization`" —— **那个分支不存在**,
  以本页为准(该文件已就地更正)。

## 7. 同步官方与冲突处置

**先算,不要等撞上。** 一条命令就够(只读,不动工作区):

```sh
node .agents/skills/fork-sync/scripts/sync-report.mjs
```

它会拉取官方并打印:落后/领先多少、官方尖端、**合并会不会冲突**、以及我们的分歧里
**有多少属于上游文件**(那部分才是合并要处理的)。退出码 1 = 预计有冲突。`--no-fetch` 则只报已取到的。

底层那两步(想单独跑时):

```sh
git fetch upstream
git merge-tree --write-tree --messages main upstream/master   # 打印冲突,不动工作区(git ≥2.38)
```

无冲突时只打印一个 tree hash、退出码 0。**每次同步前先跑它**,比合完再发现便宜得多。

**报告说 CLEAN 且落后时就该合** —— 常同步的 fork 每次付一次小而无聊的合并,等着的 fork 付一次考古。
前提是工作区先提交或 stash:合并会拒绝覆盖它要碰的未提交文件。

**冲突分四类,解法不同**(各类的实际规模见
[`FORK-SURFACE-AUDIT.md`](./FORK-SURFACE-AUDIT.md)):

| 类别 | 例子 | 怎么解 |
| --- | --- | --- |
| **生成物 / 锁定文件** | `pnpm-lock.yaml`(几乎每次必冲突) | **取上游的,再重新生成**(`pnpm install`);不要手改 |
| **交织改动**(我们的行插在上游文件里) | `ui/src/plugins/slots.tsx`、`server/src/app.ts`、`ui/src/i18n/locales/*.json` | 保留上游逻辑,把我们的增量重放上去。能"移进我们自己的文件、只留一行 import"的就移——把复发冲突塌成一行 |
| **我们新增的文件**(上游没有) | `scripts/check-fork-surface.mjs`、`server/src/icp-footer.ts` | 正常**不冲突**。风险是上游以后**也**加同名 → 名字带 `coolie-` 前缀,或放进我们自己的子目录 |
| **上游重命名/移动了我们改过的文件** | —— | 最烦的一类(git 认成"他们删、我们改"),只能按语义手工并。所以文件里"**为什么改这里**"的注释值钱——`fork-surface.json` 的 `reason` 就是干这个的 |

**让同步可重复的三个设置**:

1. **`git config rerere.enabled true`** —— 冲突解决被记住,下次同样的冲突自动复用。周期性同步的 fork 这是标准做法。
2. **用 merge,不要 rebase**:`main` 已公开推送,rebase 会重写历史。`git merge master` 进 `main`,每次同步留一个 merge commit,冲突只解一次。
3. **不要用 `-X ours`** —— 它会默默吞掉上游改动。只对第一类(生成物/锁定文件)例外。

**同步后按顺序跑**:`node scripts/check-fork-surface.mjs --range=origin/master..main`(注意 `--range=` **要带值**;
它能看见**新增**的上游文件,`--cumulative` 看不见,后者只核对清单里已登记的那几个)→ `pnpm -r typecheck && pnpm test:run`。

---

*本页与(上游的)`CONTRIBUTING.md` 不冲突:那份讲怎么给 Paperclip 提 PR,本页讲这个 fork 怎么运转。*
