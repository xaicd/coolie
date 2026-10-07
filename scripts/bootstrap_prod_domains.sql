INSERT INTO plugin_ontology_b62f8af3e9.ontology_node_types 
(id, company_id, domain_id, key, display_name, description, properties_schema, metadata)
VALUES ('e0f683c3-1236-4d98-a5e3-ceb3bd6c06c0', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820', 'wecom_staff', '企微导购/员工', '云南移动企微运营导购、渠道经理与营业厅客服员工', '{"staffId":{"type":"string","isIdentifier":true,"description":"企微工号/员工唯一ID"},"name":{"type":"string","description":"员工姓名"},"mobile":{"type":"string","description":"绑定手机号"},"department":{"type":"string","description":"所属分公司与营业厅部门"},"role":{"type":"string","enum":["导购","店长","网格经理","渠道管理员"],"description":"运营角色"},"activeCustomersCount":{"type":"number","description":"沉淀外部好友数"},"status":{"type":"string","enum":["active","disabled"],"description":"企微在职状态"}}'::jsonb, '{"source":"intake-spec"}'::jsonb)
ON CONFLICT (company_id, domain_id, key) DO UPDATE 
SET display_name = EXCLUDED.display_name, description = EXCLUDED.description, properties_schema = EXCLUDED.properties_schema;
INSERT INTO plugin_ontology_b62f8af3e9.ontology_node_types 
(id, company_id, domain_id, key, display_name, description, properties_schema, metadata)
VALUES ('15b7e9e5-0cb6-4da3-9bc2-904892e385c0', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820', 'customer', '企微客户', '移动企微私域沉淀客户画像与生命周期', '{"externalUserId":{"type":"string","isIdentifier":true,"description":"企微 external_userid"},"name":{"type":"string","description":"客户微信昵称或实名备注"},"mobile":{"type":"string","description":"脱敏手机号"},"sourceChannel":{"type":"string","description":"拓客渠道来源（吸粉码/厅店拓客/短信活码）"},"lifeCycleStage":{"type":"string","enum":["潜在","活跃","高价值","流失预警"],"description":"生命周期阶段"},"totalSpend":{"type":"number","unit":"CNY","description":"历史话费/宽带累计消费"}}'::jsonb, '{"source":"intake-spec"}'::jsonb)
ON CONFLICT (company_id, domain_id, key) DO UPDATE 
SET display_name = EXCLUDED.display_name, description = EXCLUDED.description, properties_schema = EXCLUDED.properties_schema;
INSERT INTO plugin_ontology_b62f8af3e9.ontology_node_types 
(id, company_id, domain_id, key, display_name, description, properties_schema, metadata)
VALUES ('b473deaf-c3df-453a-a22b-1b44a0b14c84', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820', 'customer_tag', '客户标签画像', '企微多维客户标签画像、资费特征与兴趣偏好', '{"tagId":{"type":"string","isIdentifier":true,"description":"标签ID"},"name":{"type":"string","description":"标签名称（如5G高潜、宽带到期）"},"groupName":{"type":"string","description":"标签组分类"},"customerCount":{"type":"number","description":"覆盖客户数量"}}'::jsonb, '{"source":"intake-spec"}'::jsonb)
ON CONFLICT (company_id, domain_id, key) DO UPDATE 
SET display_name = EXCLUDED.display_name, description = EXCLUDED.description, properties_schema = EXCLUDED.properties_schema;
INSERT INTO plugin_ontology_b62f8af3e9.ontology_node_types 
(id, company_id, domain_id, key, display_name, description, properties_schema, metadata)
VALUES ('149b3c05-2c37-4eca-a447-3fab3b8dcf52', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820', 'broadcast_task', '企微触达任务', '企微群发营销活动、服务通知与宽带质检回访任务', '{"taskId":{"type":"string","isIdentifier":true,"description":"任务批次号"},"title":{"type":"string","description":"触达任务主题"},"contentType":{"type":"string","enum":["图文","小程序","视频号","文字话术"],"description":"物料形式"},"status":{"type":"string","enum":["draft","pending_review","approved","sending","finished"],"description":"任务执行状态"},"sendCount":{"type":"number","description":"触达下发总数"}}'::jsonb, '{"source":"intake-spec"}'::jsonb)
ON CONFLICT (company_id, domain_id, key) DO UPDATE 
SET display_name = EXCLUDED.display_name, description = EXCLUDED.description, properties_schema = EXCLUDED.properties_schema;
INSERT INTO plugin_ontology_b62f8af3e9.ontology_node_types 
(id, company_id, domain_id, key, display_name, description, properties_schema, metadata)
VALUES ('18d9d4e3-e48d-4f7f-b18c-c502768229be', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed', 'floor_plan', '住宅户型基准', '文彬 128.66㎡ 住宅平面、承重墙与空间功能边界', '{"planId":{"type":"string","isIdentifier":true,"description":"方案唯一编号"},"grossAreaSqm":{"type":"number","unit":"㎡","description":"建筑面积 128.66"},"layoutType":{"type":"string","description":"三室两厅两卫双阳台 + 独立书房"},"budgetLimitCents":{"type":"number","unit":"分","description":"业主总预算上限 15 万元"},"styleDirection":{"type":"string","description":"暖白浅木日系日常办公与静心生活"}}'::jsonb, '{"source":"intake-spec"}'::jsonb)
ON CONFLICT (company_id, domain_id, key) DO UPDATE 
SET display_name = EXCLUDED.display_name, description = EXCLUDED.description, properties_schema = EXCLUDED.properties_schema;
INSERT INTO plugin_ontology_b62f8af3e9.ontology_node_types 
(id, company_id, domain_id, key, display_name, description, properties_schema, metadata)
VALUES ('74ca6ebc-832c-4583-8094-c9246eafed72', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed', 'room_zone', '功能空间分区', '主卧、独立书房、客餐厅、公卫干湿分离与生活阳台等特定区域', '{"zoneId":{"type":"string","isIdentifier":true,"description":"空间分区ID"},"name":{"type":"string","description":"空间名称"},"primaryActivity":{"type":"string","description":"核心生活方式（如独立专注办公、日常展示收纳）"},"areaSqm":{"type":"number","unit":"㎡","description":"分区面积"}}'::jsonb, '{"source":"intake-spec"}'::jsonb)
ON CONFLICT (company_id, domain_id, key) DO UPDATE 
SET display_name = EXCLUDED.display_name, description = EXCLUDED.description, properties_schema = EXCLUDED.properties_schema;
INSERT INTO plugin_ontology_b62f8af3e9.ontology_node_types 
(id, company_id, domain_id, key, display_name, description, properties_schema, metadata)
VALUES ('d06f757d-c768-46bc-9ffc-9947ac56ab41', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed', 'storage_cabinet', '定制收纳柜体', '毫米级展开定制收纳柜、藏露比例与机电插座点位规约', '{"cabinetId":{"type":"string","isIdentifier":true,"description":"柜体编号"},"zoneName":{"type":"string","description":"所在空间（餐边柜/书架/玄关柜）"},"dimensionMm":{"type":"string","description":"长x宽x高 (毫米)"},"openRatio":{"type":"string","description":"藏露比例（如 80% 隐藏 + 20% 开放）"}}'::jsonb, '{"source":"intake-spec"}'::jsonb)
ON CONFLICT (company_id, domain_id, key) DO UPDATE 
SET display_name = EXCLUDED.display_name, description = EXCLUDED.description, properties_schema = EXCLUDED.properties_schema;
INSERT INTO plugin_ontology_b62f8af3e9.ontology_node_types 
(id, company_id, domain_id, key, display_name, description, properties_schema, metadata)
VALUES ('b613a671-0bb1-4e55-bdf4-14bc69766ba1', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed', 'deliverable_asset', '双模态AI交付物', 'PDF 理性深化方案册与 HTML 感性 3D 交互孪生空间', '{"assetId":{"type":"string","isIdentifier":true,"description":"交付物唯一ID"},"type":{"type":"string","enum":["pdf_dossier","html_3d_studio"],"description":"交付载体"},"filename":{"type":"string","description":"交付文件名称"},"version":{"type":"string","description":"版本号 V01"},"status":{"type":"string","enum":["ready","under_review","approved"],"description":"验收状态"}}'::jsonb, '{"source":"intake-spec"}'::jsonb)
ON CONFLICT (company_id, domain_id, key) DO UPDATE 
SET display_name = EXCLUDED.display_name, description = EXCLUDED.description, properties_schema = EXCLUDED.properties_schema;
INSERT INTO plugin_ontology_b62f8af3e9.ontology_action_types
(id, company_id, domain_id, key, display_name, description, kind, api_contract, status)
VALUES ('516e0d85-9713-441a-b0ba-f7f98f2395ef', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820', 'create_broadcast_task', '创建企微触达任务', '针对特定标签客群发起合规批量消息与质检服务下发', 'create', '{"method":"POST","path":"/api/wecom/broadcasts"}'::jsonb, 'active')
ON CONFLICT (company_id, domain_id, key) DO UPDATE
SET display_name = EXCLUDED.display_name, description = EXCLUDED.description, api_contract = EXCLUDED.api_contract, status = 'active';
INSERT INTO plugin_ontology_b62f8af3e9.ontology_action_types
(id, company_id, domain_id, key, display_name, description, kind, api_contract, status)
VALUES ('c1919cab-c425-4307-8a93-f9b1fd555d0a', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', 'a541c1f0-16e2-4d55-84c7-714c8a518820', 'sync_wecom_customers', '同步企微外部联系人', '全量或增量拉取企微各营业厅客户数据流入私域中枢', 'sync', '{"method":"POST","path":"/api/wecom/sync-customers"}'::jsonb, 'active')
ON CONFLICT (company_id, domain_id, key) DO UPDATE
SET display_name = EXCLUDED.display_name, description = EXCLUDED.description, api_contract = EXCLUDED.api_contract, status = 'active';
INSERT INTO plugin_ontology_b62f8af3e9.ontology_action_types
(id, company_id, domain_id, key, display_name, description, kind, api_contract, status)
VALUES ('c2d08383-2c44-44c7-ac15-49b3a9f44895', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed', 'deepen_storage_cabinet', '深化全屋定制收纳', '依据 15 万总预算上限与生活方式，生成毫米级尺寸展开与插座规约', 'modify', '{"method":"POST","path":"/api/design/storage-deepening"}'::jsonb, 'active')
ON CONFLICT (company_id, domain_id, key) DO UPDATE
SET display_name = EXCLUDED.display_name, description = EXCLUDED.description, api_contract = EXCLUDED.api_contract, status = 'active';
INSERT INTO plugin_ontology_b62f8af3e9.ontology_action_types
(id, company_id, domain_id, key, display_name, description, kind, api_contract, status)
VALUES ('79d3931d-efe8-4d91-97d8-f902149eeb91', '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e', '8931cc0f-69dd-4678-9260-563ffea4feed', 'build_html_3d_studio', '生成3D设计孪生空间', '生成单文件免安装 WebGL2 交互孪生空间，支持日夜采光与风格微调', 'create', '{"method":"POST","path":"/api/design/html-preview"}'::jsonb, 'active')
ON CONFLICT (company_id, domain_id, key) DO UPDATE
SET display_name = EXCLUDED.display_name, description = EXCLUDED.description, api_contract = EXCLUDED.api_contract, status = 'active';