-- Coolie fork — wave70: boss 25:00 OOB 「5 角色员工描述都去掉」第 3 轮
-- 老 agent 行的 title 列 (前两轮 wave65 + wave69 partial 修了 UI / 新注册路径,
-- 但 wave69 之前的 DB 仍然有 Palantir 角色头衔 + capabilities 长描述串)。
-- 把 role in (fda, core-swe, pre-sre, fdse, ds) 的 title 和 capabilities 清空,
-- 跟 stripRoleDescription 的新注册行为对齐, 让 GET /api/companies/<id>/agents
-- 返回的 5 角色 row.title 全空。
UPDATE "agents"
   SET "title" = '',
       "capabilities" = ''
 WHERE "role" IN ('fda', 'core-swe', 'pre-sre', 'fdse', 'ds');