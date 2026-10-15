-- 注册 residential-plan-service 核心软件工程资产 (代码、CMMI 01~09 文档、Spec 规格)
-- 严格落实 CMMI 5 "No Artifact, No Done" 与 AI 软件工厂最高工程法典

BEGIN;

DO $$
DECLARE
    v_company_id UUID := '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e';
    v_project_id UUID := 'cf640498-664b-403c-9d06-76a75e4fe052';
    v_lead_agent_id UUID;
    v_g0_issue_id UUID := gen_random_uuid();
    v_g1_issue_id UUID;
    v_g2_issue_id UUID := gen_random_uuid();
    v_g3_issue_id UUID := gen_random_uuid();
    v_g4_issue_id UUID := gen_random_uuid();
    v_g5_issue_id UUID := gen_random_uuid();
    v_sdd_issue_id UUID := gen_random_uuid();
    v_src_issue_id UUID := gen_random_uuid();
BEGIN
    -- 获取公司 Lead Agent
    SELECT id INTO v_lead_agent_id FROM agents WHERE company_id = v_company_id LIMIT 1;

    -- 检查或复用现有 G1 issue
    SELECT id INTO v_g1_issue_id FROM issues 
    WHERE project_id = v_project_id AND title LIKE '%[G1·需求]%' LIMIT 1;
    
    IF v_g1_issue_id IS NULL THEN
        v_g1_issue_id := gen_random_uuid();
        INSERT INTO issues (id, company_id, project_id, identifier, issue_number, title, description, status, priority, created_at, updated_at)
        VALUES (v_g1_issue_id, v_company_id, v_project_id, 'XROA-152', 152, '[G1·需求] EARS 软件需求规格说明书 (SRS + RTM)', 'CMMI G1 需求门禁：采用 EARS 语法标准化收敛用户故事、固化双向需求跟踪矩阵 (RTM)。', 'done', 'critical', now(), now());
    ELSE
        UPDATE issues SET status = 'done', updated_at = now() WHERE id = v_g1_issue_id;
    END IF;

    -- 插入 G0 策划与立项工单
    INSERT INTO issues (id, company_id, project_id, identifier, issue_number, title, description, status, priority, created_at, updated_at)
    VALUES (v_g0_issue_id, v_company_id, v_project_id, 'XROA-153', 153, '[G0·立项] 项目立项书与技术选型决议 (Charter + DAR)', 'CMMI G0 策划门禁：确立业务范围、RACI 权责矩阵与 3D 渲染引擎 DAR 加权决策分析。', 'done', 'high', now(), now())
    ON CONFLICT (id) DO NOTHING;

    -- 插入 G2 总体架构工单
    INSERT INTO issues (id, company_id, project_id, identifier, issue_number, title, description, status, priority, created_at, updated_at)
    VALUES (v_g2_issue_id, v_company_id, v_project_id, 'XROA-154', 154, '[G2·架构] 总体架构设计说明书 (HLD) 与 Archify 拓扑', 'CMMI G2 架构门禁：确立微服务分层拓扑、多模型网关缓存策略与 Archify 可视化架构模型。', 'done', 'critical', now(), now())
    ON CONFLICT (id) DO NOTHING;

    -- 插入 G3 接口契约工单
    INSERT INTO issues (id, company_id, project_id, identifier, issue_number, title, description, status, priority, created_at, updated_at)
    VALUES (v_g3_issue_id, v_company_id, v_project_id, 'XROA-155', 155, '[G3·契约] 详细设计说明书 (LLD) 与 OpenAPI 3.0 契约', 'CMMI G3 契约门禁：固化 28 项 RESTful 接口、62 项设计控制参数与 MCP 工具池定义。', 'done', 'critical', now(), now())
    ON CONFLICT (id) DO NOTHING;

    -- 插入 G4 全栈验证工单
    INSERT INTO issues (id, company_id, project_id, identifier, issue_number, title, description, status, priority, created_at, updated_at)
    VALUES (v_g4_issue_id, v_company_id, v_project_id, 'XROA-156', 156, '[G4·验收] 14项 SpaceX 自动化打假门禁全栈测试报告', 'CMMI G4 验证门禁：14项自动化门禁 100% 退出码一致且 0 假绿，断言几何坐标 0 NaN 与零越界。', 'done', 'critical', now(), now())
    ON CONFLICT (id) DO NOTHING;

    -- 插入 G5 生产投产工单
    INSERT INTO issues (id, company_id, project_id, identifier, issue_number, title, description, status, priority, created_at, updated_at)
    VALUES (v_g5_issue_id, v_company_id, v_project_id, 'XROA-157', 157, '[G5·投产] 生产环境不可变部署与秒级回滚预案 (SOP)', 'CMMI G5 投产门禁：systemd residential-delivery 单元管理、逐文件 MD5 验真与反向代理健康拨测。', 'done', 'critical', now(), now())
    ON CONFLICT (id) DO NOTHING;

    -- 插入 SDD 敏捷特性包工单
    INSERT INTO issues (id, company_id, project_id, identifier, issue_number, title, description, status, priority, created_at, updated_at)
    VALUES (v_sdd_issue_id, v_company_id, v_project_id, 'XROA-158', 158, '[SDD·规格] 空间求解、WebGL 3D漫游与提案册生成敏捷特性包', 'Spec-Ops SDD 敏捷规格：空间几何拓扑、自包含 3D 渲染、9页提案册生成与网关缓存四大全息包。', 'done', 'high', now(), now())
    ON CONFLICT (id) DO NOTHING;

    -- 插入微服务源码工单
    INSERT INTO issues (id, company_id, project_id, identifier, issue_number, title, description, status, priority, created_at, updated_at)
    VALUES (v_src_issue_id, v_company_id, v_project_id, 'XROA-159', 159, '[源码] residential-plan-service 核心微服务源码仓库与 Dockerfile', '微服务工程真资产：Express/Node 核心服务、Three.js 渲染管网、MCP CLI 与生产不可变容器编排。', 'done', 'critical', now(), now())
    ON CONFLICT (id) DO NOTHING;

    -- 先清理该项目中历史可能存在的同名工程工件，避免重复
    DELETE FROM issue_work_products 
    WHERE project_id = v_project_id 
      AND title LIKE '[%' 
      AND title NOT LIKE '[空间交付]%';

    -- 1. 注册核心源码与容器资产
    INSERT INTO issue_work_products (company_id, project_id, issue_id, type, provider, title, status, review_state, is_primary, is_latest, summary, metadata, created_at, updated_at)
    VALUES 
    (v_company_id, v_project_id, v_src_issue_id, 'artifact', 'paperclip',
     '[源码] residential-plan-service 核心微服务入口 (src/server.js)', 'completed', 'approved', true, true,
     '微服务工程核心入口：基于 Node.js/Express，承载 28 个 REST 端点、静态资源路由、求解引擎调度与智算缓存。',
     jsonb_build_object('contentType', 'application/javascript', 'openPath', 'src/server.js', 'resourceRef', jsonb_build_object('kind', 'workspace_file', 'relativePath', 'src/server.js', 'displayPath', 'src/server.js')), now(), now()),

    (v_company_id, v_project_id, v_src_issue_id, 'artifact', 'paperclip',
     '[源码] 核心算法求解与三维场景渲染流水线 (src/renderers/three-scene.js)', 'completed', 'approved', true, true,
     'WebGL 3D 场景与矢量图纸渲染引擎：Three.js 离线打包、房间网格生成、漫游摄像机控制与剖切着色器。',
     jsonb_build_object('contentType', 'application/javascript', 'openPath', 'src/renderers/three-scene.js', 'resourceRef', jsonb_build_object('kind', 'workspace_file', 'relativePath', 'src/renderers/three-scene.js', 'displayPath', 'src/renderers/three-scene.js')), now(), now()),

    (v_company_id, v_project_id, v_src_issue_id, 'artifact', 'paperclip',
     '[容器编排] 生产不可变容器 Dockerfile 与 docker-compose', 'completed', 'approved', true, true,
     '生产级不可变容器构建与编排定义：多阶段构建、依赖缓存固化与端口映射配置。',
     jsonb_build_object('contentType', 'text/plain', 'openPath', 'Dockerfile', 'resourceRef', jsonb_build_object('kind', 'workspace_file', 'relativePath', 'Dockerfile', 'displayPath', 'Dockerfile')), now(), now()),

    (v_company_id, v_project_id, v_src_issue_id, 'artifact', 'paperclip',
     '[工程配置] package.json 依赖清单与 22 项 npm 脚本', 'completed', 'approved', true, true,
     '工程依赖与运行脚本清单：Express、Three.js、Archify、14 项自动化测试套件与生产守护入口。',
     jsonb_build_object('contentType', 'application/json', 'openPath', 'package.json', 'resourceRef', jsonb_build_object('kind', 'workspace_file', 'relativePath', 'package.json', 'displayPath', 'package.json')), now(), now());

    -- 2. 注册 CMMI 01~09 过程资产
    INSERT INTO issue_work_products (company_id, project_id, issue_id, type, provider, title, status, review_state, is_primary, is_latest, summary, metadata, created_at, updated_at)
    VALUES 
    (v_company_id, v_project_id, v_g0_issue_id, 'artifact', 'paperclip',
     '[G0·立项] 项目立项书与权责章程 (docs/01_management/project-charter.md)', 'completed', 'approved', true, true,
     'CMMI 01 管理基线：项目立项背景、商业目标、交付范围定义与 RACI 权责矩阵。',
     jsonb_build_object('cmmiPhase', '01_management', 'wbsCode', '1.1', 'contentType', 'text/markdown', 'openPath', 'docs/01_management/project-charter.md', 'resourceRef', jsonb_build_object('kind', 'workspace_file', 'relativePath', 'docs/01_management/project-charter.md', 'displayPath', 'docs/01_management/project-charter.md')), now(), now()),

    (v_company_id, v_project_id, v_g0_issue_id, 'artifact', 'paperclip',
     '[G0·选型] 空间规划与渲染引擎技术选型 DAR 加权矩阵 (docs/01_management/dar-residential-plan-engine.md)', 'completed', 'approved', true, true,
     'CMMI 01 决策分析：对比 Heuristic-Core、Python CadQuery 与纯生图 3 大技术方案的加权权衡报告。',
     jsonb_build_object('cmmiPhase', '01_management', 'wbsCode', '1.2', 'contentType', 'text/markdown', 'openPath', 'docs/01_management/dar-residential-plan-engine.md', 'resourceRef', jsonb_build_object('kind', 'workspace_file', 'relativePath', 'docs/01_management/dar-residential-plan-engine.md', 'displayPath', 'docs/01_management/dar-residential-plan-engine.md')), now(), now()),

    (v_company_id, v_project_id, v_g1_issue_id, 'artifact', 'paperclip',
     '[G1·需求] IEEE 29148 / EARS 软件需求规格说明书 (docs/02_requirements/software-requirements-srs.md)', 'completed', 'approved', true, true,
     'CMMI 02 需求基线：涵盖 4 大 EARS 需求语法、62 项控制参数与 9 大产物规格标准的严谨规格说明书。',
     jsonb_build_object('cmmiPhase', '02_requirements', 'wbsCode', '2.1', 'contentType', 'text/markdown', 'openPath', 'docs/02_requirements/software-requirements-srs.md', 'resourceRef', jsonb_build_object('kind', 'workspace_file', 'relativePath', 'docs/02_requirements/software-requirements-srs.md', 'displayPath', 'docs/02_requirements/software-requirements-srs.md')), now(), now()),

    (v_company_id, v_project_id, v_g1_issue_id, 'artifact', 'paperclip',
     '[G1·追踪] 双向需求跟踪矩阵 RTM (docs/02_requirements/rtm-traceability-matrix.md)', 'completed', 'approved', true, true,
     'CMMI 02 跟踪矩阵：全景追溯业务需求 ⟷ 代码实现 ⟷ 自动化门禁 ⟷ 交付产物，达成 100% 覆盖与 0 孤儿需求。',
     jsonb_build_object('cmmiPhase', '02_requirements', 'wbsCode', '2.2', 'contentType', 'text/markdown', 'openPath', 'docs/02_requirements/rtm-traceability-matrix.md', 'resourceRef', jsonb_build_object('kind', 'workspace_file', 'relativePath', 'docs/02_requirements/rtm-traceability-matrix.md', 'displayPath', 'docs/02_requirements/rtm-traceability-matrix.md')), now(), now()),

    (v_company_id, v_project_id, v_g2_issue_id, 'artifact', 'paperclip',
     '[G2·架构] 系统总体架构设计说明书 HLD (docs/03_design/architecture-design-hld.md)', 'completed', 'approved', true, true,
     'CMMI 03 架构设计：分层管道架构、协议适配、模型网关缓存、空间几何求解与多媒体渲染流水线。',
     jsonb_build_object('cmmiPhase', '03_design', 'wbsCode', '3.1', 'contentType', 'text/markdown', 'openPath', 'docs/03_design/architecture-design-hld.md', 'resourceRef', jsonb_build_object('kind', 'workspace_file', 'relativePath', 'docs/03_design/architecture-design-hld.md', 'displayPath', 'docs/03_design/architecture-design-hld.md')), now(), now()),

    (v_company_id, v_project_id, v_g2_issue_id, 'artifact', 'paperclip',
     '[G2·拓扑] 总体系统架构交互图 (docs/diagrams/system-architecture.arch.html)', 'completed', 'approved', true, true,
     'Archify 标准交互架构图：可视化展现客户端、反向代理、Node 微服务、存储卷与渲染流水线交互。',
     jsonb_build_object('cmmiPhase', '03_design', 'wbsCode', '3.2', 'contentType', 'text/html', 'openPath', 'docs/diagrams/system-architecture.arch.html', 'resourceRef', jsonb_build_object('kind', 'workspace_file', 'relativePath', 'docs/diagrams/system-architecture.arch.html', 'displayPath', 'docs/diagrams/system-architecture.arch.html')), now(), now()),

    (v_company_id, v_project_id, v_g3_issue_id, 'artifact', 'paperclip',
     '[G3·契约] OpenAPI 3.0 接口契约与详细设计说明书 (docs/03_design/interface-contracts-lld.md)', 'completed', 'approved', true, true,
     'CMMI 03 详细设计：28 项 RESTful 接口契约、62 项控制入参字典与 5 大工程图纸数据结构。',
     jsonb_build_object('cmmiPhase', '03_design', 'wbsCode', '3.3', 'contentType', 'text/markdown', 'openPath', 'docs/03_design/interface-contracts-lld.md', 'resourceRef', jsonb_build_object('kind', 'workspace_file', 'relativePath', 'docs/03_design/interface-contracts-lld.md', 'displayPath', 'docs/03_design/interface-contracts-lld.md')), now(), now()),

    (v_company_id, v_project_id, v_g3_issue_id, 'artifact', 'paperclip',
     '[G3·网关] 多模型网关智算缓存交互架构图 (docs/diagrams/model-gateway-caching.arch.html)', 'completed', 'approved', true, true,
     'Archify 标准交互模型：展示多模型动态路由器、SHA-256 输入指纹提取、L1/L2 二级缓存与命中链路。',
     jsonb_build_object('cmmiPhase', '03_design', 'wbsCode', '3.4', 'contentType', 'text/html', 'openPath', 'docs/diagrams/model-gateway-caching.arch.html', 'resourceRef', jsonb_build_object('kind', 'workspace_file', 'relativePath', 'docs/diagrams/model-gateway-caching.arch.html', 'displayPath', 'docs/diagrams/model-gateway-caching.arch.html')), now(), now()),

    (v_company_id, v_project_id, v_g3_issue_id, 'artifact', 'paperclip',
     '[G3·协议] Model Context Protocol (MCP) 工具契约规约 (docs/04_contracts/mcp-protocol-spec.md)', 'completed', 'approved', true, true,
     'CMMI 04 接口契约：标准化定义 5 大 MCP 空间工具集输入输出 JSON-Schema 规范。',
     jsonb_build_object('cmmiPhase', '03_design', 'wbsCode', '3.5', 'contentType', 'text/markdown', 'openPath', 'docs/04_contracts/mcp-protocol-spec.md', 'resourceRef', jsonb_build_object('kind', 'workspace_file', 'relativePath', 'docs/04_contracts/mcp-protocol-spec.md', 'displayPath', 'docs/04_contracts/mcp-protocol-spec.md')), now(), now()),

    (v_company_id, v_project_id, v_g4_issue_id, 'artifact', 'paperclip',
     '[G4·验收] 14项 SpaceX 自动化打假门禁全栈测试报告 (docs/05_verification/test-summary-report-ver-val.md)', 'completed', 'approved', true, true,
     'CMMI 05 全栈验收：记录 14 项自动化套件执行实绩、几何坐标 0 NaN、参数 62 项全映射与 0 假绿验证。',
     jsonb_build_object('cmmiPhase', '05_verification', 'wbsCode', '5.1', 'contentType', 'text/markdown', 'openPath', 'docs/05_verification/test-summary-report-ver-val.md', 'resourceRef', jsonb_build_object('kind', 'workspace_file', 'relativePath', 'docs/05_verification/test-summary-report-ver-val.md', 'displayPath', 'docs/05_verification/test-summary-report-ver-val.md')), now(), now()),

    (v_company_id, v_project_id, v_g4_issue_id, 'artifact', 'paperclip',
     '[G4·审计] 物理/功能配置审计与 CAR 缺陷预防报告 (docs/06_quality_assurance/pca-fca-audit-and-car.md)', 'completed', 'approved', true, true,
     'CMMI 06 质量控制：PCA/FCA 双重审计结论、逐文件 MD5 验真与历史灯位碰撞缺陷 5-Whys 根因治理。',
     jsonb_build_object('cmmiPhase', '06_quality_assurance', 'wbsCode', '6.1', 'contentType', 'text/markdown', 'openPath', 'docs/06_quality_assurance/pca-fca-audit-and-car.md', 'resourceRef', jsonb_build_object('kind', 'workspace_file', 'relativePath', 'docs/06_quality_assurance/pca-fca-audit-and-car.md', 'displayPath', 'docs/06_quality_assurance/pca-fca-audit-and-car.md')), now(), now()),

    (v_company_id, v_project_id, v_g5_issue_id, 'artifact', 'paperclip',
     '[G5·投产] 生产环境不可变部署与秒级回滚预案 (docs/07_release/system-deployment-sop.md)', 'completed', 'approved', true, true,
     'CMMI 07 生产投产：systemd 单元管理、逐文件 MD5 验真、反向代理与 3 秒极速回滚操作预案。',
     jsonb_build_object('cmmiPhase', '07_release', 'wbsCode', '7.1', 'contentType', 'text/markdown', 'openPath', 'docs/07_release/system-deployment-sop.md', 'resourceRef', jsonb_build_object('kind', 'workspace_file', 'relativePath', 'docs/07_release/system-deployment-sop.md', 'displayPath', 'docs/07_release/system-deployment-sop.md')), now(), now()),

    (v_company_id, v_project_id, v_g5_issue_id, 'artifact', 'paperclip',
     '[G6·SRE] 服务等级目标与稳定性保障矩阵 (docs/08_sre/slo-sli-error-budget.md)', 'completed', 'approved', true, true,
     'CMMI 08 可靠性保障：99.9% 可用性、P95 <1500ms 延迟、错误预算燃烧率与健康探针。',
     jsonb_build_object('cmmiPhase', '08_sre', 'wbsCode', '8.1', 'contentType', 'text/markdown', 'openPath', 'docs/08_sre/slo-sli-error-budget.md', 'resourceRef', jsonb_build_object('kind', 'workspace_file', 'relativePath', 'docs/08_sre/slo-sli-error-budget.md', 'displayPath', 'docs/08_sre/slo-sli-error-budget.md')), now(), now()),

    (v_company_id, v_project_id, v_g5_issue_id, 'artifact', 'paperclip',
     '[G7·运营] 持续运营与多租户对账平账规约 (docs/09_operations/operations-reconciliation.md)', 'completed', 'approved', true, true,
     'CMMI 09 商业运营：存储卷水位管控、计费对账轧差平账与租户治理台账。',
     jsonb_build_object('cmmiPhase', '09_operations', 'wbsCode', '9.1', 'contentType', 'text/markdown', 'openPath', 'docs/09_operations/operations-reconciliation.md', 'resourceRef', jsonb_build_object('kind', 'workspace_file', 'relativePath', 'docs/09_operations/operations-reconciliation.md', 'displayPath', 'docs/09_operations/operations-reconciliation.md')), now(), now());

    -- 3. 注册 Spec-Ops 敏捷特性包
    INSERT INTO issue_work_products (company_id, project_id, issue_id, type, provider, title, status, review_state, is_primary, is_latest, summary, metadata, created_at, updated_at)
    VALUES 
    (v_company_id, v_project_id, v_sdd_issue_id, 'artifact', 'paperclip',
     '[Spec·空间] 户型几何拓扑与动线求解特性规格 (docs/specs/spatial-layout-solver/spec.md)', 'completed', 'approved', true, true,
     'Spec-Ops 空间求解特性包：毫米级多边形切分、动线人体工学避障与收纳柜体布局算法。',
     jsonb_build_object('cmmiPhase', 'specs', 'contentType', 'text/markdown', 'openPath', 'docs/specs/spatial-layout-solver/spec.md', 'resourceRef', jsonb_build_object('kind', 'workspace_file', 'relativePath', 'docs/specs/spatial-layout-solver/spec.md', 'displayPath', 'docs/specs/spatial-layout-solver/spec.md')), now(), now()),

    (v_company_id, v_project_id, v_sdd_issue_id, 'artifact', 'paperclip',
     '[Spec·3D] 自包含零依赖 WebGL 3D 空间漫游特性规格 (docs/specs/webgl-3d-scene-renderer/spec.md)', 'completed', 'approved', true, true,
     'Spec-Ops WebGL 特性包：Three.js 单文件离线打包、全屋巡游、剖切昼夜渲染与零外部 CDN 保证。',
     jsonb_build_object('cmmiPhase', 'specs', 'contentType', 'text/markdown', 'openPath', 'docs/specs/webgl-3d-scene-renderer/spec.md', 'resourceRef', jsonb_build_object('kind', 'workspace_file', 'relativePath', 'docs/specs/webgl-3d-scene-renderer/spec.md', 'displayPath', 'docs/specs/webgl-3d-scene-renderer/spec.md')), now(), now()),

    (v_company_id, v_project_id, v_sdd_issue_id, 'artifact', 'paperclip',
     '[Spec·提案] 9页出版级住宅方案演示文稿与矢量 PDF 规格 (docs/specs/proposal-deck-pdf-generator/spec.md)', 'completed', 'approved', true, true,
     'Spec-Ops 提案册特性包：16:9 出版级排版、9大标准化编排、收纳容量换算与下一步确认清单。',
     jsonb_build_object('cmmiPhase', 'specs', 'contentType', 'text/markdown', 'openPath', 'docs/specs/proposal-deck-pdf-generator/spec.md', 'resourceRef', jsonb_build_object('kind', 'workspace_file', 'relativePath', 'docs/specs/proposal-deck-pdf-generator/spec.md', 'displayPath', 'docs/specs/proposal-deck-pdf-generator/spec.md')), now(), now()),

    (v_company_id, v_project_id, v_sdd_issue_id, 'artifact', 'paperclip',
     '[Spec·网关] 多模型智能网关与冷热多级智算缓存规格 (docs/specs/model-gateway-caching/spec.md)', 'completed', 'approved', true, true,
     'Spec-Ops 网关特性包：多模型路由、SHA-256 请求指纹提取与 L1/L2 二级缓存调度。',
     jsonb_build_object('cmmiPhase', 'specs', 'contentType', 'text/markdown', 'openPath', 'docs/specs/model-gateway-caching/spec.md', 'resourceRef', jsonb_build_object('kind', 'workspace_file', 'relativePath', 'docs/specs/model-gateway-caching/spec.md', 'displayPath', 'docs/specs/model-gateway-caching/spec.md')), now(), now());

END $$;

COMMIT;
