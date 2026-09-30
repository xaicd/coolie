# wave234 QA 报告 — claude-glm 退出主力, 5 员工 × 工具新映射

## 真因（老板原话）
"claude-glm 额度不够, 后续主要用 cmd, claude-mm 替换"

## 5 员工 × 工具新映射 (wave234 起)

| 员工 | 之前 (主线) | 新 (wave234) | 兜底 |
|---|---|---|---|
| 铁匠 (Core SWE) | claude-glm | **cmd (`@commandcode/ai` CLI, wave229)** | claude-mm |
| 门神 (FDSE) | cmd | cmd (不变) | — |
| 兑底渊 (PRE-SRE) | claude-ds | claude-ds (不变) | — |
| 墨斗 (FDA) | agy | agy (不变) | — |
| 百晓生 (DS) | claude-glm | **claude-mm** (按量) | claude-glm (老板备用, GLM 充裕时) / copilot (限) / claude-ds |

**claude-glm 退出主力** —— 配额紧不再用. 改作:
- 铁匠兜底: claude-mm (按量)
- 百晓生兜底: claude-glm (老板备用)

## 改动文件清单

5 个核心文档, 仅文档修改, 0 行代码改动:

| 文件 | 主要改动 |
|---|---|
| `docs-coolie/TEAM-MAPPING.md` | §1.2 5 员工档案铁匠/百晓生工具列; §1.2 工具切换脚注; §2 工具 vs 员工映射表 claude-glm/claude-mm/cmd 三行; §3 CMMI 25 任务分工 wave227 段; §4 PM SOP 工具选 run 列表; §5 §6 §8 引用更新 |
| `docs-coolie/HOW-TO-DELEGATE.md` | §1.1 例句 4 处; §2.1 step 4 配额监控铁匠/百晓生; §2.1 step 6 兜底工具切换; §3.1 路由表 14 行; §3.2 PM 速查流程 step 5; §4 工具切换规则铁匠/百晓生; §5 派活脚本模板 (wave227 范例 → wave234 范例); §8 出处 + 本波 (wave234) 变更摘要 |
| `docs-coolie/CMMI-EMPLOYEE-MAPPING.md` | §0 wave234 改段; §1 25 任务分工表 22 个铁匠/百晓生任务工具列; §4 5 员工 × 默认工具矩阵铁匠/百晓生行 + §4.1 DS-only MCP 行; §8 出处 + 本波 (wave234) 变更摘要 |
| `docs-coolie/EMPLOYEE-SKILLS.md` | §1.1 铁匠工具列标题; §1.5 百晓生工具列标题; §0 加载机制 claude-* 列表; §2.1 第 1/2 层路径; §7 QA 入口加 wave234 |
| `docs-coolie/TOOL-USAGE.md` | 文件标题 (加 wave234); §1 6 工具矩阵 3 行 (claude-glm/claude-mm/cmd); §2 派单优先级 + Why 解释; §3 MCP 表 agent-device/system-monitor 行; §5 切换规则铁匠/百晓生; §6 DS 责任范围扩展 5 个任务; §8 出处 + EMPLOYEE-SKILLS / wave234 QA |

## 反向约束确认

| 约束 | 状态 |
|---|---|
| 不动 server / ui / clients/expo | ✅ 0 行代码改动, 仅文档 |
| 不动 wave222 算法层 (`ROLE_MAPPING`) | ✅ 算法层不变 |
| 不动 wave225-233 文档内容 (除 5 员工 × 工具那几行) | ✅ 仅改工具映射相关行; 其他内容 (CMMI 任务分工 / 数字员工 / MCP install 脚本 / Fork-surface 注册 / 等) 不变 |
| 不动 wave228 install 脚本 | ✅ 4 个脚本 (`install-agent-device-mcp.sh` / `install-agent-browser-mcp.sh` / `install-ds-mcp.sh` / `cron-copilot-reset.sh`) 不变; 文档仅引用 |
| 不动 AGENT_ROLES enum | ✅ `packages/shared/src/constants.ts::AGENT_ROLES` 不动 |

## QA 检查项

### 1. 5 文档 grep "claude-glm" 只剩兜底 / 备用 描述

```
=== claude-glm 在 5 文档出现 ===
docs-coolie/TEAM-MAPPING.md:22  (含历史说明 wave227, wave234 改段, 备用描述)
docs-coolie/HOW-TO-DELEGATE.md:24  (含历史 wave227 changelog, wave234 changelog, 备用描述)
docs-coolie/CMMI-EMPLOYEE-MAPPING.md:17  (含 wave227 历史 changelog, wave234 改段, 备用描述)
docs-coolie/EMPLOYEE-SKILLS.md:5  (1.5 节标题 + 加载路径 + QA 入口)
docs-coolie/TOOL-USAGE.md:12  (含 §1 工具矩阵 "退出主力" + §5/§6/§8 "备用")
```

✅ 业务规则已落实: 没有任何一行**单独**写 `claude-glm` (主) / `claude-glm` 默认 — 所有
出现都伴随 "wave234 退出主力" / "老板备用" / "wave234 起降级" / "GLM 充裕时" / "wave227
历史" / "wave234 改段" 等明确说明.

### 2. grep "cmd" 是铁匠 + 门神主线

```
=== cmd 在 5 文档出现 ===
docs-coolie/TEAM-MAPPING.md:20
docs-coolie/HOW-TO-DELEGATE.md:48
docs-coolie/CMMI-EMPLOYEE-MAPPING.md:32
docs-coolie/EMPLOYEE-SKILLS.md:11
docs-coolie/TOOL-USAGE.md:15
```

✅ 铁匠主线 + 门神主线均用 cmd (`@commandcode/ai` CLI), 不再是老板亲自跑 (wave229).

### 3. 路由表 / 工具矩阵 / 工具切换规则 三表一致

| 表 | 铁匠主线 | 百晓生主线 | claude-glm 状态 |
|---|---|---|---|
| `TEAM-MAPPING.md` §1.2 | cmd (`@commandcode/ai`) | claude-mm | 退出主力 (老板备用) |
| `TEAM-MAPPING.md` §2 工具矩阵 | cmd (默认) + 门神 | claude-mm | ⚠️ 退出主力 |
| `HOW-TO-DELEGATE.md` §3.1 路由表 | cmd (5 行铁匠主) | claude-mm (5 行百晓生主) | 仅作为紧急切换 |
| `HOW-TO-DELEGATE.md` §4 切换规则 | cmd | claude-mm | 退出铁匠主线 (老板备用) |
| `CMMI-EMPLOYEE-MAPPING.md` §1 25 任务表 | cmd (11 行铁匠主) | claude-mm (5 行百晓生主) | 仅作为 copilot 之外的备用 |
| `CMMI-EMPLOYEE-MAPPING.md` §4 工具矩阵 | cmd | claude-mm | 退出主力 (老板备用) |
| `EMPLOYEE-SKILLS.md` §1.1 铁匠 / §1.5 百晓生 | cmd | claude-mm | 老板备用 (wave234) |
| `TOOL-USAGE.md` §1 6 工具矩阵 | cmd | claude-mm | ⚠️ 退出主力 |
| `TOOL-USAGE.md` §2 派单优先级 | cmd (排第 2) | claude-mm (排第 3) | 排第 8 (老板备用) |
| `TOOL-USAGE.md` §5 切换规则 | cmd | claude-mm | 退出铁匠主线 (老板备用) |

✅ 三类表互相一致.

### 4. PM SOP §1.1 例句 / §3.1 路由表 / §4 切换规则 / §5 派活模板 四段一致

| 例句 / 路由表行 | 铁匠默认 | 百晓生默认 |
|---|---|---|
| §1.1 例句 "派个活修 UUID bug" | cmd (wave234) | — |
| §1.1 例句 "测试/运营/复盘" | — | claude-mm (wave234) |
| §3.1 路由表 铁匠 5 行 | cmd | — |
| §3.1 路由表 百晓生 5 行 | — | claude-mm |
| §4 切换规则 铁匠 | cmd | — |
| §4 切换规则 百晓生 | — | claude-mm |
| §5 派活模板 wave234 范例 | — | claude-mm (替代 wave227 claude-glm) |

✅ PM SOP 四段一致.

## 派活脚本示例 (PM 跑)

`HOW-TO-DELEGATE.md` §5 派活模板 wave234 范例已用 claude-mm 主线:

```bash
#!/bin/bash
# wave234-百晓生: 测试/运营 主负责 (主线 claude-mm)
cd ~/workspace/xaicd/coolie
CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT=1 \
  claude --dangerously-skip-permissions --max-turns 500 \
  -p "$BRIEF" 2>&1 | tee /tmp/wave234.log
```

铁匠派活脚本模板示例:

```bash
#!/bin/bash
# wave234-铁匠: 写代码主线 (cmd)
cd ~/workspace/xaicd/coolie
CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT=1 \
  cmd -p "$(cat <<'BRIEF_EOF'
# wave234: 写代码主线 (铁匠 → cmd)

## 真因
"claude-glm 额度不够, 后续主要用 cmd, claude-mm 替换"

## CMMI Phase + 任务
- Phase 4.1 编码 (铁匠主线 → cmd)

## 派活
- 主员工: 铁匠 (Forge, core-swe)
- 工具: cmd (`@commandcode/ai` CLI, wave234 起)
- 兜底: claude-mm (按量, cmd 排满时切)

## 不动
- server / ui / clients/expo
BRIEF_EOF
)" 2>&1 | tee /tmp/wave234.log
```

## QA 结论

✅ **PASS** — 5 个核心文档均已同步, 0 行代码改动, 反向约束全部遵守.

| 检查 | 结果 |
|---|---|
| 铁匠主线 = cmd | ✅ |
| 门神 = cmd (不变) | ✅ |
| 兑底渊 = claude-ds (不变) | ✅ |
| 墨斗 = agy (不变) | ✅ |
| 百晓生主线 = claude-mm | ✅ |
| claude-glm 退出主力 (老板备用) | ✅ |
| 5 文档一致 | ✅ |
| 反向约束遵守 (无代码改动, 算法层不动) | ✅ |
| §8 出处与索引 4 文档互联 + 加 wave234 QA | ✅ |

## 发版

- 不发 APK (纯文档)
- commit type: `docs(tool-claude-glm-exit)`
- push origin main
