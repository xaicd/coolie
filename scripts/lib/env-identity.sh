#!/usr/bin/env bash
# scripts/lib/env-identity.sh — 多环境 Hermes 动态命名与环境身份共享层 (wave358)
#
# 目的: 这套系统装到各台电脑后, 每台机器声明自己的 Palantir 作战力量身份 (Echo/Delta/Dev)
# 与正交的物理部署宿主 (prod/staging/local), 让 Hermes 显示名、微信回复、派单 Header
# 都自适应透出「这是哪种作战属性、干什么活、部署在何种宿主」, 而不是每台机器改一遍脚本。
# 与 scripts/lib/team-roster.sh (谁干活) 互补: 这里回答「这台机器是谁、在哪个作战维度」。
#
# 覆盖顺序 (先命中先用):
#   1. $COOLIE_ENV_IDENTITY                     显式指定的身份文件
#   2. <repo>/.coolie-local/env-identity.json   本机运行态覆盖 (不入 git)
#   3. <repo>/scripts/lib/default-env-identity.json  仓库默认 (本仓 = Hermes 掌柜 Echo)
#
# Palantir 体系三元作战力量矩阵 (绝非传统运维网络环境!):
#   echo  → Echo  (业务战略)  Deployment Strategist / 掌柜 / 价值定义与全层级翻译 ("Echos win")
#   delta → Delta (前线工程)  FDSE / 现场交付攻坚 / 现实约束破局 ("Deltas build")
#   dev   → Dev   (底座抽象)  Core Platform / 平台架构与演进 / 人工反向传播沉淀 ("Devs scale")
#
# 正交部署宿主网络 (deployEnv):
#   local   → 本地开发/仿真机
#   staging → 预发/前线测试机
#   prod    → 生产网控制面
#
# 动态命名公式:
#   显示名 = <baseName>·<Codename>          例: Hermes·Echo
#   徽记   = 【显示名·作战标签】             例: 【Hermes·Echo·业务战略】
#   全徽记 = 【显示名·作战标签·职责】        例: 【Hermes·Echo·业务战略·PM掌柜】
#
# 用法 (source 后):
#   env_identity_file      打印生效的身份文件路径
#   env_identity_json      打印身份 JSON 全文
#   env_field <field>      打印原始字段 (archetype|deployEnv|projectName|baseName|role|environment)
#   env_archetype          打印作战代码 (echo|delta|dev)
#   deploy_env             打印部署宿主代码 (local|staging|prod)
#   env_codename           打印环境代号 (Echo|Delta|Dev)
#   env_label              打印作战标签 (业务战略|前线工程|底座抽象)
#   env_scope              打印体系全称 (Palantir Echo (业务战略与价值中枢) 等)
#   hermes_display_name    打印动态显示名 (Hermes·Echo)
#   hermes_badge           打印徽记 (【Hermes·Echo·业务战略】)
#   hermes_badge_full      打印全徽记 (含职责)
#   env_header_value       打印单行 Header 值 (echo|Echo|业务战略|Hermes·Echo|local)
#   hermes_identity_report 打印人类可读一句话态势
# 直接运行本文件 = 打印 hermes_identity_report。

# source 时一次性解析本文件所在目录
_env_identity_src="${BASH_SOURCE[0]}"
_ENV_IDENTITY_LIB_DIR="$(cd "$(dirname "$_env_identity_src")" && pwd)"
# 兜底: 奇异 source 上下文 (stdin/eval) 里 BASH_SOURCE 解析失真时, 按 cwd 定位
[[ -f "$_ENV_IDENTITY_LIB_DIR/env-identity.sh" ]] || _ENV_IDENTITY_LIB_DIR="$PWD/scripts/lib"

_env_identity_repo_root() {
  printf '%s' "$(cd "$_ENV_IDENTITY_LIB_DIR/../.." && pwd)"
}

env_identity_file() {
  local root
  root="$(_env_identity_repo_root)"
  if [[ -n "${COOLIE_ENV_IDENTITY:-}" && -f "$COOLIE_ENV_IDENTITY" ]]; then
    printf '%s' "$COOLIE_ENV_IDENTITY"
  elif [[ -f "${COOLIE_LOCAL_DIR:-$root/.coolie-local}/env-identity.json" ]]; then
    printf '%s' "${COOLIE_LOCAL_DIR:-$root/.coolie-local}/env-identity.json"
  else
    printf '%s' "$root/scripts/lib/default-env-identity.json"
  fi
}

env_identity_json() {
  cat "$(env_identity_file)"
}

# env_field <field> — 原始字段读取
env_field() {
  local field="$1"
  [[ -z "$field" ]] && return 0
  local idf
  idf="$(env_identity_file)"
  FIELD="$field" IDENTITY_FILE="$idf" node -e '
const fs = require("fs");
const env = process.env;
let identity = {};
try { identity = JSON.parse(fs.readFileSync(env.IDENTITY_FILE, "utf8")); } catch (e) { process.exit(0); }
const v = identity[env.FIELD];
if (v === undefined || v === null) process.exit(0);
process.stdout.write(String(v));
' 2>/dev/null || env_field_fallback "$field"
}

env_field_fallback() {
  local field="$1" idf
  idf="$(env_identity_file)"
  grep -o "\"${field}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "$idf" 2>/dev/null \
    | head -1 | sed -E "s/\"${field}\"[[:space:]]*:[[:space:]]*\"([^\"]*)\"/\1/"
}

# Palantir archetype: echo (业务战略) | delta (前线工程) | dev (底座抽象)
env_archetype() {
  local declared
  declared="$(env_field archetype)"
  [[ -z "$declared" ]] && declared="$(env_field environment)"
  case "$declared" in
    echo|delta) printf '%s' "$declared" ;;
    dev)        printf 'dev' ;;
    *)          printf 'echo' ;;
  esac
}

# 兼容老别名
env_key() {
  env_archetype
}

# 正交部署环境: prod | staging | local
deploy_env() {
  local declared
  declared="$(env_field deployEnv)"
  if [[ -z "$declared" ]]; then
    local env_val
    env_val="$(env_field environment)"
    case "$env_val" in
      prod|staging|local) declared="$env_val" ;;
      *) declared="local" ;;
    esac
  fi
  case "$declared" in
    prod|staging) printf '%s' "$declared" ;;
    *)            printf 'local' ;;
  esac
}

env_codename() {
  case "$(env_archetype)" in
    echo)  printf 'Echo' ;;
    delta) printf 'Delta' ;;
    *)     printf 'Dev' ;;
  esac
}

env_label() {
  case "$(env_archetype)" in
    echo)  printf '业务战略' ;;
    delta) printf '前线工程' ;;
    *)     printf '底座抽象' ;;
  esac
}

env_scope() {
  case "$(env_archetype)" in
    echo)  printf 'Palantir Echo (业务战略与价值中枢)' ;;
    delta) printf 'Palantir Delta (前线全栈工程攻坚)' ;;
    *)     printf 'Palantir Dev (平台底座抽象演进)' ;;
  esac
}

# 职责徽记化: "PM (掌柜)" → "PM掌柜"; 去空格/括号/斜杠, 保证徽记单行
_role_badge() {
  local role
  role="$(env_field role)"
  [[ -z "$role" ]] && return 0
  printf '%s' "$role" | tr -d ' ()（）/' | cut -c1-24
}

hermes_display_name() {
  local base
  base="$(env_field baseName)"
  [[ -z "$base" ]] && base="Hermes"
  printf '%s·%s' "$base" "$(env_codename)"
}

hermes_badge() {
  printf '【%s·%s】' "$(hermes_display_name)" "$(env_label)"
}

hermes_badge_full() {
  local role
  role="$(_role_badge)"
  if [[ -n "$role" ]]; then
    printf '【%s·%s·%s】' "$(hermes_display_name)" "$(env_label)" "$role"
  else
    hermes_badge
  fi
}

# 单行 Header 值 (派单 Receipt / HTTP 头 / 日志字段用): 竖线分隔, 无空格括号
env_header_value() {
  printf '%s|%s|%s|%s|%s' "$(env_archetype)" "$(env_codename)" "$(env_label)" "$(hermes_display_name)" "$(deploy_env)"
}

hermes_identity_report() {
  printf '%s %s · 宿主: %s · %s · 项目: %s · 身份文件: %s\n' \
    "$(hermes_badge_full)" "$(env_scope)" "$(deploy_env)" "$(env_header_value)" \
    "$(env_field projectName)" "$(env_identity_file)"
}

# 直接运行本文件 → 打印身份态势
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  hermes_identity_report
fi
