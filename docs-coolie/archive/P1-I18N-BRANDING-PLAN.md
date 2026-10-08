# P1 规划：国际化(i18n)+ 中文本地化 + 品牌替换

> **分支**：`feature/i18n-branding`（改动只在此分支，`master` / 上游同步分支不受影响）
> **阶段**：规划(requirements + design)。**本文件不含产品代码。**
> **前提结论**：品牌/i18n 属于"改造存量 UI",无法做成纯 plugin；靠**分支隔离**保证 master 不受影响。

---

## 1. 调研结论(基于 coolie 真实代码)

| 事实 | 数据 | 含义 |
|---|---|---|
| i18n 框架 | ✅ 已内建 `i18next` + `react-i18next`，`ui/src/i18n/` | **无需引入框架** |
| 语言包 | ✅ 40 个 locale 文件,含 `zh-CN.json` / `zh-TW.json` | 中文槽位已存在 |
| 语言包内容 | ❌ 基本为空(`en.json` 仅 3 条 leaf key) | 绝大多数文案**未进 i18n** |
| 组件接入率 | ❌ 979 个 tsx/ts 中仅 **3 个**用了 `useTranslation` | 文案**硬编码在组件里** |
| 品牌 "Paperclip" | 散落 **284 个文件**(含测试/loading 组件/文案) | 需系统性替换 |
| 语言切换 UI | ❌ 不存在 | 需新增切换入口 |
| 默认语言 | `en`(`DEFAULT_LOCALE`) | 需支持切到/默认 zh-CN |

**核心判断**：P1 不是"翻译一个文件",而是**把硬编码英文渐进抽取到 i18n key + 补中文 + 加品牌层 + 加切换 UI**。框架已就位,方向清晰,但是**渐进式工程**。

---

## 2. Requirements(要达成什么)

- R1 用户可在界面切换语言,选择简体中文后主要界面显示中文。
- R2 可配置**默认语言为 zh-CN**(部署级 + 用户偏好级)。
- R3 品牌可从 "Paperclip" 切换为 "Coolie"(展示层:标题/loading/空状态/页脚等),不改内部标识符(`@paperclipai/*`、`PAPERCLIP_*` 保留)。
- R4 保留 MIT LICENSE 与版权声明(合规)。
- R5 `master` 与上游同步分支零改动;所有修改在 `feature/i18n-branding`。
- R6 未翻译的 key 优雅回退到英文(fallbackLng 已是 en),不出现空白/报错。

## 3. 非目标(本阶段不做)

- 不做后端消息 i18n(先前端)。
- 不追求 100% 全量翻译;先覆盖**高频主界面**(导航/仪表盘/公司/任务/审批/设置),其余渐进补齐。
- 不改内部包名/环境变量/API 字段。

---

## 4. Design(怎么做)

### 4.1 品牌层(先做,见效快、低风险)
- 新增**单一品牌常量源**(如 `ui/src/branding.ts`):`{ productName: "Coolie", ... }`。
- loading 组件、标题、空状态等**展示性** "Paperclip" 字样改为引用品牌常量(或 i18n key)。
- 严格区分:**只改用户可见文案**,不动 `@paperclipai/*` import、`PAPERCLIP_*` env、API path、类名。
- 测试里的 "Paperclip" 字样按需同步(避免断测)。

### 4.2 i18n 渐进接入(分批,按界面优先级)
优先级从高到低分批把硬编码文案换成 `t('...')` 并补 `en.json` + `zh-CN.json`：
1. 全局框架:导航栏、侧边栏、页头、公司选择器
2. 核心页:Dashboard、Companies、Tasks/Issues、Approvals
3. 次级页:Agents、Costs、Activity、Settings
4. 长尾:向导、对话框、错误提示

每批的机械步骤(交付时执行,非现在)：
- 抽取硬编码字符串 → 定义分层 key(如 `nav.dashboard`、`company.create.title`)
- 组件改用 `const { t } = useTranslation()`;`t('key')`
- 同步写 `en.json`(原文)+ `zh-CN.json`(中文)
- 跑 `locale-validation` 保证 key 结构一致

### 4.3 语言切换 UI + 默认语言
- 在页头/设置加**语言切换器**,调用 `i18n.changeLanguage(locale)`。
- 用户偏好持久化(localStorage;若有用户设置后端则存后端)。
- 部署级默认语言:支持通过配置把初始 `lng` 设为 `zh-CN`。

### 4.4 质量门禁
- `pnpm --filter @paperclipai/ui build` 零错误。
- i18n `locale-validation.test.ts` 通过(en 与 zh-CN key 结构对齐)。
- token-only 设计系统门禁 `pnpm check:token-gates` 通过(改文案不应引入硬编码样式)。
- 关键路由测试(`App.*.test.tsx`)不因品牌字样变更而断裂。

---

## 5. 交付批次(建议)

| 批次 | 内容 | 验收 |
|---|---|---|
| **P1-a 品牌层** | 品牌常量 + loading/标题/空状态改引用 | 界面显示 Coolie,构建+测试绿 |
| **P1-b 切换器+默认语言** | 语言切换 UI + 持久化 + 可默认 zh-CN | 能切中英,刷新保持 |
| **P1-c 全局框架 i18n** | 导航/侧边栏/页头/公司选择器 中文化 | 主框架中文 |
| **P1-d 核心页 i18n** | Dashboard/Companies/Tasks/Approvals | 核心流程中文 |
| **P1-e 长尾渐进** | 其余页面按频率补齐 | 覆盖率提升,回退英文无报错 |

> 每批独立提交,master 全程不动。P1-a/P1-b 收益最快,可先交付验证。

---

## 6. 风险

- **改核心 UI → 上游合并冲突**:i18n 抽离后冲突面主要在语言包(可控);品牌层集中到单一常量源降低散点冲突。
- **翻译质量**:机器/人工翻译需校对;先保证 key 结构正确、回退英文,再迭代译文。
- **测试断裂**:品牌字样出现在测试断言里(284 文件含测试),改动时同步。

---

*规划阶段产物,不含产品代码。改动仅在 `feature/i18n-branding`,不影响 `master`。*
