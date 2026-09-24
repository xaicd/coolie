-- Coolie fork — wave77: default Palantir 5 roles (including fdse-agent) to Claude + Hermes
-- Boss: "fdse-agent 要求 coolie默认安装 Hermes,Claude 的 工具"
-- Fix for: "Process adapter missing command" when assigning tasks to Palantir agents.
-- Updates agents whose role is in ('fda', 'core-swe', 'pre-sre', 'fdse', 'ds')
-- and whose adapter_type is 'process' without a command, migrating them to 'claude_local'
-- with dangerouslySkipPermissions enabled and default model set.

UPDATE "agents"
   SET "adapter_type" = 'claude_local',
       "adapter_config" = jsonb_build_object(
         'model', 'claude-sonnet-4-5',
         'dangerouslySkipPermissions', true
       )
 WHERE "role" IN ('fda', 'core-swe', 'pre-sre', 'fdse', 'ds')
   AND (
     "adapter_type" = 'process'
     AND (
       "adapter_config" IS NULL
       OR "adapter_config" = '{}'::jsonb
       OR "adapter_config"->>'command' IS NULL
       OR "adapter_config"->>'command' = ''
     )
   );
