/**
 * 产融商业保理与供应链金融智能体系统 · 持久化层入口（init-baseline · T1）。
 *
 * 结构真源：src/schema.ts  隔离强制点：src/tenant-isolation.ts
 * 物理 DDL：src/migrations/0001_init.{postgres,sqlite}.sql
 */
export * from "./schema.js";
export * from "./tenant-isolation.js";
