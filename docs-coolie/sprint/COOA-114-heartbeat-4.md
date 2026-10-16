# COOA-114 Hermes 心跳 #4 · 2026-10-16 13:37 CST

## 真背景
心跳 #3 沉淀:routine b35ff456-cad2-42ef-9880-0fe3626beb70 与 trigger a67ff60a 在 2026-10-13 静默停摆 3 天,sprint run b75e8ae3 失败后 Routine 调度器 paused+enabled=false 不会自愈。本心跳落账踩坑修复。

## Actionable:心法 #49 入账
**commit fe4a997be · fix(scripts): setup-long-term-routine.mjs 幂等 resume Routine + trigger**
- scripts/setup-long-term-routine.mjs 第 [2/4] 步:routine status != active → PATCH /routines/:id active
- 第 [3/4] 步:trigger enabled != true → PATCH /routine-triggers/:id enabled=true
- 1 file / +22 / -3
- pre-commit-check 5 Gate 全 PASS
- git push origin main 成功

## 真验证
- 实跑 node scripts/setup-long-term-routine.mjs → routine 已是 active,走 ✅ 分支无副作用
- 服务端 nextRunAt 自动重排 = 2026-10-16T05:45Z(13:45 CST),Routine 接管正常
- work-product id=45925fad-0718-4379-85d3-6234305cf7f9 (type=commit, sha=fe4a997be, HTTP 201)

## 工具池真状态
全绿 6 池 ✅:墨斗 agy-gemini3.8 / 铁匠 claude-glm / 铁匠贰号 claude-mm / 门神 cmd / Hermes ✅,兑底渊 copilot ⚠️ 限制可用
Dev Server 健康:authReady=true,HEAD=fe4a997be

## 工单大盘
🔥 进行中 2 项:COOA-114(本主线,Hermes)/ COOA-228(百晓生 移动端复测)
⏳ 待办 3 项:COOA-1 晨会 / COOA-211 Conversation 示范 / COOA-191 移动端走查回归

## 工作区状态
- HEAD fe4a997be,本回合唯一提交即本修复
- clients/expo/src/screens/BoardChatScreen.tsx M + docs-coolie/evidence/cooa228/ ?? 属 COOA-228 百晓生,不擅自动

## 心法固化
#49:setup-long-term-routine.mjs 缺幂等 resume → Routine paused 后不会自愈;本次修
#50:Paperclip work-products 字段是 type/provider/title/url/externalId(不是 kind/title),端点是 /api/issues/:id/work-products(不带 companyId 前缀),commit provider=github

## 已知 infra 问题 (非阻塞本回合,但需记入)
**Paperclip API 401 复现**:curl -H "Authorization: Bearer $PAPERCLIP_API_KEY" 命中 POST /api/issues/:id/comments 与 GET /api/issues/:id 时返回 401 "Agent token did not verify; obtain fresh credentials and retry"。同一 token 在 POST /api/issues/:id/work-products(HTTP 201)与 GET /api/routines/:id(无需 token)均正常——疑似 board key 被当 agent key 校验,与 wave380 mcp 401 同根。**未阻塞本回合 Routine 自愈;老板/基础设施需查 token 路由分级**。

## 下次心跳候选
- COOA-228 复测证据收口(等老板审)
- 137[263表锁]/138[CMMI对抗]/136[6寸屏] 三大高优 todo 等拍
- in_review 最长尾 COOA-42 wake-queue 11d(等老板审)
- 推动 token 401 修复(交基础设施团队)
