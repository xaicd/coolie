# IEEE 1016 详细设计 (LLD) 与统一 API 契约协议标准规约

> **权威标准参考**: IEEE 1016-2009 详细设计节 (Detailed Design Description)、OpenAPI 3.1 Specification 与 CMMI V2.0 详细设计 (TS) / 单元验证 (VER) 过程域。

---

## 1. 系统详细设计说明书 (LLD) 标准结构

详细设计负责将概要架构精确细化到“类、方法、数据结构、算法与具体接口契约”层面：

```
1. 模块算法与核心流程设计 (Detailed Algorithm & Flowchart)
2. 数据字典与持久化 Schema (Database Schema & Index Design)
   2.1 实体表字段类型、主外键定义与注释
   2.2 高频查询索引拓扑与分区策略
3. 统一 API 契约协议规范 (RESTful / RPC Contract Specification)
   3.1 路径命名与 HTTP 动词约定
   3.2 请求参数 Schema (JSON Schema / DTO)
   3.3 统一响应 Payload 与分页结构
   3.4 错误码枚举矩阵 (Error Code Matrix)
4. 单元验证策略与测试断言设计 (Unit Test Assertions Plan)
```

---

## 2. 统一 API 契约设计规范 (Contract-First)

为杜绝前后端联调歧义和字段私自篡改，统一遵守以下工业级契约设计原则：

### 2.1 路由与动词规范
- 获取资源列表：`GET /api/v1/{resources}`
- 获取单体详情：`GET /api/v1/{resources}/{id}`
- 创建新资源：`POST /api/v1/{resources}`
- 全量更新：`PUT /api/v1/{resources}/{id}`
- 状态操作/局部动作：`POST /api/v1/{resources}/{id}/actions/{actionName}`
- 删除资源：`DELETE /api/v1/{resources}/{id}`

### 2.2 统一响应报文包裹结构 (Standard Envelope)
```json
{
  "code": 200,
  "message": "操作成功",
  "data": { ... },
  "traceId": "req_8f192bce90a1",
  "timestamp": 1727263200000
}
```

### 2.3 状态码与业务错误分级标准
| HTTP 状态码 | 业务错误分类 | 语义说明与处理要求 |
| :--- | :--- | :--- |
| `200 OK` | SUCCESS | 请求成功完成并返回数据 |
| `400 Bad Request` | PARAM_INVALID | 请求参数缺失、格式错误或未能通过 JSON Schema 验证 |
| `401 Unauthorized` | AUTH_EXPIRED | Token 缺失、失效或签名伪造，客户端需引导重定向登录 |
| `403 Forbidden` | PERM_DENIED | 当前用户/Token 权限不足，或试图跨企业越权访问 |
| `404 Not Found` | NOT_FOUND | 请求的目标资源标识在当前企业命名空间内不存在 |
| `409 Conflict` | STATE_CONFLICT | 状态冲突（如并发更新乐观锁冲突、唯一索引冲突） |
| `422 Unprocessable` | BIZ_RULE_VIOLATION | 语法正确但违反核心业务规则（如预算不足、未到审批阶段） |
| `500 Server Error` | INTERNAL_ERROR | 服务端未捕获异常，必须记录 traceId 并向用户屏蔽敏感堆栈 |

---

## 3. 静态契约守卫与单测防退化守则

1. **增量编译零报错**: 技术栈原生编译器检查（`tsc --noEmit`、`mvn compile`）必须为 0 错误。
2. **禁止逆向与循环依赖**: 核心实体层不得引用服务接口层，通用工具库不得逆向引用业务层。
3. **单元测试必须覆盖边界值**: 针对数学计算、状态机流转、权限判定，单测必须包含边界与非法参数用例，不仅仅覆盖 Happy Path。

---

## 4. G3 静态编译门禁自检清单 (Peer Review Checklist)

- [ ] **契约完备性**: 是否定义了完整的请求入参、返回出参及错误码枚举？
- [ ] **单一可信源**: API 契约协议是否保持单一可信源（无多处私自复制硬编码）？
- [ ] **依赖干净度**: 模块依赖关系是否严格单向无环？
- [ ] **编译整洁度**: 静态编译器检查是否保持 0 错误、0 悬空变量、0 类型降级？
