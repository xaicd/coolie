BEGIN;

-- 1. 清理旧的关系和节点
DELETE FROM plugin_ontology_b62f8af3e9.ontology_edges WHERE domain_id = '8931cc0f-69dd-4678-9260-563ffea4feed';
DELETE FROM plugin_ontology_b62f8af3e9.ontology_nodes WHERE domain_id = '8931cc0f-69dd-4678-9260-563ffea4feed';
DELETE FROM plugin_ontology_b62f8af3e9.ontology_action_types WHERE domain_id = '8931cc0f-69dd-4678-9260-563ffea4feed';
DELETE FROM plugin_ontology_b62f8af3e9.ontology_relation_types WHERE domain_id = '8931cc0f-69dd-4678-9260-563ffea4feed';
DELETE FROM plugin_ontology_b62f8af3e9.ontology_node_types WHERE domain_id = '8931cc0f-69dd-4678-9260-563ffea4feed';

-- 2. 写入九夏智居 5 大核心业务实体类型 (Node Types)
INSERT INTO plugin_ontology_b62f8af3e9.ontology_node_types 
  (id, company_id, domain_id, key, display_name, description, properties_schema, metadata)
VALUES 
  ('18d9d4e3-e48d-4f7f-b18c-c502768229be', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'floor_plan', '住宅户型基准', '户型空间几何测绘、承重墙分布、层高与全屋动线基底',
   '{"properties": ["area", "height", "rooms", "building", "orientation"]}'::jsonb, '{"icon": "📐"}'::jsonb),

  ('e1010001-0000-0000-0000-000000000003', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'resident_profile', '业主生活画像', '家庭常住人口结构、15万总预算硬顶、高密度收纳习性与个性化功能诉求',
   '{"properties": ["owner", "residentsCount", "totalBudgetWan", "budgetStrictness", "storageDemands"]}'::jsonb, '{"icon": "👨‍👩‍👧‍👦"}'::jsonb),

  ('74ca6ebc-832c-4583-8094-c9246eafed72', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'room_zone', '功能空间分区', '依据生活动线划分的玄关客餐厅多功能区、主卧套房与儿童成长空间',
   '{"properties": ["area", "lighting", "functions"]}'::jsonb, '{"icon": "🛋️"}'::jsonb),

  ('d06f757d-c768-46bc-9ffc-9947ac56ab41', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'storage_cabinet', '定制收纳矩阵', '全屋定制柜体尺寸展开、环保ENF欧松板与百隆隐形五金规约',
   '{"properties": ["dimensions", "sections", "material", "costRmb", "budgetRatio"]}'::jsonb, '{"icon": "🚪"}'::jsonb),

  ('b613a671-0bb1-4e55-bdf4-14bc69766ba1', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'deliverable_package', '双模态交付产物', '9页高定方案画册PDF与单文件WebGL 3D交互孪生设计室',
   '{"properties": ["pdfPages", "format", "pdfStatus", "webglStatus", "totalCostEst", "withinBudget"]}'::jsonb, '{"icon": "📦"}'::jsonb);

-- 3. 写入 4 大因果血缘关系类型 (Relation Types)
INSERT INTO plugin_ontology_b62f8af3e9.ontology_relation_types
  (id, company_id, domain_id, key, display_name, description, directed, metadata)
VALUES
  ('e2020001-0000-0000-0000-000000000001', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'profiles_living', '画像映射户型', '户型空间几何承载业主生活画像与15万预算硬顶', true, '{}'::jsonb),

  ('e2020001-0000-0000-0000-000000000002', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'allocates_zone', '规划功能空间', '生活画像驱动玄关客餐厅多功能区与主卧儿童分区', true, '{}'::jsonb),

  ('e2020001-0000-0000-0000-000000000003', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'embeds_cabinet', '矩阵嵌入柜体', '空间分区依据生活动线矩阵化嵌入定制收纳柜体', true, '{}'::jsonb),

  ('e2020001-0000-0000-0000-000000000004', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'synthesizes_package', '编译交付产物', '定制柜体与空间规约编译生成双模态PDF与3D产物包', true, '{}'::jsonb);

-- 4. 写入 5 个真实业务活体节点 (Nodes)
INSERT INTO plugin_ontology_b62f8af3e9.ontology_nodes
  (id, company_id, domain_id, node_type_id, key, label, properties, metadata)
VALUES
  ('f3030001-0000-0000-0000-000000000001', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   '18d9d4e3-e48d-4f7f-b18c-c502768229be', 'wenbin-fp-128', '文彬户型测绘基准 (128.66㎡)',
   '{"area": 128.66, "height": 2.85, "rooms": "4室2厅2卫", "building": "九夏智居3号楼", "orientation": "南北通透"}'::jsonb, '{}'::jsonb),

  ('f3030001-0000-0000-0000-000000000002', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'e1010001-0000-0000-0000-000000000003', 'wenbin-family-profile', '业主文彬一家生活画像 (15万预算顶)',
   '{"owner": "文彬", "residentsCount": 4, "totalBudgetWan": 15.0, "budgetStrictness": "硬约束绝不超支", "storageDemands": "全屋高密度收纳+儿童房独立学习+玄关多功能", "colorPreference": "原木极简"}'::jsonb, '{}'::jsonb),

  ('f3030001-0000-0000-0000-000000000003', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   '74ca6ebc-832c-4583-8094-c9246eafed72', 'zone-living-suite', '玄关客餐厅多功能生活区 (42.5㎡)',
   '{"area": 42.5, "lighting": "南北通透主采光", "functions": ["入户消杀", "大容量鞋履收纳", "餐厨联动", "家庭交互中心"]}'::jsonb, '{}'::jsonb),

  ('f3030001-0000-0000-0000-000000000004', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'd06f757d-c768-46bc-9ffc-9947ac56ab41', 'cab-foyer-dining-matrix', '玄关整墙与餐边收纳柜矩阵 (2400×2650×350)',
   '{"dimensions": "2400×2650×350mm", "sections": 4, "material": "ENF环保欧松板+百隆阻尼快装", "rebounder": true, "costRmb": 21800, "budgetRatio": "14.5%"}'::jsonb, '{}'::jsonb),

  ('f3030001-0000-0000-0000-000000000005', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'b613a671-0bb1-4e55-bdf4-14bc69766ba1', 'pkg-wenbin-dual-kit', '文彬方案画册PDF与3D交互设计室交付包',
   '{"pdfPages": 9, "format": "双模态交付", "pdfStatus": "已固化", "webglStatus": "在线3D交互就绪", "storageRateIncrease": "+42%", "totalCostEst": 142000, "withinBudget": true}'::jsonb, '{}'::jsonb);

-- 5. 写入 4 条真实的因果血缘连线 (Edges)
INSERT INTO plugin_ontology_b62f8af3e9.ontology_edges
  (id, company_id, domain_id, relation_type_id, relation_key, source_node_id, target_node_id, weight, properties)
VALUES
  ('e4040001-0000-0000-0000-000000000001', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'e2020001-0000-0000-0000-000000000001', 'profiles_living',
   'f3030001-0000-0000-0000-000000000001', 'f3030001-0000-0000-0000-000000000002', 1, '{}'::jsonb),

  ('e4040001-0000-0000-0000-000000000002', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'e2020001-0000-0000-0000-000000000002', 'allocates_zone',
   'f3030001-0000-0000-0000-000000000002', 'f3030001-0000-0000-0000-000000000003', 1, '{}'::jsonb),

  ('e4040001-0000-0000-0000-000000000003', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'e2020001-0000-0000-0000-000000000003', 'embeds_cabinet',
   'f3030001-0000-0000-0000-000000000003', 'f3030001-0000-0000-0000-000000000004', 1, '{}'::jsonb),

  ('e4040001-0000-0000-0000-000000000004', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'e2020001-0000-0000-0000-000000000004', 'synthesizes_package',
   'f3030001-0000-0000-0000-000000000004', 'f3030001-0000-0000-0000-000000000005', 1, '{}'::jsonb);

-- 6. 写入 4 大合法业务动词 (Action Types)
INSERT INTO plugin_ontology_b62f8af3e9.ontology_action_types
  (id, company_id, domain_id, key, display_name, description, kind, applies_to_node_type_id, status)
VALUES
  ('e5050001-0000-0000-0000-000000000001', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'profile_residents', '生活画像采集', '依据 15 万总预算硬约束与居住成员结构录入并锁定生活方式画像', 'create', 'e1010001-0000-0000-0000-000000000003', 'active'),

  ('e5050001-0000-0000-0000-000000000002', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'divide_functional_zones', '空间分区规划', '结合生活动线与采光朝向，将户型几何划分为玄关客餐厅等生活多功能区', 'modify', '74ca6ebc-832c-4583-8094-c9246eafed72', 'active'),

  ('e5050001-0000-0000-0000-000000000003', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'deepen_storage_cabinet', '深化定制收纳', '依据 15 万总预算上限与生活方式，生成毫米级尺寸展开与收纳矩阵规约', 'modify', 'd06f757d-c768-46bc-9ffc-9947ac56ab41', 'active'),

  ('e5050001-0000-0000-0000-000000000004', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'export_proposal_package', '编译双模态包', '生成单文件免安装 WebGL 交互孪生空间与 9 页高定方案册 PDF', 'create', 'b613a671-0bb1-4e55-bdf4-14bc69766ba1', 'active');

-- 7. 升级版本
UPDATE plugin_ontology_b62f8af3e9.ontology_domains
SET version = version + 1, updated_at = now()
WHERE id = '8931cc0f-69dd-4678-9260-563ffea4feed';

COMMIT;
