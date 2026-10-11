BEGIN;

-- 1. 新增 2 个业务实体类型 (Node Types)
INSERT INTO plugin_ontology_b62f8af3e9.ontology_node_types 
  (id, company_id, domain_id, key, display_name, description, properties_schema, metadata)
VALUES 
  ('e1010001-0000-0000-0000-000000000001', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'material_hardware', '板材五金规约', 'ENF级板材环保等级、Blum五金铰链与极窄铝框型材技术规约', '{"properties": ["boardGrade", "core", "hinge", "slide"]}'::jsonb, '{"icon": "🔩"}'::jsonb),
  ('e1010001-0000-0000-0000-000000000002', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'fabrication_drawing', '数控加工图纸', '32mm系统孔排布、板材开料尺寸优化与PUR激光封边生产代码', '{"properties": ["drillSpecs", "sheetCount", "edgeBanding", "accuracy"]}'::jsonb, '{"icon": "📐"}'::jsonb)
ON CONFLICT (company_id, domain_id, key) DO UPDATE 
  SET display_name = EXCLUDED.display_name, description = EXCLUDED.description;

-- 2. 新增 5 个因果关系类型 (Relation Types)
INSERT INTO plugin_ontology_b62f8af3e9.ontology_relation_types
  (id, company_id, domain_id, key, display_name, description, directed, metadata)
VALUES
  ('e2020001-0000-0000-0000-000000000001', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'defines_zone', '空间分区规约', '户型空间几何拆分为功能分区', true, '{}'::jsonb),
  ('e2020001-0000-0000-0000-000000000002', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'contains_cabinet', '容纳定制柜体', '功能空间规划并定位定制柜体', true, '{}'::jsonb),
  ('e2020001-0000-0000-0000-000000000003', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'specifies_material', '指定五金板材', '柜体结构指定环保板材与五金连接件', true, '{}'::jsonb),
  ('e2020001-0000-0000-0000-000000000004', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'generates_cnc', '生成数控代码', '由板材五金规约驱动生成生产开料代码', true, '{}'::jsonb),
  ('e2020001-0000-0000-0000-000000000005', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'compiles_into', '编译交付产物', '由数控图纸编译输出双模态PDF与3D产物包', true, '{}'::jsonb)
ON CONFLICT (company_id, domain_id, key) DO UPDATE 
  SET display_name = EXCLUDED.display_name, description = EXCLUDED.description;

-- 3. 写入 6 个核心业务实体活体节点 (Nodes)
INSERT INTO plugin_ontology_b62f8af3e9.ontology_nodes
  (id, company_id, domain_id, node_type_id, key, label, properties, metadata)
VALUES
  ('f3030001-0000-0000-0000-000000000001', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   '18d9d4e3-e48d-4f7f-b18c-c502768229be', 'wenbin-fp-128', '文彬户型基准 (128.66㎡)',
   '{"area": 128.66, "height": 2.85, "unit": "4室2厅2卫", "project": "九夏智居3号楼"}'::jsonb, '{}'::jsonb),

  ('f3030001-0000-0000-0000-000000000002', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   '74ca6ebc-832c-4583-8094-c9246eafed72', 'zone-entry-living', '玄关客餐厅多功能区 (42.5㎡)',
   '{"area": 42.5, "lighting": "南北通透", "storageDemand": "大容量鞋柜+餐边柜+展示柜"}'::jsonb, '{}'::jsonb),

  ('f3030001-0000-0000-0000-000000000003', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'd06f757d-c768-46bc-9ffc-9947ac56ab41', 'cab-foyer-closet', '玄关整墙收纳柜 (2400×2650×350)',
   '{"width": 2400, "height": 2650, "depth": 350, "sections": 4, "rebounder": true}'::jsonb, '{}'::jsonb),

  ('f3030001-0000-0000-0000-000000000004', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'e1010001-0000-0000-0000-000000000001', 'mat-enf-blum', 'ENF级欧松板与百隆五金规约',
   '{"boardGrade": "ENF", "core": "OSB欧松板", "hinge": "Blum阻尼快装", "slide": "海蒂诗隐藏轨"}'::jsonb, '{}'::jsonb),

  ('f3030001-0000-0000-0000-000000000005', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'e1010001-0000-0000-0000-000000000002', 'cnc-drill-sheet-01', '全屋数控加工开料与打孔图',
   '{"drillSpecs": "32mm系统孔", "sheetCount": 18, "edgeBanding": "PUR激光封边", "accuracy": "0.1mm"}'::jsonb, '{}'::jsonb),

  ('f3030001-0000-0000-0000-000000000006', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'b613a671-0bb1-4e55-bdf4-14bc69766ba1', 'pdf-html-dual-kit', 'PDF方案册与HTML 3D设计室交付包',
   '{"pdfPages": 9, "format": "双模态交付", "threeJs": "在线交互设计室", "status": "已固化"}'::jsonb, '{}'::jsonb)
ON CONFLICT (company_id, domain_id, key) DO UPDATE 
  SET label = EXCLUDED.label, properties = EXCLUDED.properties;

-- 4. 写入 5 条因果血缘连线 (Edges)
DELETE FROM plugin_ontology_b62f8af3e9.ontology_edges WHERE domain_id = '8931cc0f-69dd-4678-9260-563ffea4feed';

INSERT INTO plugin_ontology_b62f8af3e9.ontology_edges
  (id, company_id, domain_id, relation_type_id, relation_key, source_node_id, target_node_id, weight, properties)
VALUES
  ('e4040001-0000-0000-0000-000000000001', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'e2020001-0000-0000-0000-000000000001', 'defines_zone',
   'f3030001-0000-0000-0000-000000000001', 'f3030001-0000-0000-0000-000000000002', 1, '{}'::jsonb),

  ('e4040001-0000-0000-0000-000000000002', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'e2020001-0000-0000-0000-000000000002', 'contains_cabinet',
   'f3030001-0000-0000-0000-000000000002', 'f3030001-0000-0000-0000-000000000003', 1, '{}'::jsonb),

  ('e4040001-0000-0000-0000-000000000003', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'e2020001-0000-0000-0000-000000000003', 'specifies_material',
   'f3030001-0000-0000-0000-000000000003', 'f3030001-0000-0000-0000-000000000004', 1, '{}'::jsonb),

  ('e4040001-0000-0000-0000-000000000004', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'e2020001-0000-0000-0000-000000000004', 'generates_cnc',
   'f3030001-0000-0000-0000-000000000004', 'f3030001-0000-0000-0000-000000000005', 1, '{}'::jsonb),

  ('e4040001-0000-0000-0000-000000000005', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed',
   'e2020001-0000-0000-0000-000000000005', 'compiles_into',
   'f3030001-0000-0000-0000-000000000005', 'f3030001-0000-0000-0000-000000000006', 1, '{}'::jsonb);

-- 5. 升级本体域版本并更新 metadata
UPDATE plugin_ontology_b62f8af3e9.ontology_domains
SET version = version + 1, updated_at = now()
WHERE id = '8931cc0f-69dd-4678-9260-563ffea4feed';

COMMIT;
