# COOA-255 · 全端界面实现 · 交付报告 (O 端 Vue3 运营后台 / B 端商户 H5 / C 端居民小程序)

> **工单**: COOA-255 · **负责工匠**: 铁匠 (Core SWE)
> **上游**: COOA-93 中台核心服务 (CS-API-002 REST 契约) · 承接「配套管理端与商家端界面」缺口
> **交付仓库**: `projects/cls-core-services/` (独立交付工作区) · **交付目录**: `frontends/`
> **主干提交**: tag `cooa-255-impl` (branch `main`) · **日期**: 2026-10-16

---

## 1. 交付范围 (三端完整界面)

| 端 | 目录 | 技术栈 | 覆盖关键路径 |
|---|---|---|---|
| **O 端** 运营后台 | `frontends/ops-console/` | Vue3 + Element Plus + vue-router | 大盘看板 / 商户审核 / 服务(SKU)审核 / 订单仲裁 / 结算分账 / 审计日志 |
| **B 端** 商户工作台 | `frontends/merchant-h5/` | Vue3 + Vant H5 + vue-router | 接单派工 / 打卡 / 举证 / 对账单 / 提现 / 商户信息 |
| **C 端** 居民端 | `frontends/resident-miniapp/` | uni-app (Vue3) → 微信小程序 / H5 | 浏览服务 / 下单 / 支付 / 签收 / 评价 / 我的 |

配套补齐的**最小 C 端评价接口** (原契约缺口)：`POST /api/v1/app/order/review` +
`GET /api/v1/app/order/{orderNo}/reviews`（一单一评、仅已完结可评、租户隔离），
实现落点 `src/main/java/cn/coolie/cls/review/`，测试 `ReviewFlowTest`
(提交 `7216a6b`)。

## 2. 与后端契约的对齐 (CS-API-002)

- **统一响应模型** `{code,message,data,traceId,timestamp}`，`code=0` 为成功；前端 `api/http.js`
  统一解析，失败抛 `ApiError` 携带 `code` / `traceId`。
- **零信任报头** `X-Tenant-Id` / `X-Merchant-Id` / `X-User-Id` 由 `http.js` 按端注入演示上下文
  （租户 1 · 运营 9002 · 商户 9001(merchant=1) · 居民 9003）。
- **零 CORS 依赖**：三端各自通过 Vite dev proxy 同源转发 `/api` → `http://localhost:48080`，
  保证「真实联调」而非 Mock（`vite.config.js` 的 `server.proxy['/api']`）。
- 前端 `api/index.js` 调用的全部路由，与后端控制器 `@GetMapping` / `@PostMapping` 逐一对应
  (admin/merchant/catalog/order/payment/settlement 全域)。

## 3. 四态覆盖 (空 / 加载 / 成功 / 异常)

统一封装 `composables/useAsync.js` (`idle→loading→success|empty|error`) + 组件
`components/StateBox.vue`（加载态 / 异常态含错误码与 traceId + 重试 / 空态 / 成功态）。
三端逐一落点：

| 端 | 业务视图 | 接线 StateBox + useAsync |
|---|---|---|
| O 端 | 6 | 6/6 |
| B 端 | 4 | 4/4 |
| C 端 | 6 | 5/6 (「我的」为静态信息页，无需异步态) |

## 4. 验证证据 (最小可证伪)

1. **三端生产构建全绿** (复验于本次收口)：
   - `ops-console`: `npm run build` → ✓ built in 4.30s
   - `merchant-h5`: `npm run build` → ✓ built in 1.42s
   - `resident-miniapp`: `npm run build:mp-weixin` → **DONE Build complete** (产物 `dist/build/mp-weixin`)
2. **与后端真实联调 (live, 非 Mock)**：后端 `http://localhost:48080` 实跑，经各端 dev proxy 转发：
   - 全部被引用 GET 端点 `HTTP 200 / code=0`：`/api/v1/admin/{dashboard,pending,audit-logs}`、
     `/api/v1/merchant/{list,1}`、`/api/v1/merchant/sku/{list,on-shelf}`、`/api/v1/app/order/{list,orderNo}`、
     `/api/v1/payment/splits/{orderNo}`、`/api/v1/merchant/settle/list`、
     `/api/v1/merchant/account/{1,withdrawals}`；
   - 评价接口端到端：已完结订单提交评价成功；重复评价 → `HTTP 409 code=40011`；
     未完结订单评价 → `HTTP 409 code=40901`。
3. **交付库统计**: tag `cooa-255-impl` (`ab970f8`, tree `74a5f8c9`)，
   受版本控制文件 121 个，其中 `frontends/` 58 个；本次前端新增 59 files / 15,183 insertions。

## 5. 本地运行方式

```bash
# 1) 启动后端
cd projects/cls-core-services && mvn spring-boot:run          # http://localhost:48080

# 2) 启动三端 (各自目录)
cd frontends/ops-console      && npm install && npm run dev   # http://localhost:5181
cd frontends/merchant-h5      && npm install && npm run dev   # http://localhost:5182
cd frontends/resident-miniapp && npm install && npm run dev:h5 # http://localhost:5183 (H5 预览)
# 微信小程序：npm run dev:mp-weixin，用微信开发者工具导入 dist/dev/mp-weixin
```

## 6. 务实取舍 (诚实声明)

- 演示上下文为固定演示账号（租户 1 运营/商户/居民），未接入正式登录鉴权（后续工单）。
- 三端均经 Vite dev proxy 联调真实后端；生产部署需网关反向代理 `/api` 或补齐 CORS。
- 本工单仅交付前端界面与最小评价接口，未触碰 COOA-256「微服务拆分/真实支付/租户 AST 隔离」生产化改动。

## 7. 后续 (已并入生产化子工单)

- 生产化：微服务拆分接入 yudao 基座、真实微信服务商分账、MySQL/Redis/RocketMQ、SM4 字段级加密
  (COOA-256 域)。
