# Feature: Wave156 全量审查与代码审计闭环修复 (Audit Remediation & Fork Governance)

> 日期 2026-09-30 · 基线 commit `899b45ea56` · 状态：已确立 (Draft / Ready for Implementation)

---

## 1. 背景

在针对系统近期一系列交付（`v0.6.0` / `wave152` ~ `wave155`）进行全量代码审计与 Palantir 五角色（FDA / Core SWE / PRE-SRE / FDSE / DS）工程走查中，发现并锁定了影响生产合规与交付体验的三大核心问题：

1. **Fork Surface 门禁阻断 (Core SWE / SRE)**：`wave154`/`wave155` 在上游属主目录下新增与修改了 19 个文件（DB 迁移、shared 类型契约、服务端路由及前端组件），未在 [`scripts/fork-surface.json`](../../scripts/fork-surface.json) 中登记，导致 `node scripts/check-fork-surface.mjs --range=946c9fd7f3..899b45ea56` 报 19 项 undeclared 失败。
2. **Onboarding 重定向 UX 竞态缺陷 (FDSE / DS)**：[`ui/src/App.tsx`](../../ui/src/App.tsx) 中 `CompanyRootRedirect` 组件在 `useQuery` 尚处于 loading 状态时（`data: onboarding` 为 `undefined`），无条件回退并立即执行 `<Navigate to="/${targetCompany.issuePrefix}/dashboard" replace />`。这导致新企业首次登录时，在网络请求返回前组件就已卸载并跳转至控制台，使新手 3 步引导向导 (`/getting-started`) 被永久静默跳过。
3. **RBAC 鉴权缺位与审计缺失 (FDA / Core SWE)**：
   - [`server/src/routes/onboarding.ts`](../../server/src/routes/onboarding.ts) 中推进向导步骤 (`POST /step`) 和完成向导 (`POST /complete`) 仅校验了企业成员权限，未校验 Board 操作员权限 (`assertBoard(req)`)，违背了 [`AGENTS.md`](../../AGENTS.md) 规则 8（变异性操作必须区分 board 与 agent 身份）。
   - [`server/src/routes/ontology-graph.ts`](../../server/src/routes/ontology-graph.ts) 中触发批量链接生成的 `POST /ontology/backfill` 虽已实现幂等，但缺少 `logActivity` 审计留痕。

本 Spec 遵循 Spec-Driven 开发链，旨在收敛并一次性闭环解决上述审计缺陷。

---

## 2. User Stories

- 作为 **新企业操作员 (Operator)**，当我首次登录或进入企业根路径时，系统应当保持加载状态直到明确获取 Onboarding 状态；若未完成引导，系统应稳定、无闪烁地引导我进入 `/getting-started` 页面。
- 作为 **已入驻企业用户 (User)**，当我进入企业根路径时，若企业已完成 Onboarding，系统应流畅进入 `/dashboard`。
- 作为 **平台安全架构师 (FDA)**，我希望只有具备 Board 身份的操作员才能更新企业 Onboarding 状态；持有 Agent API Key 的自动化程序尝试调用时必须被严格拦截并返回 403。
- 作为 **审计管理员 (Compliance)**，当管理员手动触发本体链接 Backfill 时，系统应记录审计活动日志（含触发人、企业 ID、生成关系条数）。
- 作为 **代码库维护者 (Core SWE / PRE)**，在持续集成中运行 `check-fork-surface` 门禁时，所有变更的属主文件均有明确原因和行数预算，保证 0 门禁误报与合规演进。

---

## 3. Acceptance Criteria (EARS 规范)

### 3.1 前端重定向状态机 (FDSE)
- **WHILE** `CompanyRootRedirect` 中获取企业的 Onboarding 状态请求仍在进行中 (`isLoading === true`), **THEN** 系统 **SHALL** 渲染 `<PaperclipLoading />` 加载组件，**SHALL NOT** 触发任何路由跳转。
- **WHEN** 企业 Onboarding 状态加载完成且 `onboarding.onboardedStep === null`, **THEN** 系统 **SHALL** 确定性跳转至 `/${targetCompany.issuePrefix}/getting-started`。
- **WHEN** 企业 Onboarding 状态加载完成且 `onboarding.onboardedStep !== null`, **THEN** 系统 **SHALL** 确定性跳转至 `/${targetCompany.issuePrefix}/dashboard`。
- **WHEN** 发生网络错误或无该企业状态时, **THEN** 系统 **SHALL** 容错回退重定向至 `/${targetCompany.issuePrefix}/dashboard`。

### 3.2 权限控制与审计规范 (FDA)
- **WHEN** 非 Board 操作员（例如使用普通 Agent API Key）调用 `POST /api/companies/:companyId/onboarding/step`, **THEN** 系统 **SHALL** 拦截并返回 `403 Forbidden`。
- **WHEN** 非 Board 操作员调用 `POST /api/companies/:companyId/onboarding/complete`, **THEN** 系统 **SHALL** 拦截并返回 `403 Forbidden`。
- **WHEN** 合法 Board 操作员成功执行 `POST /api/companies/:companyId/ontology/backfill`, **THEN** 系统 **SHALL** 异步写入一条操作日志至 `activity_logs`（`action: "ontology.backfill"`）。

### 3.3 Fork 门禁与工程规范 (Core SWE / SRE)
- **WHEN** 针对最近的提交执行 `node scripts/check-fork-surface.mjs`, **THEN** 系统 **SHALL** 返回 `0 undeclared, 0 over budget` 并且进程以 `exit 0` 退出。
- **WHEN** 执行 `pnpm check:token-gates`, **THEN** 系统 **SHALL** 保持 0 违规通过。

---

## 4. 边界 / Out of Scope

- **不改动** Onboarding 向导 3 步表单（行业选择、团队规模、完成按钮）的业务逻辑。
- **不重构** `entity_relations` 表结构与 BFS 图搜索核心算法。
- **不引入** 新的第三方外部依赖包。
- **不修改** CMMI 相关既有表结构。

---

## 5. 文件范围（白名单）

本任务仅允许对以下既有文件进行编辑修改：

1. [`ui/src/App.tsx`](../../ui/src/App.tsx) —— 修复 `CompanyRootRedirect` 加载竞态逻辑。
2. [`server/src/routes/onboarding.ts`](../../server/src/routes/onboarding.ts) —— 补充 `assertBoard(req)` 门禁。
3. [`server/src/routes/ontology-graph.ts`](../../server/src/routes/ontology-graph.ts) —— 补充 `assertBoard(req)` 与 `logActivity` 审计。
4. [`scripts/fork-surface.json`](../../scripts/fork-surface.json) —— 登记 19 个 wave154/155 文件与合理预算。
5. [`server/src/__tests__/onboarding-routes.test.ts`](../../server/src/__tests__/onboarding-routes.test.ts) —— 补齐 403 Board 权限拦截单测。

---

## 6. 不动项

- `packages/db/src/schema/entity_relations.ts`
- `packages/db/src/schema/companies.ts`
- `packages/ontology-core/**`
- `docs/cmmi/**`

---

## 7. 技术方案 (Design)

### 7.1 前端异步状态守卫 (`ui/src/App.tsx`)
在 `CompanyRootRedirect` 中解构 `isLoading: onboardingLoading` 与 `isError: onboardingError`：
```tsx
const { data: onboarding, isLoading: onboardingLoading, isError: onboardingError } = useQuery({
  queryKey: queryKeys.onboarding.state(targetCompany?.id ?? ""),
  queryFn: () => onboardingApi.state(targetCompany!.id),
  enabled: Boolean(targetCompany),
});

// 1. 公司列表或引导状态查询进行中，均渲染 loading，杜绝竞态穿透
if (loading || (Boolean(targetCompany) && onboardingLoading)) {
  return <PaperclipLoading />;
}

// 2. 无公司引导
if (!targetCompany) {
  if (shouldRedirectCompanylessRouteToOnboarding({ pathname: location.pathname, hasCompanies: false })) {
    return <Navigate to="/onboarding" replace />;
  }
  return <NoCompaniesStartPage />;
}

// 3. 明确处于未 onboarding 状态
if (!onboardingError && onboarding && onboarding.onboardedStep === null) {
  return <Navigate to={`/${targetCompany.issuePrefix}/getting-started`} replace />;
}

// 4. 已完成 onboarding 或查询出错容错兜底
return <Navigate to={`/${targetCompany.issuePrefix}/dashboard`} replace />;
```

### 7.2 服务端 RBAC 守卫与审计日志
- 导入 `assertBoard`：
  ```ts
  import { assertBoard, assertCompanyAccess } from "./authz.js";
  ```
- 在 `POST /companies/:companyId/onboarding/step` 与 `POST /companies/:companyId/onboarding/complete` 前置调用 `assertBoard(req)`。
- 在 `POST /companies/:companyId/ontology/backfill` 中，同样增加 `assertBoard(req)` 并记录审计：
  ```ts
  assertCompanyAccess(req, companyId);
  assertBoard(req);
  const result = await backfill.backfill(companyId);
  await logActivity(db, {
    companyId,
    actorType: "user",
    actorId: req.user?.id ?? "unknown",
    action: "ontology.backfill",
    targetType: "company",
    targetId: companyId,
    details: { inserted: result.inserted, total: result.total },
  });
  res.json(result);
  ```

### 7.3 Fork Surface 清单补齐
将 19 个 wave154/wave155 上游文件写入 `scripts/fork-surface.json`，并配置留有余量的 `maxNetLines` 与 `maxTotalLines`（依据实际变更行数向上浮动 30%~50% 防膨胀）：
- DB Schema/Migration: `packages/db/src/migrations/9012_add_company_metadata.sql`, `packages/db/src/schema/companies.ts`
- Shared Contracts: `company-onboarding.ts`, `entity-relation.ts` (types + validators)
- Server Services/Routes: `onboarding.ts`, `ontology-backfill.ts`, `ontology-graph.ts`, route 测试用例
- UI: `onboarding.ts`, `ontologyGraph.ts`, `IssueLinkedEntities.tsx`, `OntologyGraphView.tsx`, 2 个 Pages

---

## 8. 权衡与设计决策 (Trade-offs)

1. **为什么在 `CompanyRootRedirect` 中等待网络请求？**
   - *权衡：* 阻塞首屏增加数十毫秒白屏/loading 时间，对已经完成 onboarding 的老用户是否有性能影响？
   - *决策：* React Query 具备客户端内存缓存与强 ETag/304 机制；而如果不等待，新用户将永远看不到 3 步 Onboarding 向导，业务目标完全失效。等待网络往返是保证正确状态机转移的唯一手段。
2. **为什么 Onboarding 推进只允许 Board？**
   - *权衡：* 某些全自主 Agent 是否能代替用户完成公司初始化？
   - *决策：* Onboarding 涉及企业行业选择与人数规模（企业元数据与法务属性），属于高等级组织治理动作，严格受 Board 控制；后续如有自动化脚本，可由 Board 签发的特权 Token 执行。

---

## 9. 验证方式 (Verification Plan)

1. **门禁验证：**
   - 运行 `node scripts/check-fork-surface.mjs --range=946c9fd7f3..HEAD`，确保 19 个新增文件全部识别且 0 undeclared。
   - 运行 `pnpm check:token-gates`，确保无新增样式违规。
2. **单元测试与集成测试：**
   - 运行 `server/src/__tests__/onboarding-routes.test.ts`，新增断言：用 Agent Key 访问 `POST /step` 返回 403。
3. **UI 旅程走查：**
   - 模拟 `onboardedStep === null` 的新租户，访问根路径，验证精准被重定向至 `/getting-started`。
   - 模拟 `onboardedStep = 3` 的已就绪租户，访问根路径，验证直接进入 `/dashboard`。
