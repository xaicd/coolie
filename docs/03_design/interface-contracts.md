# 社区生活服务商用中台 · 统一 API 契约与接口设计规范 (LLD)

> **系统代码**: CS-API-001 · 版本: v1.0 (基线版)  
> **责任架构师**: 墨斗 (Inkstick · modou-fda · 前线架构师 FDA)  
> **归属门禁**: CMMI G2/G3 契约治理门禁 (`gate_g2_arch` / `gate_g3_contract`)  
> **遵循标准**: OpenAPI 3.0 / RESTful / Yudao 统一协议规范  
> **接入网关**: `http://localhost:48080` (Spring Cloud Gateway)  

---

## 1. 统一通信协议与响应规范

### 1.1 基础请求规范
- **协议格式**: `HTTPS / RESTful JSON`
- **字符编码**: `UTF-8`
- **公共请求头 (Headers)**:
  - `Authorization`: `Bearer <Access-Token>` (前台微信用户 / 后台管理员 JWT)
  - `X-Idempotency-Key`: `<UUID>` (针对所有写操作与资金变动，必须携带防重放幂等键)
  - `Content-Type`: `application/json`

### 1.2 统一响应报文格式 (`CommonResult<T>`)
```json
{
  "code": 0,
  "data": {},
  "msg": "操作成功"
}
```
- `code = 0`: 业务执行成功；
- `code = 401`: 未认证或 Token 已过期；
- `code = 403`: 无访问权限或触发“防自批自审”强规则阻断；
- `code = 429`: 触发 Sentinel 限流或 24 小时高频防刷机制；
- `code >= 10000`: 业务显式异常（如 `1001001001`: 房源状态不处于待审核状态）。

---

## 2. 两字核心动词与 HTTP 动作映射矩阵

全端全局收敛 24 个两字核心动词，映射为标准的 HTTP Method 与 URI 契约：

| 两字动词 | HTTP 动作 | URI 规范示例 | 业务语义 |
|---|---|---|---|
| **新增** / **提交** | `POST` | `/app-api/house/property/create` | 提交新实体或工单 |
| **保存** | `PUT` | `/app-api/house/property/update` | 更新实体属性 |
| **查询** | `GET` | `/app-api/house/property/get?id=1` | 幂等获取详情或列表 |
| **审核** | `PUT` | `/admin-api/house/property/audit` | 触发流转审核 |
| **通过** | `PUT` | `/admin-api/house/property/approve` | 审核判定通过 |
| **驳回** | `PUT` | `/admin-api/house/property/reject` | 审核判定驳回并记录原因 |
| **上架** | `PUT` | `/admin-api/house/property/online` | 资产/服务对 C 端可见 |
| **下架** | `PUT` | `/admin-api/house/property/offline` | 资产/服务对 C 端隐藏 |
| **看房** / **预约** | `POST` | `/app-api/house/appointment/create` | 租客发起线下看房预约 |
| **下单** | `POST` | `/app-api/hk/order/create` | 居民创建家政服务订单 |
| **接单** / **派工** | `PUT` | `/admin-api/hk/order/dispatch` | 服务商指定技工履约 |
| **开始** / **签到** | `PUT` | `/app-api/hk/order/check-in` | 技工上门 GPS 签到打卡 |
| **完成** / **签退** | `PUT` | `/app-api/hk/order/finish` | 技工完成履约拍照签退 |
| **退款** | `POST` | `/app-api/hk/order/refund-apply` | 居民或客服申请退款 |
| **评价** | `POST` | `/app-api/hk/review/create` | 居民多维星级评价 |
| **报名** | `POST` | `/app-api/community/activity/enroll` | 居民抢报社区活动名额 |
| **重置** | `PUT` | `/admin-api/system/user/reset-password` | 重置密码或参数 |
| **启用** / **停用** | `PUT` | `/admin-api/system/user/update-status` | 启停用户或服务 |
| **封禁** / **解封** | `PUT` | `/admin-api/member/user/update-ban` | 处置违规前台用户 |

---

## 3. 四大业务主线核心 API 契约详细定义

### 3.1 主线 A: 房源租赁微闭环接口契约

#### 1. 提交实名房东资质申请
- **URI**: `POST /app-api/house/landlord/apply`
- **权限**: 登录居民用户
- **请求体**:
```json
{
  "realName": "张三",
  "idCard": "110101199001011234",
  "propertyImgs": [
    "https://oss.example.com/certs/property_cert_01.jpg"
  ],
  "contactPhone": "13800138000"
}
```
- **响应体**:
```json
{
  "code": 0,
  "data": {
    "landlordId": 10024,
    "auditStatus": 0,
    "msg": "申请已提交，请等待平台管理员审核"
  }
}
```

#### 2. 平台审核房东资质 (防自批自审)
- **URI**: `PUT /admin-api/house/landlord/audit`
- **权限**: `@PreAuthorize("@ss.hasPermission('house:landlord:audit')")`
- **请求体**:
```json
{
  "landlordId": 10024,
  "auditStatus": 1,
  "auditReason": "资质合规，房产证明有效"
}
```
- **防护拦截**: 若 `currentUserId == landlord.userId`，直接拦截返回 `403`。

#### 3. 房东发布房源
- **URI**: `POST /app-api/house/property/create`
- **权限**: 已认证房东
- **请求体**:
```json
{
  "categoryId": 2,
  "title": "阳光花园 2室1厅 南北通透 精装修",
  "rentPrice": 3200.00,
  "depositType": 1,
  "layout": "2室1厅1卫",
  "area": 78.50,
  "address": "阳光社区 5号楼 2单元 601室",
  "photos": [
    "https://oss.example.com/house/h1_01.jpg",
    "https://oss.example.com/house/h1_02.jpg",
    "https://oss.example.com/house/h1_03.jpg"
  ]
}
```
- **校验规则**: 实拍照片少于 3 张时直接抛出 `400` 校验错误。

#### 4. 居民发起看房预约 (24小时高频防刷)
- **URI**: `POST /app-api/house/appointment/create`
- **权限**: 登录居民
- **请求体**:
```json
{
  "houseId": 1089,
  "appointTime": "2026-10-15 14:30:00",
  "contactPhone": "13911112222",
  "remark": "希望能周末下午看房"
}
```
- **防护拦截**: 同一用户 24 小时内对同一房源重复发起预约，网关直接返回 `429 Too Many Requests`。

---

### 3.2 主线 B: 家政服务履约闭环接口契约

#### 1. 居民创建家政服务订单
- **URI**: `POST /app-api/hk/order/create`
- **权限**: 登录居民
- **请求体**:
```json
{
  "itemId": 305,
  "quantity": 2,
  "appointTime": "2026-10-12 09:00:00",
  "serviceAddress": "阳光社区 3号楼 1单元 402室",
  "contactName": "李女士",
  "contactPhone": "13700001111",
  "remark": "需要自带深度保洁工具"
}
```
- **响应体**:
```json
{
  "code": 0,
  "data": {
    "orderNo": "HK202610101738010001",
    "payPrice": 160.00,
    "status": 0,
    "expireTime": "2026-10-10 17:53:01"
  }
}
```

#### 2. 预支付统一统一下单接口
- **URI**: `POST /app-api/pay/order/submit`
- **请求体**:
```json
{
  "bizOrderNo": "HK202610101738010001",
  "payChannel": "wx_lite"
}
```
- **响应体**:
```json
{
  "code": 0,
  "data": {
    "appId": "wx8888888888888888",
    "timeStamp": "1791625081",
    "nonceStr": "5K8264ILTKCH16CQ2502SI8ZNMTM67VS",
    "packageValue": "prepay_id=wx20261010173801556677",
    "signType": "RSA",
    "paySign": "oWJ+...=="
  }
}
```

#### 3. 服务商派工调度
- **URI**: `PUT /admin-api/hk/order/dispatch`
- **权限**: `@PreAuthorize("@ss.hasPermission('hk:order:dispatch')")`
- **请求体**:
```json
{
  "orderNo": "HK202610101738010001",
  "workerName": "王师傅",
  "workerPhone": "13699998888"
}
```

#### 4. 技工上门签到与签退
- **URI**: `PUT /app-api/hk/order/check-in` (签到) / `PUT /app-api/hk/order/finish` (签退)
- **请求体**:
```json
{
  "orderNo": "HK202610101738010001",
  "longitude": 102.712251,
  "latitude": 25.040609,
  "photoProof": "https://oss.example.com/proof/checkin_01.jpg"
}
```

#### 5. 居民申请退款
- **URI**: `POST /app-api/hk/order/refund-apply`
- **请求体**:
```json
{
  "orderNo": "HK202610101738010001",
  "refundReason": "临时出差无法接受服务",
  "refundAmount": 160.00
}
```
- **自动化逻辑**: 处于 `WAIT_DISPATCH` 的订单直接调用微信原路退款秒级完成；处于 `IN_SERVICE` 的订单挂入协商工单队列。

---

### 3.3 主线 C: 社区互动与诉求工单接口契约

#### 1. 社区活动报名 (高并发抢报名)
- **URI**: `POST /app-api/community/activity/enroll`
- **请求体**:
```json
{
  "activityId": 501,
  "participantCount": 1
}
```
- **核心逻辑**: Redis 执行 `DECRBY activity:cap:{id}` 结合 Lua 脚本原子防超卖，成功后下发 6 位随机动态核销码。

#### 2. 居民提交诉求工单
- **URI**: `POST /app-api/community/complaint/submit`
- **请求体**:
```json
{
  "source": "wechat_miniapp",
  "targetType": "community_property",
  "content": "3号楼电梯按键失灵，存在安全隐患",
  "contactPhone": "13800002222",
  "photos": ["https://oss.example.com/tickets/t1.jpg"]
}
```

---

## 4. 接口契约校验与防漂移守卫

1. **统一 Swagger / Knife4j 契约导出**:
   在编译期由 `springdoc-openapi` 自动编译生成标准 `docs/specs/openapi-v3.json`；
2. **静态契约测试**:
   下游 SWE 团队必须在单元测试中加载契约并执行 MockMvc 验证，确保字段命名与类型 100% 保持一致。
