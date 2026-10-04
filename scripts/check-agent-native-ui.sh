#!/usr/bin/env bash
# scripts/check-agent-native-ui.sh
# 
# 自动化检查 Web (ui/src) 与移动端 (clients/expo/src) 的 Agent-Native UI 属性规范符合度

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

node "$SCRIPT_DIR/check-agent-native-ui.mjs"
