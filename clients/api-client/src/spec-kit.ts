import type { IssueSpecKind } from "./types";

/**
 * Spec-Kit 派单规约 (COOA-521 / wave368) 与 wave147 spec 文档链的收敛映射 (COOA-525)。
 *
 * 这是两个不同的词表, 服务两个不同的层, 必须分开:
 *
 *   - **Spec-Kit 派单类型** (`SPEC_KIT_TYPES`) 驱动服务端物理规格脚手架:
 *     建单请求 `POST /api/companies/:id/issues` 的 `specKit.type`, 由
 *     `server/src/services/speckit-dispatch.ts::inferSpecType` 消费
 *     (`feature | bugfix | refactor | security | enhancement`)。
 *   - **wave147 spec 文档 kind** (`SPEC_DOC_KINDS`) 驱动
 *     `POST /api/issues/:id/spec` 的规范骨架 —— 服务端 `issueSpecSchema` /
 *     `ISSUE_SPEC_KINDS` 只接受 `requirement | bugfix | design | task`
 *     (`packages/shared/src/constants.ts:258`)。
 *
 * 建单弹窗的芯片是 Spec-Kit 类型; 写 spec 骨架前 MUST 先经
 * `SPEC_DOC_KIND_FOR_SPEC_KIT_TYPE` 映射到 wave147 kind, 否则
 * `feature` / `refactor` / `security` 三种骨架会被服务端 400 拒收
 * (建单流程 try/catch 吞掉错误 → 任务建了但规格未落盘)。
 *
 * 本模块是客户端侧的单一真源。`specDocSkeleton` 逐字对齐服务端真源
 * `packages/shared/src/spec-templates.ts::specTemplateSkeleton`; 客户端不依赖
 * `@paperclipai/shared` (见 `types.ts` 的既有说明), 故在此镜像一份并加守卫测试。
 */

/** Spec-Kit 派单类型 —— 与 `issueSpecKitConfigSchema.type` 对齐。 */
export type SpecKitType = "feature" | "bugfix" | "refactor" | "security";

export const SPEC_KIT_TYPES: readonly SpecKitType[] = [
  "feature",
  "bugfix",
  "refactor",
  "security",
];

export const SPEC_KIT_TYPE_LABEL: Record<SpecKitType, string> = {
  feature: "需求规格",
  bugfix: "缺陷修复",
  refactor: "架构重构",
  security: "安全加固",
};

/** wave147 spec 文档 kind —— 与 `ISSUE_SPEC_KINDS` 对齐。 */
export const SPEC_DOC_KINDS: readonly IssueSpecKind[] = [
  "requirement",
  "bugfix",
  "design",
  "task",
];

/**
 * Spec-Kit 类型 → wave147 spec 文档 kind 的收敛映射。
 *
 * `bugfix` 两表同名直通; `feature` (需求规格) 落 `requirement`;
 * `refactor` (架构重构) 与 `security` (安全加固) 都是「设计 / 加固方案」性质, 落 `design`。
 */
export const SPEC_DOC_KIND_FOR_SPEC_KIT_TYPE: Record<SpecKitType, IssueSpecKind> = {
  feature: "requirement",
  bugfix: "bugfix",
  refactor: "design",
  security: "design",
};

/**
 * A fresh, structurally valid wave147 spec skeleton. Every required field carries
 * the placeholder so the skeleton passes `issueSpecSchema` and can be stored
 * before a human fills it in. Mirrors `specTemplateSkeleton`.
 */
export function specDocSkeleton(kind: IssueSpecKind): Record<string, unknown> {
  const todo = "（待填写）";
  switch (kind) {
    case "requirement":
      return {
        kind,
        requirement: {
          body: `${todo}描述要做什么 —— 1~3 句话。`,
          acceptanceCriteria: [`${todo}一条可判定的验收条件。`],
        },
      };
    case "bugfix":
      return {
        kind,
        bugfix: {
          reproSteps: `${todo}复现步骤 1、2、3…`,
          expectedBehavior: `${todo}预期行为。`,
          actualBehavior: `${todo}实际行为。`,
        },
      };
    case "design":
      return {
        kind,
        design: {
          approach: `${todo}怎么做：接口 / 数据 / 边界。`,
          tradeoffs: [`${todo}权衡 1。`],
          apiSurface: `${todo}接口或数据结构（可留空）。`,
        },
      };
    case "task":
      return {
        kind,
        task: {
          files: [`${todo}path/to/file.ts`],
          steps: [`${todo}改动点 1。`],
        },
      };
    default: {
      const exhaustive: never = kind;
      throw new Error(`unknown spec kind: ${String(exhaustive)}`);
    }
  }
}
