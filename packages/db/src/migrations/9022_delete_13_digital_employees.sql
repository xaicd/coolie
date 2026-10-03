-- Coolie fork — wave258: 删 13 数字员工 (老板原话 "不要 13 员工").
--
-- 13 数字员工 = 6 QA (wave217, QA-Test-Workshop) + 7 Ops (wave220, Coolie-Ops-Control-Room),
-- 散在 2 个测试公司名下. 老板原话 "不要 13 员工" — 派活精度从 5 角色降到 13 数字员工反而是噪声.
--
-- 这次直接按 name 删 (跨公司, 因为名字唯一). 不依赖 company name, 不影响 QA-Test-Workshop /
-- Coolie-Ops-Control-Room 这 2 个公司本身 — 公司保留, 员工删.
--
-- 先解除外键依赖 (activity_log, issues, heartbeat 等), 避免外键约束中断 migration.

UPDATE "heartbeat_runs"
SET "wakeup_request_id" = NULL
WHERE "wakeup_request_id" IN (
  SELECT id FROM "agent_wakeup_requests"
  WHERE "agent_id" IN (
    SELECT id FROM "agents"
    WHERE "name" IN (
      'QA Lead', 'Mobile Tester', 'iOS Tester', 'Web Tester', 'Performance Tester', 'Accessibility Tester',
      'Ops Lead', 'Mobile Ops', 'iOS Ops', 'Web Ops', 'Server Ops', 'Build Ops', 'Release Ops'
    )
  )
);

DELETE FROM "agent_wakeup_requests"
WHERE "agent_id" IN (
  SELECT id FROM "agents"
  WHERE "name" IN (
    'QA Lead', 'Mobile Tester', 'iOS Tester', 'Web Tester', 'Performance Tester', 'Accessibility Tester',
    'Ops Lead', 'Mobile Ops', 'iOS Ops', 'Web Ops', 'Server Ops', 'Build Ops', 'Release Ops'
  )
);

DELETE FROM "agent_api_keys"
WHERE "agent_id" IN (
  SELECT id FROM "agents"
  WHERE "name" IN (
    'QA Lead', 'Mobile Tester', 'iOS Tester', 'Web Tester', 'Performance Tester', 'Accessibility Tester',
    'Ops Lead', 'Mobile Ops', 'iOS Ops', 'Web Ops', 'Server Ops', 'Build Ops', 'Release Ops'
  )
);

UPDATE "agents"
SET "reports_to" = NULL
WHERE "reports_to" IN (
  SELECT id FROM "agents"
  WHERE "name" IN (
    'QA Lead', 'Mobile Tester', 'iOS Tester', 'Web Tester', 'Performance Tester', 'Accessibility Tester',
    'Ops Lead', 'Mobile Ops', 'iOS Ops', 'Web Ops', 'Server Ops', 'Build Ops', 'Release Ops'
  )
);

UPDATE "goals"
SET "owner_agent_id" = NULL
WHERE "owner_agent_id" IN (
  SELECT id FROM "agents"
  WHERE "name" IN (
    'QA Lead', 'Mobile Tester', 'iOS Tester', 'Web Tester', 'Performance Tester', 'Accessibility Tester',
    'Ops Lead', 'Mobile Ops', 'iOS Ops', 'Web Ops', 'Server Ops', 'Build Ops', 'Release Ops'
  )
);

UPDATE "activity_log"
SET "agent_id" = NULL,
    "run_id" = NULL
WHERE "agent_id" IN (
  SELECT id FROM "agents"
  WHERE "name" IN (
    'QA Lead', 'Mobile Tester', 'iOS Tester', 'Web Tester', 'Performance Tester', 'Accessibility Tester',
    'Ops Lead', 'Mobile Ops', 'iOS Ops', 'Web Ops', 'Server Ops', 'Build Ops', 'Release Ops'
  )
) OR "run_id" IN (
  SELECT id FROM "heartbeat_runs"
  WHERE "agent_id" IN (
    SELECT id FROM "agents"
    WHERE "name" IN (
      'QA Lead', 'Mobile Tester', 'iOS Tester', 'Web Tester', 'Performance Tester', 'Accessibility Tester',
      'Ops Lead', 'Mobile Ops', 'iOS Ops', 'Web Ops', 'Server Ops', 'Build Ops', 'Release Ops'
    )
  )
);

UPDATE "finance_events"
SET "agent_id" = NULL,
    "heartbeat_run_id" = NULL
WHERE "agent_id" IN (
  SELECT id FROM "agents"
  WHERE "name" IN (
    'QA Lead', 'Mobile Tester', 'iOS Tester', 'Web Tester', 'Performance Tester', 'Accessibility Tester',
    'Ops Lead', 'Mobile Ops', 'iOS Ops', 'Web Ops', 'Server Ops', 'Build Ops', 'Release Ops'
  )
) OR "heartbeat_run_id" IN (
  SELECT id FROM "heartbeat_runs"
  WHERE "agent_id" IN (
    SELECT id FROM "agents"
    WHERE "name" IN (
      'QA Lead', 'Mobile Tester', 'iOS Tester', 'Web Tester', 'Performance Tester', 'Accessibility Tester',
      'Ops Lead', 'Mobile Ops', 'iOS Ops', 'Web Ops', 'Server Ops', 'Build Ops', 'Release Ops'
    )
  )
);

UPDATE "decision_queues"
SET "created_by_agent_id" = NULL,
    "created_by_run_id" = NULL
WHERE "created_by_agent_id" IN (
  SELECT id FROM "agents" WHERE "name" IN (
    'QA Lead', 'Mobile Tester', 'iOS Tester', 'Web Tester', 'Performance Tester', 'Accessibility Tester',
    'Ops Lead', 'Mobile Ops', 'iOS Ops', 'Web Ops', 'Server Ops', 'Build Ops', 'Release Ops'
  )
) OR "created_by_run_id" IN (
  SELECT id FROM "heartbeat_runs" WHERE "agent_id" IN (
    SELECT id FROM "agents" WHERE "name" IN (
      'QA Lead', 'Mobile Tester', 'iOS Tester', 'Web Tester', 'Performance Tester', 'Accessibility Tester',
      'Ops Lead', 'Mobile Ops', 'iOS Ops', 'Web Ops', 'Server Ops', 'Build Ops', 'Release Ops'
    )
  )
);

DELETE FROM "decisions"
WHERE "origin_agent_id" IN (
  SELECT id FROM "agents" WHERE "name" IN (
    'QA Lead', 'Mobile Tester', 'iOS Tester', 'Web Tester', 'Performance Tester', 'Accessibility Tester',
    'Ops Lead', 'Mobile Ops', 'iOS Ops', 'Web Ops', 'Server Ops', 'Build Ops', 'Release Ops'
  )
) OR "origin_run_id" IN (
  SELECT id FROM "heartbeat_runs" WHERE "agent_id" IN (
    SELECT id FROM "agents" WHERE "name" IN (
      'QA Lead', 'Mobile Tester', 'iOS Tester', 'Web Tester', 'Performance Tester', 'Accessibility Tester',
      'Ops Lead', 'Mobile Ops', 'iOS Ops', 'Web Ops', 'Server Ops', 'Build Ops', 'Release Ops'
    )
  )
);

DELETE FROM "approvals"
WHERE "requested_by_agent_id" IN (
  SELECT id FROM "agents" WHERE "name" IN (
    'QA Lead', 'Mobile Tester', 'iOS Tester', 'Web Tester', 'Performance Tester', 'Accessibility Tester',
    'Ops Lead', 'Mobile Ops', 'iOS Ops', 'Web Ops', 'Server Ops', 'Build Ops', 'Release Ops'
  )
);

UPDATE "issues"
SET "assignee_agent_id" = NULL,
    "created_by_agent_id" = NULL,
    "conversation_agent_id" = NULL,
    "checkout_run_id" = NULL,
    "execution_run_id" = NULL
WHERE "assignee_agent_id" IN (
  SELECT id FROM "agents" WHERE "name" IN (
    'QA Lead', 'Mobile Tester', 'iOS Tester', 'Web Tester', 'Performance Tester', 'Accessibility Tester',
    'Ops Lead', 'Mobile Ops', 'iOS Ops', 'Web Ops', 'Server Ops', 'Build Ops', 'Release Ops'
  )
) OR "created_by_agent_id" IN (
  SELECT id FROM "agents" WHERE "name" IN (
    'QA Lead', 'Mobile Tester', 'iOS Tester', 'Web Tester', 'Performance Tester', 'Accessibility Tester',
    'Ops Lead', 'Mobile Ops', 'iOS Ops', 'Web Ops', 'Server Ops', 'Build Ops', 'Release Ops'
  )
) OR "conversation_agent_id" IN (
  SELECT id FROM "agents" WHERE "name" IN (
    'QA Lead', 'Mobile Tester', 'iOS Tester', 'Web Tester', 'Performance Tester', 'Accessibility Tester',
    'Ops Lead', 'Mobile Ops', 'iOS Ops', 'Web Ops', 'Server Ops', 'Build Ops', 'Release Ops'
  )
);

DELETE FROM "heartbeat_run_events"
WHERE "agent_id" IN (
  SELECT id FROM "agents" WHERE "name" IN (
    'QA Lead', 'Mobile Tester', 'iOS Tester', 'Web Tester', 'Performance Tester', 'Accessibility Tester',
    'Ops Lead', 'Mobile Ops', 'iOS Ops', 'Web Ops', 'Server Ops', 'Build Ops', 'Release Ops'
  )
) OR "run_id" IN (
  SELECT id FROM "heartbeat_runs" WHERE "agent_id" IN (
    SELECT id FROM "agents" WHERE "name" IN (
      'QA Lead', 'Mobile Tester', 'iOS Tester', 'Web Tester', 'Performance Tester', 'Accessibility Tester',
      'Ops Lead', 'Mobile Ops', 'iOS Ops', 'Web Ops', 'Server Ops', 'Build Ops', 'Release Ops'
    )
  )
);

DELETE FROM "heartbeat_runs"
WHERE "agent_id" IN (
  SELECT id FROM "agents" WHERE "name" IN (
    'QA Lead', 'Mobile Tester', 'iOS Tester', 'Web Tester', 'Performance Tester', 'Accessibility Tester',
    'Ops Lead', 'Mobile Ops', 'iOS Ops', 'Web Ops', 'Server Ops', 'Build Ops', 'Release Ops'
  )
);

DELETE FROM "cost_events"
WHERE "agent_id" IN (
  SELECT id FROM "agents" WHERE "name" IN (
    'QA Lead', 'Mobile Tester', 'iOS Tester', 'Web Tester', 'Performance Tester', 'Accessibility Tester',
    'Ops Lead', 'Mobile Ops', 'iOS Ops', 'Web Ops', 'Server Ops', 'Build Ops', 'Release Ops'
  )
);

DELETE FROM "agent_runtime_state"
WHERE "agent_id" IN (
  SELECT id FROM "agents" WHERE "name" IN (
    'QA Lead', 'Mobile Tester', 'iOS Tester', 'Web Tester', 'Performance Tester', 'Accessibility Tester',
    'Ops Lead', 'Mobile Ops', 'iOS Ops', 'Web Ops', 'Server Ops', 'Build Ops', 'Release Ops'
  )
);

DELETE FROM "agent_task_sessions"
WHERE "agent_id" IN (
  SELECT id FROM "agents" WHERE "name" IN (
    'QA Lead', 'Mobile Tester', 'iOS Tester', 'Web Tester', 'Performance Tester', 'Accessibility Tester',
    'Ops Lead', 'Mobile Ops', 'iOS Ops', 'Web Ops', 'Server Ops', 'Build Ops', 'Release Ops'
  )
);

DELETE FROM "agent_memberships"
WHERE "agent_id" IN (
  SELECT id FROM "agents" WHERE "name" IN (
    'QA Lead', 'Mobile Tester', 'iOS Tester', 'Web Tester', 'Performance Tester', 'Accessibility Tester',
    'Ops Lead', 'Mobile Ops', 'iOS Ops', 'Web Ops', 'Server Ops', 'Build Ops', 'Release Ops'
  )
);

DELETE FROM "agents"
WHERE "name" IN (
  -- 6 QA (wave217)
  'QA Lead',
  'Mobile Tester',
  'iOS Tester',
  'Web Tester',
  'Performance Tester',
  'Accessibility Tester',
  -- 7 Ops (wave220)
  'Ops Lead',
  'Mobile Ops',
  'iOS Ops',
  'Web Ops',
  'Server Ops',
  'Build Ops',
  'Release Ops'
);
