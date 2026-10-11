BEGIN;

-- 1. 新增/更新 4 个核心业务实体类型 (Node Types)
INSERT INTO plugin_ontology_b62f8af3e9.ontology_node_types 
  (id, company_id, domain_id, key, display_name, description, properties_schema, metadata)
VALUES 
  ('a1010002-0000-0000-0000-000000000001', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'smart_routing_rule', '智能导购分流规则', '渠道来源、客户画像标签、所属网格匹配权重与超时兜底派单策略', '{"properties": ["ruleId", "matchTags", "priority", "targetStaffRole", "timeoutFallbackMins"]}'::jsonb, '{"icon": "🔀"}'::jsonb),
  ('a1010002-0000-0000-0000-000000000002', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'campaign_sop', '存量升档触达SOP', '千人千面营销话术、宽带续约权益券、群发触达时间窗口与转化漏斗', '{"properties": ["sopCode", "templateId", "coupon", "channel", "targetConversion"]}'::jsonb, '{"icon": "📢"}'::jsonb),
  ('a1010002-0000-0000-0000-000000000003', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'compliance_audit_record', '会话风控质检审计', '敏感词拦截、超时未回复预警、违规承诺质检与反电信网络诈骗AI督导', '{"properties": ["auditEngine", "interceptWords", "riskLevel", "auditStatus"]}'::jsonb, '{"icon": "🛡️"}'::jsonb),
  ('a1010002-0000-0000-0000-000000000004', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'boss_billing_sync', 'BOSS系统数据对齐流', 'BOSS鉴权、宽带到期预警增量对齐与套餐变更实时回写流水', '{"properties": ["syncInterval", "sourceSystem", "lastSyncTime", "reconcileRate", "status"]}'::jsonb, '{"icon": "🔄"}'::jsonb)
ON CONFLICT (company_id, domain_id, key) DO UPDATE 
  SET display_name = EXCLUDED.display_name, description = EXCLUDED.description;

-- 2. 新增 5 个因果关系类型 (Relation Types)
INSERT INTO plugin_ontology_b62f8af3e9.ontology_relation_types
  (id, company_id, domain_id, key, display_name, description, directed, metadata)
VALUES
  ('a2020002-0000-0000-0000-000000000001', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'serves_customer', '网格管辖服务', '网格导购员服务管辖企业微信存量/潜客', true, '{}'::jsonb),
  ('a2020002-0000-0000-0000-000000000002', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'matched_by_rule', '智能路由匹配', '客户画像与标签匹配智能分流与派单规则', true, '{}'::jsonb),
  ('a2020002-0000-0000-0000-000000000003', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'dispatches_sop', '触发存量SOP', '智能分流规则驱动触发存量营销SOP触达任务', true, '{}'::jsonb),
  ('a2020002-0000-0000-0000-000000000004', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'monitored_by_compliance', '合规风控监控', '营销触达SOP受到敏感词与反诈质检实时审计', true, '{}'::jsonb),
  ('a2020002-0000-0000-0000-000000000005', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'reconciled_with_boss', 'BOSS数据对齐', '客户宽带状态与套餐流水与BOSS中台增量双向对齐', true, '{}'::jsonb)
ON CONFLICT (company_id, domain_id, key) DO UPDATE 
  SET display_name = EXCLUDED.display_name, description = EXCLUDED.description;

-- 3. 清理旧模板连线与占位节点，写入 6 个核心业务实体活体节点 (Nodes)
DELETE FROM plugin_ontology_b62f8af3e9.ontology_edges WHERE domain_id = 'a541c1f0-16e2-4d55-84c7-714c8a518820';
DELETE FROM plugin_ontology_b62f8af3e9.ontology_nodes WHERE domain_id = 'a541c1f0-16e2-4d55-84c7-714c8a518820';

INSERT INTO plugin_ontology_b62f8af3e9.ontology_nodes
  (id, company_id, domain_id, node_type_id, key, label, properties, metadata)
VALUES
  ('a3030002-0000-0000-0000-000000000001', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'e0f683c3-1236-4d98-a5e3-ceb3bd6c06c0', 'staff-km-008', '昆明盘龙金星网格卓越导购员 (YNKM-0882)',
   '{"staffNo": "YNKM-0882", "name": "李云霞", "grid": "盘龙区金星网格", "customerCount": 1248, "satisfaction": 99.4}'::jsonb, '{}'::jsonb),

  ('a3030002-0000-0000-0000-000000000002', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   '15b7e9e5-0cb6-4da3-9bc2-904892e385c0', 'cust-yn-5g-889', '昆明千兆宽带到期高价值客户 (密文)',
   '{"phoneMask": "138****9281", "netAgeYears": 8, "arpu": 158.5, "broadbandExpiry": "2026-10-31", "package": "5G智享158套餐+千兆宽带", "riskLevel": "中度流失预警"}'::jsonb, '{}'::jsonb),

  ('a3030002-0000-0000-0000-000000000003', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'a1010002-0000-0000-0000-000000000001', 'rule-broadband-renew', '千兆宽带续约与FTTR升级智能路由',
   '{"ruleId": "RULE-KM-FTTR-01", "matchTags": ["高价值", "宽带30天内到期"], "priority": 1, "targetStaffRole": "网格金牌导购", "timeoutFallbackMins": 15}'::jsonb, '{}'::jsonb),

  ('a3030002-0000-0000-0000-000000000004', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'a1010002-0000-0000-0000-000000000002', 'sop-fttr-upgrade-2025', '2025年云南移动FTTR全光WiFi千兆升级SOP',
   '{"sopCode": "SOP-YN-FTTR-2025", "templateId": "WX_MSG_FTTR_09", "coupon": "免费上门测速与首月半价", "channel": "企业微信单聊/群发", "targetConversion": 35.8}'::jsonb, '{}'::jsonb),

  ('a3030002-0000-0000-0000-000000000005', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'a1010002-0000-0000-0000-000000000003', 'audit-wecom-risk-01', '企微会话违规敏感词与反诈质检审计',
   '{"auditEngine": "反诈与违规承诺AI质检模型", "interceptWords": ["私下返现", "保本兜底", "免费送手机套路"], "riskLevel": "normal", "auditStatus": "合规通过"}'::jsonb, '{}'::jsonb),

  ('a3030002-0000-0000-0000-000000000006', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820',
   'a1010002-0000-0000-0000-000000000004', 'boss-flow-km-broadband', '昆明移动业务支撑网BOSS实时对齐流',
   '{"syncInterval": "5min", "sourceSystem": "云南移动新一代CRM/BOSS", "lastSyncTime": "2026-10-07 14:30:00", "reconcileRate": 99.98, "status": "active"}'::jsonb, '{}'::jsonb);

-- 4. 写入 5 条因果血缘连线 (Edges)
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

-- 5. 升级本体域版本并更新 metadata
UPDATE plugin_ontology_b62f8af3e9.ontology_domains
SET version = version + 1, updated_at = now()
WHERE id = 'a541c1f0-16e2-4d55-84c7-714c8a518820';

COMMIT;
