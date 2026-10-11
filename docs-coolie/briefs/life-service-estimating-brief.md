# 社区生活服务平台 · 60/90 天交付估算方案 (墨斗+铁匠 评审稿)

## 0. 项目真身（~/workspace/life-service/ 某单位社区生活服务平台采购项目技术规范书 V1.0, 2025/12/20）
- 体量: 1662 段 / 4.7 万字 / 12 部分 / 9 大业务模块
- 工期原文(客户硬红线): **★签订合同后 90 天内完成系统全功能交付（提供承诺函）**
- 客户提的「60 天」很可能是谈判筹码，需老板先与客户对齐

## 1. 3 端 × 15 业务模块 × 12 角色
- 端: 微信小程序(原生) + H5(Vue3+Vite+TS) + PC 后台(Vue3+Element Plus)
- 后端: Java 17 + Spring Boot 3 + Spring Cloud 2022 + MyBatis-Plus + MySQL 8 + Redis 7 + ES 8 + RabbitMQ + Knife4j + JWT
- 运维: Docker + K8s 1.25 + Jenkins + GitLab CI + Prometheus + Grafana + ELK + SkyWalking
- 非功能: C端 5000+并发,后台 200+并发,SLA 99.9%/99.99%,单测覆盖率 ≥80%,驻场 + 承诺函

## 2. 底座选型: yudao-cloud-mini(master-jdk17)
- ⭐ 19.6k stars,MIT,活跃维护
- 7 个 module, 1001 Java 文件, 15 starter (RBAC/多租户/MyBatis/Security/MQ/Redis/Excel/限流/Job/Monitor 全包)
- 复用: module-system(用户/角色/部门/字典/通知/短信/租户) + module-infra(文件/代码生成/定时任务/API日志/配置) → 直接覆盖 ① ② ④ ⑭

## 3. 模块合并映射 (15 业务 → 9 实际 module)
| 规范模块 | 合并来源 | 工作量 |
|---|---|---|
| ① 角色与权限 | ✅ module-system + biz-data-permission | 0.5d |
| ② 后台管理员 | ✅ module-system + 自定义字段 | 2d |
| ③ 前台用户(房东/家政/居民) | ⚠️ 从完整版 yudao-cloud 拉 module-member | 5d |
| ④ 系统配置 | ✅ module-infra | 1d |
| ⑤ 房源分类 | 🆕 自建 yudao-module-house | 2d |
| ⑥ 房源审核上架 | 🆕 自建 | 4d |
| ⑦ 房东资质审核 (OCR身份证) | 自建 + 腾讯云 OCR SDK | 5d |
| ⑧ 房源数据统计 | ✅ 从完整版拉 module-report | 2d |
| ⑨ 家政服务商入驻 | 🆕 自建 yudao-module-domestic | 4d |
| ⑩ 家政服务项目 | 🆕 自建 | 3d |
| ⑪ 家政服务订单(支付+退款) | ⚠️ 从完整版拉 module-pay + 自建订单状态机 | 5d |
| ⑫ 家政服务评价 | 🆕 自建 | 2d |
| ⑬ 社区公告通知 | ✅ module-system 内置 | 1d |
| ⑭ 社区活动互动 | ✅ module-system + bpm 流程 | 3d |
| ⑮ 前台3端(小程序/H5/PC) | ⚠️ yudao-ui + uni-app (vs 规范原生冲突) | 12d |

## 4. 工期矩阵 (3 方案对照)
### 方案 A: 极限 60 天 (高风险)
- 阶段 1 合并底座 (1d) + 拉 member/pay/report 改包 (2d) = 3d
- 阶段 2 自建 house/domestic (10d)
- 阶段 3 配置/公告/活动接通 (2d)
- 阶段 4 前台 3 端 UI (19d)
- 阶段 5 测试 (6d) + K8s 部署/数据迁移/培训 (14d)
- 合计 = 54d
- 风险: 0 buffer, 任何需求变更 / 人员请假 / OCR 接入坑 都击穿

### 方案 B: 稳妥 90 天 (推荐) - 与客户招标承诺函一致
- 阶段 1-4 同 A (34d)
- 阶段 5 测试 + 部署/迁移/培训 = 14d
- buffer 8d + 测试复测 10d + 客户驻场磨合 6d = 24d
- 合计 = 88-90d
- 风险: 可控, 接受客户 90 天承诺函

### 方案 C: 60 天 MVP + 30 天 二期补齐
- 60 天交付 8 模块 (① ② ③ ④ ⑬ ⑭ ⑮ + 核心 ⑥⑪)
- 30 天补 ⑤ ⑦ ⑧ ⑨ ⑩ ⑫ + 数据迁移 + 培训
- 风险: 中, 客户能接受分期即可

## 5. 关键风险点
1. **小程序原生 vs uni-app**: 规范写"微信小程序原生", yudao 默认 uni-app. 坚持原生 → 复用 yudao-ui 失效, +5-8d
2. **OCR 身份证 + 活体**: yudao 无现成, 2-3d 接腾讯云 OCR
3. **驻场承诺**: 框架+ 老板团队 签字, yudao 不能解决
4. **数据迁移**: 客户旧数据 ETL 自写, 3-5d
5. **K8s + SkyWalking 集群**: 部署复杂度 1d 调试
6. **性能压测**: 5000+并发压测工具/调优 3d

## 6. 派活 (按宪法 §A)
Phase 1 立项 (5d):
  - 墨斗 (modou-fda / agy): WBS + 工期矩阵 + 风险册 → docs-coolie/srf/
  - 铁匠 (forge-core-swe / claude-glm): 拉 yudao-mini 本地跑通, 出技术 spike 报告

Phase 2 编码 (35d, 6 人队):
  - 铁匠+铁匠贰号: 自建 house/domestic (10d)
  - 铁匠: 拉 member/pay/report 改包 (2d)
  - 门神+铁匠: 前台 3 端 UI (19d)
  - 门神: 单元测试 (4d)

Phase 3 验收 + 现场 (14d):
  - 百晓生 (claude-mm): 性能压测 + 渗透 + 真机四态
  - 兑底渊 (copilot): K8s 部署 + 数据迁移 + 客户驻场培训
  - 老板: 签 UAT 终验核销单

## 7. 你 (agy / claude-glm) 需要输出的评审意见
请按下面 5 维度评审:
1. **工期真伪**: 矩阵里的天数学员实际干活, 是否合理? 哪里高估/低估?
2. **风险盲点**: 老板漏列了哪些坑? (团队规模/人才/合规/网安/集成测试/客户沟通)
3. **派活合理性**: 6 人队谁干啥, 缺谁? 是否需要加运营/QA Lead?
4. **yudao 合并可信度**: 自建 2 module + 复用 5 module, 估算保守/激进? 是否需要 spike?
5. **优化建议**: 给老板 1 条最关键的"立刻就做"指令

---

**评审者角色**:
- 墨斗 (modou-fda): FDA 前线架构师, 强项: 选型/架构/风险扫描/工期估算
- 铁匠 (forge-core-swe): Core SWE 主力, 强项: 代码阅读/包结构/编译踩坑/工作量测算

**回复格式** (markdown):
```
# [员工] 评审意见 · 60/90 天估算方案

## 1. 工期真伪 (评分 1-5, 5=准确)
- 总评:
- 高估的地方:
- 低估的地方:

## 2. 风险盲点
...

## 3. 派活合理性
...

## 4. yudao 合并可信度
...

## 5. 给老板的 1 条关键指令
...

## 6. 我的最终选 A/B/C?
```
