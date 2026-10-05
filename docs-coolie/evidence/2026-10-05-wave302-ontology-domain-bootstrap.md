# wave302 存证：宪法第2条「项目进厂即本体域」真机验证

- 日期: 2026-10-05
- 责任工匠: 铁匠 (agent 02cab729-c5b7-4a14-9ce9-5a34885c336a)
- 议题: COOA-52 【wave302】按照宪法第二章现有能力组合铁律，把项目创建路由原子化初始化同名 ontology_domains
- 代码落点: commit `23569fdfd` (feat(ontology): 项目进厂即本体域——创建项目事务内原子初始化同名本体域)
  + 治理守卫 `scripts/check-governance-audit.mjs` 第 8 节（本存证同批提交）

## 【Echo 价值定义】

**解决的核心业务阻塞**: 宪法第2条要求"项目进厂即本体域"，但修复前项目创建只写 `projects` 行，
项目与本体域脱钩，成为"裸项目"——Palantir 式真业务本体（第18章北极星）失去挂载点，项目
无法被本体图谱检索、血缘与治理。高管的执行级交付结果：**任何项目创建后立即拥有同名本体域
与 project→domain owner 血缘链，同生共死，杜绝裸项目**，且零新增表（宪法第5条，纯组合）。

## 【Delta 真实验证】真实接口跑通 (隔离实例 127.0.0.1:3211)

验证环境: 独立第二个服务实例（PORT=3211，SERVE_UI=false，fresh 数据库 `coolie_wave302_verify`，
嵌入式 PostgreSQL 18 集群 127.0.0.1:54329），**不影响** 3100 生产控制面。
实例版本指纹: `0.6.29+16.git.23569fdfd.dirty`，commit `23569fdfd`，deploymentMode `local_trusted`。

### 1. 服务健康

```
$ curl -s http://127.0.0.1:3211/api/health
{"status":"ok","version":"0.6.29+16.git.23569fdfd.dirty",...,"commit":"23569fdfd75a4172a2864a9389e31ce60d9f3e63",
 "deploymentMode":"local_trusted","authReady":true,"bootstrapStatus":"ready",...}
```

### 2. 建公司 → 建项目（两次同名立项）

```
$ curl -s -X POST http://127.0.0.1:3211/api/companies -H 'content-type: application/json' \
    -d '{"name":"wave302验证集团","description":"宪法第2条 Delta 真机验证专用公司（隔离实例 3211）"}'
{"id":"7f3003d8-b97f-40a6-bf28-d740a4df9d79","name":"wave302验证集团",...,"status":"active",...}

$ curl -s -w '\nHTTP_STATUS=%{http_code}\n' -X POST http://127.0.0.1:3211/api/companies/7f3003d8.../projects \
    -H 'content-type: application/json' -d '{"name":"Wave302 原子域验证","description":"宪法第2条：项目进厂即本体域 真机验证"}'
{"id":"4328cf77-fef9-43fe-b106-2a0fe9819d29","companyId":"7f3003d8-b97f-40a6-bf28-d740a4df9d79",
 "name":"Wave302 原子域验证",...,"status":"backlog",...}
HTTP_STATUS=201

$ curl -s -w '\nHTTP_STATUS=%{http_code}\n' -X POST .../projects -d '{"name":"Wave302 原子域验证"}'
{"id":"1ad926fd-25f4-432d-b1f2-a8c1fba817a7",...,"name":"Wave302 原子域验证",...}
HTTP_STATUS=201
```

### 3. 插件本体域 API（插件自己的读者视角，200）

```
$ curl -s "http://127.0.0.1:3211/api/plugins/4095dd8b-c18f-43d1-88ad-52ddd09fdbf6/api/domains?companyId=7f3003d8..."
{"domains":[
  {"slug":"wave302","display_name":"Wave302 原子域验证","category":"项目","is_built_in":false,
   "bootstrap_source":"system-seed","created_by":"local-board",...},
  {"slug":"wave302-1ad926fd","display_name":"Wave302 原子域验证","category":"项目",
   "bootstrap_source":"system-seed",...},
  {"slug":"enterprise-core","display_name":"企业核心运营与IT基座","category":"enterprise","is_built_in":true,...}]}
```

撞名消歧实证: 第二个同名项目 id 为 `1ad926fd-25f4-...`，其域名 slug 自动落为
`wave302-1ad926fd`（项目自身 uuid 前 8 位），与设计一致。

### 4. 数据库直查（血缘链与不变量）

```
$ node --input-type=module (postgres.js → postgres://...@127.0.0.1:54329/coolie_wave302_verify)
namespace: plugin_ontology_b62f8af3e9
--- ontology_domains ---
{"slug":"wave302","display_name":"Wave302 原子域验证","category":"项目","bootstrap_source":"system-seed","created_by":"local-board","project_id":"4328cf77-fef9-43fe-b106-2a0fe9819d29"}
{"slug":"wave302-1ad926fd","display_name":"Wave302 原子域验证","category":"项目","bootstrap_source":"system-seed","created_by":"local-board","project_id":"1ad926fd-25f4-432d-b1f2-a8c1fba817a7"}
--- ontology_resource_links (owner chain) ---
{"slug":"wave302","resource_kind":"project","resource_id":"4328cf77-fef9-43fe-b106-2a0fe9819d29","resource_label":"Wave302 原子域验证","role":"owner"}
{"slug":"wave302-1ad926fd","resource_kind":"project","resource_id":"1ad926fd-25f4-432d-b1f2-a8c1fba817a7","resource_label":"Wave302 原子域验证","role":"owner"}
--- invariant: 1 project = 1 domain = 1 owner link ---
{"projects":"2","project_domains":"2","owner_links":"2"}
```

不变量成立: 每个项目 1 个同名域 + 1 条 owner 血缘链，零裸项目。

## 【Dev 反向传播】防退化自动化守卫

### 治理门禁（新增第 8 节，全绿，exit 0）

```
$ pnpm check:governance
🏗️ 8. 宪法第 2 条「项目进厂即本体域」防退化守卫:
  ✅ [PASS] 第2条_挂钩: 项目创建路由在事务内调用 ensureProjectOntologyDomain (杜绝裸项目)
  ✅ [PASS] 第2条_原子性: 本体域写入随调用方事务原子提交 (project + domain + resource_link 同生共死)
  ✅ [PASS] 第2条_血缘: 写入 project→domain owner 资源链 (ontology_resource_links, role=owner)
  ✅ [PASS] 第2条_防退化: 原子性/回滚/降级/重放/撞名守卫测试就位 (project-ontology-bootstrap.test.ts)
🎉 全面管局审计全绿通过！
```

### 回归测试（真实插件迁移 + 嵌入式 Postgres）

```
$ cd server && npx vitest run src/__tests__/project-ontology-bootstrap.test.ts
 Test Files  1 passed (1)
      Tests  9 passed (9)
   Duration  4.76s
```

覆盖: 原子创建+血缘、调用方失败随事务回滚、撞名 uuid 片段消歧、重放幂等采纳、
未迁移降级跳过（事务仍提交）、插件未安装降级跳过、slugify 约定 3 例。

## 宪法符合性

- 第2条 项目进厂即本体域: ✅ 事务内原子初始化，裸项目在默认安装下不可能存在
- 第5条 现有积木组合铁律: ✅ 零新增表——写入的正是 plugin-ontology 命名空间
  `plugin_ontology_b62f8af3e9` 的现有两张表（行内容与 `PostgresGraphStore.createDomain`
  + `linkResource` 完全一致），插件读者无差别识别
- 降级不阻断: 插件未安装/未迁移时报告 skipped，项目创建照常提交（守卫测试覆盖）
