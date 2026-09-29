# Playbook: CMMI WBS 拆解 + 里程碑主线

> 角色: 掌柜 / 项目负责人（PM）。定位: 项目立项后把工作拆成阶段 → 工作包 → 收口里程碑，
> 并让里程碑作为贯穿 G1–G5 的主线。
> 对应 skill: `.agents/skills/cmmi-wbs-milestone/SKILL.md`
> 素材来源: `server/src/services/wbs-draft.ts`、`server/src/services/project-document-enrichment.ts`、
> `server/src/routes/projects.ts`、`packages/shared/src/wbs.ts`、wave140 实况。

## 触发条件

- 新项目立项完成、需求文档（技术规范书）已上传 → 应看到一份 WBS 草案待确认。
- 交付例会要看「项目走到哪个阶段」「门禁过没过」。
- 有人问「为什么后面阶段的任务一直没动」→ 先查是不是被上游门禁卡住。
- 要新增/调整阶段、工作包、里程碑。

## 前置

```sh
export API=https://xrobinai.cn/api
export CID=<companyId>
export PID=<projectId>
export KEY="$PAPERCLIP_API_KEY"   # 不要在校验/记录中写出真实值
H=(-H "Authorization: Bearer $KEY" -H "x-paperclip-api-key: $KEY")
```

读接口 board 或授权 agent 均可；采纳/忽略是项目写接口（走项目访问校验）。

## 1. 看 WBS 主线

```sh
curl -fsS "${H[@]}" "$API/companies/$CID/projects/$PID/wbs" | python3 -m json.tool
```

返回三段：

- `draft`：待确认的 WBS 草案（`null` 表示已采纳/已忽略/尚未解析）。
- `mainline.phases[6]`：六个 CMMI 阶段，各带收口里程碑、门禁、工作包计数；
  `mainline.currentPhaseIndex` = 项目当前所在阶段。
- `gateStates`：每个任务的门禁状态（`blocked` + `blockedByMilestone*` + `reason`）。

## 2. 草案从哪来

上传需求文档后，异步 enrichment（`project-document-enrichment.ts`）在补描述/建设目标之外，
调用纯函数 `buildWbsDraft()` 产出草案，写进 `projects.wbs_draft`。约束：

- 10s 硬超时；失败静默（不影响上传响应）。
- **幂等**：仅当项目「无草案 且 无里程碑任务」时才生成 → 重新上传不会重复建。
- **不静默乱建**：草案只是提案，必须人工采纳。

## 3. 一键采纳 / 忽略

```sh
# 采纳：把草案物化为 阶段 → 工作包 → 里程碑 任务树（幂等，重试为回放）
curl -fsS "${H[@]}" -X POST "$API/companies/$CID/projects/$PID/wbs/adopt"

# 忽略：丢弃草案，不物化
curl -fsS "${H[@]}" -X DELETE "$API/companies/$CID/projects/$PID/wbs/draft"
```

采纳时：需求确认阶段的工作包按标题匹配既有 `goal`（`issues.goal_id`），
每个里程碑服务项目主目标；叶任务的 `parent_id` 指向其阶段。

## 4. 推进里程碑（判定达成 / 豁免）

里程碑就是一个任务，用普通更新接口改它的 `milestone` 字段：

```sh
# 标记达成，并写判定人与证据
curl -fsS "${H[@]}" -X PATCH "$API/issues/<milestoneIssueId>" \
  -H 'content-type: application/json' \
  -d '{"milestone":{"gate":"gate_g2_arch","status":"achieved",
        "completedDate":"2026-09-29","approver":"掌柜",
        "evidence":"docs/cmmi/02-hld.md + check-fork-surface 退出码0"}}'

# 显式豁免（必须写原因，否则校验拒绝）
curl -fsS "${H[@]}" -X PATCH "$API/issues/<milestoneIssueId>" \
  -H 'content-type: application/json' \
  -d '{"milestone":{"gate":"gate_g2_arch","status":"not_started",
        "exempted":true,"exemptionReason":"客户书面同意先行开发"}}'
```

## 5. 门禁联动

`gateStates` 由 `packages/shared/src/wbs.ts` 派生（server / Web / App 同一份实现）：

- 某阶段任务，若**之前任一「带门禁阶段」的里程碑**存在且未达成、未豁免 → `blocked = true`。
- 里程碑不存在（未采纳 / 部分拉取）**不**构成阻塞 —— 不把「没数据」报成「被卡住」。
- 豁免（`exempted` + 原因）会解除对下游的阻塞。

## UI 在哪看

- **Web**：项目页 →「里程碑主线」Tab（草案卡片 + 六阶段时间线 + 受阻告警）；
  任务列表有「主线」徽章 +「只看主线」筛选；项目头有「N 个里程碑」证书。
- **App**：项目中心展开面板 →「里程碑主线」（采纳/忽略 + 阶段状态 + 受阻提示）；
  任务页有「主线」标记 +「只看主线」筛选。

## 常见错误

- 把里程碑当工作量任务派给工程师 —— 它是门禁锚点，不是工单。
- 未达成却不留痕就往下走 —— 要么补达成，要么显式豁免写原因。
- 重复拆解 —— 一个项目一份 WBS；要重来先忽略旧草案并处理已有里程碑任务。
- 门禁绑错：G1 需求 / G2 架构 / G3 静态编译 / G4 验收 / G5 投产。

## 与 cmmi-* 技能衔接

各阶段收口的门禁交付物由对应技能产出（`cmmi-req-spec`→01-srs、`cmmi-tech-solution`→02-hld、
`cmmi-detailed-contracts`→03-lld-api、`cmmi-ver-val`→04-test-report、`cmmi-immutable-release`→05-deploy-sop）。
里程碑的「判定证据」应指向这些交付物或对应门禁命令的输出。
