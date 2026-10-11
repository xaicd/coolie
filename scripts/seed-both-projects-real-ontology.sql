BEGIN;

-- ==============================================================================
-- 1. 云南移动2025年数智化企微运营底座与智能导购系统
-- Domain ID: 969e3510-2811-4551-9805-7ae51a8579ea
-- Company ID: 4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e
-- ==============================================================================

-- 1.1 清理历史关联
DELETE FROM plugin_ontology_b62f8af3e9.ontology_datasets WHERE domain_id = '969e3510-2811-4551-9805-7ae51a8579ea';
DELETE FROM plugin_ontology_b62f8af3e9.ontology_edges WHERE domain_id = '969e3510-2811-4551-9805-7ae51a8579ea';
DELETE FROM plugin_ontology_b62f8af3e9.ontology_nodes WHERE domain_id = '969e3510-2811-4551-9805-7ae51a8579ea';
DELETE FROM plugin_ontology_b62f8af3e9.ontology_action_types WHERE domain_id = '969e3510-2811-4551-9805-7ae51a8579ea';
DELETE FROM plugin_ontology_b62f8af3e9.ontology_relation_types WHERE domain_id = '969e3510-2811-4551-9805-7ae51a8579ea';
DELETE FROM plugin_ontology_b62f8af3e9.ontology_node_types WHERE domain_id = '969e3510-2811-4551-9805-7ae51a8579ea';

-- 1.2 写入云南移动 6 大核心业务实体类型 (Node Types)
INSERT INTO plugin_ontology_b62f8af3e9.ontology_node_types 
  (id, company_id, domain_id, key, display_name, description, properties_schema, metadata)
VALUES 
  ('a1010002-0000-0000-0000-000000000010', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '969e3510-2811-4551-9805-7ae51a8579ea',
   'grid_staff', '网格卓越导购员', '企业微信持证专属网格服务经理、管辖客户池与服务满意度态势',
   '{"properties": ["staffNo", "name", "grid", "customerCount", "satisfaction"]}'::jsonb, '{"icon": "👩‍💼"}'::jsonb),

  ('a1010002-0000-0000-0000-000000000020', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '969e3510-2811-4551-9805-7ae51a8579ea',
   'wecom_customer', '企微高价值客户', '昆明到期宽带高价值私域客户画像、套餐归属与流失风险预警',
   '{"properties": ["phoneMask", "netAgeYears", "arpu", "broadbandExpiry", "package", "riskLevel"]}'::jsonb, '{"icon": "👤"}'::jsonb),

  ('a1010002-0000-0000-0000-000000000001', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '969e3510-2811-4551-9805-7ae51a8579ea',
   'smart_routing_rule', '智能导购分流规则', '渠道来源、客户画像标签、所属网格匹配权重与超时兜底派单策略',
   '{"properties": ["ruleId", "matchTags", "priority", "targetStaffRole", "timeoutFallbackMins"]}'::jsonb, '{"icon": "🔀"}'::jsonb),

  ('a1010002-0000-0000-0000-000000000002', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '969e3510-2811-4551-9805-7ae51a8579ea',
   'campaign_sop', '存量升档触达SOP', '千人千面营销话术、宽带续约权益券、群发触达时间窗口与转化漏斗',
   '{"properties": ["sopCode", "templateId", "coupon", "channel", "targetConversion"]}'::jsonb, '{"icon": "📢"}'::jsonb),

  ('a1010002-0000-0000-0000-000000000003', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '969e3510-2811-4551-9805-7ae51a8579ea',
   'compliance_audit_record', '会话风控质检审计', '敏感词拦截、超时未回复预警、违规承诺质检与反电信网络诈骗AI督导',
   '{"properties": ["auditEngine", "interceptWords", "riskLevel", "auditStatus"]}'::jsonb, '{"icon": "🛡️"}'::jsonb),

  ('a1010002-0000-0000-0000-000000000004', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '969e3510-2811-4551-9805-7ae51a8579ea',
   'boss_billing_sync', 'BOSS系统数据对齐流', 'BOSS鉴权、宽带到期预警增量对齐与套餐变更实时回写流水',
   '{"properties": ["syncInterval", "sourceSystem", "lastSyncTime", "reconcileRate", "status"]}'::jsonb, '{"icon": "🔄"}'::jsonb);

-- 1.3 写入云南移动 5 大因果血缘关系类型 (Relation Types)
INSERT INTO plugin_ontology_b62f8af3e9.ontology_relation_types
  (id, company_id, domain_id, key, display_name, description, directed, metadata)
VALUES
  ('a2020002-0000-0000-0000-000000000001', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '969e3510-2811-4551-9805-7ae51a8579ea',
   'serves_customer', '网格管辖服务', '网格专属导购经理服务管辖企业微信存量/潜客', true, '{}'::jsonb),

  ('a2020002-0000-0000-0000-000000000002', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '969e3510-2811-4551-9805-7ae51a8579ea',
   'matched_by_rule', '智能路由匹配', '客户画像与标签匹配智能分流与派单规则', true, '{}'::jsonb),

  ('a2020002-0000-0000-0000-000000000003', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '969e3510-2811-4551-9805-7ae51a8579ea',
   'dispatches_sop', '触发存量SOP', '智能分流规则驱动触发存量营销SOP触达任务', true, '{}'::jsonb),

  ('a2020002-0000-0000-0000-000000000004', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '969e3510-2811-4551-9805-7ae51a8579ea',
   'monitored_by_compliance', '合规风控监控', '营销触达SOP受到敏感词与反诈质检实时审计', true, '{}'::jsonb),

  ('a2020002-0000-0000-0000-000000000005', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '969e3510-2811-4551-9805-7ae51a8579ea',
   'reconciled_with_boss', 'BOSS数据对齐', '客户宽带状态与套餐流水与BOSS中台增量双向对齐', true, '{}'::jsonb);

-- 1.4 写入云南移动 6 个核心业务活体实体节点 (Nodes)
INSERT INTO plugin_ontology_b62f8af3e9.ontology_nodes
  (id, company_id, domain_id, node_type_id, key, label, properties, metadata)
VALUES
  ('a3030002-0000-0000-0000-000000000001', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '969e3510-2811-4551-9805-7ae51a8579ea',
   'a1010002-0000-0000-0000-000000000010', 'staff-km-008', '昆明盘龙金星网格卓越导购员 (YNKM-0882)',
   '{"staffNo": "YNKM-0882", "name": "李云霞", "grid": "盘龙区金星网格", "customerCount": 1248, "satisfaction": 99.4}'::jsonb, '{"icon": "👩‍💼"}'::jsonb),

  ('a3030002-0000-0000-0000-000000000002', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '969e3510-2811-4551-9805-7ae51a8579ea',
   'a1010002-0000-0000-0000-000000000020', 'cust-yn-5g-889', '昆明千兆宽带到期高价值客户 (密文 138****9281)',
   '{"phoneMask": "138****9281", "netAgeYears": 8, "arpu": 158.5, "broadbandExpiry": "2026-10-31", "package": "5G智享158套餐+千兆宽带", "riskLevel": "中度流失预警"}'::jsonb, '{"icon": "👤"}'::jsonb),

  ('a3030002-0000-0000-0000-000000000003', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '969e3510-2811-4551-9805-7ae51a8579ea',
   'a1010002-0000-0000-0000-000000000001', 'rule-broadband-renew', '千兆宽带续约与FTTR升级智能路由 (RULE-KM-FTTR-01)',
   '{"ruleId": "RULE-KM-FTTR-01", "matchTags": ["高价值", "宽带30天内到期"], "priority": 1, "targetStaffRole": "网格金牌导购", "timeoutFallbackMins": 15}'::jsonb, '{"icon": "🔀"}'::jsonb),

  ('a3030002-0000-0000-0000-000000000004', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '969e3510-2811-4551-9805-7ae51a8579ea',
   'a1010002-0000-0000-0000-000000000002', 'sop-fttr-upgrade-2025', '2025年云南移动FTTR全光WiFi千兆升级SOP (SOP-YN-FTTR-2025)',
   '{"sopCode": "SOP-YN-FTTR-2025", "templateId": "WX_MSG_FTTR_09", "coupon": "免费上门测速与首月半价", "channel": "企业微信单聊/群发", "targetConversion": 35.8}'::jsonb, '{"icon": "📢"}'::jsonb),

  ('a3030002-0000-0000-0000-000000000005', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '969e3510-2811-4551-9805-7ae51a8579ea',
   'a1010002-0000-0000-0000-000000000003', 'audit-wecom-risk-01', '企微会话违规敏感词与反诈质检审计 (AI质检合规)',
   '{"auditEngine": "反诈与违规承诺AI质检模型", "interceptWords": ["私下返现", "保本兜底", "免费送手机套路"], "riskLevel": "normal", "auditStatus": "合规通过"}'::jsonb, '{"icon": "🛡️"}'::jsonb),

  ('a3030002-0000-0000-0000-000000000006', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '969e3510-2811-4551-9805-7ae51a8579ea',
   'a1010002-0000-0000-0000-000000000004', 'boss-flow-km-broadband', '昆明移动业务支撑网BOSS实时对齐流 (对齐率99.98%)',
   '{"syncInterval": "5min", "sourceSystem": "云南移动新一代CRM/BOSS", "lastSyncTime": "2026-10-07 14:30:00", "reconcileRate": 99.98, "status": "active"}'::jsonb, '{"icon": "🔄"}'::jsonb);

-- 1.5 写入云南移动 5 条因果血缘连线 (Edges)
INSERT INTO plugin_ontology_b62f8af3e9.ontology_edges
  (id, company_id, domain_id, relation_type_id, relation_key, source_node_id, target_node_id, weight, properties)
VALUES
  ('a4040002-0000-0000-0000-000000000001', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '969e3510-2811-4551-9805-7ae51a8579ea',
   'a2020002-0000-0000-0000-000000000001', 'serves_customer',
   'a3030002-0000-0000-0000-000000000001', 'a3030002-0000-0000-0000-000000000002', 1, '{}'::jsonb),

  ('a4040002-0000-0000-0000-000000000002', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '969e3510-2811-4551-9805-7ae51a8579ea',
   'a2020002-0000-0000-0000-000000000002', 'matched_by_rule',
   'a3030002-0000-0000-0000-000000000002', 'a3030002-0000-0000-0000-000000000003', 1, '{}'::jsonb),

  ('a4040002-0000-0000-0000-000000000003', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '969e3510-2811-4551-9805-7ae51a8579ea',
   'a2020002-0000-0000-0000-000000000003', 'dispatches_sop',
   'a3030002-0000-0000-0000-000000000003', 'a3030002-0000-0000-0000-000000000004', 1, '{}'::jsonb),

  ('a4040002-0000-0000-0000-000000000004', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '969e3510-2811-4551-9805-7ae51a8579ea',
   'a2020002-0000-0000-0000-000000000004', 'monitored_by_compliance',
   'a3030002-0000-0000-0000-000000000004', 'a3030002-0000-0000-0000-000000000005', 1, '{}'::jsonb),

  ('a4040002-0000-0000-0000-000000000005', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '969e3510-2811-4551-9805-7ae51a8579ea',
   'a2020002-0000-0000-0000-000000000005', 'reconciled_with_boss',
   'a3030002-0000-0000-0000-000000000002', 'a3030002-0000-0000-0000-000000000006', 1, '{}'::jsonb);

-- 1.6 写入云南移动 5 大合法业务动词 (Action Types)
INSERT INTO plugin_ontology_b62f8af3e9.ontology_action_types
  (id, company_id, domain_id, key, display_name, description, kind, applies_to_node_type_id, status)
VALUES
  ('a5050002-0000-0000-0000-000000000001', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '969e3510-2811-4551-9805-7ae51a8579ea',
   'sync_wecom_customers', '同步企微客户', '全量或增量拉取云南移动各网格营业厅外部联系人流入私域中枢', 'sync', 'a1010002-0000-0000-0000-000000000020', 'active'),

  ('a5050002-0000-0000-0000-000000000002', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '969e3510-2811-4551-9805-7ae51a8579ea',
   'match_smart_routing', '智能导购分流', '计算到期宽带客户标签与网格导购员权重，执行15分钟超时兜底派发', 'execute', 'a1010002-0000-0000-0000-000000000001', 'active'),

  ('a5050002-0000-0000-0000-000000000003', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '969e3510-2811-4551-9805-7ae51a8579ea',
   'dispatch_sop_campaign', '下发千兆SOP', '向盘龙金星网格目标客群定向推送FTTR全光升级权益与测速券', 'create', 'a1010002-0000-0000-0000-000000000002', 'active'),

  ('a5050002-0000-0000-0000-000000000004', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '969e3510-2811-4551-9805-7ae51a8579ea',
   'audit_compliance_risk', '反诈合规质检', '对企微导购会话进行违规承诺敏感词与反电信网络诈骗AI实时质检', 'verify', 'a1010002-0000-0000-0000-000000000003', 'active'),

  ('a5050002-0000-0000-0000-000000000005', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '969e3510-2811-4551-9805-7ae51a8579ea',
   'reconcile_boss_billing', '对齐BOSS流水', '双向对齐云南移动业务支撑网新一代CRM/BOSS系统宽带到期与资费流水', 'sync', 'a1010002-0000-0000-0000-000000000004', 'active');

-- 1.7 写入云南移动 5 大核心业务数据源流 (Datasets)
INSERT INTO plugin_ontology_b62f8af3e9.ontology_datasets
  (id, company_id, domain_id, key, name, description, format, lifecycle_state, stats, metadata)
VALUES
  ('d1010001-0000-0000-0000-000000000001', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '969e3510-2811-4551-9805-7ae51a8579ea',
   'wecom_customer_cache', 'wecom_customers_cache', '云南移动全省网格营业厅外部联系人画像与私域标签缓存表', 'postgresql', 'active',
   '{"recordCount": "4,820 条", "latency": "< 500ms", "engine": "PostgreSQL", "syncType": "实时同步", "boundObject": "企微高价值客户"}'::jsonb, '{}'::jsonb),

  ('d1010001-0000-0000-0000-000000000002', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '969e3510-2811-4551-9805-7ae51a8579ea',
   'boss_broadband_sync', 'crm_boss_broadband_sync', '云南移动新一代CRM/BOSS宽带30天到期预警与套餐变更增量流水', 'kafka_stream', 'active',
   '{"recordCount": "12,500 条", "latency": "< 1s", "engine": "Kafka/REST", "syncType": "增量对齐", "boundObject": "BOSS数据对齐流"}'::jsonb, '{}'::jsonb),

  ('d1010001-0000-0000-0000-000000000003', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '969e3510-2811-4551-9805-7ae51a8579ea',
   'smart_routing_cfg', 'smart_routing_rules_cfg', '千兆宽带到期与FTTR升级智能路由权重与网格匹配策略规则库', 'postgresql', 'active',
   '{"recordCount": "18 规则", "latency": "0ms", "engine": "PostgreSQL", "syncType": "实时生效", "boundObject": "智能导购分流规则"}'::jsonb, '{}'::jsonb),

  ('d1010001-0000-0000-0000-000000000004', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '969e3510-2811-4551-9805-7ae51a8579ea',
   'fttr_campaign_funnel', 'fttr_campaign_sop_funnel', '2025年云南移动FTTR全光WiFi千兆升级群发触达与转化漏斗账本', 'redis_db', 'active',
   '{"recordCount": "3,200 转化", "latency": "< 2s", "engine": "Redis/PG", "syncType": "事件驱动", "boundObject": "存量升档触达SOP"}'::jsonb, '{}'::jsonb),

  ('d1010001-0000-0000-0000-000000000005', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '969e3510-2811-4551-9805-7ae51a8579ea',
   'compliance_audit_logs', 'ai_compliance_audit_logs', '企微导购会话反电信网络诈骗AI督导与敏感词违规质检流水账本', 'elasticsearch', 'active',
   '{"recordCount": "98,400 审计", "latency": "< 300ms", "engine": "ES/PostgreSQL", "syncType": "实时质检", "boundObject": "会话风控质检审计"}'::jsonb, '{}'::jsonb);

-- 1.8 更新云南移动本体域统计指标
UPDATE plugin_ontology_b62f8af3e9.ontology_domains
SET version = version + 1, updated_at = now()
WHERE id = '969e3510-2811-4551-9805-7ae51a8579ea';


-- ==============================================================================
-- 2. 产融数字供应链智居平台
-- Domain ID: ac5fe25e-274d-41c1-b521-1e6049c226ed
-- Company ID: 4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e
-- ==============================================================================

-- 2.1 清理历史关联
DELETE FROM plugin_ontology_b62f8af3e9.ontology_datasets WHERE domain_id = 'ac5fe25e-274d-41c1-b521-1e6049c226ed';
DELETE FROM plugin_ontology_b62f8af3e9.ontology_edges WHERE domain_id = 'ac5fe25e-274d-41c1-b521-1e6049c226ed';
DELETE FROM plugin_ontology_b62f8af3e9.ontology_nodes WHERE domain_id = 'ac5fe25e-274d-41c1-b521-1e6049c226ed';
DELETE FROM plugin_ontology_b62f8af3e9.ontology_action_types WHERE domain_id = 'ac5fe25e-274d-41c1-b521-1e6049c226ed';
DELETE FROM plugin_ontology_b62f8af3e9.ontology_relation_types WHERE domain_id = 'ac5fe25e-274d-41c1-b521-1e6049c226ed';
DELETE FROM plugin_ontology_b62f8af3e9.ontology_node_types WHERE domain_id = 'ac5fe25e-274d-41c1-b521-1e6049c226ed';

-- 2.2 写入九夏智居 5 大核心业务实体类型 (Node Types)
INSERT INTO plugin_ontology_b62f8af3e9.ontology_node_types 
  (id, company_id, domain_id, key, display_name, description, properties_schema, metadata)
VALUES 
  ('18d9d4e3-e48d-4f7f-b18c-c502768229be', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'ac5fe25e-274d-41c1-b521-1e6049c226ed',
   'floor_plan', '住宅户型基准', '户型空间几何测绘、承重墙分布、层高与全屋动线基底',
   '{"properties": ["area", "height", "rooms", "building", "orientation"]}'::jsonb, '{"icon": "📐"}'::jsonb),

  ('e1010001-0000-0000-0000-000000000003', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'ac5fe25e-274d-41c1-b521-1e6049c226ed',
   'resident_profile', '业主生活画像', '家庭常住人口结构、15万总预算硬顶、高密度收纳习性与个性化功能诉求',
   '{"properties": ["owner", "residentsCount", "totalBudgetWan", "budgetStrictness", "storageDemands"]}'::jsonb, '{"icon": "👨‍👩‍👧‍👦"}'::jsonb),

  ('74ca6ebc-832c-4583-8094-c9246eafed72', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'ac5fe25e-274d-41c1-b521-1e6049c226ed',
   'room_zone', '功能空间分区', '依据生活动线划分的玄关客餐厅多功能区、主卧套房与儿童成长空间',
   '{"properties": ["area", "lighting", "functions"]}'::jsonb, '{"icon": "🛋️"}'::jsonb),

  ('d06f757d-c768-46bc-9ffc-9947ac56ab41', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'ac5fe25e-274d-41c1-b521-1e6049c226ed',
   'storage_cabinet', '定制收纳矩阵', '全屋定制柜体尺寸展开、环保ENF欧松板与百隆隐形五金规约',
   '{"properties": ["dimensions", "sections", "material", "costRmb", "budgetRatio"]}'::jsonb, '{"icon": "🚪"}'::jsonb),

  ('b613a671-0bb1-4e55-bdf4-14bc69766ba1', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'ac5fe25e-274d-41c1-b521-1e6049c226ed',
   'deliverable_package', '双模态交付产物', '9页高定方案画册PDF与单文件WebGL 3D交互孪生设计室',
   '{"properties": ["pdfPages", "format", "pdfStatus", "webglStatus", "totalCostEst", "withinBudget"]}'::jsonb, '{"icon": "📦"}'::jsonb);

-- 2.3 写入九夏智居 4 大因果血缘关系类型 (Relation Types)
INSERT INTO plugin_ontology_b62f8af3e9.ontology_relation_types
  (id, company_id, domain_id, key, display_name, description, directed, metadata)
VALUES
  ('e2020001-0000-0000-0000-000000000001', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'ac5fe25e-274d-41c1-b521-1e6049c226ed',
   'profiles_living', '画像映射户型', '户型空间几何承载业主生活画像与15万预算硬顶', true, '{}'::jsonb),

  ('e2020001-0000-0000-0000-000000000002', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'ac5fe25e-274d-41c1-b521-1e6049c226ed',
   'allocates_zone', '规划功能空间', '生活画像驱动玄关客餐厅多功能区与主卧儿童分区', true, '{}'::jsonb),

  ('e2020001-0000-0000-0000-000000000003', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'ac5fe25e-274d-41c1-b521-1e6049c226ed',
   'embeds_cabinet', '矩阵嵌入柜体', '空间分区依据生活动线矩阵化嵌入定制收纳柜体', true, '{}'::jsonb),

  ('e2020001-0000-0000-0000-000000000004', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'ac5fe25e-274d-41c1-b521-1e6049c226ed',
   'synthesizes_package', '编译交付产物', '定制柜体与空间规约编译生成双模态PDF与3D产物包', true, '{}'::jsonb);

-- 2.4 写入九夏智居 5 个真实业务活体节点 (Nodes)
INSERT INTO plugin_ontology_b62f8af3e9.ontology_nodes
  (id, company_id, domain_id, node_type_id, key, label, properties, metadata)
VALUES
  ('f3030001-0000-0000-0000-000000000001', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'ac5fe25e-274d-41c1-b521-1e6049c226ed',
   '18d9d4e3-e48d-4f7f-b18c-c502768229be', 'wenbin-fp-128', '文彬户型测绘基准 (128.66㎡)',
   '{"area": 128.66, "height": 2.85, "rooms": "4室2厅2卫", "building": "九夏智居3号楼", "orientation": "南北通透"}'::jsonb, '{"icon": "📐"}'::jsonb),

  ('f3030001-0000-0000-0000-000000000002', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'ac5fe25e-274d-41c1-b521-1e6049c226ed',
   'e1010001-0000-0000-0000-000000000003', 'wenbin-family-profile', '业主文彬一家生活画像 (15万预算顶)',
   '{"owner": "文彬", "residentsCount": 4, "totalBudgetWan": 15.0, "budgetStrictness": "硬约束绝不超支", "storageDemands": "全屋高密度收纳+儿童房独立学习+玄关多功能", "colorPreference": "原木极简"}'::jsonb, '{"icon": "👨‍👩‍👧‍👦"}'::jsonb),

  ('f3030001-0000-0000-0000-000000000003', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'ac5fe25e-274d-41c1-b521-1e6049c226ed',
   '74ca6ebc-832c-4583-8094-c9246eafed72', 'zone-living-master', '客餐厅复合生活区与主卧儿童分区',
   '{"area": 86.4, "lighting": "极佳自然采光", "functions": ["客餐厅家庭活动区", "独立办公角", "主卧隐私套房", "儿童成长收纳"]}'::jsonb, '{"icon": "🛋️"}'::jsonb),

  ('f3030001-0000-0000-0000-000000000004', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'ac5fe25e-274d-41c1-b521-1e6049c226ed',
   'd06f757d-c768-46bc-9ffc-9947ac56ab41', 'cabinet-enf-osb', 'ENF级全屋定制柜体矩阵 (38.6㎡展开)',
   '{"dimensions": "展开总面积38.6㎡", "sections": ["入户玄关多功能800mm深度柜", "客餐厅满墙书柜与餐边柜", "主卧通顶衣柜与隐形梳妆台", "儿童床底抽拉高密度收纳"], "material": "万华ENF原态禾香板+奥地利百隆阻尼铰链", "costRmb": 68420.0, "budgetRatio": 0.456}'::jsonb, '{"icon": "🚪"}'::jsonb),

  ('f3030001-0000-0000-0000-000000000005', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'ac5fe25e-274d-41c1-b521-1e6049c226ed',
   'b613a671-0bb1-4e55-bdf4-14bc69766ba1', 'pkg-wenbin-v1', '九夏智居双模态交付产物包 (PDF+3D)',
   '{"pdfPages": 9, "format": "PDF高清精装画册 + WebGL单文件3D孪生", "pdfStatus": "已生成封箱", "webglStatus": "离线运行就绪", "totalCostEst": 142800.0, "withinBudget": true}'::jsonb, '{"icon": "📦"}'::jsonb);

-- 2.5 写入九夏智居 4 条因果血缘连线 (Edges)
INSERT INTO plugin_ontology_b62f8af3e9.ontology_edges
  (id, company_id, domain_id, relation_type_id, relation_key, source_node_id, target_node_id, weight, properties)
VALUES
  ('f4040001-0000-0000-0000-000000000001', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'ac5fe25e-274d-41c1-b521-1e6049c226ed',
   'e2020001-0000-0000-0000-000000000001', 'profiles_living',
   'f3030001-0000-0000-0000-000000000001', 'f3030001-0000-0000-0000-000000000002', 1, '{}'::jsonb),

  ('f4040001-0000-0000-0000-000000000002', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'ac5fe25e-274d-41c1-b521-1e6049c226ed',
   'e2020001-0000-0000-0000-000000000002', 'allocates_zone',
   'f3030001-0000-0000-0000-000000000002', 'f3030001-0000-0000-0000-000000000003', 1, '{}'::jsonb),

  ('f4040001-0000-0000-0000-000000000003', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'ac5fe25e-274d-41c1-b521-1e6049c226ed',
   'e2020001-0000-0000-0000-000000000003', 'embeds_cabinet',
   'f3030001-0000-0000-0000-000000000003', 'f3030001-0000-0000-0000-000000000004', 1, '{}'::jsonb),

  ('f4040001-0000-0000-0000-000000000004', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'ac5fe25e-274d-41c1-b521-1e6049c226ed',
   'e2020001-0000-0000-0000-000000000004', 'synthesizes_package',
   'f3030001-0000-0000-0000-000000000004', 'f3030001-0000-0000-0000-000000000005', 1, '{}'::jsonb);

-- 2.6 写入九夏智居 4 大合法业务动词 (Action Types)
INSERT INTO plugin_ontology_b62f8af3e9.ontology_action_types
  (id, company_id, domain_id, key, display_name, description, kind, applies_to_node_type_id, status)
VALUES
  ('f5050001-0000-0000-0000-000000000001', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'ac5fe25e-274d-41c1-b521-1e6049c226ed',
   'parse_floor_plan', '解析户型图纸', 'DXF/CAD工程矢量图纸空间拓扑结构语义化识别与参数提取', 'create', '18d9d4e3-e48d-4f7f-b18c-c502768229be', 'active'),

  ('f5050001-0000-0000-0000-000000000002', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'ac5fe25e-274d-41c1-b521-1e6049c226ed',
   'profile_living_habits', '生活画像建模', '根据业主家庭结构与15万预算顶约束完成生活习惯建模与空间推荐', 'execute', 'e1010001-0000-0000-0000-000000000003', 'active'),

  ('f5050001-0000-0000-0000-000000000003', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'ac5fe25e-274d-41c1-b521-1e6049c226ed',
   'optimize_panel_cutting', '运筹板材开料', '执行启发式排样优化算法保证出材率>=92%并输出MES数控开料G代码', 'execute', 'd06f757d-c768-46bc-9ffc-9947ac56ab41', 'active'),

  ('f5050001-0000-0000-0000-000000000004', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'ac5fe25e-274d-41c1-b521-1e6049c226ed',
   'synthesize_bim_package', '生成双模产物', '一键自动化渲染生成9页高定画册PDF并编译单文件WebGL 3D空间孪生', 'create', 'b613a671-0bb1-4e55-bdf4-14bc69766ba1', 'active');

-- 2.7 写入九夏智居 4 大核心业务数据源流 (Datasets)
INSERT INTO plugin_ontology_b62f8af3e9.ontology_datasets
  (id, company_id, domain_id, key, name, description, format, lifecycle_state, stats, metadata)
VALUES
  ('d2020001-0000-0000-0000-000000000001', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'ac5fe25e-274d-41c1-b521-1e6049c226ed',
   'cad_dxf_vector_shapes', 'cad_dxf_vector_shapes', '住宅户型CAD/DXF几何矢量图纸结构解析与墙体承重图元库', 'minio_json', 'active',
   '{"recordCount": "48 个图元", "latency": "0ms", "engine": "MinIO/PG", "syncType": "静态解析", "boundObject": "住宅户型基准"}'::jsonb, '{}'::jsonb),

  ('d2020001-0000-0000-0000-000000000002', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'ac5fe25e-274d-41c1-b521-1e6049c226ed',
   'mes_panel_cutting', 'mes_panel_cutting_optimization', '九夏智居工业MES数控开料运筹算法优化结果库 (出材率92.4%)', 'postgresql', 'active',
   '{"recordCount": "出材率 92.4%", "latency": "< 5s", "engine": "C++运筹/PG", "syncType": "算法计算", "boundObject": "定制收纳矩阵"}'::jsonb, '{}'::jsonb),

  ('d2020001-0000-0000-0000-000000000003', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'ac5fe25e-274d-41c1-b521-1e6049c226ed',
   'bom_disassembly_lines', 'bom_order_disassembly_lines', '全屋定制柜体BOM拆单物料清单与数控打孔拉槽开槽参数账本', 'postgresql', 'active',
   '{"recordCount": "164 板件", "latency": "< 1s", "engine": "PostgreSQL", "syncType": "实时拆单", "boundObject": "双模态交付产物"}'::jsonb, '{}'::jsonb),

  ('d2020001-0000-0000-0000-000000000004', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'ac5fe25e-274d-41c1-b521-1e6049c226ed',
   'pledge_collateral_ledger', 'supply_chain_pledge_collateral', '产融数字供应链生产期在制品货值质押风控与金融履约证据链', 'blockchain_ledger', 'active',
   '{"recordCount": "质押 ¥14.2万", "latency": "< 2s", "engine": "金融账本/PG", "syncType": "不可变存证", "boundObject": "双模态交付产物"}'::jsonb, '{}'::jsonb);

-- 2.8 更新九夏智居本体域统计指标
UPDATE plugin_ontology_b62f8af3e9.ontology_domains
SET version = version + 1, updated_at = now()
WHERE id = 'ac5fe25e-274d-41c1-b521-1e6049c226ed';

COMMIT;
