# 补丁: yudao-cloud-bootstrap skill 加 pnpm monorepo workspace 架构

## 老板新指示
「前后端都要 pnpm monorepo, workspace 方案」

## 在原 brief 基础上追加 §8 节到 SKILL.md

正文 (§8 §8 pnpm monorepo workspace 强制架构) — 必含 8 个子节:

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
│   │   └── pom.xml         # 后端唯一入口
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
│   ├── shared-types/      # 跨端共享 TS 类型 (DTO/Enum)
│   ├── eslint-config/     # 共享 ESLint 配置
│   └── tsconfig/          # 共享 TS 配置 (base.json + node.json + web.json)
├── scripts/
│   ├── trim-modules.sh    # 一键裁剪 yudao-cloud 多余 module
│   ├── gen-api-sdk.sh     # 从 Knife4j 生成 api-client
│   └── bootstrap.sh       # 一键引导新项目
├── pnpm-workspace.yaml
├── package.json           # root, scripts: dev/build/test/lint/typecheck 全用 pnpm -r
├── pnpm-lock.yaml
├── .npmrc                 # hoist-pattern:false (避免 expo/native 冲突)
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
    "typescript": "^5.0.0",
    "vite": "^5.0.0",
    "vue": "^3.4.0",
    "pinia": "^2.1.0",
    "@vueuse/core": "^10.0.0"
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

# 3. 后端 Maven 仓库 (apps/backend 单独处理)
# backend 用 mvn 不走 npm, 在 apps/backend/.mvn/ 独立配置

# 4. workspace 内部互引
auto-install-peers=true
strict-peer-dependencies=false
```

### §8.5 trim-modules.sh (一键裁剪 yudao-cloud 多余 module)
放在 scripts/trim-modules.sh, 输入要判断:
  - 选 JDK (--jdk 8|17|21|25)
  - 选保留 module (--keep system,infra,member,pay,report)
  - 选剔除 module (--remove bpm,crm,erp,mes,fms,hrm,im,iot,mall,mp,oa,pms,wms,ai)
伪代码:
```bash
#!/usr/bin/env bash
# trim-modules.sh - 一键裁剪 yudao-cloud
JDK="${JDK:-17}"
KEEP_MODULES=(${KEEP_MODULES:-system infra member pay report})
REMOVE_MODULES=(${REMOVE_MODULES:-bpm crm erp mes fms hrm im iot mall mp oa pms wms ai})

cd apps/backend
# 1. 删除多余 module 目录
for m in "${REMOVE_MODULES[@]}"; do
  rm -rf "yudao-module-$m"
done

# 2. 从 pom.xml 删除 <module> 行
sed -i.bak "/<module>yudao-module-\($(IFS='|'; echo "${REMOVE_MODULES[*]}")\)<\/module>/d" pom.xml

# 3. mvn 验证编译
mvn clean compile -pl '!yudao-ui-admin-vue3' -am
echo "✅ 裁剪完成: $(ls -d yudao-module-* | wc -l) modules, $(find . -name '*.java' | wc -l) Java files"
```

### §8.6 gen-api-sdk.sh (从 Knife4j/OpenAPI 生成 api-client TS SDK)
放在 scripts/gen-api-sdk.sh, 依赖 openapi-typescript-codegen 或 orval:
```bash
#!/usr/bin/env bash
# 从后端 Knife4j 拉 OpenAPI JSON -> 生成 packages/api-client
set -e
API_URL="${API_URL:-http://localhost:8080/v3/api-docs}"
OUTPUT_DIR="packages/api-client/src/generated"

mkdir -p "$OUTPUT_DIR"
curl -fsSL "$API_URL" -o /tmp/openapi.json

# 用 openapi-typescript 生成
npx --yes openapi-typescript /tmp/openapi.json --output "$OUTPUT_DIR/index.ts"

# 暴露 axios 实例
cat > "$OUTPUT_DIR/client.ts" <<'EOF'
import axios from 'axios'
export const httpClient = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL })
EOF

echo "✅ api-client 已生成: $(wc -l < $OUTPUT_DIR/index.ts) 行"
```

### §8.7 apps/admin/h5/miniapp 与 api-client 互引约定
- apps/admin 和 apps/h5 通过 `import { UserAPI } from '@yudao-monorepo/api-client'` 调用后端
- apps/miniapp (uni-app) 通过 `import http from '@/utils/http'` 直接 axios 调用 (uni-app 跨端兼容 axios)
- 后端返回 JSON 格式严格遵守 §6 统一返回格式 (code/msg/data)

### §8.8 与原 Coolie monorepo 的 3 个借鉴
  - Coolie 自己用 `packages/* + packages/adapters/* + server + ui + cli` (含特殊豁免 `clients/expo` standalone)
  - **本 skill 默认 apps/* 强制纳入 workspace, 不准 standalone** (除非要原生 RN/Expo)
  - 共享 packages/api-client 是 Coolie 现有 `clients/api-client` 的升级版

## 修法 (不改原有 brief, 直接 append §8)
打开 `skills/yudao-cloud-bootstrap/SKILL.md`, 在文末追加 §8 节 (8.1~8.8 共 8 子节, 总长约 300+ 行)

## 验收 (在原 brief 基础上加)
✅ 必备新增输出 (markdown):
- §8 实际行数 (8 子节, 约 300+ 行)
- pnpm-workspace.yaml / package.json / .npmrc / trim-modules.sh / gen-api-sdk.sh 5 个代码模板各给完整一份 (含 ASCII 注释)
- 引用真实数据: pnpm 9.x / vite 5.x / vue 3.4 / pinia 2.1 真实最新版本号

⚠️ 重要: 不准编造 npm 包版本号。要么从 npm 查，要么标"待 pnpm latest 校准"。

## Rules (继承原 brief)
- 单写 (不并发)
- 不输出 keystore 密码 / token / secrets
- 不引入 mock 数据
- 卡 4h 必须回报 stuck
- 不动 skills/ 下其他文件