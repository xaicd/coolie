-- scripts/reset-prod-projects-data.sql
-- Atomically resets all inaccurate project data, issues, work products,
-- ontology domains, and event logs in Coolie Production (tc-coolie-claw).
-- Preserves admin user, company configuration, 6 digital employees, and plugins.

BEGIN;

-- 1. Decisions & Triage child tables
DELETE FROM decision_effect_executions;
DELETE FROM decision_triage_events;
DELETE FROM decision_triage;
DELETE FROM decision_queue_items;
DELETE FROM decision_queues;
DELETE FROM decision_retention;
DELETE FROM decision_training_examples;
DELETE FROM decision_target_issues;
DELETE FROM decisions;
DELETE FROM decision_bundles;

-- 2. Sessions, Activity, and Heartbeat tables
DELETE FROM agent_task_sessions;
DELETE FROM activity_log;
DELETE FROM cost_events;
DELETE FROM finance_events;
DELETE FROM native_run_finalizations;
DELETE FROM native_run_results;
DELETE FROM work_assessments;

DELETE FROM heartbeat_run_events;
DELETE FROM heartbeat_run_watchdog_decisions;
DELETE FROM heartbeat_runs;

-- 3. Issue-related child & dependent tables
DELETE FROM chat_github_reviews;
DELETE FROM chat_teams_file_transfers;
DELETE FROM chat_publications;
DELETE FROM chat_conversations;
DELETE FROM company_skill_test_runs;
DELETE FROM case_issue_links;
DELETE FROM pipeline_case_issue_links;
DELETE FROM pipeline_automation_executions;
DELETE FROM workspace_operations;
DELETE FROM tool_action_deliveries;
DELETE FROM issue_question_response_deliveries;
DELETE FROM connection_token_issuances;
DELETE FROM tool_mcp_gateways;
DELETE FROM tool_gateway_sessions;
DELETE FROM tool_call_events;
DELETE FROM tool_action_requests;
DELETE FROM tool_invocations;
DELETE FROM tool_runtime_slots;
DELETE FROM summary_slots;
DELETE FROM status_card_updates;
DELETE FROM status_cards;
DELETE FROM company_onboarding_seeds;
DELETE FROM company_secret_proposals;
DELETE FROM feedback_votes;
DELETE FROM secret_access_events;
DELETE FROM environment_leases;
DELETE FROM execution_workspace_runtime_leases;
DELETE FROM completion_contracts;
DELETE FROM status_decisions;
DELETE FROM status_decision_effects;
DELETE FROM board_conversations;
DELETE FROM routine_documents;
DELETE FROM routine_revisions;
DELETE FROM routine_runs;
DELETE FROM routine_triggers;
DELETE FROM routines;
DELETE FROM issue_work_products;
DELETE FROM document_annotation_comments;
DELETE FROM document_annotation_threads;
DELETE FROM issue_documents;
DELETE FROM issue_attachments;
DELETE FROM issue_comments;
DELETE FROM issue_thread_interactions;
DELETE FROM issue_approvals;
DELETE FROM issue_execution_decisions;
DELETE FROM issue_labels;
DELETE FROM issue_relations;
DELETE FROM issue_inbox_archives;
DELETE FROM issue_read_states;
DELETE FROM issue_recovery_actions;
DELETE FROM issue_watchdogs;
DELETE FROM issue_plan_decompositions;
DELETE FROM issue_tree_holds;
DELETE FROM issue_tree_hold_members;
DELETE FROM issue_reference_mentions;
DELETE FROM external_object_mentions;
DELETE FROM feedback_exports;
DELETE FROM issue_create_idempotency_keys;

-- 4. Delete all issues
DELETE FROM issues;

-- 5. Delete projects and project-related tables
DELETE FROM pipeline_case_documents;
DELETE FROM pipeline_case_events;
DELETE FROM pipeline_case_blockers;
DELETE FROM pipeline_cases;
DELETE FROM project_workspaces;
DELETE FROM project_memberships;
DELETE FROM project_goals;
DELETE FROM projects;

-- 6. Delete ontology objects, types, links from public schema
DELETE FROM ontology_links;
DELETE FROM ontology_properties;
DELETE FROM ontology_objects;
DELETE FROM ontology_types;
DELETE FROM ontology_functions;
DELETE FROM ontology_branches;

-- 7. Delete plugin ontology data in plugin_ontology_b62f8af3e9
DELETE FROM plugin_ontology_b62f8af3e9.ontology_edges;
DELETE FROM plugin_ontology_b62f8af3e9.ontology_nodes;
DELETE FROM plugin_ontology_b62f8af3e9.ontology_action_types;
DELETE FROM plugin_ontology_b62f8af3e9.ontology_resource_links;
DELETE FROM plugin_ontology_b62f8af3e9.ontology_proposals;
DELETE FROM plugin_ontology_b62f8af3e9.ontology_views;
DELETE FROM plugin_ontology_b62f8af3e9.ontology_domain_snapshots;
DELETE FROM plugin_ontology_b62f8af3e9.ontology_audit_logs;
DELETE FROM plugin_ontology_b62f8af3e9.ontology_transforms;
DELETE FROM plugin_ontology_b62f8af3e9.ontology_interfaces;
DELETE FROM plugin_ontology_b62f8af3e9.ontology_package_installs;
DELETE FROM plugin_ontology_b62f8af3e9.ontology_datasets;
DELETE FROM plugin_ontology_b62f8af3e9.ontology_connectors;
DELETE FROM plugin_ontology_b62f8af3e9.ontology_cognition_jobs;
DELETE FROM plugin_ontology_b62f8af3e9.ontology_business_systems;
DELETE FROM plugin_ontology_b62f8af3e9.ontology_sub_projects;
DELETE FROM plugin_ontology_b62f8af3e9.ontology_prompt_templates;
DELETE FROM plugin_ontology_b62f8af3e9.ontology_golden_datasets;
DELETE FROM plugin_ontology_b62f8af3e9.ontology_aip_logics;
DELETE FROM plugin_ontology_b62f8af3e9.ontology_evals;
DELETE FROM plugin_ontology_b62f8af3e9.ontology_simulation_scenarios;
DELETE FROM plugin_ontology_b62f8af3e9.ontology_umodel_telemetry;
DELETE FROM plugin_ontology_b62f8af3e9.ontology_umodel_links;
DELETE FROM plugin_ontology_b62f8af3e9.ontology_umodel_entities;
DELETE FROM plugin_ontology_b62f8af3e9.ontology_umodel_entity_sets;
DELETE FROM plugin_ontology_b62f8af3e9.ontology_capability_resolutions;
DELETE FROM plugin_ontology_b62f8af3e9.ontology_capability_gaps;
DELETE FROM plugin_ontology_b62f8af3e9.ontology_aide_messages;
DELETE FROM plugin_ontology_b62f8af3e9.ontology_aide_snapshots;
DELETE FROM plugin_ontology_b62f8af3e9.ontology_aide_sessions;
DELETE FROM plugin_ontology_b62f8af3e9.ontology_node_types;
DELETE FROM plugin_ontology_b62f8af3e9.ontology_relation_types;
DELETE FROM plugin_ontology_b62f8af3e9.ontology_domains;

-- 8. Reset company issue counter and budget spent
UPDATE companies
SET issue_counter = 0,
    spent_monthly_cents = 0
WHERE id = '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e';

-- 9. Reset agent states to idle
UPDATE agents
SET status = 'idle',
    spent_monthly_cents = 0
WHERE company_id = '4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e';

COMMIT;
