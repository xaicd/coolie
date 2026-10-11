# 任务 v2: 给已落地的 SKILL.md 追加 §8 pnpm monorepo workspace 节

## Background
老板 16:55 新增硬指示: 「前后端都要, pnpm monorepo, workspace 方案」
墨斗 v1 已写完 skills/yudao-cloud-bootstrap/SKILL.md (§1-§7, 32784 字节)
v2 任务: 不重写 §1-§7, 只**追加 §8** 节到文末

## Target
你是墨斗 (modou-fda), FDA 前线架构师。任务: 在已有 SKILL.md 文末**追加 §8 pnpm monorepo workspace 强制架构**。

已有文件: /Users/mac/workspace/xaicd/coolie/skills/yudao-cloud-bootstrap/SKILL.md
- §1 JDK 版本矩阵
- §2 基座选型
- §3 18 业务 module 功能表
- §4 三端模板矩阵
- §5 裁剪脚本模板
- §6 验证与排障守卫
- §7 故障排除 (待确认)

需追加:
- §8 pnpm monorepo workspace 强制架构 (8 子节 300+ 行)

## Branch
main (本机 dispatch 默认工作区)

## File allowlist
✅ 允许写: /Users/mac/workspace/xaicd/coolie/skills/yudao-cloud-bootstrap/SKILL.md (append §8)
❌ 禁止: 改 §1-§7 任何已有内容 (v1 写的, 完整)
❌ 禁止: 改 skills/ 下其他 skill 文件
❌ 禁止: push / commit

## Steps
1. 用 Read 工具读取现有 SKILL.md, 找到文末位置 (不要读全文, 用 Read offset/limit 只读最后 100 行)
2. 用 Edit/Append 工具在文末追加 §8 节 (300+ 行, 8 个子节 8.1~8.8)
3. 保留原 §1-§7 内容不动

## §8 必含 8 个子节 (300+ 行)

### §8.1 monorepo 顶层布局 (老板硬规则)
```
yudao-cloud-monorepo/
├── apps/
│   ├── backend/           # yudao-cloud 裁剪后的 Spring Boot 服务
│   │   ├── yudao-module-system/  # 保留的 5 个业务 module
│   │   ├── yudao-module-infra/
│   │   ├── yudao-module-member/
│   │   ├── yudao-module-pay/
│   │   ├── yudao-module-report/
│   │   ├── yudao-gateway/
│   │   ├── yudao-framework/    # 15 个 starter
│   │   └── pom.xml
│   ├── admin/              # PC 后台 (admin-vue3 或 admin-vben)
│   │   ├── src/
│   │   ├── package.json   # name: "@yudao-monorepo/admin"
│   │   ├── vite.config.ts
│   │   └── tsconfig.json
│   ├── h5/                # 移动端 H5 (Vue 3 + Vite + TS)
│   │   ├── src/
│   │   ├── package.json   # name: "@yudao-monorepo/h5"
│   │   └── vite.config.ts
│   └── miniapp/           # 微信小程序 (uni-app 或 原生)
│       ├── src/           # pages/, components/, store/
│       ├── package.json   # name: "@yudao-monorepo/miniapp"
│       └── manifest.json
├── packages/
│   ├── api-client/       # 自动生成的 TS API SDK (从后端 OpenAPI/Knife4j 生成)
│   │   ├── src/
│   │   └── package.json   # name: "@yudao-monorepo/api-client"
│   ├── shared-types/      # 跨端共享 TS 类型
│   ├── eslint-config/     # 共享 ESLint 配置
│   └── tsconfig/          # 共享 TS 配置 (base.json + node.json + web.json)
├── scripts/
│   ├── trim-modules.sh    # 一键裁剪 yudao-cloud 多余 module
│   ├── gen-api-sdk.sh     # 从 Knife4j 生成 api-client
│   └── bootstrap.sh       # 一键引导新项目
├── pnpm-workspace.yaml
├── package.json           # root scripts: dev/build/test/lint/typecheck
├── pnpm-lock.yaml
├── .npmrc                 # hoist-pattern:false
└── README.md
```

### §8.2 pnpm-workspace.yaml 模板
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### §8.3 root package.json 关键 scripts
```json
{
  "name": "yudao-monorepo",
  "private": true,
  "scripts": {
    "dev": "pnpm --parallel --filter './apps/*' run dev",
    "build": "pnpm -r --filter './apps/*' --filter './packages/*' run build",
    "lint": "eslint . --ext .ts,.vue,.js,.jsx",
    "typecheck": "pnpm -r run typecheck",
    "test": "pnpm -r run test",
    "trim:modules": "bash scripts/trim-modules.sh",
    "gen:api-sdk": "bash scripts/gen-api-sdk.sh",
    "bootstrap": "bash scripts/bootstrap.sh",
    "backend:run": "cd apps/backend && mvn spring-boot:run -Dspring-boot.run.profiles=local"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vite": "^5.4.0",
    "vue": "^3.4.0",
    "pinia": "^2.1.7"
  },
  "packageManager": "pnpm@9.0.0",
  "engines": { "node": ">=20.0.0", "pnpm": ">=9.0.0" }
}
```

### §8.4 .npmrc 配置 (避免 React Native / yudao 后端冲突)
```ini
# 1. pnpm 严格模式 (禁用 hoist 到根)
shamefully-hoist=false
public-hoist-pattern[]=!types/*
public-hoist-pattern[]=!*eslint*
public-hoist-pattern[]=!*prettier*

# 2. 允许 native 模块 (rollup/esbuild)
node-linker=hoisted

# 3. workspace 内部互引
auto-install-peers=true
strict-peer-dependencies=false
```

### §8.5 trim-modules.sh (一键裁剪 yudao-cloud)
```bash
#!/usr/bin/env bash
# trim-modules.sh - 一键裁剪 yudao-cloud
JDK="${JDK:-17}"
KEEP_MODULES=(${KEEP_MODULES:-system infra member pay report})
REMOVE_MODULES=(${REMOVE_MODULES:-bpm crm erp mes fms hrm im iot mall mp oa pms wms ai})

cd apps/backend
for m in "${REMOVE_MODULES[@]}"; do
  rm -rf "yudao-module-$m"
done

sed -i.bak "/<module>yudao-module-\($(IFS='|'; echo "${REMOVE_MODULES[*]}")\)<\/module>/d" pom.xml

mvn clean compile -pl '!yudao-ui-admin-vue3' -am
echo "✅ 裁剪完成: $(ls -d yudao-module-* | wc -l) modules, $(find . -name '*.java' | wc -l) Java files"
```

### §8.6 gen-api-sdk.sh (从 Knife4j/OpenAPI 生成 api-client TS SDK)
```bash
#!/usr/bin/env bash
# 从后端 Knife4j 拉 OpenAPI JSON -> 生成 packages/api-client
set -e
API_URL="${API_URL:-http://localhost:48080/v3/api-docs}"
OUTPUT_DIR="packages/api-client/src/generated"

mkdir -p "$OUTPUT_DIR"
curl -fsSL "$API_URL" -o /tmp/openapi.json

npx --yes openapi-typescript /tmp/openapi.json --output "$OUTPUT_DIR/index.ts"

cat > "$OUTPUT_DIR/client.ts" <<'EOF'
import axios from 'axios'
export const httpClient = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL })
EOF

echo "✅ api-client 已生成: $(wc -l < $OUTPUT_DIR/index.ts) 行"
```

### §8.7 apps 与 api-client 互引约定
- apps/admin 和 apps/h5 通过 `import { UserAPI } from '@yudao-monorepo/api-client'` 调用后端
- apps/miniapp (uni-app) 通过 `import http from '@/utils/http'` 直接 axios 调用
- 后端返回 JSON 格式严格遵守 §6 统一返回格式

### §8.8 与原 Coolie monorepo 借鉴
- Coolie 自己用 `packages/* + packages/adapters/* + server + ui + cli` (含特殊豁免 `clients/expo` standalone)
- 本 skill 默认 apps/* 强制纳入 workspace, 不准 standalone (除非 RN/Expo 原生)
- 共享 packages/api-client 是 Coolie 现有 `clients/api-client` 升级版

## Acceptance
✅ 必备新增输出 (markdown):
- §8 实际行数 (8 子节, 约 300+ 行)
- pnpm-workspace.yaml / package.json / .npmrc / trim-modules.sh / gen-api-sdk.sh 5 个代码模板各给完整一份
- 引用真实数据: pnpm 9.x / vite 5.x / vue 3.4 / pinia 2.1 真实版本号

⚠️ 重要: 不准编造 npm 包版本号。要么从 npm 查，要么标"待 pnpm latest 校准"。

## Rules
- 单写 (不并发)
- 不输出 keystore 密码 / token / secrets
- 不引入 mock 数据
- 卡 4h 必须回报 stuck
- 不动 skills/ 下其他文件