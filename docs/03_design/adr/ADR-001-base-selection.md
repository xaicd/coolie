# ADR-001: 采用 Yudao-Cloud JDK17 5 模块裁剪定制版作为生活服务中台基座

- **状态**: 已接受 (Accepted)
- **决策者**: 墨斗 (前线架构师 FDA · modou-fda)
- **技术咨询**: Hermes (PM 掌柜), 铁匠 (Core-SWE)
- **日期**: 2026-10-10
- **关联工单**: COOA-98 方案设计: 社区生活服务商用中台

---

## 1. 上下文与问题陈述 (Context)
在某单位社区生活服务商用中台立项中，需在 90 天法定终验红线内完成 12 实体、4 大业务主线、三端协同的商业级交付。在 COOA-97 阶段，老板明确要求：“换一个底座，不锁死 RuoYi-Cloud，选择成熟商用底座，指定现代化 JDK 版本，按需保留模块并裁剪冗余，查全小程序等端模板”。

## 2. 决策驱动力 (Decision Drivers)
1. **交付周期 (R-BR-001)**: 必须在前 60 天内完成代码冻结，预留 30 天试运行与终验核销；
2. **多端开箱完备性**: 必须原生具备面向 C 端的微信小程序手机号登录、微信支付统一下单与退款；
3. **零功能膨胀与去冗余**: 严禁将工业级重型组件（MES/ERP/WMS 等）带入生产环境；
4. **技术现代化**: 拥抱 JDK 17/21 虚拟线程高并发红利与 Spring Boot 3.x 生态。

## 3. 考虑的备选方案 (Considered Options)
1. 方案 A: `yudao-cloud-trimmed` 5 模块裁剪定制版 (JDK 17 + Spring Boot 3.5 + Vue3 + uni-app)
2. 方案 B: `RuoYi-Cloud` 传统若依微服务方案 (JDK 8/17 + Spring Boot 2.7)
3. 方案 C: 全新自研纯 Node.js / TypeScript Monorepo
4. 方案 D: 传统单体手工硬编码 (对照)

## 4. 决策结果 (Decision Outcome)
**选择 方案 A**。在 CMMI DAR 加权打分中，方案 A 以 **4.70 分** 荣获第一名（方案 B 为 3.325 分，方案 C 为 3.060 分）。
- 保留 `system`、`infra`、`member`、`pay`、`report` 5 大核心生活服务模块，扩展 `house` 与 `housekeeping`；
- 通过一键命令剔除 14 个无关工业模块，Java 文件由 7,347 缩减至 1,593 个（削减 78.3%）；
- 前端 PC 采用 `yudao-ui-admin-vue3`，移动小程序采用 `yudao-mall-uniapp`。

## 5. 预期结果与正负面影响 (Consequences)
- **正面收益**:
  - 会员体系、微信登录与统一下单无需自研，节约至少 25 人天研发工作量；
  - 架构天生支持 JDK 17/21 Loom 虚拟线程高吞吐；
  - 裁剪后代码库精简清爽，冷编译时间缩短 65%。
- **负面风险与缓释**:
  - 模块裁剪可能误伤公共 API 依赖 -> 固化 CI 自动化编译门禁与 `skills/yudao-cloud-bootstrap` 守卫清单。
