---
name: product-project-intake
description: >
  产品总监视角的需求进厂 skill：把客户需求文档识别、立项、落档，并拆成有依赖顺序的工单流水线，
  把验收标准写进工单文档。适用于「客户丢来一份需求文档」「把需求变成系统里的项目」
  「把大活拆成一串工单」「写验收标准」等场景。
  完整可执行脚本见 docs-coolie/playbooks/product-project-intake.md。
---

# Product Director / 产品总监 — 需求进厂到立项

**一句话职责**：把"微信里的需求"变成"系统里可交付、可验收的项目 + 工单链"。

## 何时用

- 客户/老板丢来需求文档要进厂。
- 要新建项目（不只是口头有需求）。
- 要把大需求拆成有序工单并派发。

## 执行步骤

### 1 先识别，再立项（Ring 0）

```sh
export API=https://xrobinai.cn/api
export CID=<company-id>
export KEY="$PAPERCLIP_API_KEY"
H=(-H "Authorization: Bearer $KEY" -H "x-paperclip-api-key: $KEY")

curl -fsS -X POST "${H[@]}" -F "file=@./需求.docx" \
  "$API/companies/$CID/projects/analyze-document"
# -> {suggestedName,suggestedSlug,summary,source,extractedChars,textSupported}
```

`source=="content"` = 从正文拿的（可信）；`source=="filename"` = 无文本层（扫描件），
**产品总监必须人工确认名称**。

### 2 建项目

```sh
curl -fsS -X POST "${H[@]}" -H 'Content-Type: application/json' \
  --data '{"name":"进销存系统","targetDate":"2026-09-30"}' "$API/companies/$CID/projects"
```

### 3 需求文档落档 + 回读

```sh
curl -fsS -X POST "${H[@]}" -F "file=@./需求.docx" \
  "$API/companies/$CID/projects/$PID/documents"
curl -fsS "${H[@]}" "$API/companies/$CID/projects/$PID/documents"
```

落点 `<instanceRoot>/projects/<cid>/<pid>/coolie-docs/`，不进 git。

### 4 一键拆解流水线（D1 断点）

四步骨架，每步 `blockedByIssueIds` 指向前一步：

1. 架构定界 → `fda`（G1）
2. 全栈开发 → `fdse`（G3，依赖 1）
3. 发布核验 → `pre-sre`（G4，依赖 2）；平台内核改动走 `core-swe`（G2）
4. 业务终审 → `ds`（G5，依赖 3）

企业级大项目**用 `https://github.com/xaicd/ruoyi-all-next.git` 作底座**，不从零手搓：

```sh
curl -fsS -X POST "${H[@]}" -H 'Content-Type: application/json' \
  --data '{"repoUrl":"https://github.com/xaicd/ruoyi-all-next.git","isPrimary":true}' \
  "$API/projects/$PID/workspaces"
```

### 5 验收标准写进工单 `plan` 文档

```sh
curl -fsS -X PUT "${H[@]}" -H 'Content-Type: application/json' \
  --data '{"format":"markdown","body":"## 验收标准\n- ..."}' \
  "$API/issues/$ISSUE_ID/documents/plan"
```

## 已知坑

1. 上传是 **multipart**，字段名固定 **`file`**；用 JSON 会 400。
2. 扫描件 `textSupported:false`，自动名不可信 → 人工补。
3. 后台补 description/建设目标是**异步**的，建完立刻读可能为空。
4. 派活前要有对应角色的 agent（见 `hr-agent-onboarding`）。
5. 老板常把"交付时间 + 交付风险"当交付物一部分，要在项目/plan 里显式写。

## 验收标准

1. `analyze-document` 结果与人工确认一致（或记录为何改）。
2. 项目可回读 `targetDate`。
3. 需求文档落档且能被列出来（写进去读得出）。
4. 工单依赖顺序正确，每条有 `plan` 文档承载验收标准。
5. 走查能见到真产物附件，不是一句"已完成"。

## 反例

- 凭文件名拍脑袋填项目名。
- 需求只在对话里，系统里查无此项目。
- 把整包需求丢给一个人，不拆依赖、不写验收标准。

## 关联

- 招人 → `hr-agent-onboarding`；派活 → `ops-task-orchestration`
- 开发 → `swe-delivery-flow`；上线 → `sre-release-and-deploy`
