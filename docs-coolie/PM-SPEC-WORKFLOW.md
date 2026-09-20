# Spec 派活工作流（启用）— 2026-09-20

PM 派活从「老板一句话」升级为「老板一句话 + PM 写 spec + 匠人按 spec 干」。

## 1. 流程（端到端）

```
老板说话（微信）
   ↓
PM（Hermes）：docs-coolie/specs/YYYY-MM-DD-<slug>.md 写 spec
   ↓
PM：门神/铁匠按 spec 派活（brief 在仓库内 docs-coolie/briefs/）
   ↓
匠人：按 spec 干活 + tsc 0 错误 + commit + 出 APK/版本
   ↓
PM：24 项 gate 签字
   ↓
老板：实测 + weixin 回签
   ↓
PM-DISPATCH-LOG 加一行 + docs-coolie/specs/ 加后续 spec
```

## 2. spec 模板

每个 spec 6 要素：

```markdown
# Spec: <一句话目标>

## 1. 背景
<为何要做 + 关联 commit / 文档 / 老板说话原文>

## 2. 目标（验收标准）
<一句话可测目标，含具体数值 / 文件 / 路径>

## 3. 文件范围（白名单）
- path/to/file1.tsx
- path/to/file2.ts

## 4. 不动项
- <list of files NOT to touch>

## 5. 匠人分配
- 门神 cmd（180s 冷却）— <什么活>
- 铁匠 claude（30s 冷却）— <什么活>

## 6. 验收 gate（24 项 PM-RELEASE-CHECKLIST 的子集）
- [ ] tsc 0 errors
- [ ] commit message 模板
- [ ] APK / version.json 字段（涉及发版时）
- [ ] 老板 weixin 回签
```

## 3. Spec 文件位置

- `docs-coolie/specs/` 目录：所有 PM 写的 spec
- 文件名：`YYYY-MM-DD-<slug>.md`
- slug：kebab-case，≤ 30 字符

## 4. Spec 与 PM-DISPATCH-RULES 的关系

| 关系 | 说明 |
|---|---|
| PM-DISPATCH-RULES.md | **派单模板**（给匠人看的 brief 怎么写）|
| docs-coolie/specs/*.md | **具体 spec**（一个 spec 一个文件）|
| PM-RELEASE-CHECKLIST.md | **发版 gate**（24 项）|

三件套配套：spec 是「做什么」，dispatch-rules 是「怎么派」，checklist 是「怎么验」。

## 5. 当前已实现（DS 同款 build-on-spec 已就位）

`server/src/services/ontology-spec*.ts` 5 文件 + `clients/expo/src/components/SpecDiffCard.tsx` + `ui/src/components/SpecDiffCard.tsx` + `server/src/services/hermes-oneshot.ts` + 单测 `server/src/__tests__/ontology-spec.test.ts`（commit `6092653a9`）

这是「spec 工作流」在 Coolie 系统内的代码实现。`PM-SPEC-WORKFLOW.md`（本文档）是 PM 流程层的 spec 工作流。

**两者协同：**
- 老板说话 → PM 写 docs-coolie/specs/*.md（PM 层）
- 老板在 App 工坊说 "build xxx" → Coolie 后端用 ontology-spec*.ts（系统层）

两层都用「spec 拆解 → 审批 → 派单 → 验收」这一套。

## 6. 启用后的派单纪律

派单时：

1. **老板说话必留痕**（写到 spec 第一节）
2. **spec 写完再派单**，不口头说就派
3. **匠人收到 brief（spec 路径 + 简报）** → 按 spec 干活
4. **匠人 commit message 必含 spec 路径**（如 `feat(feedback): per docs-coolie/specs/2026-09-21-feedback-page.md`）
5. **PM-LOG 必记 spec 文件名**

## 7. 第一个示例 spec

`docs-coolie/specs/2026-09-20-spec-workflow-rollout.md`（启用自身）—— 你正在看的就是它的产物。

## 8. 反例（spec 不该是）

- ❌ 一句话目标：「修一下登录」
- ❌ 不列白名单：「你看着改吧」
- ❌ 不列不动项：「顺便把 X 也改了」
- ❌ 不给验收：「差不多就行」
- ❌ 老板说改 spec：「改一下描述」 → PM 改 spec + 重派，**不直接动匠人**

## 9. 与 DS 的对齐

DS 的 spec 是「带 diff 预览的待确认变更集」（DS 学习报告 343b13b75）—— 我们用 Coolie 的 SpecDiffCard 已落地同款体验。老板在 App 工坊看到的是「diff 预览卡」，老板在 weixin 看到的是 `docs-coolie/specs/*.md`。

**两边同源，都是 spec 驱动。**

## 10. 启动开关

从本文件 commit（`docs(spec): PM spec workflow rollout`）起，所有派单按 spec 流程走。

**老板下次说话，第一句即 spec。**