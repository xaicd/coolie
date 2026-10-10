---
name: yudao-cmmi-gatekeeper
description: Yudao-Quad-Terminal CMMI 01~09 全生命周期质量门禁与变异测试打假守卫。指导数字员工 (DS 百晓生 / SRE 兜底渊) 驱动 workflow-engine.cjs 严格校验 G1 需求、G2 架构、G3 契约、G4 四态真机快照与 G5 投产回滚预案，落实 No Artifact, No Done 铁律。
---

# Yudao-Quad-Terminal CMMI 质量门禁与测试打假守卫 (CMMI Gatekeeper Skill)

> **最高法典契约**：任何业务需求结项与任务更新为 `done` 时，必须挂载物理工程真资产。严禁无产物结项，严禁空洞假 Mock 测试，必须通过工作流引擎验证 G1~G7 阶段门禁方可放行。

---

## §1 G1~G7 全生命周期门禁图谱

```
[G1 需求门禁] ──────► [G2 架构门禁] ──────► [G3 契约门禁] ──────► [G4 验收门禁] ──────► [G5 投产门禁]
  EARS SRS 规范         HLD + DAR 选型         TS 契约 0 报错         四态真机测试快照       不可变制品与SOP
  docs/02_requirements  docs/03_design         packages/api-client    docs/05_verification  docs/07_release
```

---

## §2 自动化门禁校验指令集

项目根目录下内置了轻量化工作流引擎 [`scripts/workflow-engine.cjs`](file:///host-workspace/xaicd/yudao-quad-terminal/scripts/workflow-engine.cjs)，可一键执行静态与物理断言：

```bash
# 1. 门禁全景体检
node scripts/workflow-engine.cjs --check

# 2. 单独校验指定门禁
node scripts/workflow-engine.cjs --verify-gate G1  # 校验需求 SRS 资产在位
node scripts/workflow-engine.cjs --verify-gate G3  # 校验 API 契约与 TS 编译通过
node scripts/workflow-engine.cjs --verify-gate G4  # 校验端到端验收快照与测试报告

# 3. 驱动门禁向下一阶段演进
node scripts/workflow-engine.cjs --advance
```

---

## §3 反假 Mock 与变异测试铁律 (Anti-Fake Mocking)

1. **真实数据库事务回滚测试**：
   - 严禁在测试中仅仅对 Mapper 进行伪造打桩（`when(mapper.selectById(any())).thenReturn(fakeUser)`）；
   - 必须通过 `@SpringBootTest` 结合本地开发数据库，真实执行 SQL 写入并断言受影响行数与唯一索引约束，最后利用 `@Transactional` 自动回滚，保持数据零污染。
2. **状态机全覆盖**：
   - 前端三端（Admin/MiniApp/Expo）页面必须穷举四态：
     - **加载态 (Loading)**：数据未返回前骨架屏正常展示，无跳白；
     - **成功态 (Success)**：真实数据绑定与正确排版；
     - **空态 (Empty)**：列表无数据时显示轻量占位图与引导新增按钮；
     - **异常态 (Error)**：网络超时或 500 时具备友好重试按钮，绝不出现卡死或整页红屏。
