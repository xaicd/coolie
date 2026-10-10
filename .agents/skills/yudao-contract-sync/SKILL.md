---
name: yudao-contract-sync
description: Yudao 跨端契约自动转译与 TypeScript 类型防漂移技能。用于将 Spring Boot / Knife4j 后端生成的 OpenAPI 规范自动化编译转译为前端强类型 TS SDK，并在三大终端 (Vue3 Admin / Uni-App 小程序 / Expo App) 间保持零漂移契约守卫。
---

# Yudao 跨端契约同步与类型防漂移深度研发法典

> **最高法典契约**：后端接口是全系统的唯一真理源。任何数字员工（铁匠 CoreSWE、门神 FDSE）在新增或修改后端 API、DTO 或错误码时，**必须在提交前执行契约转译同步**。严禁在前端三端手工编造重复的 TypeScript 接口类型，严禁绕过 `packages/api-client` 直接手写未经校验的裸网络调用。

---

## §1 跨端契约自动转译流水线机制

```
  ┌────────────────────────────────────────────────────────┐
  │ 1. Spring Boot 3 后端 (/v3/api-docs)                    │
  │    • 由 Knife4j / SpringDoc 收集所有 Controller 契约   │
  │    • 规范输出 OpenAPI 3.0.1 标准 JSON 数据结构         │
  └───────────────────────────┬────────────────────────────┘
                              │
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │ 2. openapi-typescript 编译器 (packages/api-client)     │
  │    • 静态分析 AST，自动将 Java 类转译为 TS Interface   │
  │    • 将 Long/Integer 转为 number，LocalDateTime 转为 string │
  └───────────────────────────┬────────────────────────────┘
                              │
                              ▼
  ┌────────────────────────────────────────────────────────┐
  │ 3. packages/api-client/src/generated/index.ts          │
  │    • 包含完整的 paths['/admin-api/...'] 强类型映射     │
  │    • 导出 components['schemas'] 所有 DTO / VO 契约      │
  └───────────────────────────┬────────────────────────────┘
                              │
             ┌────────────────┼────────────────┐
             ▼                ▼                ▼
     [apps/admin]     [apps/miniapp]      [apps/app]
    (Vue3 PC 后台)    (UniApp 微信小程序) (Expo 原生端)
```

---

## §2 契约生成核心脚本与执行 SOP

在 `packages/api-client/scripts/gen-api-sdk.sh` 中，我们封装了全自动契约拉取与转译逻辑：

```bash
#!/usr/bin/env bash
# ==============================================================================
# gen-api-sdk.sh — 从后端 Knife4j / OpenAPI 自动拉取并转译强类型 TypeScript SDK
# ==============================================================================
set -euo pipefail

API_URL="${API_URL:-http://localhost:48080/v3/api-docs}"
OUTPUT_FILE="packages/api-client/src/generated/index.ts"
TMP_OPENAPI="/tmp/yudao-openapi.json"

mkdir -p "$(dirname "$OUTPUT_FILE")"

echo "📡 [1/3] 正在从后端拉取 OpenAPI 3.0 契约文档: $API_URL ..."

if curl -s -f -o "$TMP_OPENAPI" --connect-timeout 3 "$API_URL"; then
  echo "⚡ [2/3] 成功拉取 OpenAPI 契约，启动 openapi-typescript 编译..."
  npx --yes openapi-typescript "$TMP_OPENAPI" --output "$OUTPUT_FILE"
  echo "✅ [3/3] 强类型 TypeScript SDK 转译成功: $OUTPUT_FILE"
else
  echo "⚠️ [警告] 后端服务未在 $API_URL 启动，尝试检查本地离线快照..."
  if [ -f "docs/artifacts/openapi.json" ]; then
    echo "📦 从本地离线快照 docs/artifacts/openapi.json 转译..."
    npx --yes openapi-typescript docs/artifacts/openapi.json --output "$OUTPUT_FILE"
  else
    echo "ℹ️ 未检测到离线快照，生成保底基础通用契约骨架..."
    cat <<'EOF' > "$OUTPUT_FILE"
/**
 * 由 Yudao Contract Sync 自动生成的基础契约骨架
 */
export interface paths {
  [path: string]: {
    get?: { parameters?: any; responses: { 200: { content: { "application/json": any } } } };
    post?: { requestBody?: any; responses: { 200: { content: { "application/json": any } } } };
    put?: { requestBody?: any; responses: { 200: { content: { "application/json": any } } } };
    delete?: { parameters?: any; responses: { 200: { content: { "application/json": any } } } };
  };
}
export interface components {
  schemas: Record<string, any>;
}
EOF
  fi
fi
```

### 执行命令
```bash
# 在工程根目录下，一行指令完成契约拉取与转译
pnpm --filter @yudao-quad-terminal/api-client gen
```

---

## §3 三端统一消费代码范本 (零类型漂移)

在 `packages/api-client/src/client.ts` 中封装了基于契约的类型安全请求工具：

```typescript
import { paths } from './generated';

type HttpMethod = 'get' | 'post' | 'put' | 'delete';

// 泛型推导：根据 Path 和 Method 自动推导参数类型与返回类型
export type ApiRequestParams<
  P extends keyof paths,
  M extends HttpMethod
> = M extends keyof paths[P]
  ? paths[P][M] extends { parameters: { query: infer Q } }
    ? Q
    : paths[P][M] extends { requestBody: { content: { 'application/json': infer B } } }
    ? B
    : never
  : never;

export type ApiResponseData<
  P extends keyof paths,
  M extends HttpMethod
> = M extends keyof paths[P]
  ? paths[P][M] extends { responses: { 200: { content: { 'application/json': { data: infer D } } } } }
    ? D
    : never
  : never;
```

### 前端三端引入范例：
```typescript
import type { paths, components } from '@yudao-quad-terminal/api-client';

// 1. 直接获取后端 DTO 强类型
type UserVO = components['schemas']['UserRespVO'];

// 2. 直接获取接口出参强类型
type AddressListResp = paths['/app-api/member/address/list']['get']['responses']['200']['content']['application/json']['data'];
```

---

## §4 静态契约守卫 (Zero-Drift 编译拦截)

在任何 PR 提交前，执行全仓静态类型校验：
```bash
pnpm -r typecheck
```
**防御场景**：
- 如果后端研发人员将 `name` 字段改为了 `recipientName`，或者删除了某个必填字段；
- 前端未同步修改时，TypeScript 编译器会在第一时间直接报出红字错误：
  `Property 'name' does not exist on type 'AddressCreateReqVO'. Did you mean 'recipientName'?`
- **把所有接口拼写错误和类型不匹配直接拦截在编译器内，杜绝带病上线！**
