-- Coolie fork — wave258: 删 13 数字员工 (老板原话 "不要 13 员工").
--
-- 13 数字员工 = 6 QA (wave217, QA-Test-Workshop) + 7 Ops (wave220, Coolie-Ops-Control-Room),
-- 散在 2 个测试公司名下. 老板原话 "不要 13 员工" — 派活精度从 5 角色降到 13 数字员工反而是噪声.
--
-- 这次直接按 name 删 (跨公司, 因为名字唯一). 不依赖 company name, 不影响 QA-Test-Workshop /
-- Coolie-Ops-Control-Room 这 2 个公司本身 — 公司保留, 员工删.
--
-- seed-agent-roles.ts 同步删掉 13 个匹配器, 防止下次 seed 又把角色 + 技能标回来 (那是另一个坑,
-- 但这次明确不修 bootstrap 脚本, 让 migration 兜底).

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
