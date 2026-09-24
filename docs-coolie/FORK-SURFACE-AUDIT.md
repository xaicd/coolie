# 分歧面审计 (FORK-SURFACE-AUDIT)

日期:2026-09-18。方法:`git diff <基线>...main --numstat --diff-filter=AM`,按上游拥有的前缀过滤。

> **2026-09-18 已同步,本页需按新基线读。** 当天开了 `upstream` remote(之前**根本没有通道**,
> `origin/master` 只是 9-13 的快照),预演 CLEAN,合并了 **71 个官方提交**(merge `b50f028d4`),
> 现在 **0 behind / 236 ahead**。重新以 `upstream/master` 为基线实测:
> **92 个上游文件 / 9316 行**(同步前是 91 / 9295)。
> 下表的分桶是**同步前**那次测量,桶间比例不变;**当天数字一律用报告取**:
> `node .agents/skills/fork-sync/scripts/sync-report.mjs`。

> **2026-09-22 第二次审计(结构性,数字待重取)。** 方法:`git diff --numstat
> $(git merge-base HEAD upstream/master)..HEAD`,再用 `check-fork-surface.mjs` 导出的
> `isOwned` / `loadManifest` 分类——**不重新实现门禁的逻辑,直接 import 它**,否则两边会漂。
> 当天 `upstream/master` 是本地缓存的 `c65fc9e3`(沙箱连不上 github,`sync-report.mjs`
> 会 `SSL_ERROR_SYSCALL`),所以下面每个数字都是**那个基线**的,且早于其后约 40 个提交。
> 要用,先重取。
>
> 这次测到:全量改动 **828** 文件 = 已登记 54 + 自有前缀 518 + **未登记 256**。
> 未登记的 256 分成两类,处置完全不同:
>
> | 类 | 文件 | 依据 | 处置 |
> | --- | --- | --- | --- |
> | **可整体归我方** | 121 | 上游在该前缀下**零文件** | 加进 `OWNED_PREFIXES` |
> | **必须逐条登记** | 135 | 上游同路径**有**文件 | 补 `scripts/fork-surface.json` |
>
> 第二类里真正贵的是 **A 类(上游真有这个 path)**:108 文件 / 8393 行,其中约 64 个是
> §3 那批 locale;另外 **21 个是"混合树里的新文件"**——落在上游目录下但上游没有这个文件,
> 构不成合并冲突,门禁却按前缀认不出来。这是 §2 分桶之外的一个新类,值得单独定一条规则。
>
> **这次已经落地的**(见提交 `1ae5ef3f5`、`824a58f6f`):
> - `OWNED_PREFIXES` 加了 **18 个前缀**(13 棵树 + 5 个脚本),**并把准入规则写进代码注释**:
>   一个前缀只有在上游该路径下零文件时才能加。混合树绝不能加——门禁先判 owned 再查
>   manifest,加了会把树里的上游文件一起静默豁免。`server/src/services/` 就是反例(上游 654 个文件)。
>   这同时把 §2 的 **C 桶**("上游没有同名 → 考虑搬进我们自己的目录")就地解决了:没有搬目录,
>   而是让门禁承认它们本来就归我方。
> - 登记 **10 条**新条目,并**删掉一条错的**:`plugin-npc-factory/src/worker.ts` 的 reason 写着
>   "A plugin package, but not one we own" —— 上游 `packages/plugins/` 下**从来没有**这个包
>   (也从来没有过),它是 `47bb99a0f` 我们自己建的。同一个错误前提还被一个单测断言着
>   (`isOwned(".../plugin-npc-factory/...") === false`),一并改到真正的上游兄弟包上。
> - 未登记 256 → **129**;**`--cumulative` 仍余 2 个超预算**(`server/src/auth/better-auth.ts`
>   126/70 为既存,`server/src/__tests__/board-chat-route-feature-flag.test.ts` 169/80 是后加的)。
>
> **一个校准提醒(这次踩到的)**:`--range=<分叉点>..HEAD` 是拿**全量净值**去比
> `maxNetLines`(单提交预算),必然虚高——当天它报了 12 个"超预算",而 `--cumulative`
> 只有 1 个是真的。**总量看 `--cumulative`,单次提交看 `--range=HEAD~1..HEAD`。**
>
> **一个真实的教训(§2 之外的第七类风险)**:我们的迁移曾用 `0280_lumpy_thunderbird.sql`,
> 而上游已经有 `0280_unique_genesis` / `0281_true_boom_boom`。两边的**四位号**撞在同一号段,
> 下次合并必然 `Duplicate migration number 0280`,且 `meta/0280_snapshot.json` 同名不同内容。
> 已改到 **9000**(`9000_coolie_company_template`)并把 journal 的 `idx` 也设到 9000,
> 让 `drizzle-kit generate` 的下一个号从 9001 起、不再回到 0280。**结论:fork 的迁移要占一个
> 上游够不到的号段**,这一条不在上面的六个桶里,因为它是"数字"层面的冲突,而六个桶只看文件。

**为什么要这份**:`scripts/fork-surface.json` 是**预算**清单,不是**地图**。它只登记了 7 个文件,
而实际分歧是 91 个 / 9295 行 —— 也就是说 `check-fork-surface --cumulative` 的 PASS
**只对清单里那几个成立**。上游一动,冲突大概率落在**没登记、也没记理由**的那些文件里。
这份文档就是那份缺掉的地图,用来把分歧面**收敛**掉。

## 1. 总量

| | 文件 | 改动行 | 其中删除 | 已登记 |
| --- | --- | --- | --- | --- |
| **合计** | **91** | **9295** | 259 | **6** |

`main` 完全包含 `origin/master`(`0 ahead / 231 behind`),所以**今天合并是空操作**——
冲突只会在上游有新提交之后出现。现在正是做收敛的时机。

## 2. 六个桶,六种处置

| 桶 | 文件 | 行 | 删 | 已登记 | 处置 |
| --- | --- | --- | --- | --- | --- |
| **A 锁定文件(生成)** | 1 | 436 | 4 | 0 | 无脑:取上游 + `pnpm install` 重生成 |
| **B i18n 语言包** | 40 | 6446 | 3 | 0 | **最大的一桶(69%)**,见 §3 |
| **C `scripts/` 我们新增的工具** | 7 | 1425 | 0 | 0 | 上游没有同名 → 现在不冲突;考虑搬进我们自己的目录 |
| **D 交织改动(有删除)** | 28 | 711 | 252 | **1** | **真正会冲突的那批**,见 §4 |
| **E 上游文件只做追加** | 12 | 156 | 0 | 5 | 上游在附近改动时会冲突;改动小,逐个人工解即可 |
| **F 我们新增的文件** | 3 | 121 | 0 | 0 | 不冲突 |

## 3. B 桶:i18n 是最大且会**反复**冲突的一桶

40 个 `ui/src/i18n/locales/*.json`,每个约 161 行,合计 6446 行(占全部分歧的 69%)。
上游每加一个界面字符串,这 40 个文件都会变 ⇒ 每次都可能在 40 个文件里冲突。

机制(`ui/src/i18n/locales.ts`,上游文件):它用
`import.meta.glob("./locales/*.json", { eager: true })` **把目录下每个 json 当一个 locale**,
并校验、要求 `en` 必须存在。所以**在同一个目录里放"我们的覆盖文件"是行不通的**——
它会被当成一个语言代码。要覆盖,只能把我们的词条放在该目录**之外**,再合并进 `i18nextResources`,
那是 `locales.ts` 或 `i18n/index.ts` 里的一次性改动(几行)。

三条路,按推荐排序:

1. **往上贡献**:这 40 个文件里大多是**上游界面的翻译**,上游大概率愿意收。PR 一旦合并,
   它们就不再是分歧,冲突面直接消失。**长期最便宜。**
2. **停止增长**:新词条不再写进上游的 locale 文件,改为我们自己的覆盖层(一次性改 `locales.ts`,
   之后 40 个文件保持干净)。这正是"把复发冲突塌成一行"那条原则。
3. **接受现状 + `rerere`**:已有 6446 行当作"已花掉的分歧",靠 `git config rerere.enabled true`
   让同样的冲突解决被记住、自动复用。省事,但每次仍会有 40 个文件冒冲突。

## 4. D 桶:交织改动 —— 按意图解的那 28 个

这些文件里有我们的**删除行**,git 无法自动判断意图(±4 行的小改也一样),
解冲突时必须知道"当初为什么改"。当前**只有 1 个**有登记(`ui/src/pages/PluginPage.tsx`)。

```
+62  -36  ui/src/plugins/slots.tsx
+32  -30  ui/src/components/Sidebar.tsx
+54  -28  server/src/routes/plugin-ui-static.ts
+28  -25  ui/src/pages/PluginManager.tsx
+35  -22  ui/src/pages/ProfileSettings.tsx
+22  -20  ui/src/pages/Dashboard.tsx
+16  -14  ui/src/pages/Companies.tsx
+15  -13  ui/src/components/CompanySettingsSidebar.production.tsx
+15  -13  ui/src/components/CompanySettingsSidebar.tsx
+10  -8   ui/src/pages/Approvals.tsx
+8   -6   ui/src/pages/Issues.tsx
+5   -5   ui/src/pages/BootstrapSetupUxLab.tsx
+4   -4   ui/src/App.test.tsx
+5   -4   ui/src/components/InboxAgentPolicyControl.tsx
+4   -4   ui/src/pages/apps/chat/ChatEndpointSetup.tsx
+3   -3   ui/src/components/BootstrapPendingPage.tsx
+52  -2   server/src/app.ts
+2   -2   ui/index.html
+2   -2   ui/public/site.webmanifest
+8   -2   ui/src/pages/PluginPage.tsx        ← 唯一已登记
+2   -2   ui/src/pages/apps/generic-mcp-connect.ts
+1   -1   ui/src/components/CloudAccessGate.tsx
+1   -1   ui/src/components/OnboardingWizard.tsx
+1   -1   ui/src/components/StandaloneBrowserControls.tsx
+3   -1   ui/src/context/BreadcrumbContext.tsx
+67  -1   ui/src/i18n/index.ts
+1   -1   ui/src/pages/InstanceGeneralSettings.tsx
+1   -1   ui/src/pages/apps/AppsConnect.test.tsx
```

其中 `ui/src/plugins/slots.tsx`、`ui/src/components/Sidebar.tsx`、`server/src/routes/plugin-ui-static.ts`
是插件 UI 的宿主接缝——**改动量最大、上游也在活跃开发**,同步时最可能真冲突。

## 5. 收敛动作(建议顺序)

1. **i18n**:先决定走上游 PR,还是做覆盖层;不管哪条,先**停止**继续往上游 locale 文件里加词条。
   **仍未定** —— 这是未登记清单里最大的一块(约 64 个文件 × 每 161 行)。
2. **D 桶 28 个 + 2026-09-22 新增的 A 类**:每个要么补进 `scripts/fork-surface.json`
   (`maxNetLines` + `reason`,写清为什么),要么把改动缩回一行 re-export。做完之后,冲突文件能与清单
   对得上,**解决靠意图而不是靠猜**。
3. ~~**C 桶 7 个 `scripts/`**:考虑移进我们自己的目录~~ —— **2026-09-22 已解决,换了更便宜的解法**:
   不搬目录,把它们加进 `OWNED_PREFIXES`(上游本来就没有同名文件),并把准入规则写进代码注释。
4. **混合树里的新文件(约 21 个)**:定一条规则 —— 上游在该 path 下没有文件时,是否仍需登记。
   倾向"不需要"(门禁约束的是**冲突面**,上游没有的文件构不成冲突),代价是上游日后在同一路径新增
   文件会变成 create/create 冲突。**未定。**
5. **把 `--range=` 用起来**:`node scripts/check-fork-surface.mjs --range=origin/master..main`
   能看见新增的上游文件,是这份地图下次刷新时的一致性检查。
6. **迁移号段**:fork 自己的迁移要占一个上游够不到的号段(现有 `9000_coolie_company_template`)。
   这是**文件层面之外**的"数字"冲突,上面六个桶都看不见 —— 见头部 2026-09-22 那条。

> 这份文档是**地图**,不是预算。`scripts/fork-surface.json` 才是预算;两者的差值就是待收敛的工作量。
