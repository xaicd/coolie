# Playbook: Product Director / 产品总监 — 需求进厂到立项

> 角色:产品总监。定位:把客户需求文档变成系统里一个**可交付**的项目与工单流水线。
> 对应 skill:`.agents/skills/product-project-intake/SKILL.md`
> 素材来源:wave122 需求文档上传+识别+落档、wave123 后台补描述、board skill「总指挥拆解流水线」。

## 触发条件

- 客户/老板丢来一份需求文档(Word/PDF/Markdown),要"进厂"。
- 需要在系统里**新建项目**(而不是只在微信里有需求)。
- 需要把一个大需求拆成一串有依赖顺序的工单,派给不同角色。

## 前置

```sh
export API=https://xrobinai.cn/api
export CID=4cafeb9a-22c9-48db-ae2e-70ad0dfbfc1e
export KEY="$PAPERCLIP_API_KEY"
H=(-H "Authorization: Bearer $KEY" -H "x-paperclip-api-key: $KEY")
```

- 需求文档先落在本地,例如 `./需求-进销存.docx`。
- 上传是 **multipart/form-data**,文件字段名固定为 **`file`**;大小上限 `MAX_ATTACHMENT_BYTES`(默认 10MB)。

## 步骤

### 0. 前置:Ring 0 — 先识别文档,再建项目

**不要**凭文档文件名拍脑袋填项目名。用系统自带的确定性分析器先识别:

```sh
curl -fsS -X POST "${H[@]}" \
  -F "file=@./需求-进销存.docx" \
  "$API/companies/$CID/projects/analyze-document"
# 期望 200:
# {"suggestedName":"进销存系统","suggestedSlug":"jin-xiao-cun-system",
#  "summary":"...","source":"content","extractedChars":12345,"textSupported":true}
```

判据:`source=="content"` 说明是从文档正文拿的(可信);`source=="filename"` 说明文档
没有可解析文本层(扫描件/纯图),只能用文件名兜底 —— **此时产品总监要人工确认名称**。

路由:`server/src/routes/projects.ts:481`;分析器是纯函数、无 LLM
(`server/src/services/project-documents.ts`,wave122 Req C)。

### 1. 建项目

```sh
curl -fsS -X POST "${H[@]}" -H 'Content-Type: application/json' \
  --data '{"name":"进销存系统","description":"客户A 进销存,目标 9 月底上线","targetDate":"2026-09-30"}' \
  "$API/companies/$CID/projects"
# 期望 201 + project 行(记下 id = $PID)
```

### 2. 需求文档落档(落 `coolie-docs`,不进 git)

```sh
curl -fsS -X POST "${H[@]}" \
  -F "file=@./需求-进销存.docx" \
  "$API/companies/$CID/projects/$PID/documents"
# 期望 201: {projectId,filename,relativePath,byteSize,sha256,originalFilename}
```

落点:`<instanceRoot>/projects/<companyId>/<projectId>/coolie-docs/`
(`server/src/home-paths.ts` 的 `resolveProjectCoolieDocsDir`),是托管仓库检出目录的**同级**,
永远不写进检出、不进 git。上传后服务端会**异步**补 `description` + 建设目标(wave123,
`project-document-enrichment.ts`),所以创建/上传接口本身很快返回。

### 3. 回读已落档的文档(证明"写进去读得出来")

```sh
curl -fsS "${H[@]}" "$API/companies/$CID/projects/$PID/documents"
# 期望 200: {projectId, documents:[{filename,byteSize,modifiedAt}]}
```

### 4. 一键拆解流水线(D1 断点:需求→任务链)

按 board skill 的「总指挥拆解流水线」把大活拆成有序工单,每个工单带**依赖**
(`blockedByIssueIds`)与**建议指派角色**。四步骨架(复杂交付的标准切法):

1. 架构定界 → `fda`(数据隔离/权限/契约,受 G1 门禁)
2. 全栈开发 → `fdse`(受 G3 门禁,`blockedBy = 步骤1`)
3. 发布核验 → `pre-sre`(受 G4 门禁,`blockedBy = 步骤2`);平台内核类改动走 `core-swe`(G2)
4. 业务终审 → `ds`(受 G5 门禁,`blockedBy = 步骤3`)

逐条建工单(MCP 工具 `paperclipDispatchTaskToRole` 或直接 REST):

```sh
curl -fsS -X POST "${H[@]}" -H 'Content-Type: application/json' \
  --data '{"title":"[架构] 进销存数据模型与权限边界","description":"...","projectId":"'$PID'","priority":"high"}' \
  "$API/companies/$CID/issues"
```

大项目脚手架铁律:企业级系统**优先用 `https://github.com/xaicd/ruoyi-all-next.git` 作底座**,
不从零手搓;绑定方式:

```sh
curl -fsS -X POST "${H[@]}" -H 'Content-Type: application/json' \
  --data '{"repoUrl":"https://github.com/xaicd/ruoyi-all-next.git","isPrimary":true}' \
  "$API/projects/$PID/workspaces"
```

### 5. 把验收标准写进工单文档,派发

验收标准不能停在对话里。写进工单的 `plan` 文档:

```sh
curl -fsS -X PUT "${H[@]}" -H 'Content-Type: application/json' \
  --data '{"format":"markdown","title":"交付计划","body":"## 验收标准\n- ...\n## 里程碑\n- ..."}' \
  "$API/issues/$ISSUE_ID/documents/plan"
```

然后派发(见 `ops-task-orchestration.md` / MCP `paperclipDispatchTaskToRole`)。

### 6. 产品走查(截图审查)

交付产物要到手才验收:产物必须是**工单附件/work product**,不是本地路径。

```sh
curl -fsS "${H[@]}" "$API/issues/$ISSUE_ID/work-products"
curl -fsS "${H[@]}" "$API/issues/$ISSUE_ID/attachments"
```

## 验收标准

1. `analyze-document` 返回的 `suggestedName` 与人工确认的项目名一致(或明确记录了为何改)。
2. 项目已建,`GET $API/projects/$PID` 能读回 `targetDate`。
3. 需求文档落档成功且 `GET .../documents` 能列出来(写进去读得出)。
4. 工单链存在、依赖顺序正确(每步 `blockedByIssueIds` 指向前一步),每条有 `plan` 文档承载验收标准。
5. 走查时能在工单里看到**产物附件/预览**,而不是一句"已完成"。

## 失败分支

| 编号 | 症状 | 原因 | 处置 |
|---|---|---|---|
| F1 | 上传 400 `file is required` | 用了 JSON 或字段名不对 | 必须 `-F "file=@..."`(multipart,字段名 `file`) |
| F2 | `textSupported:false` / `source:filename` | 文档是扫描件,无文本层 | 人工补项目名 + 描述;不要相信自动结果 |
| F3 | 上传 413 | 超过 `MAX_ATTACHMENT_BYTES` | 拆分文档或压缩;不要改上限放行 |
| F4 | 项目建好但 description 一直空 | 后台补描述是**异步**的,可能仍在跑 | 等几秒回读;仍空则看 enrichment 是否报错(wave123) |
| F5 | 工单派了但没人接 | 角色名/agent 不在公司里 | 先 `hr-agent-onboarding.md` 招人,再派 |
| F6 | 需求含"交付时间/风险"要求 | 老板把交付时间当交付物的一部分 | 在项目/`plan` 里显式写**交付时间 + 交付风险**清单(老板要求) |

## 关联

- 招人 → `hr-agent-onboarding.md`;派活/排班 → `ops-task-orchestration.md`
- 开发交付 → `swe-delivery-flow.md`;上线 → `sre-release-and-deploy.md`
