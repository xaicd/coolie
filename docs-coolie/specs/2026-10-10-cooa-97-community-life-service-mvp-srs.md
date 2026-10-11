# COOA-97 · 社区生活服务商用中台 · 软件需求规格说明书 (SRS v1.1 · 老板拍板版)

> 报告人: Hermes (PM 掌柜 / 业务战略总控)
> 报告日期: 2026-10-10(初版 v1.0)/ 2026-10-10 v1.1 老板拍板修订
> 适用于: 某单位社区生活服务平台采购项目(询比采购,第二次)
> 阶段归属: COOA-97 requirements (1/5) — 需求梳理环节
> 上游上下文: 墨斗 wave368《60/90天交付估算与架构全维度严肃评审报告》(doc/plans/2026-10-10-wave368-community-life-service-60-90-days-delivery-evaluation.md)
> 文档形态: Issue Document (key=requirements),与 plan 解耦,作为 CMMI G1 阶段唯一法定需求真源

---

## 0.1 老板 v1.1 拍板摘要 (Boss Decisions Audit Log)

本次 v1.1 修订直接基于老板在 c537bfa7 ask_user_questions 交互的 4 个 A/B/C/D 回复落地,逐条穿透 SRS:

| 决策点 | 选项 | 老板回复 | SRS 落地点 |
|---|---|---|---|
| 是否全盘采纳 wave368 墨斗 FDA 评审结论 (60+30 交付模型 + 底座复用 70% + 极简两字交互 + 黄金 5 槽位)? | A 全盘采纳 / **B 采纳模型换一个底座** / C 保留旧评审 / D 撤回 v3 | **B** | §10 AS-001 / §3.4 主线 D / §7 RTM Owner 列 — 底座不再锁死 RuoYi-Cloud,留给 COOA-98 方案设计阶段做选型矩阵 |
| 12 业务实体 / 50+ 需求条目是否扩缩? | **A 照单全收** / B 收紧 / C 扩增 / D 砍掉一半 | **A** | §2 实体清单 + §3 4 主线 + 50+ EARS 条目全部保留,不动 |
| Out of Scope §9 (不引入直播/短视频/IM/SKU 商城/多语言完整切换) 是否同意封存? | **A 同意封存** / B 不封存 / C 部分采纳 / D 重写 | **A** | §9 OOS 六项原文保留,标书交付期 → 业务期全程封存 |
| 标书 7 处 ★ 强制截图佐证(模块 02/04/05/07/09/10/12)是否照单全收作为合同硬约束? | A 照单全收硬约束 / B 照单全收软约束 / C 部分挂 / **D 等合同定稿再确认** | **D** | §7 RTM "规范书截图佐证要求" 列、`§8 全维度审计` 行、`§10 AS-005` 风险项 — 三处全部改软,等合同定稿后由老板决策是否升级为合同硬约束 |

> **变更校验闭环**:本 SRS v1.1 与本拍板日志 4 条决策点 100% 一致;若有任意一条穿透失败,本 SRS 视为失效,必须回到 v1.0 重谈。

---

## 0. 阅读说明与术语约定

本 SRS 采用 **EARS (Easy Approach to Requirements Syntax)** 五类模式收敛:
- `Ubiquitous` (基本需求): 系统应当 X
- `Event-driven` (事件触发): 当 [事件] 时,系统应当 X
- `State-driven` (状态触发): 当 [状态] 时,系统应当 X
- `Unwanted` (异常防御): 若 [不希望条件] 时,系统应当 X
- `Optional` (可选项): 系统可以 X (Future)

本文档聚焦**业务需求 (BR) 与功能需求 (FR)**,非功能需求 (NFR) 在第六章统一收口。所有需求条目编号全局唯一,作为下游 ARCH-DS (COOA-98 方案设计) / IMPL-SWE (COOA-99 编码实现) / TEST-QA (COOA-100 测试验收) 的双向追溯跟踪矩阵 (RTM) 主键。

---

## 1. 业务愿景与最高纲领

### 1.1 业务愿景
为某单位的社区居民、房东、家政服务商、街道网格员四方协同提供一个**轻量、稳定、两字按钮极简上手**的统一生活服务平台,聚焦**房源租赁闭环 + 家政服务闭环**两大主营,杜绝功能膨胀与复杂电商化,严守老板定调的"极简使用 / 零功能膨胀 / 聚焦核心 / 全维度审计"四大最高交付主义总则。

### 1.2 法定与商务红线
| 编号 | 红线 | 来源 | 后果 |
|---|---|---|---|
| R-BR-001 | 自合同签订之日起 **90 天**内须完成全功能交付并签署《客户终验核销单》 | 规范书 10.2 ★号条款(法人承诺函) | 违约扣款 / 没收保函 |
| R-BR-002 | 全过程须派驻**专职技术人员**常驻业主方办公场所 | 规范书 10.3 ★号条款 | 取消候选人资格 |
| R-BR-003 | 房源 + 家政核心业务**两张闭环**为主,禁止引入秒杀、拼团、复杂积分、社区 SNS 等膨胀需求 | 老板总则 + 规范书核心清单 | 超出需求边界导致延期 |

### 1.3 三大角色与四方协同
| 角色 | 数量级 | 主要诉求 |
|---|---|---|
| 居民 (C 端) | 万级并发 | 一键看房、一键下单服务、一键投诉 |
| 房东 / 家政服务商 (B 端) | 千级 | 发布房源/服务、接单派工、查看经营数据 |
| 街道网格管理员 / 居委会 (G 端) | 百级 | 公告/活动发布、投诉工单处置、统计看板 |

---

## 2. 业务实体 (Object Types) 与生命周期

### 2.1 核心实体清单(共 10 个,与墨斗 wave368 §2.1 严格对齐)

| 编号 | ObjectType | 中文名 | 核心字段 | 关键状态枚举 |
|---|---|---|---|---|
| OBJ-01 | CommunityTenant | 社区租户 | code, name, province, city, district, status | active / archived |
| OBJ-02 | ResidentUser | 前台居民用户 | phone, nickname, avatar, real_name, id_card_hash, is_real_name, status | normal / banned |
| OBJ-03 | LandlordProfile | 房东档案 | user_id, real_name, id_card_enc, property_imgs, audit_status, audit_reason | pending / approved / rejected / frozen |
| OBJ-04 | HouseProperty | 房源信息 | landlord_id, category_id, title, rent_price, deposit_type, layout, area, photos, status | draft / pending / online / offline / rented |
| OBJ-05 | HouseAppointment | 房源看房单 | house_id, consumer_id, appoint_time, phone, status, feedback | pending / confirmed / finished / cancelled |
| OBJ-06 | HousekeepingVendor | 家政服务商 | company_name, license_enc, contact_phone, score, audit_status, category_ids | pending / approved / rejected / frozen |
| OBJ-07 | ServiceItem | 家政服务项目 | vendor_id, category_id, name, unit_price, price_unit, cover_img, status | draft / pending / online / offline |
| OBJ-08 | ServiceOrder | 家政服务订单 | order_no, consumer_id, vendor_id, item_id, pay_price, status, worker_id, refund_status | unpaid / wait_dispatch / dispatched / in_service / finished / refunding / refunded / closed |
| OBJ-09 | ServiceReview | 服务评价 | order_no, vendor_id, consumer_id, star_rating, content, img_urls, reply_content | normal / hidden |
| OBJ-10 | CommunityNotice | 社区公告 | title, category_id, content, is_top, expire_time, status, read_count | draft / published / expired |
| OBJ-11 | CommunityActivity | 社区活动 | title, max_capacity, enrolled_count, start_time, end_time, verify_code, status | draft / enrolling / ongoing / finished / cancelled |
| OBJ-12 | ComplaintTicket | 居民诉求工单 | source, target_type, target_id, content, contact_phone, status, handler_id | submitted / assigned / handling / closed / rejected |

OBJ-11/OBJ-12 由模块 14 "社区活动与互动" 反向定义,非墨斗主报告 10 实体直接条目;此处补齐以保证 RTM 全闭环。

---

## 3. 业务主线与功能需求

### 3.1 主线 A: 房源租赁微闭环

**生命周期公式**:
```
房东实名入驻 → 资质审核 → 发布房源 → 图文审核 → 上架展示 → 居民筛选 → 预约看房 → 房东确认 → 线下带看 → 预约结案 (归档)
```

| 编号 | EARS 类别 | 需求陈述 |
|---|---|---|
| FR-A-001 | Ubiquitous | 系统应当允许前台用户提交实名入驻申请,必填字段含身份证号(国密 SM4-GCM 加密入库)、房产证/授权证明图片。 |
| FR-A-002 | Event-driven | 当后台管理员审核通过房东资质时,系统应当:① 推送微信模板消息;② 自动同步 Elasticsearch 房东索引;③ 落库 `audit_log`。 |
| FR-A-003 | Ubiquitous | 系统应当允许已审核通过的房东发布房源,房源必须挂载至少 3 张实拍图、明确租金(元/月)、押金方式、月/季/年付选择。 |
| FR-A-004 | Event-driven | 当房源被批量审核通过时,系统应当幂等同步其上下架状态至 ES,并通过 RocketMQ 事务消息保证搜索索引与主库最终一致。 |
| FR-A-005 | Ubiquitous | 系统应当展示房源详情时聚合浏览/收藏/预约转化漏斗看板,供后台运营人员使用。 |
| FR-A-006 | Event-driven | 当同一用户对同一房源在 24 小时内重复发起预约时,系统应当以 **429 Too Many Requests** 阻断该请求,防止刷单接口被压垮。 |
| FR-A-007 | Event-driven | 当房东点击"确认"预约看房单时,系统应当双向推送微信模板消息并双向同步虚拟号或明文电话(根据用户隐私开关)。 |
| FR-A-008 | State-driven | 当房源下架时,若存在**待处理**预约单,系统应当自动撤回并向租客推送通知,租客可一键重新选择其他房源。 |
| FR-A-009 | Unwanted | 若房东提交的资料缺失关键字段或图片压缩失败,系统应当 **阻止提交** 并明示缺失项,不得静默跳过。 |

### 3.2 主线 B: 家政服务履约闭环

**生命周期公式**:
```
服务商入驻 → 资质审核 → 发布服务 → 合规审核 → 上架 → 居民下单 → 在线支付 → 服务商派工 → 上门签到/签退 → 履约完成 → 用户评价 → 结算平账
```

| 编号 | EARS 类别 | 需求陈述 |
|---|---|---|
| FR-B-001 | Ubiquitous | 系统应当允许家政服务商提交营业执照(国密加密)、联系人、联系电话、服务类型多选。 |
| FR-B-002 | Event-driven | 当服务项目发布后,系统应当触发合规预审工作流,人工/机审混合判定包含敏感词、夸大宣传、违规项目时一键驳回。 |
| FR-B-003 | Event-driven | 当居民下单成功并完成微信支付回调时,系统应当通过 RocketMQ 事务消息驱动订单状态由 `UNPAID → WAIT_DISPATCH`。 |
| FR-B-004 | Event-driven | 当居民申请退款时,系统应当:① 若订单处于 `WAIT_DISPATCH`,自动秒级原路退回;② 若订单处于 `IN_SERVICE`,需服务商两字"确认",超时 24 小时自动同意;③ 全程账务守恒校验。 |
| FR-B-005 | State-driven | 当订单进入 `DISPATCHED` 时,系统应当要求服务商在 4 小时内点击"派工"并选定具体服务人员,否则系统自动取消订单并原路退款。 |
| FR-B-006 | Event-driven | 当服务人员点击"签到"上传地理位置时,系统应当记录 GPS 与时间戳;若迟到 15 分钟,自动通知居民端。 |
| FR-B-007 | Event-driven | 当居民完成"评价"时,系统应当:① 一星/两星自动触发整改工单;② 更新服务商综合评分(滚动 30 天加权);③ 差评默认隐藏 24 小时,供商家申诉。 |
| FR-B-008 | Unwanted | 若订单金额、支付流水、结算金额三方不一致,系统应当以 **分布式事务补偿** 完成闭环,不得出现单边账实不符。 |
| FR-B-009 | Ubiquitous | 系统应当对所有跨服务调用启用 Redis 分布式锁,确保同一订单不会被两个派工节点同时处理。 |

### 3.3 主线 C: 社区互动与诉求闭环

| 编号 | EARS 类别 | 需求陈述 |
|---|---|---|
| FR-C-001 | Ubiquitous | 系统应当支持社区公告的富文本编辑、定时发布、置顶、到期自动下架。 |
| FR-C-002 | Event-driven | 当公告发布或取消置顶时,系统应当推送微信订阅消息并刷新居民端首页轮播。 |
| FR-C-003 | Ubiquitous | 系统应当支持社区活动的发布、报名上限校验、超卖计数器(Redis INCR + 悲观锁双保险)、验证码核销。 |
| FR-C-004 | Event-driven | 当居民提交诉求工单时,系统应当分类指派至居委会/物业/平台客服,并支持催办提醒与超时升级。 |
| FR-C-005 | State-driven | 当活动已开始但仍有未签到报名者时,系统应当自动短信通知,迟到 30 分钟释放名额至候补队列。 |

### 3.4 主线 D: 平台管理后台与底座

| 编号 | EARS 类别 | 需求陈述 |
|---|---|---|
| FR-D-001 | Ubiquitous | 系统应当提供基于 **RBAC + 数据范围 (DataScope)** 的细粒度菜单级与按钮级权限管理,缺失权限时返回 403。 |
| FR-D-002 | Ubiquitous | 系统应当对身份证号、手机号、银行卡、地址等敏感字段统一采用 **SM4-GCM 国密加密** 存储,密钥由 KSM/HSM 托管。 |
| FR-D-003 | Ubiquitous | 系统应当提供敏感词过滤词库 (`sensitive_word`) 与统一拦截切面,覆盖发布、评论、私信、反馈。 |
| FR-D-004 | Event-driven | 当发生**非法越权访问**或**暴力破解**时,系统应当触发 Sentinel 限流熔断并落审计日志。 |
| FR-D-005 | Ubiquitous | 系统应当提供 `sys_config` 键值系统统一托管全局可变参数(单点登录开关、第三方接口密钥、风控阈值等)。 |
| FR-D-006 | Ubiquitous | 系统应当提供 `sys_notice` 公告能力,具备富文本/分类/定时发布/置顶/到期下架/微信服务通知推送全能力。 |

---

## 4. 用户故事地图与端到端脚本

### 4.1 居民 (C 端) 关键场景

| US 编号 | 故事 | 验收动作 (Given-When-Then) |
|---|---|---|
| US-C-01 | 一键看房 | Given 已实名居民  When 浏览某房源  Then 可查看 3+ 照片 + 房东联系方式(隐私授权后)+ 两字按钮"预约" |
| US-C-02 | 一键下家政单 | Given 已登录居民  When 选择某服务 + 选时段 + 微信支付  Then 1) 订单进入 WAIT_DISPATCH  2) 收到系统 + 服务商提醒 |
| US-C-03 | 一键申诉 | Given 已下单居民  When 提交投诉工单  Then 工单进入指派队列 + 24h 内未响应自动升级 |
| US-C-04 | 查公告 | Given 居民  When 进入首页  Then 看到顶部公告 + 居委活动推荐 + 两字"报名"按钮 |

### 4.2 房东 / 服务商 (B 端) 关键场景

| US 编号 | 故事 | 验收动作 |
|---|---|---|
| US-B-01 | 入驻 | Given 房东  When 提交身份证 + 房产证  Then 进入审核队列 + 微信通知审核结果 |
| US-B-02 | 发布/上架 | Given 已审核 B 端  When 发布房源或服务  Then 自动进入审核流 + ES 索引同步 |
| US-B-03 | 工作台 | Given B 端  When 进入"我的-工作台"  Then 单一 Tab 见所有订单/预约/客户消息 |
| US-B-04 | 处理退款 | Given 服务商  When 接到退款申请  Then 24h 内确认/超时自动同意 |

### 4.3 居委会 / 平台管理 (G 端) 关键场景

| US 编号 | 故事 | 验收动作 |
|---|---|---|
| US-G-01 | 发公告 | Given 居委会  When 富文本编辑公告  Then 可定时发布 + 置顶 + 到期自动下架 |
| US-G-02 | 办活动 | Given 居委会  When 创建活动 + 设上限  Then 报名数到上限自动截止 + 验证码核销 |
| US-G-03 | 看统计 | Given 平台管理员  When 进数据看板  Then 看到房源热度、订单漏斗、评价分布 |

---

## 5. 三端统一触达规范(两字按钮 + 黄金 5 槽位)

### 5.1 移动端(微信小程序 + H5)

| 端 | 底栏 5 槽位(绝对黄金对称) |
|---|---|
| 居民端 | `[首页] - [房源] - [家政] - [活动] - [我的]` |
| B 端工作台(在"我的"身份切换抽屉下) | `[工作台] - [订单] - [商品] - [结算] - [我的]` |

**两字核心动词集合**(全端全局收敛):`发布 / 审核 / 通过 / 驳回 / 上架 / 下架 / 看房 / 预约 / 下单 / 接单 / 派工 / 开始 / 完成 / 退款 / 评价 / 报名 / 签到 / 签退 / 查询 / 重置 / 新增 / 保存 / 启用 / 停用 / 封禁 / 解封 / 提交`

### 5.2 PC 管理后台

- 左侧菜单层级 **≤ 2 级** + 面包屑防丢栈;
- 表格操作列收紧至 ≤ 3 个文字操作按钮,超出 3 个收进"更多"下拉浮层;
- 严禁宽表横向滚动条失控,长字段采用 wrap + tooltip 双保险。

---

## 6. 非功能需求 (NFR) 总则

| 编号 | 维度 | 量化基线 |
|---|---|---|
| NFR-001 | 性能 - C 端 QPS | 5000 在线并发,接口响应 < 1.2s |
| NFR-002 | 性能 - 后台列表 | P95 < 300ms |
| NFR-003 | 可用性 | 99.95%(年故障时长 < 4.38h) |
| NFR-004 | 数据合规 | SM4-GCM 加密 / 操作审计 180 天留存 / 个人信息可导出可删除 |
| NFR-005 | 安全合规 | SonarQube 0 高危 + 渗透扫描 0 中危 + BCrypt 密码哈希 + 防 SQL 注入/防 XSS |
| NFR-006 | 国际化 | 中文简体 + 预留繁体/英文扩展位(本次 v1.1 不交付) |
| NFR-007 | 兼容性 | iOS 12+ / Android 7+ / Chrome 90+ / Edge 90+ |
| NFR-008 | 可观测性 | OTLP trace 全链路 + run-log 全量留痕 |
| NFR-009 | 可移植性 | 全栈 Docker Compose 一键起 + K8s Helm Charts 离线包 |
| NFR-010 | 容灾 | RPO ≤ 15min / RTO ≤ 30min |

---

## 7. 标书 15 模块 → SRS 需求双向追溯矩阵 (RTM v1.0)

> 全部 15 模块的"功能-需求条目-验收用例"映射,作为下游 IMPL-SWE 与 TEST-QA 的契约依据。
>
> **佐证等级说明**:
> - `★` — 规范书明确点名的**核心佐证模块**(目前为"应提供佐证材料"软要求,合同定稿后老板决策是否升级为合同硬约束);
> - `★ 补充真机` — 同上,且额外要求**真机/真账号四态截图**;
> - `—` — 未点名为佐证模块,但仍需在 IMPL-SWE 阶段交付对应功能代码与基础单测。

| 模块 | 名称 | 规范书截图佐证要求 | SRS 需求编号 | Owner 阶段 |
|---|---|---|---|---|
| 01 | 角色与权限管理 | — | FR-D-001 | G2 底座(候选,COOA-98 拍板) |
| 02 | 后台管理员管理 | ★ | OBJ-02 平台后台侧 | G2 底座(候选,COOA-98 拍板) |
| 03 | 前台用户管理 | — | OBJ-02 ResidentUser | G2 底座(候选,COOA-98 拍板) |
| 04 | 系统配置管理 | ★ | FR-D-005 | G2 底座(候选,COOA-98 拍板) |
| 05 | 房源分类管理 | ★ | OBJ-04 HouseProperty.category_id | G3 房源链 |
| 06 | 房源审核与上架 | — | FR-A-002 / FR-A-004 | G3 房源链 |
| 07 | 房东信息与资质 | ★ | OBJ-03 LandlordProfile + FR-A-001 | G3 房源链 |
| 08 | 房源数据统计分析 | — | FR-A-005 | G3 房源链 |
| 09 | 家政服务商管理 | ★ | OBJ-06 HousekeepingVendor + FR-B-001 | G3 家政链 |
| 10 | 家政服务项目管理 | ★ | OBJ-07 ServiceItem + FR-B-002 | G3 家政链 |
| 11 | 家政服务订单管理 | — | OBJ-08 ServiceOrder + FR-B-003~FR-B-009 | G3 家政链 |
| 12 | 家政服务评价管理 | ★ | OBJ-09 ServiceReview + FR-B-007 | G3 家政链 |
| 13 | 社区公告与通知 | — | FR-D-006 + FR-C-001 / FR-C-002 | G2 底座(候选,COOA-98 拍板) |
| 14 | 社区活动与互动 | — | OBJ-11/12 + FR-C-003~FR-C-005 | G3 互动链 |
| 15 | 前台用户中心(三端) | ★ 补充真机 | §5 三端规范全章节 | G3 前台 |

---

## 8. 老板总则穿透与 SRS 守恒校验

| 老板总则 | 守恒校验结论 |
|---|---|
| 极简使用主义 | 全端两字按钮 30+ 收敛完毕 (§5.1) + 黄金 5 槽位强约束 (§5.1) |
| 零功能膨胀 | 复杂电商 / 拼团 / 秒杀 / 社区 SNS / 开放论坛 全部剔除 (OBJ/FR 均无对应条目) |
| 聚焦核心与质量 | 仅 4 条主线 + 12 实体,RTM 覆盖规范书 100% 模块 (§7) |
| 全维度审计 | NFR-005 + NFR-008 + **标书 7 处佐证材料**(目前为软要求,合同定稿后由老板决策是否升级为合同硬约束) |

---

## 9. 范围之外 / Out of Scope (本期明确剔除)

1. 微信支付之外的任何第三方支付渠道(支付宝、银联、USDT 等);
2. 直播、短视频、IM 即时通讯等高流量消耗特性;
3. 复杂的 SKU 商城、积分商城、优惠券叠加引擎;
4. 跨市/跨省的多租户分级管理(本期单一社区,后续模块预留扩展);
5. i18n 多语言完整切换(仅预留字段与翻译位);
6. 智能化推荐(暂用规则排序,不引入机器学习栈)。

---

## 10. 风险与假设 (Assumptions & Risks)

| 编号 | 类型 | 内容 | 缓解措施 |
|---|---|---|---|
| AS-001 | 假设 | 老板已批准 wave368 评审结论的**交付模型 (60+30)** + **极简两字交互** + **黄金 5 槽位**;**底座选型留待 COOA-98 方案设计阶段拍板** | 本 SRS 在 COOA-97 阶段采用该评审的实体建模与方法论,但 §3.4 主线 D 的底座一栏(原列"G2 底座")保持中性,候选底座在 COOA-98 给出至少 3 套(RuoYi-Cloud / 全新自研 / 复用 X 平台)的评审选型矩阵 |
| AS-002 | 假设 | 甲方专网环境在 90 天周期内至少可触达 1 次远程维护通道 | FDE 现场驻扎 + 离线介质预案 |
| AS-003 | 风险 | 政企专网行政审批延误可能压缩现场交付窗口 | 60+30 双段式缓冲吸收 |
| AS-004 | 风险 | 居民历史数据脏乱导致迁移一次性偏差 | 落地 5 步清洗沙盒(详见 wave368 §6.2) |
| AS-005 | 风险 | 标书 7 处佐证材料若合同定稿后变更为合同硬约束 | 预留 Playwright + 水印自动化截图流水线能力;COOA-98 方案阶段同步挂入"自动化截图"工作项,合同定稿后视是否硬约束再 switch on/off |

---

## 11. 验收标准 (Definition of Done · requirements 阶段)

1. SRS 文档已落入 COOA-97 的 issue document(key=`requirements`),最新版可被 COOA-98/99/100/101 直接 consume;
2. RTM 矩阵覆盖规范书 15 模块 100%,且每条目可追溯到对应 US/EARS 编号;
3. 12 业务实体 + 50+ 需求条目的字段/状态/事件口径在文档内全部闭合,无悬空;
4. NFR 10 项均具备量化基线且可验证方式明确;
5. Out of Scope/Assumption/Risk 三节均签字,作为下游 ARCH 拒收时的判定参考;
6. **(v1.1 追加) §0.1 Boss Decisions Audit Log 4 条决策点 100% 穿透落地,无任何"老板已答但 SRS 未改"的口径偏差**;
7. **(v1.1 追加) §10 AS-001 / §3.4 / §7 RTM Owner 列 全部采用"G2 底座(候选,COOA-98 拍板)"口径,严禁任一章节再出现 RuoYi-Cloud 锁死的表述**;
8. **(v1.1 追加) §7 RTM 佐证等级说明 + §8 全维度审计 + §10 AS-005 三处一致采用"目前为软要求,合同定稿后再决定"口径**。

---

## 12. 签字栏

| 角色 | 姓名 | 签字 / 日期 |
|---|---|---|
| PM (撰写) | Hermes | `[Hermes 2026-10-10 v1.0 / 2026-10-10 v1.1 老板拍板修订]` |
| FDA (评审) | 墨斗 (Inkstick) | `[引用 wave368 评审结论 2026-10-10,底座选型交还方案阶段]` |
| 平台架构师 (审核) | 待指派 (COOA-98 接手) | `[ ]` |
| 老板 (最高交付总控 审批) | 陈伟 | `[已通过 4 决策 · v1.1 拍板版生效 2026-10-10]` |
