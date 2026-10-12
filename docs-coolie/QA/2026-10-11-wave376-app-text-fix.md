# 【铁匠贰号】Coolie 原生 App 长文本阻断与两字按钮标准化整改报告 (wave376)

> **执行员工**：铁匠贰号 (forge-ii-core-swe · Core SWE fallback)
> **受命总指挥**：Hermes·Echo (业务战略与价值中枢 · PM 掌柜)
> **上游审计**：`docs-coolie/QA/2026-10-11-wave375-app-text-length-audit.md` (472 行, 墨斗 FDA)
> **老板拍板**：`a` = 修 P0 + P1
> **工作仓库**：`/Users/mac/workspace/xaicd/coolie` · 分支 `main`
> **交付日期**：2026-10-12
> **状态**：代码整改完成并 typecheck 全绿；发版受阻（见第六节）

---

## 一、整改总览

本轮针对审计报告 P0 (5 件致命) + P1 (两字按钮违规) 及 P2 (长文本折叠) 落地整改，共改动 **14 个文件**（12 改 + 2 新增）：

| 分层 | 文件 | 说明 |
| :--- | :--- | :--- |
| 新增 | `clients/expo/src/ui/FoldableText.tsx` | 6 寸屏长文本折叠原子组件 (超阈值默认 2/3 行截断 + 两字「展开/收起」) |
| 新增 | `clients/expo/src/utils/sanitize.ts` | 通知正文脱敏适配器 (`isWakePayloadText` / `sanitizeNotificationBody` / `summarizeBody`) |
| 服务端 | `server/src/routes/notifications.ts` | 通知总线拦截 `Paperclip Wake Payload` 调试载荷 |
| Expo | `screens/InboxScreen.tsx` | P0-1 拦截 + P0-2 截断 + 「全读」两字 |
| Expo | `screens/TaskDetailScreen.tsx` | P0-3 描述/评论折叠 + 「指派/规范」两字 |
| Expo | `screens/AssetOntologyScreen.tsx` | P0-4/P0-5 折叠 + 5 处两字按钮 + 数据集描述截断 |
| Expo | `screens/NotificationsScreen.tsx` | P0-1 拦截 + P0-2 截断 |
| Expo | `screens/BoardChatScreen.tsx` | 「新建/操作」两字 |
| Expo | `screens/SettingsScreen.tsx` | 7 行复合按钮无障碍标签收敛为两字 |
| Expo | `components/ChatHeader.tsx` | 列表/新建/清空 三字→两字 |
| Expo | `components/ChatInput.tsx` | 附件/语音/键盘/停止 两字化 |
| Expo | `components/IssueRow.tsx` | 任务行无障碍标签去全文字化 + 标题截断 |
| Expo | `components/TasksScreenFilters.tsx` | 筛选 chips 去前缀，收敛两字 |
| Expo | `components/composer/UploadRow.tsx` | 「附件」两字化 |

---

## 二、P0 五件致命缺陷整改明细

### P0-1 收件箱过滤 `## Paperclip Wake Payload` JSON 泄露

- **根因**：Paperclip 心跳唤醒调试载荷（`## Paperclip Wake Payload` + 内嵌 ```text 序列化 JSON，含 `version/companyId/trigger/messages`）作为 issue comment 落入通知流，移动端原样渲染成 2000+ 字符 raw JSON。
- **整改**：
  - **服务端**（`notifications.ts`）：`buildFeed` 在 mention 通知映射前 `filter((row) => !isWakePayloadBody(row.body))`，通知总线层面直接不推送该载荷。
  - **客户端**（`InboxScreen.tsx` / `NotificationsScreen.tsx`）：双层防御——`unreadWorkItems` 逐条 `isWakePayloadText(n.body)` 丢弃；`mineWorkItems` / `allTabWorkItems` 的提及流同样跳过；`NotificationsScreen.visible` 过滤。
- **效果**：raw JSON 绝无可能进入渲染树。

### P0-2 通知列表长正文未截断

- `AlertRow` 正文（`alertBody`）补 `numberOfLines={2} ellipsizeMode="tail"`。
- `mention` 提及正文补 `ellipsizeMode="tail"`（原本仅 `numberOfLines={2}`）。
- `NotificationsScreen` 的 `rowTitle` / `rowBody` 补 `ellipsizeMode="tail"`。
- `IssueRow` 任务标题、`IssuesList` 看板卡标题补 `ellipsizeMode="tail"`。

### P0-3 工单详情长文本平铺

- `TaskDetailScreen` 描述卡改用 `FoldableText`（`maxLines={3}` / `threshold={90}`）。
- 时间线评论正文改用 `FoldableText`（`maxLines={3}` / `threshold={120}`）——覆盖审计快照 10「工单交付件长文时间线」。

### P0-4 资产简介未截断

- `AssetOntologyScreen` 业务对象卡 `objectDesc` 由 `numberOfLines={1}` 提升为 `numberOfLines={2} ellipsizeMode="tail"`（系统对象 + 域实体节点两处）。
- 数据集卡 `datasetDesc`（系统 + 域两处）补 `numberOfLines={2} ellipsizeMode="tail"`。

### P0-5 本体域详情未折叠

- 域横幅 `bannerSubtitle`（`currentDomain.description`，审计快照 11 的 102 字符域简介）改用 `FoldableText`（`maxLines={2}` / `threshold={40}`），默认折叠、两字「展开/收起」就地展阅。
- 域总表抽屉 `domainManageDesc` 保持 `numberOfLines={1}` 单行截断。

---

## 三、P1 两字按钮标准化（16+ 组件）

| 位置 | 原文本 | 整改后 |
| :--- | :--- | :--- |
| 任务行 `IssueRow` 无障碍标签 | 整条 57 字符标题 | `任务 #{identifier}` + 标题降级为 accessibilityHint |
| 资产域管理按钮 | 切换或管理本体域 (8) | 域表 |
| 资产域刷新按钮 | 刷新当前域态势 (7) | 刷新 |
| 资产系统刷新按钮 | 刷新本体态势 (7) | 刷新 |
| 资产域动作·工坊 | 在工坊演进本体 (7) | 工坊 |
| 资产域动作·工程 | 查看关联项目工程 (8) | 工程 |
| 资产域动作·熔断 | 切换熔断与活跃 (7) | 熔断 / 恢复 |
| 设置·Git 凭证 | 复合 26 字 | 管理 |
| 设置·插件中心 | 复合 26 字 | 配置 |
| 设置·版本更新 | 复合 24 字 | 检查 |
| 设置·清理缓存 | 复合 24 字 | 清理 |
| 设置·原生能力 | 复合 24 字 | 探测 |
| 设置·演进记录 | 复合 | 查看 |
| 设置·退出账号 | 复合 24 字 | 退出 |
| 工坊顶栏 | 对话列表 / 新建对话 / 清空对话 (4) | 列表 / 新建 / 清空 |
| 工坊输入栏 | 添加附件 / 切换语音输入 (4/6) | 附件 / 语音(键盘) |
| 工坊发送 | 停止生成 (4) | 停止 |
| 工坊会话列表 | 新建对话 / 对话操作 | 新建 / 操作 |
| 收件箱全读 | 全部标为已读 (6) | 全读 |
| 工单详情指派 | 分配智能体: 墨斗 (7) | 指派 |
| 工单详情规范 | 打开规范 (4) | 规范 |
| 任务筛选栏 | 指派 · 全部 / 项目 · 全部项目 / 排序 · 更新时间 | 指派 / 项目 / 排序（选定后显示选定值） |

---

## 四、P2 长文本折叠（40~100 字列表项）

- 资产对象卡简介 / 域实体标识描述：`numberOfLines={2}` + tail 截断。
- 数据集卡描述：`numberOfLines={2}` + tail 截断。
- 工单描述 / 评论、本体域简介：统一走 `FoldableText` 折叠 + 两字「展开」。
- 已确认本就合规处（未改动）：`ProjectsScreen` 项目描述已 2 行折叠 + 展开、`PluginManagerScreen` 描述已 2 行、`ProjectDirectoryTree` 文件副描述已 1 行、`ArtifactsScreen` 预览文本已 3 行。

> 说明：审计快照 01 的「工坊此刻快照」为聊天会话消息（非列表项）。对任意助手消息统一折叠会破坏正常对话阅读，故本轮不做全局折叠；该自动快照若需折叠，建议在服务端生成侧压缩或加专用卡片标识后再处理，单列后续 wave 跟进。

---

## 五、验证

| 项 | 结果 |
| :--- | :--- |
| Expo 类型检查 `pnpm exec tsc --noEmit`（`clients/expo`） | ✅ **EXIT=0，0 errors** |
| 提交前综合守卫 (Pre-Commit Guard) | ✅ 全绿（含两字按钮契约、底栏对称、CMMI 门禁等 19 组守卫） |
| 服务端类型检查 `@paperclipai/server` | ✅ PASS（提交钩子 Gate 5 增量类型检查） |
| 提交 | `5341a9104` — `fix(app): wave376 P0 5件长文本阻断 + P1 两字按钮标准化 (老板拍a=修)` |

未运行：Android 真机四态快照复验（依赖 emulator-5554，容器内需 `host-exec` 穿透）；建议在发版后由 FDSE 墨斗复跑 `agent-device` 走查存证。

---

## 六、发版状态：阻塞（未发版）

**执行**：`bash scripts/release-app.sh 0.6.58 "wave376 修复 App P0 长文本阻断与 P1 两字按钮标准化"`

**结果**：在 `[1/9] 前置检查` 的 1.5 commit 强制门禁处 **安全中止（RC=1）**，未产生任何生产副作用（未构建、未上传 COS、未 scp、未发布 OTA、未推 tag）：

```
失败: [sanity] git status NOT clean (modified files in tracked). Commit first. Don't ship dirty state.
```

**根因**：发版脚本要求**全仓 tracked 工作区洁净**，但仓库当前存在**另一条并行工作流**（服务端路由 / OpenAPI / packages / scripts）的未提交改动，非本任务范围：

```
 M docs/09_operations/tenant-governance.md
 M packages/agents/package.json
 M packages/ontology-core/package.json
 M packages/templates/package.json
 M scripts/check-governance-audit.mjs
 M scripts/cmmi-asset-scaffold.cjs
 M scripts/e2e/tests/api-smoke-25.spec.ts
 M scripts/init-local-workshop.mjs
 M scripts/qa-api-smoke-25.mjs
 M server/src/__tests__/cases-routes.test.ts
 D server/src/__tests__/companies-route-path-guard.test.ts
 M server/src/__tests__/decision-training.test.ts
 M server/src/__tests__/environment-routes.test.ts
 M server/src/__tests__/plugin-routes-authz.test.ts
 M server/src/__tests__/tool-access-service.test.ts
 M server/src/routes/cases.ts
 M server/src/routes/companies.ts
 M server/src/routes/decision-training.ts
 M server/src/routes/environments.ts
 M server/src/routes/experimental-api-metadata.ts
 M server/src/routes/experimental-api-paths.ts
 M server/src/routes/openapi.ts
 M server/src/routes/plugins.ts
 M server/src/routes/tool-access.ts
```

**处置（遵令不越界）**：单写者纪律要求"不触碰无关脏文件"、"不 `reset --hard`"，故铁匠贰号**不提交、不回滚**上述无关改动。

**解阻路径**：由该并行工作流的负责人先提交/清理其改动（使全仓 tracked 洁净），随后原样重跑：

```sh
bash scripts/release-app.sh 0.6.58 "wave376 修复 App P0 长文本阻断与 P1 两字按钮标准化"
```

脚本将自 `[2/9]` 起完成版本号改写、APK 构建、COS 上传、version.json 推送、OTA 发布、server 联动与 git tag。

---

## 七、工完自评

- ✅ 审计 P0 (5 件) 全部整改；
- ✅ P1 两字按钮违规 16+ 组件全部收敛至严格两字；
- ✅ P2 长文本列表项统一 `numberOfLines` 截断或 `FoldableText` 折叠；
- ✅ Expo + 服务端类型检查 0 报错，提交守卫全绿；
- ⚠️ 发版因无关并行改动导致的全仓洁净门禁受阻，已给出解阻路径，未越界提交/回滚他人改动；
- ✅ 未调用子 Agent、未 `git reset --hard`、未触碰无关脏文件。
