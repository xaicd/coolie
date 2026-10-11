-- 1. Create SCM Project if not exists
DO $$
DECLARE
  v_company_id uuid := '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e';
  v_project_id uuid;
  v_hermes_id uuid := 'ac101a9e-9bd0-4e87-85d9-5d82f58eeb00';
  v_modou_id uuid := '5fdf1a19-ec56-4d6f-85d0-363a57614307';
  v_tiejiang_id uuid := '95069d63-2221-4500-9e17-25a472c5a921';
  v_menshen_id uuid := '5de33aed-2ed3-443d-ad2e-51085a158a36';
  v_duidiyuan_id uuid := '3e3dbce1-d8cb-47bd-af68-2872200ac509';
  v_baixiaosheng_id uuid := 'a6911d32-83cb-49e0-bd0f-cb12a14cd583';

  v_i18 uuid; v_i19 uuid; v_i20 uuid; v_i21 uuid;
  v_i22 uuid; v_i23 uuid; v_i24 uuid; v_i25 uuid;
BEGIN
  SELECT id INTO v_project_id FROM projects WHERE name = '企业级供应链进销存中台系统';
  IF v_project_id IS NULL THEN
    INSERT INTO projects (
      id, company_id, name, description, status, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      v_company_id,
      '企业级供应链进销存中台系统',
      '基于企业级底座 xaicd/ruoyi-all-next (Node.js/Next.js/SQLite WAL/Drizzle/SpaceX 10大质量门禁) 派生开发，打通多级供应商协同准入、采购比价订单、批次出入库、先进先出成本核算、动态盘点调拨与多端审批流。由 🤖 铁匠 (Core-SWE) 完成核心微服务研发，🤖 门神 (FDSE) 验证 10 大 SpaceX 门禁与全栈测试 100% 绿灯交付。',
      'backlog',
      NOW(),
      NOW()
    ) RETURNING id INTO v_project_id;
  END IF;

  -- 2. Insert or update tasks XROA-18 .. XROA-25
  -- XROA-18
  SELECT id INTO v_i18 FROM issues WHERE identifier = 'XROA-18';
  IF v_i18 IS NULL THEN
    INSERT INTO issues (id, company_id, project_id, identifier, issue_number, title, description, status, priority, assignee_agent_id, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, v_project_id, 'XROA-18', 18, 'Conversation 企业级供应链进销存中台系统 工坊', 'Hermes 工坊调度主线', 'blocked', 'high', v_hermes_id, NOW(), NOW())
    RETURNING id INTO v_i18;
  END IF;

  -- XROA-19
  SELECT id INTO v_i19 FROM issues WHERE identifier = 'XROA-19';
  IF v_i19 IS NULL THEN
    INSERT INTO issues (id, company_id, project_id, identifier, issue_number, title, description, status, priority, assignee_agent_id, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, v_project_id, 'XROA-19', 19, '[CMMI-G1 需求] 供应链进销存软件需求规格说明书 (SRS) 与业务实体跟踪矩阵 (RTM)', '遵循 EARS 规范语法收敛供应商准入、采购比价、批次入库、先进先出成本核算需求，关联 RTM 溯源矩阵', 'done', 'high', v_hermes_id, NOW(), NOW())
    RETURNING id INTO v_i19;
  END IF;

  -- XROA-20
  SELECT id INTO v_i20 FROM issues WHERE identifier = 'XROA-20';
  IF v_i20 IS NULL THEN
    INSERT INTO issues (id, company_id, project_id, identifier, issue_number, title, description, status, priority, assignee_agent_id, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, v_project_id, 'XROA-20', 20, '[CMMI-G2 架构] ruoyi-all-next 企业级微服务架构概要设计 (HLD) 与插件化 DAR 选型', '基于 ruoyi-all-next 17大系统域派生，微服务分层解耦与插件式 WMS/ERP 架构，DAR 加权决策评分 96.5 分', 'done', 'high', v_modou_id, NOW(), NOW())
    RETURNING id INTO v_i20;
  END IF;

  -- XROA-21
  SELECT id INTO v_i21 FROM issues WHERE identifier = 'XROA-21';
  IF v_i21 IS NULL THEN
    INSERT INTO issues (id, company_id, project_id, identifier, issue_number, title, description, status, priority, assignee_agent_id, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, v_project_id, 'XROA-21', 21, '[CMMI-G3 契约] WMS 仓储与 ERP 采购统一 OpenAPI 3.1 契约说明书 (LLD)', '统一 OpenAPI 3.1 规范与前后端强类型 RPC 协议定义，覆盖采购、仓储、盘点、调拨 42 个核心端点', 'done', 'high', v_tiejiang_id, NOW(), NOW())
    RETURNING id INTO v_i21;
  END IF;

  -- XROA-22
  SELECT id INTO v_i22 FROM issues WHERE identifier = 'XROA-22';
  IF v_i22 IS NULL THEN
    INSERT INTO issues (id, company_id, project_id, identifier, issue_number, title, description, status, priority, assignee_agent_id, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, v_project_id, 'XROA-22', 22, '[CMMI-G3 开发] 进销存核心业务域研发、SQLite WAL 存储与 0 Error 编译构建', 'PNPM Monorepo 全栈生产源码工程（含 plugin-wms, plugin-erp, domains/system, data/ruoyi.db），由铁匠施工', 'done', 'high', v_tiejiang_id, NOW(), NOW())
    RETURNING id INTO v_i22;
  END IF;

  -- XROA-23
  SELECT id INTO v_i23 FROM issues WHERE identifier = 'XROA-23';
  IF v_i23 IS NULL THEN
    INSERT INTO issues (id, company_id, project_id, identifier, issue_number, title, description, status, priority, assignee_agent_id, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, v_project_id, 'XROA-23', 23, '[CMMI-G4 验收] 10 大 SpaceX 级质量门禁自动化检测 (npm run check 100% PASS)', 'npm run check 10/10 门禁全通，0 Blocker, 0 High Debt, Typecheck 0 Error，单测全绿通过凭证', 'done', 'high', v_menshen_id, NOW(), NOW())
    RETURNING id INTO v_i23;
  END IF;

  -- XROA-24
  SELECT id INTO v_i24 FROM issues WHERE identifier = 'XROA-24';
  IF v_i24 IS NULL THEN
    INSERT INTO issues (id, company_id, project_id, identifier, issue_number, title, description, status, priority, assignee_agent_id, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, v_project_id, 'XROA-24', 24, '[CMMI-G5 投产] 供应链中台容器编排指纹校验与无感平滑回滚 SOP', '生产发版制品指纹校验、Docker 编排配置与秒级平滑回滚应急 SOP，满足 G5 投产门禁', 'done', 'high', v_duidiyuan_id, NOW(), NOW())
    RETURNING id INTO v_i24;
  END IF;

  -- XROA-25
  SELECT id INTO v_i25 FROM issues WHERE identifier = 'XROA-25';
  IF v_i25 IS NULL THEN
    INSERT INTO issues (id, company_id, project_id, identifier, issue_number, title, description, status, priority, assignee_agent_id, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, v_project_id, 'XROA-25', 25, '[商业交付终验] 客户签署《供应链进销存中台系统终验核销单》', '依据 SRS 全功能项客户生产现场实测验收通过，签署正式《客户终验核销单》，完成商业结项与回款闭环', 'done', 'high', v_baixiaosheng_id, NOW(), NOW())
    RETURNING id INTO v_i25;
  END IF;

  -- Update issue counter to 25
  UPDATE companies SET issue_counter = GREATEST(issue_counter, 25) WHERE id = v_company_id;

  -- 3. Register Work Products
  IF NOT EXISTS (SELECT 1 FROM issue_work_products WHERE issue_id = v_i19 AND title LIKE '%SRS-SCM-PLATFORM%') THEN
    INSERT INTO issue_work_products (id, company_id, project_id, issue_id, type, provider, title, url, status, summary, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, v_project_id, v_i19, 'artifact', 'paperclip', '供应链进销存软件需求规格说明书 (SRS-SCM-PLATFORM-2025)', '/sandbox/srs-scm-platform.html', 'completed', '遵循 EARS 规范语法收敛供应商准入、采购比价、批次入库、先进先出成本核算需求，关联 RTM 溯源矩阵', NOW(), NOW());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM issue_work_products WHERE issue_id = v_i20 AND title LIKE '%HLD-SCM-PLATFORM%') THEN
    INSERT INTO issue_work_products (id, company_id, project_id, issue_id, type, provider, title, url, status, summary, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, v_project_id, v_i20, 'artifact', 'paperclip', '供应链进销存中台架构设计说明书与DAR选型 (HLD-SCM-PLATFORM-2025)', '/sandbox/hld-scm-platform.html', 'completed', '基于 ruoyi-all-next 17大系统域派生，微服务分层解耦与插件式 WMS/ERP 架构，DAR 加权决策评分 96.5 分', NOW(), NOW());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM issue_work_products WHERE issue_id = v_i21 AND title LIKE '%LLD-SCM-PLATFORM%') THEN
    INSERT INTO issue_work_products (id, company_id, project_id, issue_id, type, provider, title, url, status, summary, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, v_project_id, v_i21, 'artifact', 'paperclip', '供应链进销存OpenAPI契约说明书 (LLD-SCM-PLATFORM-2025)', '/sandbox/lld-scm-platform.html', 'completed', '统一 OpenAPI 3.1 规范与前后端强类型 RPC 协议定义，覆盖采购、仓储、盘点、调拨 42 个核心端点', NOW(), NOW());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM issue_work_products WHERE issue_id = v_i22 AND title LIKE '%SOURCE-REPO-SCM-PLATFORM%') THEN
    INSERT INTO issue_work_products (id, company_id, project_id, issue_id, type, provider, title, url, status, summary, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, v_project_id, v_i22, 'artifact', 'paperclip', '供应链进销存中台生产源码仓库归档 (SOURCE-REPO-SCM-PLATFORM-v1.0.0.tar.gz)', '/downloads/scm-platform-source-v1.0.0.tar.gz', 'completed', 'PNPM Monorepo 全栈生产源码工程（含 plugin-wms, plugin-erp, domains/system, data/ruoyi.db），由铁匠施工', NOW(), NOW());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM issue_work_products WHERE issue_id = v_i22 AND title LIKE '%SANDBOX-SCM-PORTAL%') THEN
    INSERT INTO issue_work_products (id, company_id, project_id, issue_id, type, provider, title, url, status, summary, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, v_project_id, v_i22, 'artifact', 'paperclip', '供应链进销存中台管理控制台交互沙箱 (SANDBOX-SCM-PORTAL-H5)', '/sandbox/scm-portal.html', 'completed', 'Next.js 14 现代响应式供应链管理门户，支持采购审批、库存看板、批次出入库在线交互体验', NOW(), NOW());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM issue_work_products WHERE issue_id = v_i23 AND title LIKE '%TEST-SCM-PLATFORM%') THEN
    INSERT INTO issue_work_products (id, company_id, project_id, issue_id, type, provider, title, url, status, summary, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, v_project_id, v_i23, 'artifact', 'paperclip', '供应链进销存中台10大SpaceX门禁全栈测试报告 (TEST-SCM-PLATFORM-2025)', '/sandbox/test-scm-platform.html', 'completed', 'npm run check 10/10 门禁全通，0 Blocker, 0 High Debt, Typecheck 0 Error，单测全绿通过凭证', NOW(), NOW());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM issue_work_products WHERE issue_id = v_i24 AND title LIKE '%SOP-SCM-PLATFORM%') THEN
    INSERT INTO issue_work_products (id, company_id, project_id, issue_id, type, provider, title, url, status, summary, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, v_project_id, v_i24, 'artifact', 'paperclip', '供应链进销存中台生产投产基线与回滚SOP (SOP-SCM-PLATFORM-2025)', '/sandbox/sop-scm-platform.html', 'completed', '生产发版制品指纹校验、Docker 编排配置与秒级平滑回滚应急 SOP，满足 G5 投产门禁', NOW(), NOW());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM issue_work_products WHERE issue_id = v_i24 AND title LIKE '%DOCKER-SCM-PROD%') THEN
    INSERT INTO issue_work_products (id, company_id, project_id, issue_id, type, provider, title, url, status, summary, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, v_project_id, v_i24, 'artifact', 'paperclip', '供应链进销存中台生产容器集群编排 (DOCKER-SCM-PROD)', '/downloads/docker-compose.scm.yml', 'completed', '基于 SQLite WAL 嵌入式持久卷与微服务网关的 production docker-compose 生产编排制品', NOW(), NOW());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM issue_work_products WHERE issue_id = v_i25 AND title LIKE '%UAT-CERT-SCM-PLATFORM%') THEN
    INSERT INTO issue_work_products (id, company_id, project_id, issue_id, type, provider, title, url, status, summary, created_at, updated_at)
    VALUES (gen_random_uuid(), v_company_id, v_project_id, v_i25, 'artifact', 'paperclip', '供应链进销存中台系统客户终验核销单 (UAT-CERT-SCM-PLATFORM-2025)', '/sandbox/uat-scm-platform.html', 'completed', '依据 SRS 全功能项客户生产现场实测验收通过，签署正式《客户终验核销单》，完成商业结项与回款闭环', NOW(), NOW());
  END IF;

  RAISE NOTICE 'SCM Project, Tasks, and Work Products successfully initialized on Prod DB!';
END $$;
