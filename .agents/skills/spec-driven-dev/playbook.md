# spec-driven 开发 — PM / 派单玩法

面向 PM、boss、以及派单的人：**怎么把员工的工作派成 spec 链**。

## 一句话

> 派活时不要只说「做个 X」——先落一条 **requirement**，让员工补 **design**，再拆 **task**。
> 每一步都是一条 issue，挂在同一棵 spec 树上，可查、可验收。

## 派 requirement（给员工）

在对应项目下建一条 issue，选 spec 类型 `requirement`（或直接调模板）：

```bash
# 一键起一条 requirement（骨架已填，员工补内容）
curl -sX POST "$API/api/companies/$CID/specs/from-template" \
  -H "authorization: Bearer $KEY" -H 'content-type: application/json' \
  -d '{"kind":"requirement","title":"看板助手显示发送回执","projectId":"<uuid>"}'
```

派给员工时，说清三件事：

1. 要做什么（`requirement.body` 由来）。
2. 验收条件（每条可判定；EARS 优先）。**没有验收条件不算派完。**
3. 边界（不做什么），避免范围蔓延。

## 员工回 design

员工从 requirement 派生一条 design（`parentSpecId` = requirement 的 issue id），
写清方案 / 权衡 / API surface。PM 只审两点：

- 是否覆盖了每条验收条件。
- 权衡是否写明了「为什么没选另一条路」。

## 拆 task 并派 core-swe

design 拆成 1~N 条 task，每条一个可独立提交的白名单。派给 core-swe 时带上：

- task 的 issue id（spec 已内嵌文件列表与步骤）。
- 完成定义：跑哪个 typecheck / 哪个测试 / 看哪个页面。

## 验收

- `GET /api/companies/$CID/specs/tree` 看整棵链是否闭合（req → design → task）。
- `GET /api/issues/$TASK_ID/spec` 读回该 task 的 spec，核对文件列表与步骤。
- 真实验证：像 boss 一样**点一遍**，别只看「测试绿」。

## 与 CMMI 的边界

- 阶段门、交付物、评审记录 → **CMMI**（`docs/cmmi/`、`cmmi-*` skills）。
- 本次改动的做什么/怎么改/改哪几行 → **spec 链**（本文）。
- 长留档设计 → `docs-coolie/specs/YYYY-MM-DD-*.md`（Kiro 风格，`requirements-capture` skill）。

## 排障

- **spec 写不进去（400）**：`kind` 与 payload 不匹配，或少了必填字段。检查 `kind` 对应的字段名。
- **树里看不到某条**：确认该 issue 的 `spec_kind` 已落（`GET /issues/:id/spec`）；孤儿的
  父不在同公司时会被当作根节点浮出来，不是丢失。
- **误报 422**：`parentSpecId` 指向自己或别的公司 —— 被有意拒绝。
