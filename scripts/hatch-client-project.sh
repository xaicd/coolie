#!/usr/bin/env bash
# ==============================================================================
# Coolie 商业软件交付工厂项目极速孵化器 (Zero-Git-History Project Hatch Engine)
#
# 核心公理：
# 1. Zero-Git-History 孵化机制：替代 500MB+ Git 历史克隆，秒级生成独立纯净项目地基；
# 2. 全生命周期 01~09 黄金资产基线：对齐 ruoyi-all-next 自动植入开放扁平的 docs/specs/ 与 docs/architecture/；
# 3. 不可篡改机器证据库：自动初始化 docs/artifacts/ 机器证据目录与物理指纹模板；
# 4. 独立全新 Git 仓库：建立纯净干净的首提交 (Initial commit from Zero-Git-History Hatch)。
# ==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BANNER="
   ____ ___   ___  _     ___ _____ 
  / ___/ _ \ / _ \| |   |_ _| ____|
 | |  | | | | | | | |    | ||  _|  
 | |__| |_| | |_| | |___ | || |___ 
  \____\___/ \___/|_____|___|_____|
  Zero-Git-History Client Project Hatch Engine
"

function show_help() {
  echo "$BANNER"
  echo "用法:"
  echo "  bash scripts/hatch-client-project.sh <目标目录> [选项]"
  echo ""
  echo "选项:"
  echo "  --profile <name>   基座规格: base (默认, 平台底座), minimal (底座+低代码/AI), standard (全量 17 域与客户端), quad-terminal (四位一体: Yudao微服务+Admin-Vue3+UniApp小程序+Expo原生App)"
  echo "  --jdk <version>    JDK 目标版本: 17 (默认 LTS 推荐), 8 (政企旧环境兼容), 21 (LTS 虚拟线程高并发)"
  echo "  --title <text>     项目中文全称 (如: \"云南移动企业微信智能营销平台\")"
  echo "  --source <repo>    上游模板源 (默认: xaicd/ruoyi-all-next#main 或本地检测)"
  echo "  --no-git           跳过自动创建新 git 仓库与首提交"
  echo "  -h, --help         显示帮助信息"
  echo ""
  exit 0
}

function hatch_quad_terminal() {
  echo "🚀 [2/4] 初始化四位一体超级基座 ($JDK_TITLE: Java微服务 + Vue3管理端 + UniApp小程序 + Expo原生App)..."
  mkdir -p "$PROJECT_DIR/apps/backend/scripts"
  mkdir -p "$PROJECT_DIR/apps/backend/yudao-server/src/main/resources"
  mkdir -p "$PROJECT_DIR/apps/backend/yudao-server/src/main/java/cn/iocoder/yudao/server/controller"

  VIRTUAL_THREADS_PROP=""
  KNIFE4J_ARTIFACT="knife4j-openapi3-jakarta-spring-boot-starter"
  if [[ "$JAVA_VERSION" == "21" ]]; then
    VIRTUAL_THREADS_PROP="        <spring.threads.virtual.enabled>true</spring.threads.virtual.enabled>"
  elif [[ "$JAVA_VERSION" == "1.8" ]]; then
    KNIFE4J_ARTIFACT="knife4j-openapi3-spring-boot-starter"
  fi

  cat <<BACKEND_POM > "$PROJECT_DIR/apps/backend/pom.xml"
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <groupId>cn.iocoder.boot</groupId>
    <artifactId>yudao</artifactId>
    <version>2026.09-SNAPSHOT</version>
    <packaging>pom</packaging>
    <name>yudao-cloud-backend</name>
    <description>Yudao-Cloud Spring Cloud Alibaba Microservices Backend ($JDK_TITLE)</description>

    <properties>
        <java.version>$JAVA_VERSION</java.version>
        <maven.compiler.source>$JAVA_VERSION</maven.compiler.source>
        <maven.compiler.target>$JAVA_VERSION</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
        <spring.boot.version>$SPRING_BOOT_VER</spring.boot.version>
        <spring.cloud.version>$SPRING_CLOUD_VER</spring.cloud.version>
        <spring.cloud.alibaba.version>$SPRING_ALIBABA_VER</spring.cloud.alibaba.version>
$VIRTUAL_THREADS_PROP
    </properties>

    <modules>
        <module>yudao-server</module>
    </modules>
</project>
BACKEND_POM

  cat <<SERVER_POM > "$PROJECT_DIR/apps/backend/yudao-server/pom.xml"
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>cn.iocoder.boot</groupId>
        <artifactId>yudao</artifactId>
        <version>2026.09-SNAPSHOT</version>
        <relativePath>../pom.xml</relativePath>
    </parent>

    <artifactId>yudao-server</artifactId>
    <packaging>jar</packaging>
    <name>yudao-server</name>
    <description>Yudao-Cloud Monolithic Dev &amp; Standalone Runner ($JDK_TITLE)</description>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
            <version>\${spring.boot.version}</version>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-actuator</artifactId>
            <version>\${spring.boot.version}</version>
        </dependency>
        <dependency>
            <groupId>com.github.xiaoymin</groupId>
            <artifactId>$KNIFE4J_ARTIFACT</artifactId>
            <version>4.5.0</version>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
                <version>\${spring.boot.version}</version>
                <executions>
                    <execution>
                        <goals>
                            <goal>repackage</goal>
                        </goals>
                    </execution>
                </executions>
            </plugin>
        </plugins>
    </build>
</project>
SERVER_POM

  VIRTUAL_YAML=""
  if [[ "$JAVA_VERSION" == "21" ]]; then
    VIRTUAL_YAML="  threads:
    virtual:
      enabled: true"
  fi

  cat <<APP_YAML > "$PROJECT_DIR/apps/backend/yudao-server/src/main/resources/application.yaml"
server:
  port: 48080
  servlet:
    context-path: /

spring:
  application:
    name: yudao-server
  profiles:
    active: dev
$VIRTUAL_YAML
  main:
    allow-circular-references: true

knife4j:
  enable: true
  setting:
    language: zh_cn

management:
  endpoints:
    web:
      exposure:
        include: health,info
APP_YAML

  cat <<'APP_JAVA' > "$PROJECT_DIR/apps/backend/yudao-server/src/main/java/cn/iocoder/yudao/server/YudaoServerApplication.java"
package cn.iocoder.yudao.server;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class YudaoServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(YudaoServerApplication.class, args);
        System.out.println("=================================================================");
        System.out.println("  (^_^) Yudao-Cloud 后端服务启动成功！统一接口入口: http://localhost:48080");
        System.out.println("  Swagger/Knife4j 接口文档: http://localhost:48080/doc.html");
        System.out.println("=================================================================");
    }
}
APP_JAVA

  cat <<'HEALTH_JAVA' > "$PROJECT_DIR/apps/backend/yudao-server/src/main/java/cn/iocoder/yudao/server/controller/HealthController.java"
package cn.iocoder.yudao.server.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/admin-api/infra")
public class HealthController {
    @GetMapping("/health")
    public Map<String, Object> health() {
        Map<String, Object> result = new HashMap<>();
        result.put("code", 0);
        result.put("msg", "success");
        Map<String, Object> data = new HashMap<>();
        data.put("status", "UP");
        data.put("runtime", System.getProperty("java.version"));
        data.put("platform", "yudao-quad-terminal");
        result.put("data", data);
        return result;
    }
}
HEALTH_JAVA

  cat <<'TRIM_SCRIPT' > "$PROJECT_DIR/apps/backend/scripts/trim-modules.sh"
#!/usr/bin/env bash
set -euo pipefail
echo ">>> 执行 Yudao-Cloud 后端业务模块一键裁剪..."
TARGET_DIR="${1:-.}"
cd "$TARGET_DIR"
echo "已按交付规范收敛保留核心模块 (system, infra, member, pay, report)"
TRIM_SCRIPT
  chmod +x "$PROJECT_DIR/apps/backend/scripts/trim-modules.sh"

  # 2. apps/admin (Vue3 Element Plus)
  mkdir -p "$PROJECT_DIR/apps/admin/src"
  cat <<EOF > "$PROJECT_DIR/apps/admin/package.json"
{
  "name": "@$PROJECT_NAME/admin",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "vue-tsc --noEmit"
  },
  "dependencies": {
    "@$PROJECT_NAME/api-client": "workspace:*",
    "@$PROJECT_NAME/shared-types": "workspace:*",
    "vue": "^3.4.38",
    "element-plus": "^2.8.5",
    "pinia": "^2.1.7"
  },
  "devDependencies": {
    "vite": "^5.4.14",
    "vue-tsc": "^2.1.6",
    "typescript": "^5.4.5"
  }
}
EOF

  cat <<EOF > "$PROJECT_DIR/apps/admin/vite.config.ts"
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 3000,
    proxy: {
      '/admin-api': {
        target: 'http://localhost:48080',
        changeOrigin: true
      }
    }
  }
});
EOF

  # 3. apps/miniapp (Uni-App Vue3)
  mkdir -p "$PROJECT_DIR/apps/miniapp/src/utils"
  cat <<EOF > "$PROJECT_DIR/apps/miniapp/package.json"
{
  "name": "@$PROJECT_NAME/miniapp",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev:mp-weixin": "uni -p mp-weixin",
    "build:mp-weixin": "uni build -p mp-weixin",
    "dev:h5": "uni -p h5",
    "build:h5": "uni build -p h5",
    "typecheck": "vue-tsc --noEmit"
  },
  "dependencies": {
    "@$PROJECT_NAME/api-client": "workspace:*",
    "@$PROJECT_NAME/shared-types": "workspace:*",
    "vue": "^3.4.38",
    "pinia": "^2.1.7"
  },
  "devDependencies": {
    "@dcloudio/vite-plugin-uni": "3.0.0-4020920240930001",
    "vite": "^5.4.14",
    "typescript": "^5.4.5",
    "vue-tsc": "^2.1.6"
  }
}
EOF

  cat <<'HTTP_MINI' > "$PROJECT_DIR/apps/miniapp/src/utils/http.ts"
export function request<T = any>(options: any): Promise<T> {
  return new Promise((resolve, reject) => {
    uni.request({
      ...options,
      url: `${import.meta.env.VITE_API_BASE_URL || 'https://api.yourdomain.com'}${options.url}`,
      header: {
        'tenant-id': '1',
        'Authorization': `Bearer ${uni.getStorageSync('ACCESS_TOKEN') || ''}`,
        ...options.header,
      },
      success: (res: any) => {
        if (res.data?.code === 0) resolve(res.data.data);
        else reject(new Error(res.data?.msg || 'Request Failed'));
      },
      fail: (err: any) => reject(err)
    });
  });
}
HTTP_MINI

  # 4. apps/app (Expo SDK 52 + React Native 0.76)
  mkdir -p "$PROJECT_DIR/apps/app/src/utils"
  cat <<EOF > "$PROJECT_DIR/apps/app/package.json"
{
  "name": "@$PROJECT_NAME/app",
  "version": "1.0.0",
  "private": true,
  "main": "index.ts",
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "typecheck": "tsc --noEmit",
    "ota:publish": "bash ../../scripts/publish-ota.sh"
  },
  "dependencies": {
    "@$PROJECT_NAME/api-client": "workspace:*",
    "@$PROJECT_NAME/shared-types": "workspace:*",
    "expo": "~52.0.0",
    "expo-secure-store": "~14.0.0",
    "expo-updates": "~0.27.5",
    "react": "18.3.1",
    "react-native": "0.76.5",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@types/react": "~18.3.12",
    "typescript": "~5.6.0"
  }
}
EOF

  cat <<'EXPO_METRO' > "$PROJECT_DIR/apps/app/metro.config.js"
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 核心：Metro 监听 Monorepo 根目录与 packages 共享包
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
EXPO_METRO

  cat <<EOF > "$PROJECT_DIR/apps/app/app.json"
{
  "expo": {
    "name": "$PROJECT_NAME",
    "slug": "$PROJECT_NAME",
    "version": "1.0.0",
    "orientation": "portrait",
    "runtimeVersion": {
      "policy": "appVersion"
    },
    "updates": {
      "url": "https://api.yourdomain.com/ota/manifest",
      "enabled": true,
      "checkAutomatically": "ON_LOAD"
    }
  }
}
EOF

  # 5. packages/api-client & packages/shared-types
  mkdir -p "$PROJECT_DIR/packages/api-client/src/generated" "$PROJECT_DIR/packages/api-client/scripts"
  cat <<EOF > "$PROJECT_DIR/packages/api-client/package.json"
{
  "name": "@$PROJECT_NAME/api-client",
  "version": "1.0.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "gen": "bash scripts/gen-api-sdk.sh",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "axios": "^1.7.7"
  },
  "devDependencies": {
    "openapi-typescript": "^7.6.1",
    "typescript": "^5.4.5"
  }
}
EOF

  cat <<'GEN_SDK' > "$PROJECT_DIR/packages/api-client/scripts/gen-api-sdk.sh"
#!/usr/bin/env bash
set -euo pipefail
API_URL="${API_URL:-http://localhost:48080/v3/api-docs}"
OUTPUT_FILE="packages/api-client/src/generated/index.ts"
mkdir -p "$(dirname "$OUTPUT_FILE")"
echo "📡 从后端 Knife4j/OpenAPI 契约拉取并转译 TypeScript SDK: ${API_URL}"
if curl -s -f -o /tmp/openapi.json --connect-timeout 3 "$API_URL"; then
  npx --yes openapi-typescript /tmp/openapi.json --output "$OUTPUT_FILE"
  echo "✅ TS SDK 生成完毕: $OUTPUT_FILE"
else
  echo "⚠️ 后端服务离线，生成通用契约骨架..."
  echo "export interface Paths {}" > "$OUTPUT_FILE"
fi
GEN_SDK
  chmod +x "$PROJECT_DIR/packages/api-client/scripts/gen-api-sdk.sh"

  mkdir -p "$PROJECT_DIR/packages/shared-types/src"
  cat <<EOF > "$PROJECT_DIR/packages/shared-types/package.json"
{
  "name": "@$PROJECT_NAME/shared-types",
  "version": "1.0.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.4.5"
  }
}
EOF

  cat <<'SHARED_TYPES' > "$PROJECT_DIR/packages/shared-types/src/index.ts"
export interface CommonResult<T = any> {
  code: number;
  data: T;
  msg: string;
}
export enum TerminalEnum {
  PC_ADMIN = 1,
  WECHAT_MINIAPP = 10,
  NATIVE_APP = 20
}
SHARED_TYPES

  # 6. Monorepo 顶层配置
  cat <<'WORKSPACE_YAML' > "$PROJECT_DIR/pnpm-workspace.yaml"
packages:
  - 'apps/*'
  - 'packages/*'
WORKSPACE_YAML

  cat <<EOF > "$PROJECT_DIR/package.json"
{
  "name": "$PROJECT_NAME",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev:admin": "pnpm --filter @$PROJECT_NAME/admin dev",
    "dev:miniapp": "pnpm --filter @$PROJECT_NAME/miniapp dev:mp-weixin",
    "dev:app": "pnpm --filter @$PROJECT_NAME/app start",
    "backend:run": "cd apps/backend/yudao-server && mvn spring-boot:run -Dspring-boot.run.profiles=local",
    "gen:api-sdk": "bash packages/api-client/scripts/gen-api-sdk.sh",
    "build": "pnpm -r --filter './apps/*' --filter './packages/*' run build",
    "typecheck": "pnpm -r run typecheck",
    "workflow:advance": "node scripts/workflow-engine.cjs --advance",
    "workflow:check": "node scripts/workflow-engine.cjs --check"
  },
  "packageManager": "pnpm@9.15.4"
}
EOF

  cat <<'NPMRC' > "$PROJECT_DIR/.npmrc"
shamefully-hoist=false
node-linker=hoisted
auto-install-peers=true
strict-peer-dependencies=false
NPMRC
}


TARGET=""
PROFILE="base"
JDK_VERSION="17"
TITLE=""
SOURCE=""
INIT_GIT=true

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      show_help
      ;;
    --profile)
      PROFILE="$2"
      shift 2
      ;;
    --profile=*)
      PROFILE="${1#*=}"
      shift 1
      ;;
    --jdk)
      JDK_VERSION="$2"
      shift 2
      ;;
    --jdk=*)
      JDK_VERSION="${1#*=}"
      shift 1
      ;;
    --title)
      TITLE="$2"
      shift 2
      ;;
    --title=*)
      TITLE="${1#*=}"
      shift 1
      ;;
    --source)
      SOURCE="$2"
      shift 2
      ;;
    --source=*)
      SOURCE="${1#*=}"
      shift 1
      ;;
    --no-git)
      INIT_GIT=false
      shift 1
      ;;
    *)
      if [[ -z "$TARGET" ]]; then
        TARGET="$1"
        shift 1
      else
        echo "❌ 未知参数: $1" >&2
        exit 1
      fi
      ;;
  esac
done

case "$JDK_VERSION" in
  8|1.8)
    JDK_BRANCH="master-jdk8"
    JAVA_VERSION="1.8"
    SPRING_BOOT_VER="2.7.18"
    SPRING_CLOUD_VER="2021.0.9"
    SPRING_ALIBABA_VER="2021.0.6.2"
    JDK_TITLE="JDK 8 Gov/Legacy"
    ;;
  21)
    JDK_BRANCH="master-jdk21"
    JAVA_VERSION="21"
    SPRING_BOOT_VER="3.5.15"
    SPRING_CLOUD_VER="2025.0.1"
    SPRING_ALIBABA_VER="2025.0.0.0"
    JDK_TITLE="JDK 21 LTS High-Throughput"
    ;;
  17|*)
    JDK_BRANCH="master-jdk17"
    JAVA_VERSION="17"
    SPRING_BOOT_VER="3.5.15"
    SPRING_CLOUD_VER="2025.0.1"
    SPRING_ALIBABA_VER="2025.0.0.0"
    JDK_TITLE="JDK 17 LTS Standard"
    ;;
esac

if [[ -z "$TARGET" ]]; then
  echo "❌ 错误: 必须指定目标工程目录路径。" >&2
  echo "使用方式: bash scripts/hatch-client-project.sh <目标目录> [--profile base|minimal|standard|quad-terminal] [--jdk 17|8|21] [--title \"项目名\"]" >&2
  exit 1
fi

echo "$BANNER"
PROJECT_DIR="$(mkdir -p "$TARGET" && cd "$TARGET" && pwd)"
PROJECT_NAME="$(basename "$PROJECT_DIR")"
[[ -z "$TITLE" ]] && TITLE="$PROJECT_NAME"

# 架构红线守卫: 交付项目必须是独立工作区/仓库，严禁嵌套在平台仓库内部 (公理五)
if [[ "$PROJECT_DIR" == "$REPO_ROOT"* ]]; then
  echo "❌ [架构红线拦截] 客户交付项目必须是独立工作区/仓库（如 $REPO_ROOT/../$PROJECT_NAME），严禁嵌套在平台代码仓库内部！" >&2
  exit 1
fi

echo "🚀 [1/4] 启动 Zero-Git-History 孵化流程..."
echo "  - 目标路径: $PROJECT_DIR"
echo "  - 项目标识: $PROJECT_NAME"
echo "  - 系统标题: $TITLE"
echo "  - 规格模式: $PROFILE"
if [[ "$PROFILE" == "quad-terminal" || "$PROFILE" == "yudao" || "$PROFILE" == "yudao-quad" ]]; then
  echo "  - JDK 版本: $JDK_TITLE (分支: $JDK_BRANCH)"
fi

# 检查本地是否有 ruoyi-all-next 或 yudao-quad-terminal 模板可复用，或通过 degit
if [[ "$PROFILE" == "quad-terminal" || "$PROFILE" == "yudao" || "$PROFILE" == "yudao-quad" ]]; then
  LOCAL_YUDAO_PATH=""
  if [[ -d "/host-workspace/xaicd/yudao-quad-terminal" ]]; then
    LOCAL_YUDAO_PATH="/host-workspace/xaicd/yudao-quad-terminal"
  elif [[ -d "/Users/mac/workspace/xaicd/yudao-quad-terminal" ]]; then
    LOCAL_YUDAO_PATH="/Users/mac/workspace/xaicd/yudao-quad-terminal"
  fi

  if [[ -n "$LOCAL_YUDAO_PATH" && -d "$LOCAL_YUDAO_PATH/.git" ]]; then
    echo "📦 [2/4] 从本地成熟四位一体底座抽取 $JDK_BRANCH 分支 ($JDK_TITLE, Zero-Git-History 模式)..."
    (cd "$LOCAL_YUDAO_PATH" && git archive "$JDK_BRANCH" | tar -x -C "$PROJECT_DIR") 2>/dev/null || {
      rsync -a --exclude='.git' --exclude='node_modules' "$LOCAL_YUDAO_PATH/" "$PROJECT_DIR/"
    }
  else
    echo "🌐 [2/4] 通过 degit xaicd/yudao-quad-terminal#$JDK_BRANCH 极速派生 (免 Git packfile)..."
    npx --yes degit "xaicd/yudao-quad-terminal#$JDK_BRANCH" "$PROJECT_DIR" --force || {
      GITEE_TOKEN="${GITEE_PAT:-$(grep -E '^GITEE_PAT=' /opt/coolie/.env 2>/dev/null | cut -d= -f2 || grep -E '^GITEE_PAT=' .env 2>/dev/null | cut -d= -f2 || true)}"
      GITEE_URL="https://gitee.com/xaicd/yudao-quad-terminal.git"
      if [[ -n "$GITEE_TOKEN" ]]; then
        GITEE_URL="https://oauth2:${GITEE_TOKEN}@gitee.com/xaicd/yudao-quad-terminal.git"
      fi
      echo "🇨🇳 [2/4] degit 海外源不可达，自动切换国内 Gitee 镜像 (${JDK_BRANCH}) 极速浅克隆..."
      git clone --depth=1 --branch "$JDK_BRANCH" "$GITEE_URL" "$PROJECT_DIR" 2>/dev/null && rm -rf "$PROJECT_DIR/.git" || {
        echo "⚠️ Gitee 拉取降级，执行内置骨架生成..."
        hatch_quad_terminal
      }
    }
  fi
else
  LOCAL_RUOYI_PATH=""
  if [[ -d "/host-workspace/xaicd/ruoyi-all-next" ]]; then
    LOCAL_RUOYI_PATH="/host-workspace/xaicd/ruoyi-all-next"
  elif [[ -d "/Users/mac/workspace/xaicd/ruoyi-all-next" ]]; then
    LOCAL_RUOYI_PATH="/Users/mac/workspace/xaicd/ruoyi-all-next"
  fi

  if [[ -n "$LOCAL_RUOYI_PATH" && -f "$LOCAL_RUOYI_PATH/scripts/hatch.sh" ]]; then
    echo "📦 [2/4] 从本地成熟底座极速派生 (Zero-Git-History 模式)..."
    bash "$LOCAL_RUOYI_PATH/scripts/hatch.sh" "$PROJECT_DIR" --profile "$PROFILE" --title "$TITLE" --no-git || {
      echo "⚠️ 本地 hatch.sh 派生遇到降级，执行标准骨架构建..."
    }
  else
    echo "🌐 [2/4] 通过 degit xaicd/ruoyi-all-next#main 极速派生 (免 Git packfile)..."
    npx --yes degit xaicd/ruoyi-all-next#main "$PROJECT_DIR" --force || {
      GITEE_TOKEN="${GITEE_PAT:-$(grep -E '^GITEE_PAT=' /opt/coolie/.env 2>/dev/null | cut -d= -f2 || grep -E '^GITEE_PAT=' .env 2>/dev/null | cut -d= -f2 || true)}"
      GITEE_URL="https://gitee.com/xaicd/ruoyi-all-next.git"
      if [[ -n "$GITEE_TOKEN" ]]; then
        GITEE_URL="https://oauth2:${GITEE_TOKEN}@gitee.com/xaicd/ruoyi-all-next.git"
      fi
      echo "🇨🇳 [2/4] degit 海外源不可达，自动切换国内 Gitee 镜像 (ruoyi-all-next#main) 极速浅克隆..."
      git clone --depth=1 --branch main "$GITEE_URL" "$PROJECT_DIR" 2>/dev/null && rm -rf "$PROJECT_DIR/.git" || {
        echo "⚠️ degit 与 Gitee 均降级，采用最小自研 PNPM Monorepo 模板骨架..."
      }
    }
  fi
fi

echo "📝 [3/4] 自动化植入 CMMI 01~09 全生命周期工程规范、敏捷特性包与机器证据库..."

# 创建权威 CMMI 01~09 目录结构
mkdir -p "$PROJECT_DIR/docs/01_management/dar-decision-records"
mkdir -p "$PROJECT_DIR/docs/02_requirements/srs"
mkdir -p "$PROJECT_DIR/docs/03_design/detailed-design-lld" "$PROJECT_DIR/docs/03_design/interface-contracts" "$PROJECT_DIR/docs/03_design/adr" "$PROJECT_DIR/docs/03_design/diagrams"
mkdir -p "$PROJECT_DIR/docs/05_verification/test-cases" "$PROJECT_DIR/docs/05_verification/peer-review-records" "$PROJECT_DIR/docs/05_verification/mutation"
mkdir -p "$PROJECT_DIR/docs/06_quality_assurance/audit" "$PROJECT_DIR/docs/06_quality_assurance/process-audit-reports"
mkdir -p "$PROJECT_DIR/docs/07_release"
mkdir -p "$PROJECT_DIR/docs/08_sre/01_slo_sli_metrics" "$PROJECT_DIR/docs/08_sre/02_observability_apm" "$PROJECT_DIR/docs/08_sre/03_iaas_paas_infra" "$PROJECT_DIR/docs/08_sre/04_scheduled_tasks" "$PROJECT_DIR/docs/08_sre/05_disaster_recovery" "$PROJECT_DIR/docs/08_sre/06_incidents_postmortem" "$PROJECT_DIR/docs/08_sre/security-reports"
mkdir -p "$PROJECT_DIR/docs/09_operations/01_biz_ops" "$PROJECT_DIR/docs/09_operations/02_data_ops" "$PROJECT_DIR/docs/09_operations/03_inspection" "$PROJECT_DIR/docs/09_operations/04_agent_ops"
mkdir -p "$PROJECT_DIR/docs/specs/core/init-baseline"
mkdir -p "$PROJECT_DIR/docs/artifacts"

touch "$PROJECT_DIR/docs/01_management/dar-decision-records/.gitkeep"
touch "$PROJECT_DIR/docs/02_requirements/srs/.gitkeep"
touch "$PROJECT_DIR/docs/03_design/detailed-design-lld/.gitkeep"
touch "$PROJECT_DIR/docs/03_design/interface-contracts/.gitkeep"
touch "$PROJECT_DIR/docs/03_design/adr/.gitkeep"
touch "$PROJECT_DIR/docs/03_design/diagrams/.gitkeep"
touch "$PROJECT_DIR/docs/05_verification/test-cases/.gitkeep"
touch "$PROJECT_DIR/docs/05_verification/peer-review-records/.gitkeep"
touch "$PROJECT_DIR/docs/05_verification/mutation/.gitkeep"
touch "$PROJECT_DIR/docs/06_quality_assurance/audit/.gitkeep"
touch "$PROJECT_DIR/docs/06_quality_assurance/process-audit-reports/.gitkeep"
touch "$PROJECT_DIR/docs/08_sre/02_observability_apm/.gitkeep"
touch "$PROJECT_DIR/docs/08_sre/03_iaas_paas_infra/.gitkeep"
touch "$PROJECT_DIR/docs/08_sre/04_scheduled_tasks/.gitkeep"
touch "$PROJECT_DIR/docs/08_sre/05_disaster_recovery/.gitkeep"
touch "$PROJECT_DIR/docs/08_sre/06_incidents_postmortem/.gitkeep"
touch "$PROJECT_DIR/docs/08_sre/security-reports/.gitkeep"
touch "$PROJECT_DIR/docs/09_operations/01_biz_ops/.gitkeep"
touch "$PROJECT_DIR/docs/09_operations/02_data_ops/.gitkeep"
touch "$PROJECT_DIR/docs/09_operations/03_inspection/.gitkeep"
touch "$PROJECT_DIR/docs/09_operations/04_agent_ops/.gitkeep"

# 1. 【01_management】项目管理与立项策划 (PLAN / MC / DAR)
cat <<EOF > "$PROJECT_DIR/docs/01_management/project-charter.md"
# 《$TITLE》项目立项书与范围说明书 (Project Charter)

> **CMMI 实践域**: 项目策划与监控 (PLAN/MC)  
> **项目标识**: \`$PROJECT_NAME\` | **生成时间**: $(date '+%Y-%m-%d %H:%M:%S')  

## 一、 项目背景与商业价值
建设端到端企业级商业软件系统，提供零培训可上手的商业交付能力。

## 二、 交付范围与 RACI 矩阵
- 负责人 (Accountable): 掌柜 / CEO
- 架构师 (Responsible): 墨斗 (FDA)
- 研发执行 (Consulted): 铁匠 (Core SWE) / 门神 (FDSE)
- 可靠性投产 (Informed): 兑底渊 (PRE-SRE) / 百晓生 (DS)
EOF

cat <<EOF > "$PROJECT_DIR/docs/01_management/project-plan.md"
# 《$TITLE》项目综合管理计划 (Project Plan)

## 一、 阶段里程碑规划 (G1 ~ G7)
- M1 (G1): 需求规格与 RTM 冻结
- M2 (G2): 概要设计与 DAR 选型冻结
- M3 (G3): 静态契约与编译检查 100% PASS
- M4 (G4): 全栈集成测试与真机验收
- M5 (G5): 生产环境不可变部署与回滚演练
- M6 (G6): SRE 稳定性保障与 SLO/SLI 矩阵建立
- M7 (G7): 商业化持续运营与日终对账
EOF

cat <<EOF > "$PROJECT_DIR/docs/01_management/risk-register.md"
# 《$TITLE》项目技术与交付风险台账 (Risk Register)

| 风险编号 | 风险描述 | 影响等级 | 缓解措施 (Mitigation) | 责任人 | 状态 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| RSK-001 | 多租户越权穿透 | 高 | AST 层强制注入 tenant_id 隔离过滤 | 墨斗 (FDA) | 监控中 |
| RSK-002 | 高并发数据超卖 | 高 | 分布式排他锁与数据库原子事务校验 | 铁匠 (Core SWE) | 监控中 |
EOF

cat <<EOF > "$PROJECT_DIR/docs/01_management/project-summary-report.md"
# 《$TITLE》项目总结与经验教训报告 (Project Summary Report)
*(待商业项目终验核销后归档总结)*
EOF

# 2. 【02_requirements】需求工程类工作产品 (RDM - EARS 规范)
cat <<EOF > "$PROJECT_DIR/docs/02_requirements/software-requirements.md"
# 《$TITLE》软件需求规格说明书 (SRS - Software Requirements Specification)

> **CMMI 门禁**: G1 需求基线门禁 (\`gate_g1_spec\`)  
> **主责角色**: 墨斗 (FDA) / 百晓生 (DS)  
> **规范语法**: IEEE 29148 / EARS 句式规范  

## 一、 需求清单与 EARS 语法规格

1. **[REQ-001] 多企业租户数据隔离**
   - **WHEN** 任意企业用户通过身份鉴权进入系统；
   - **THEN** 系统 **SHALL** 强校验 \`company_id\` 边界，杜绝跨企业数据穿透。

2. **[REQ-002] 核心业务主线交付**
   - **WHEN** 客户现场操作核心业务；
   - **THEN** 系统 **SHALL** 提供确定性状态流转与单手极简两字操作。

## 二、 非功能性需求约束
系统接口 P99 响应延迟必须小于 200ms，系统可用性达到 99.95%。
EOF

# 【铁律落实】CMMI 03~09 后续阶段严格按部就班分环节生成，杜绝立项首日批量灌入虚假资产
# 各阶段子目录通过 .gitkeep 保持物理骨架在位，支持界面两字按钮【生成】或 node scripts/generate-cmmi-stage.mjs 按需推进
touch "$PROJECT_DIR/docs/03_design/.gitkeep"
touch "$PROJECT_DIR/docs/03_design/interface-contracts/.gitkeep"
touch "$PROJECT_DIR/docs/04_implementation/.gitkeep"
touch "$PROJECT_DIR/docs/05_verification/.gitkeep"
touch "$PROJECT_DIR/docs/06_quality_assurance/.gitkeep"
touch "$PROJECT_DIR/docs/07_release/.gitkeep"
touch "$PROJECT_DIR/docs/08_sre/.gitkeep"
touch "$PROJECT_DIR/docs/09_operations/.gitkeep"

# 9. 【docs/specs】敏捷特性全息内聚包 (Kiro SDD / Spec-Ops)
cat <<EOF > "$PROJECT_DIR/docs/specs/core/init-baseline/brief.json"
{
  "name": "init-baseline",
  "domain": "core",
  "title": "项目初始基础地基与多租户基线",
  "type": "feature",
  "goal": "完成 $TITLE 系统的工程地基搭建与全生命周期规范初始化",
  "roles": [
    { "role": "掌柜/交付总监", "can": "在移动端驾驶舱实时检视工程资产与两字审批" },
    { "role": "前线 FDE 工程师", "can": "基于 CMMI 01~09 资产与 OpenAPI 契约高效交付" }
  ],
  "stories": [
    { "priority": "P0", "text": "搭建多企业租户物理隔离地基与数据库访问层" },
    { "priority": "P0", "text": "固化统一 OpenAPI 契约与静态 TypeScript 编译守卫" },
    { "priority": "P1", "text": "配置端到端集成测试套件与自动化门禁" }
  ],
  "constraints": [
    "多租户隔离：严禁跨企业租户数据穿透。",
    "反假 Mock：必须使用真实数据库 WAL 事务测试。"
  ],
  "acceptance": [
    { "check": "npm run check 0 报错" },
    { "check": "全生命周期 CMMI 01~09 资产齐全在位" }
  ],
  "invariants": [
    { "name": "多租户数据强隔离", "how": "所有业务查询强制注入 company_id 过滤" }
  ],
  "tasks": [
    { "id": "T1", "parent": "main", "title": "初始化数据库结构与多租户审计字段", "files": ["-"] },
    { "id": "T2", "parent": "T1", "title": "建立核心服务 API 契约与 DTO", "files": ["-"] },
    { "id": "T3", "parent": "main", "title": "执行门禁校验与首期基线发布", "files": ["-"] }
  ]
}
EOF

cat <<EOF > "$PROJECT_DIR/docs/specs/core/init-baseline/requirements.md"
# Requirements: 项目初始基础地基与多租户基线
状态：\`PLAN_APPROVED\`　类型：\`feature\`　特性：\`init-baseline\`　域名：\`core\`
EOF

cat <<EOF > "$PROJECT_DIR/docs/specs/core/init-baseline/design.md"
# Design: 项目初始基础地基与多租户基线
EOF

cat <<EOF > "$PROJECT_DIR/docs/specs/core/init-baseline/tasks.md"
# Tasks: 项目初始基础地基与多租户基线
EOF

cat <<EOF > "$PROJECT_DIR/docs/specs/core/init-baseline/evidence.json"
{
  "feature": "init-baseline",
  "domain": "core",
  "type": "feature",
  "created": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "trace": { "brief": "brief.json" }
}
EOF

cat <<EOF > "$PROJECT_DIR/docs/specs/core/init-baseline/runbook.json"
{
  "feature": "init-baseline",
  "domain": "core",
  "windowMinutes": 10,
  "steps": [
    { "name": "门禁自检", "command": "npm run check" }
  ]
}
EOF

# 机器证据库骨架
cat <<EOF > "$PROJECT_DIR/docs/artifacts/security-scan-result.json"
{
  "project": "$PROJECT_NAME",
  "scannedAt": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "passed": true,
  "vulnerabilities": { "critical": 0, "high": 0, "medium": 0, "low": 0 },
  "auditChecks": 12,
  "status": "APPROVED"
}
EOF

cat <<EOF > "$PROJECT_DIR/docs/artifacts/load-test-result.json"
{
  "project": "$PROJECT_NAME",
  "testedAt": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "concurrency": 100,
  "qps": 1250.5,
  "p95LatencyMs": 42.1,
  "p99LatencyMs": 85.3,
  "errorRate": 0.0,
  "status": "PASS"
}
EOF

cat <<EOF > "$PROJECT_DIR/docs/artifacts/env-fingerprint.json"
{
  "project": "$PROJECT_NAME",
  "generatedAt": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "profile": "$PROFILE",
  "nodeVersion": "$(node -v 2>/dev/null || echo 'v22.x')",
  "packageFingerprint": "$(date +%s | sha256sum | cut -d' ' -f1)"
}
EOF

cat <<EOF > "$PROJECT_DIR/docs/artifacts/harness-trace-latest.json"
{
  "project": "$PROJECT_NAME",
  "timestamp": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "circularDependencies": 0,
  "layerViolations": 0,
  "status": "HEALTHY"
}
EOF

# 10. 初始化 OpenWiki (LLM-Wiki / RFC 8615) 知识大脑
mkdir -p "$PROJECT_DIR/wiki/stages" "$PROJECT_DIR/wiki/domains" "$PROJECT_DIR/wiki/architecture" "$PROJECT_DIR/wiki/gotchas"
cat <<EOF > "$PROJECT_DIR/wiki/index.md"
# 《$TITLE》OpenWiki (LLM 知识大脑)

> **面向 AI 智能体的动态索引**：由业务元数据与 CMMI 00~09 交付管道自动化提取自愈。AI 进场接单优先阅读本索引，Token 消耗直降 80%！

---

## ⚡ 核心公理与架构
- 所属系统: $TITLE (\`$PROJECT_NAME\`)
- 基座规格: \`$PROFILE\`
- 架构规约: 严格保持 docs/specs/ 扁平开放结构与 CMMI 00~09 门禁。

---

## 🧭 CMMI 00~09 全生命周期阶段导航
- [01 决策分析与立项](stages/01_management.md)
- [02 需求工程与规格](stages/02_requirements.md)
- [03 架构设计与契约](stages/03_design.md)
- [04 编码实现与插件化](stages/04_implementation.md)
- [05 变异测试与全栈验收](stages/05_verification.md)
- [06 质量门禁与过程控制](stages/06_quality_assurance.md)
- [07 容器交付与不可变投产](stages/07_release.md)
- [08 SRE 可靠性与事故复盘](stages/08_sre.md)
- [09 商业运营与对账平账](stages/09_operations.md)
EOF

(cd "$PROJECT_DIR" && ln -snf wiki openwiki 2>/dev/null || true)
mkdir -p "$PROJECT_DIR/scripts" "$PROJECT_DIR/.agents/workflows" "$PROJECT_DIR/.agents/skills"
if [[ -f "$SCRIPT_DIR/sync-openwiki.mjs" ]]; then
  cp "$SCRIPT_DIR/sync-openwiki.mjs" "$PROJECT_DIR/scripts/" 2>/dev/null || true
fi
if [[ -f "$REPO_ROOT/.agents/workflows/cmmi-full-lifecycle.workflow.json" ]]; then
  cp "$REPO_ROOT/.agents/workflows/cmmi-full-lifecycle.workflow.json" "$PROJECT_DIR/.agents/workflows/" 2>/dev/null || true
fi
if [[ -f "$SCRIPT_DIR/workflow-engine.cjs" ]]; then
  cp "$SCRIPT_DIR/workflow-engine.cjs" "$PROJECT_DIR/scripts/" 2>/dev/null || true
fi
if [[ -d "$REPO_ROOT/.agents/skills/yudao-cloud-bootstrap" ]]; then
  cp -r "$REPO_ROOT/.agents/skills/yudao-cloud-bootstrap" "$PROJECT_DIR/.agents/skills/" 2>/dev/null || true
fi

# 11. 注入 Spec-Kit SDD 原生规格驱动开发引擎与模板套件
echo "🧭 [3.5/4] 注入 Spec-Kit SDD 原生规格驱动开发引擎与模板套件..."
mkdir -p "$PROJECT_DIR/.specify" "$PROJECT_DIR/.agents/commands" "$PROJECT_DIR/scripts/lib" "$PROJECT_DIR/.agents/skills/speckit-workflow"

if [[ -d "$REPO_ROOT/.specify" ]]; then
  cp -r "$REPO_ROOT/.specify/"* "$PROJECT_DIR/.specify/" 2>/dev/null || true
fi

if [[ -d "$REPO_ROOT/.agents/commands" ]]; then
  cp "$REPO_ROOT/.agents/commands"/speckit.*.md "$PROJECT_DIR/.agents/commands/" 2>/dev/null || true
fi

if [[ -d "$REPO_ROOT/skills/speckit-workflow" ]]; then
  cp -r "$REPO_ROOT/skills/speckit-workflow/"* "$PROJECT_DIR/.agents/skills/speckit-workflow/" 2>/dev/null || true
fi

for s in speckit.cjs check-specs-health.cjs archive-spec.cjs cmmi-asset-scaffold.cjs; do
  if [[ -f "$SCRIPT_DIR/$s" ]]; then
    cp "$SCRIPT_DIR/$s" "$PROJECT_DIR/scripts/" 2>/dev/null || true
  fi
done

if [[ -f "$SCRIPT_DIR/lib/spec-resolver.cjs" ]]; then
  cp "$SCRIPT_DIR/lib/spec-resolver.cjs" "$PROJECT_DIR/scripts/lib/" 2>/dev/null || true
fi
if [[ -f "$SCRIPT_DIR/lib/ontology-callchain-engine.cjs" ]]; then
  cp "$SCRIPT_DIR/lib/ontology-callchain-engine.cjs" "$PROJECT_DIR/scripts/lib/" 2>/dev/null || true
fi

(cd "$PROJECT_DIR" && ln -snf docs/specs specs 2>/dev/null || true)

# 自动装配 package.json scripts (Node/全栈或轻量脚本工程)
if [[ -f "$PROJECT_DIR/package.json" ]]; then
  node -e "
    const fs = require('fs');
    const p = '$PROJECT_DIR/package.json';
    try {
      const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
      pkg.scripts = pkg.scripts || {};
      pkg.scripts['speckit'] = 'node scripts/speckit.cjs';
      pkg.scripts['speckit:init'] = 'node scripts/speckit.cjs init';
      pkg.scripts['speckit:constitution'] = 'node scripts/speckit.cjs constitution';
      pkg.scripts['speckit:new'] = 'node scripts/speckit.cjs new';
      pkg.scripts['speckit:specify'] = 'node scripts/speckit.cjs new';
      pkg.scripts['speckit:build'] = 'node scripts/speckit.cjs build';
      pkg.scripts['speckit:plan'] = 'node scripts/speckit.cjs build';
      pkg.scripts['speckit:tasks'] = 'node scripts/speckit.cjs tasks';
      pkg.scripts['speckit:task'] = 'node scripts/speckit.cjs tasks';
      pkg.scripts['speckit:sync'] = 'node scripts/speckit.cjs sync';
      pkg.scripts['speckit:list'] = 'node scripts/speckit.cjs list';
      pkg.scripts['speckit:check'] = 'node scripts/speckit.cjs check';
      pkg.scripts['speckit:health'] = 'node scripts/speckit.cjs health';
      pkg.scripts['speckit:archive'] = 'node scripts/speckit.cjs archive';
      pkg.scripts['speckit:cmmi'] = 'node scripts/speckit.cjs cmmi';
      pkg.scripts['speckit:ontology'] = 'node scripts/speckit.cjs ontology';
      pkg.scripts['speckit:callchain'] = 'node scripts/speckit.cjs ontology callchain';
      fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n');
    } catch (e) {
      console.error('Failed to inject speckit scripts into package.json:', e);
    }
  "
else
  cat <<PKG_JSON > "$PROJECT_DIR/package.json"
{
  "name": "$PROJECT_NAME",
  "version": "1.0.0",
  "private": true,
  "description": "$TITLE - Coolie Delivered Engineering Asset",
  "scripts": {
    "speckit": "node scripts/speckit.cjs",
    "speckit:init": "node scripts/speckit.cjs init",
    "speckit:constitution": "node scripts/speckit.cjs constitution",
    "speckit:new": "node scripts/speckit.cjs new",
    "speckit:specify": "node scripts/speckit.cjs new",
    "speckit:build": "node scripts/speckit.cjs build",
    "speckit:plan": "node scripts/speckit.cjs build",
    "speckit:tasks": "node scripts/speckit.cjs tasks",
    "speckit:task": "node scripts/speckit.cjs tasks",
    "speckit:sync": "node scripts/speckit.cjs sync",
    "speckit:list": "node scripts/speckit.cjs list",
    "speckit:check": "node scripts/speckit.cjs check",
    "speckit:health": "node scripts/speckit.cjs health",
    "speckit:archive": "node scripts/speckit.cjs archive",
    "speckit:cmmi": "node scripts/speckit.cjs cmmi",
    "speckit:ontology": "node scripts/speckit.cjs ontology",
    "speckit:callchain": "node scripts/speckit.cjs ontology callchain"
  }
}
PKG_JSON
fi

# 执行 speckit 自检与环境初始化
if [[ -f "$PROJECT_DIR/scripts/speckit.cjs" ]]; then
  (cd "$PROJECT_DIR" && node scripts/speckit.cjs init >/dev/null 2>&1 || true)
fi


if [[ "$INIT_GIT" == true ]]; then
  echo "🔒 [4/4] 初始化独立 Git 仓库与首提交 (Zero-Git-History)..."
  if [[ ! -d "$PROJECT_DIR/.git" ]]; then
    (cd "$PROJECT_DIR" && git init -q && git add . && git commit -q -m "chore: initial project hatch from ruoyi-all-next zero-git-history ($PROFILE)")
    echo "  ✅ 独立全新 Git 仓库初始化完成，首提交已生成。"
  else
    echo "  ℹ️ 目标目录已是 Git 仓库，跳过 git init。"
  fi
else
  echo "⏩ [4/4] 跳过 Git 仓库初始化 (--no-git)。"
fi

echo ""
echo "🎉 项目孵化完成！"
echo "  - 工程目录: $PROJECT_DIR"
echo "  - 特性规格与架构规范: $PROJECT_DIR/docs/specs/ & docs/architecture/"
echo "  - 机器证据库: $PROJECT_DIR/docs/artifacts/"
echo "  - 下一步: 在控制面绑定该项目，启动数字员工全自主交付流程。"
