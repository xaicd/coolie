-- Coolie fork — wave256: 数字员工卡显示职责 / 技能 / 真名
--
-- Boss 真机 0.6.10 截图: 5 个员工都显示「空闲」+「claude_local」,
-- 老板看不出区别, 派活无判断依据 ("不知道咋派活").
--
-- 给 `agents` 表加 4 列 (NULL-safe, 已有 row 不破坏):
--   role_label        text        - CMMI 角色中文标签 (FDA / Core SWE / PRE-SRE / FDSE / DS),
--                                     跟上游 `role` 枚举并存 (上游 validator 不动).
--   responsibilities  jsonb []    - 职责短语数组 (1 行 + 折叠), 卡片显示第 1 条.
--   skills            jsonb []    - 中文 2 字 skill ("调研" / "编码" / ...), 卡片显示 4-8 个.
--                                     wave258 起跟 cli 工具解耦.
--   tools             jsonb []    - 英文 cli tool ("cmd" / "agy" / ...), 卡片显示 1-3 个.
--                                     wave258 新增 — 老板原话 "技能不是 cli 工具, 是 skills,
--                                     得区分了".
--
-- 字段语义上游没用到 (这是 fork-only 增强), 不与 upstream 冲突.
-- ALTER TABLE IF NOT EXISTS 保证幂等 (replay 不会报错).

ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "role_label" text;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "responsibilities" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "skills" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "tools" jsonb DEFAULT '[]'::jsonb NOT NULL;