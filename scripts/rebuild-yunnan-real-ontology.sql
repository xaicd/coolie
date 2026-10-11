BEGIN;

-- 1. 清理旧的关系与节点与动词
DELETE FROM plugin_ontology_b62f8af3e9.ontology_edges WHERE domain_id = 'a541c1f0-16e2-4d55-84c7-714c8a518820';
DELETE FROM plugin_ontology_b62f8af3e9.ontology_nodes WHERE domain_id = 'a541c1f0-16e2-4d55-84c7-714c8a518820';
DELETE FROM plugin_ontology_b62f8af3e9.ontology_action_types WHERE domain_id = 'a541c1f0-16e2-4d55-84c7-714c8a518820';
DELETE FROM plugin_ontology_b62f8af3e9.ontology_relation_types WHERE domain_id = 'a541c1f0-16e2-4d55-84c7-714c8a518820';
DELETE FROM plugin_ontology_b62f8af3e9.ontology_node_types WHERE domain_id = 'a541c1f0-16e2-4d55-84c7-714c8a518820';

-- 2. 写入 6 大核心业务实体类型 (Node Types)
INSERT INTO plugin_ontology_b62f8af3e9.ontology_node_types 
  (id, company_id, domain_id, key, display_name, description, properties_schema, metadata)
VALUES 
  ('a1010002-0000-0000-0000-000000000010', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'grid_staff', '网格卓越导购员', '企业微信持证专属网格服务经理、管辖客户池与服务满意度态势',
   '{"properties": ["staffNo", "name", "grid", "customerCount", "satisfaction"]}'::jsonb, '{"icon": "👩‍💼"}'::jsonb),

  ('a1010002-0000-0000-0000-000000000020', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'wecom_customer', '企微高价值客户', '昆明到期宽带高价值私域客户画像、套餐归属与流失风险预警',
   '{"properties": ["phoneMask", "netAgeYears", "arpu", "broadbandExpiry", "package", "riskLevel"]}'::jsonb, '{"icon": "👤"}'::jsonb),

  ('a1010002-0000-0000-0000-000000000001', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'smart_routing_rule', '智能导购分流规则', '渠道来源、客户画像标签、所属网格匹配权重与超时兜底派单策略',
   '{"properties": ["ruleId", "matchTags", "priority", "targetStaffRole", "timeoutFallbackMins"]}'::jsonb, '{"icon": "🔀"}'::jsonb),

  ('a1010002-0000-0000-0000-000000000002', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'campaign_sop', '存量升档触达SOP', '千人千面营销话术、宽带续约权益券、群发触达时间窗口与转化漏斗',
   '{"properties": ["sopCode", "templateId", "coupon", "channel", "targetConversion"]}'::jsonb, '{"icon": "📢"}'::jsonb),

  ('a1010002-0000-0000-0000-000000000003', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'compliance_audit_record', '会话风控质检审计', '敏感词拦截、超时未回复预警、违规承诺质检与反电信网络诈骗AI督导',
   '{"properties": ["auditEngine", "interceptWords", "riskLevel", "auditStatus"]}'::jsonb, '{"icon": "🛡️"}'::jsonb),

  ('a1010002-0000-0000-0000-000000000004', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'boss_billing_sync', 'BOSS系统数据对齐流', 'BOSS鉴权、宽带到期预警增量对齐与套餐变更实时回写流水',
   '{"properties": ["syncInterval", "sourceSystem", "lastSyncTime", "reconcileRate", "status"]}'::jsonb, '{"icon": "🔄"}'::jsonb);

-- 3. 写入 5 大因果血缘关系类型 (Relation Types)
INSERT INTO plugin_ontology_b62f8af3e9.ontology_relation_types
  (id, company_id, domain_id, key, display_name, description, directed, metadata)
VALUES
  ('a2020002-0000-0000-0000-000000000001', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'serves_customer', '网格管辖服务', '网格专属导购经理服务管辖企业微信存量/潜客', true, '{}'::jsonb),

  ('a2020002-0000-0000-0000-000000000002', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'matched_by_rule', '智能路由匹配', '客户画像与标签匹配智能分流与派单规则', true, '{}'::jsonb),

  ('a2020002-0000-0000-0000-000000000003', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'dispatches_sop', '触发存量SOP', '智能分流规则驱动触发存量营销SOP触达任务', true, '{}'::jsonb),

  ('a2020002-0000-0000-0000-000000000004', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'monitored_by_compliance', '合规风控监控', '营销触达SOP受到敏感词与反诈质检实时审计', true, '{}'::jsonb),

  ('a2020002-0000-0000-0000-000000000005', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'reconciled_with_boss', 'BOSS数据对齐', '客户宽带状态与套餐流水与BOSS中台增量双向对齐', true, '{}'::jsonb);

-- 4. 写入 6 个核心业务活体实体节点 (Nodes)
INSERT INTO plugin_ontology_b62f8af3e9.ontology_nodes
  (id, company_id, domain_id, node_type_id, key, label, properties, metadata)
VALUES
  ('a3030002-0000-0000-0000-000000000001', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'a1010002-0000-0000-0000-000000000010', 'staff-km-008', '昆明盘龙金星网格卓越导购员 (YNKM-0882)',
   '{"staffNo": "YNKM-0882", "name": "李云霞", "grid": "盘龙区金星网格", "customerCount": 1248, "satisfaction": 99.4}'::jsonb, '{}'::jsonb),

  ('a3030002-0000-0000-0000-000000000002', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'a1010002-0000-0000-0000-000000000020', 'cust-yn-5g-889', '昆明千兆宽带到期高价值客户 (密文 138****9281)',
   '{"phoneMask": "138****9281", "netAgeYears": 8, "arpu": 158.5, "broadbandExpiry": "2026-10-31", "package": "5G智享158套餐+千兆宽带", "riskLevel": "中度流失预警"}'::jsonb, '{}'::jsonb),

  ('a3030002-0000-0000-0000-000000000003', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'a1010002-0000-0000-0000-000000000001', 'rule-broadband-renew', '千兆宽带续约与FTTR升级智能路由 (RULE-KM-FTTR-01)',
   '{"ruleId": "RULE-KM-FTTR-01", "matchTags": ["高价值", "宽带30天内到期"], "priority": 1, "targetStaffRole": "网格金牌导购", "timeoutFallbackMins": 15}'::jsonb, '{}'::jsonb),

  ('a3030002-0000-0000-0000-000000000004', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'a1010002-0000-0000-0000-000000000002', 'sop-fttr-upgrade-2025', '2025年云南移动FTTR全光WiFi千兆升级SOP (SOP-YN-FTTR-2025)',
   '{"sopCode": "SOP-YN-FTTR-2025", "templateId": "WX_MSG_FTTR_09", "coupon": "免费上门测速与首月半价", "channel": "企业微信单聊/群发", "targetConversion": 35.8}'::jsonb, '{}'::jsonb),

  ('a3030002-0000-0000-0000-000000000005', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'a1010002-0000-0000-0000-000000000003', 'audit-wecom-risk-01', '企微会话违规敏感词与反诈质检审计 (AI质检合规)',
   '{"auditEngine": "反诈与违规承诺AI质检模型", "interceptWords": ["私下返现", "保本兜底", "免费送手机套路"], "riskLevel": "normal", "auditStatus": "合规通过"}'::jsonb, '{}'::jsonb),

  ('a3030002-0000-0000-0000-000000000006', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'a1010002-0000-0000-0000-000000000004', 'boss-flow-km-broadband', '昆明移动业务支撑网BOSS实时对齐流 (对齐率99.98%)',
   '{"syncInterval": "5min", "sourceSystem": "云南移动新一代CRM/BOSS", "lastSyncTime": "2026-10-07 14:30:00", "reconcileRate": 99.98, "status": "active"}'::jsonb, '{}'::jsonb);

-- 5. 写入 5 条真实的因果血缘连线 (Edges)
INSERT INTO plugin_ontology_b62f8af3e9.ontology_edges
  (id, company_id, domain_id, relation_type_id, relation_key, source_node_id, target_node_id, weight, properties)
VALUES
  ('a4040002-0000-0000-0000-000000000001', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'a2020002-0000-0000-0000-000000000001', 'serves_customer',
   'a3030002-0000-0000-0000-000000000001', 'a3030002-0000-0000-0000-000000000002', 1, '{}'::jsonb),

  ('a4040002-0000-0000-0000-000000000002', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'a2020002-0000-0000-0000-000000000002', 'matched_by_rule',
   'a3030002-0000-0000-0000-000000000002', 'a3030002-0000-0000-0000-000000000003', 1, '{}'::jsonb),

  ('a4040002-0000-0000-0000-000000000003', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'a2020002-0000-0000-0000-000000000003', 'dispatches_sop',
   'a3030002-0000-0000-0000-000000000003', 'a3030002-0000-0000-0000-000000000004', 1, '{}'::jsonb),

  ('a4040002-0000-0000-0000-000000000004', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'a2020002-0000-0000-0000-000000000004', 'monitored_by_compliance',
   'a3030002-0000-0000-0000-000000000004', 'a3030002-0000-0000-0000-000000000005', 1, '{}'::jsonb),

  ('a4040002-0000-0000-0000-000000000005', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'a2020002-0000-0000-0000-000000000005', 'reconciled_with_boss',
   'a3030002-0000-0000-0000-000000000002', 'a3030002-0000-0000-0000-000000000006', 1, '{}'::jsonb);

-- 6. 写入 5 大合法业务动词 (Action Types)
INSERT INTO plugin_ontology_b62f8af3e9.ontology_action_types
  (id, company_id, domain_id, key, display_name, description, kind, applies_to_node_type_id, status)
VALUES
  ('a5050002-0000-0000-0000-000000000001', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'sync_wecom_customers', '同步企微客户', '全量或增量拉取云南移动各网格营业厅外部联系人流入私域中枢', 'sync', 'a1010002-0000-0000-0000-000000000020', 'active'),

  ('a5050002-0000-0000-0000-000000000002', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'match_smart_routing', '智能导购分流', '计算到期宽带客户标签与网格导购员权重，执行15分钟超时兜底派发', 'execute', 'a1010002-0000-0000-0000-000000000001', 'active'),

  ('a5050002-0000-0000-0000-000000000003', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'dispatch_sop_campaign', '下发千兆SOP', '向盘龙金星网格目标客群定向推送FTTR全光升级权益与测速券', 'create', 'a1010002-0000-0000-0000-000000000002', 'active'),

  ('a5050002-0000-0000-0000-000000000004', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'audit_compliance_risk', '反诈合规质检', '对企微导购会话进行违规承诺敏感词与反电信网络诈骗AI实时质检', 'verify', 'a1010002-0000-0000-0000-000000000003', 'active'),

  ('a5050002-0000-0000-0000-000000000005', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'reconcile_boss_billing', '对齐BOSS流水', '双向对齐云南移动业务支撑网新一代CRM/BOSS系统宽带到期与资费流水', 'sync', 'a1010002-0000-0000-0000-000000000004', 'active');

-- 7. 升级版本
UPDATE plugin_ontology_b62f8af3e9.ontology_domains
SET version = version + 1, updated_at = now()
WHERE id = 'a541c1f0-16e2-4d55-84c7-714c8a518820';

COMMIT;
