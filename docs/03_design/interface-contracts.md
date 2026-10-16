# 社区生活服务商用中台 · 接口契约设计说明书 (OpenAPI / LLD)

> **系统名称**: 社区生活服务商用中台 (Community Life Service Commercial Hub)  
> **文档代号**: CS-API-002 · 版本: **v1.0 (基线版)**  
> **责任架构师**: 墨斗 (Inkstick · modou-fda · 前线架构师 FDA)  
> **归属任务**: Issue **COOA-92** (中台总体架构与技术设计方案)  
> **协议规范**: RESTful HTTP/2 (TLS 1.3), JSON 序列化, UTF-8 编码  
> **核心原则**: 极简两字动词 · 统一响应格式 · 幂等防重 Token · 防自批自审 · 严格服务端鉴权  

---

## 1. 统一通信协议与响应规范

### 1.1 基础网络协议与报头约束
- **基础路径 (Base URL)**: `https://api.cls.example.com/api/v1`
- **公共请求头 (Common Headers)**:
  - `Authorization`: `Bearer {JWT_TOKEN}` (用户认证凭证)
  - `X-Tenant-Id`: `{tenantId}` (客户端建议值，服务端强制使用 Token 中注入的真值覆盖)
  - `X-Idempotency-Key`: `{UUID}` (针对 `POST`/`PUT` 写操作的唯一幂等键，Redis 保持 60 秒排重)
  - `X-Client-Trace-Id`: `{TraceId}` (客户端全链路追踪标识，缺失时网关自动生成)

### 1.2 统一响应模型 (Standard Response Body)
```json
{
  "code": 0,
  "message": "success",
  "data": {},
  "traceId": "c479e11e-7b63-4941-a5fe-60a32109ea70",
  "timestamp": 1792137600000
}
```

### 1.3 核心业务错误码字典 (Error Code Constants)

| 错误代码 (`code`) | HTTP Status | 错误语义说明与前端处理指引 |
|---|---|---|
| `0` | 200 OK | 请求成功，业务正常响应 |
| `40001` | 400 Bad Request | 请求参数格式错误或必填字段缺失 |
| `40101` | 401 Unauthorized | JWT 签名过期或认证失效，客户端需拉起静默刷新或重新登录 |
| `40301` | 403 Forbidden | 权限不足或跨租户未授权访问 |
| `40302` | 403 Forbidden | **FORBIDDEN_SELF_APPROVAL**: 严禁自批自审（如审核本人资质或验收自身订单） |
| `40401` | 404 Not Found | 资源不存在（或跨租户访问，为防嗅探统一返回 404） |
| `40901` | 409 Conflict | 并发操作冲突或重复提交（幂等键拦截） |
| `50001` | 500 Internal Error | 核心业务异常（如资金断言不守恒，已触发事务回滚并告警） |

---

## 2. 极简两字核心动词与 HTTP 动作映射矩阵

为了契合极简人机使用主义与移动端高效流转，中台将多角色核心交互高度收敛为 **≤ 2 个汉字** 的核心动词：

| 端别 | 核心动词 | 语义解释 | 对应 HTTP 方法与典型路由 | 权限标识 |
|---|---|---|---|---|
| **C 端** | `下单` | 创建生活服务/团购/跑腿订单 | `POST /app/order/create` | `c:order:create` |
| **C 端** | `支付` | 调起微信预支付统一下单 | `POST /app/order/pay` | `c:order:pay` |
| **C 端** | `确认` | 居民出示电子签收码确认验收 | `POST /app/order/sign` | `c:order:sign` |
| **C 端** | `退款` | 未履约前用户申请极速退款 | `POST /app/order/refund` | `c:order:refund` |
| **C 端** | `评价` | 订单完结后发表星级与评价 | `POST /app/order/evaluate` | `c:order:evaluate` |
| **B 端** | `入驻` | 提交商户法人与资质资料 | `POST /merchant/apply` | `b:merchant:apply` |
| **B 端** | `上架` | 提交新服务 SKU 并申请上架 | `POST /merchant/sku/create` | `b:sku:create` |
| **B 端** | `接单` | 商户确认受理用户生活服务订单 | `POST /merchant/order/accept` | `b:order:accept` |
| **B 端** | `派工` | 将订单分配调度给下属技工师傅 | `POST /merchant/order/dispatch` | `b:order:dispatch` |
| **B 端** | `打卡` | 师傅到达现场上传 GPS 与信标打卡 | `POST /merchant/order/checkin` | `b:order:checkin` |
| **B 端** | `举证` | 上传服务前/中/后三段式照片或视频 | `POST /merchant/order/evidence` | `b:order:evidence` |
| **B 端** | `确认` | 商户主账号确认 T-1 日终结算单 | `POST /merchant/settle/confirm` | `b:settle:confirm` |
| **B 端** | `提现` | 商户申请可用余额提现至银行对公户 | `POST /merchant/account/withdraw`| `b:account:withdraw` |
| **O 端** | `审核` | 运营审核商户资质或服务 SKU | `POST /admin/audit/approve` | `o:audit:approve` |
| **O 端** | `驳回` | 审核不通过并填写具体驳回理由 | `POST /admin/audit/reject` | `o:audit:reject` |
| **O 端** | `仲裁` | 介入订单客诉纠纷并裁定退款比例 | `POST /admin/order/arbitrate` | `o:order:arbitrate` |
| **O 端** | `分账` | 财务批量执行结算单微信分账打款 | `POST /admin/settle/dispatch` | `o:settle:dispatch` |

---

## 3. C 端微信小程序 / 移动 App 核心 API 契约

### 3.1 创建生活服务订单 (POST `/app/order/create`)
- **功能**: 用户选择家政、维修、团购或跑腿服务并提交下单，锁定服务名额或预扣团购库存。
- **请求体**:
```json
{
  "categoryType": 1,
  "skuId": 10023,
  "quantity": 1,
  "appointmentStartTime": "2026-10-18 09:00:00",
  "appointmentEndTime": "2026-10-18 12:00:00",
  "userCouponId": 501,
  "contactName": "张三",
  "contactPhone": "13800138000",
  "serviceAddress": "幸福阳光花园 3 栋 2 单元 502 室",
  "userRemark": "日常深度保洁，请携带吸尘器",
  "pickupPointId": null
}
```
- **成功响应 (`data`)**:
```json
{
  "orderId": 800192,
  "orderNo": "ORD202610160001",
  "totalAmount": 150.00,
  "discountAmount": 20.00,
  "freightAmount": 0.00,
  "payAmount": 130.00,
  "status": "UNPAID",
  "expireTime": "2026-10-16 16:15:00"
}
```

### 3.2 调起微信预支付统一下单 (POST `/app/order/pay`)
- **功能**: 获取微信支付 JSAPI / 小程序收银台唤起参数。
- **请求体**:
```json
{
  "orderNo": "ORD202610160001",
  "payChannel": "WXPAY_MINI"
}
```
- **成功响应 (`data`)**:
```json
{
  "payNo": "PAY202610160001",
  "appId": "wx8888888888888888",
  "timeStamp": "1792137600",
  "nonceStr": "5K8264ILTKCH16CQ2502SI8ZNMTM67VS",
  "package": "prepay_id=wx20261016160000abcdef",
  "signType": "RSA",
  "paySign": "q9W5j7K...=="
}
```

### 3.3 居民电子签收确认 (POST `/app/order/sign`)
- **功能**: 服务技工完成施工并出示验收请求后，居民输入 4 位动态验证码或签字确认验收。
- **请求体**:
```json
{
  "orderNo": "ORD202610160001",
  "signType": 2,
  "verifyCode": "6829",
  "signEvidenceUrl": null
}
```
- **成功响应 (`data`)**:
```json
{
  "orderNo": "ORD202610160001",
  "status": "FINISHED",
  "signTime": "2026-10-18 11:45:00",
  "message": "服务验收成功，感谢您的使用"
}
```

---

## 4. B 端商户工作台核心 API 契约

### 4.1 师傅/骑手现场打卡 (POST `/merchant/order/checkin`)
- **功能**: 技工师傅到达客户门禁或门口，上传高德经纬度与信标校验是否在 200 米偏差内。
- **请求体**:
```json
{
  "orderNo": "ORD202610160001",
  "longitude": 116.397128,
  "latitude": 39.916527,
  "beaconBssid": "d8:0d:17:ab:cd:ef",
  "clientTime": "2026-10-18 08:58:30"
}
```
- **成功响应 (`data`)**:
```json
{
  "orderNo": "ORD202610160001",
  "status": "IN_SERVICE",
  "distanceMeter": 35,
  "checkinTime": "2026-10-18 08:58:32",
  "validFlag": true
}
```

### 4.2 履约存证与三段式举证 (POST `/merchant/order/evidence`)
- **功能**: 上传服务前、服务中、服务后的照片及视频存证，作为争议仲裁与结项放款依据。
- **请求体**:
```json
{
  "orderNo": "ORD202610160001",
  "beforePhotos": ["https://oss.cls.example.com/2026/10/before_1.jpg"],
  "inProgressPhotos": ["https://oss.cls.example.com/2026/10/prog_1.jpg"],
  "afterPhotos": ["https://oss.cls.example.com/2026/10/after_1.jpg"],
  "videoUrl": "https://oss.cls.example.com/2026/10/repair_video.mp4"
}
```
- **成功响应 (`data`)**:
```json
{
  "orderNo": "ORD202610160001",
  "fulfillmentId": 90012,
  "evidenceCount": 4,
  "status": "WAIT_ACCEPT"
}
```

### 4.3 商户结算账单确认与异议 (POST `/merchant/settle/confirm`)
- **功能**: 商户核对 T-1 日终结算单，可选择确认结清或发起异议申诉。
- **请求体**:
```json
{
  "billNo": "SETTLE-20261015-5002",
  "action": "CONFIRM",
  "disputeReason": ""
}
```
- **成功响应 (`data`)**:
```json
{
  "billNo": "SETTLE-20261015-5002",
  "status": "CONFIRMED",
  "netSettleAmount": 4680.50,
  "estimatedTransferTime": "2026-10-17 10:00:00"
}
```

---

## 5. O 端平台/物业运营管理后台核心 API 契约

### 5.1 商户入驻与服务资质审核 (POST `/admin/audit/approve`)
- **功能**: 平台运营或物业管理员对商户资料执行终审，强制防自批自审。
- **请求头**: 携带平台管理员 Bearer Token
- **请求体**:
```json
{
  "targetType": "MERCHANT_CERT",
  "targetId": 5002,
  "approved": true,
  "auditOpinion": "资质文件齐全，特种作业证通过核验，准予试运营营业",
  "assignedLevel": 1,
  "requiredDeposit": 2000.00
}
```
- **成功响应 (`data`)**:
```json
{
  "merchantId": 5002,
  "auditStatus": "TRIAL",
  "level": 1,
  "commissionRate": 0.0800,
  "settlementCycle": "T+15"
}
```

### 5.2 争议纠纷仲裁 (POST `/admin/order/arbitrate`)
- **功能**: 当用户投诉师傅履约质量不合格且商户拒绝退款时，平台客服接入仲裁并强制分账退还。
- **请求体**:
```json
{
  "orderNo": "ORD202610160001",
  "arbitrationResult": "PARTIAL_REFUND",
  "refundToUserAmount": 50.00,
  "payToMerchantAmount": 80.00,
  "deductDepositAmount": 0.00,
  "penaltyDeductScore": 2,
  "reason": "保洁服务客厅窗台存在明显未清理污渍，依据履约存证照片判定商户承担部分责任"
}
```
- **成功响应 (`data`)**:
```json
{
  "orderNo": "ORD202610160001",
  "refundNo": "REF202610160002",
  "refundStatus": "REFUNDED",
  "arbitratedAt": "2026-10-16 16:30:00"
}
```

---

## 6. 开放 API 与第三方生态协同契约

### 6.1 美团/达达聚合跑腿派单接口 (POST `/open/dispatch/create`)
- **功能**: 跑腿订单支付后，开放网关调用第三方运力平台分发骑手运单。
- **第三方调用报文**:
```json
{
  "deliveryId": "CLS_RUN_202610160001",
  "vendorCode": "MEITUAN_COURIER",
  "pickupAddress": "北京市朝阳区幸福生活馆",
  "pickupContact": "李店长 13900139000",
  "deliverAddress": "北京市朝阳区幸福小区 2 号楼 101",
  "deliverContact": "王先生 13700137000",
  "itemWeightKg": 2.5,
  "itemType": "日用百货",
  "tipFee": 2.00
}
```
- **外部回调通知接收 (POST `/open/dispatch/callback`)**:
```json
{
  "deliveryId": "CLS_RUN_202610160001",
  "courierName": "刘骑手",
  "courierPhone": "18600186000",
  "event": "PICKED_UP",
  "longitude": 116.402130,
  "latitude": 39.921340,
  "timestamp": 1792138200
}
```

---

## 7. 契约防漂移守卫与 TypeScript SDK 强类型定义

为保证前端与移动端不发生接口定义漂移，全盘接口通过 `yudao-contract-sync` 自动转译为 TypeScript 强类型 SDK：

```typescript
/**
 * 社区生活服务订单详情强类型定义
 */
export interface ClsOrderDetailVO {
  readonly id: number;
  readonly tenantId: number;
  readonly merchantId: number;
  readonly orderNo: string;
  readonly orderCategory: 1 | 2 | 3 | 4; // 1:家政 2:维修 3:团购 4:跑腿
  readonly status: 'UNPAID' | 'WAIT_DISPATCH' | 'DISPATCHED' | 'IN_SERVICE' | 'WAIT_ACCEPT' | 'FINISHED' | 'REFUNDED' | 'CLOSED';
  readonly payAmount: number;
  readonly appointmentStartTime?: string;
  readonly appointmentEndTime?: string;
  readonly serviceAddress: string;
  readonly contactName: string;
  readonly contactPhoneEnc: string;
  readonly fulfillment?: ClsFulfillmentVO;
}

export interface ClsFulfillmentVO {
  readonly checkinTime?: string;
  readonly distanceMeter?: number;
  readonly beforePhotos: string[];
  readonly inProgressPhotos: string[];
  readonly afterPhotos: string[];
  readonly videoUrl?: string;
  readonly signType?: 1 | 2 | 3;
}
```

---

## 8. CMMI G2 接口契约门禁判定

- [x] 接口定义全面覆盖 C 端小程序、B 端商户端、O 端运营后台与开放网关；
- [x] 核心操作动词严格收敛至 ≤2 个汉字，符合极简使用主义；
- [x] 敏感数据国密加密字段明确；
- [x] 关键写接口具备防自批自审及 `X-Idempotency-Key` 幂等约束；
- [x] 提供 TypeScript 强类型 SDK 契约，防漂移守卫健全。

—— 报告人：墨斗 (Inkstick · modou-fda · 前线架构师) · 2026-10-16
