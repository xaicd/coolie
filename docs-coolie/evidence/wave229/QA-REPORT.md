# wave229 QA 报告 — cmd 工具 = commandcode.ai CLI 修正

> **波次**: wave229
> **范围**: 纯文档 — `docs-coolie/TEAM-MAPPING.md` / `docs-coolie/HOW-TO-DELEGATE.md` / `docs-coolie/TOOL-USAGE.md`
> **不动**: server / ui / clients/expo / wave222 算法层 / wave226 quota / wave227 DS 责任 / wave228 MCP
> **不动 `CMMI-EMPLOYEE-MAPPING.md`**: 本波仅修 3 文档, 老板原话"3 文档 cmd 改 commandcode.ai",
> CMMI-EMPLOYEE-MAPPING.md 同类错误留待后续波次 (wave229+1) 单独处理, 避免本波 diff 过大.

---

## 1. 真因 (老板原话)

> "cmd 工具是 commandcode.ai 的 CLI 工具, 不是老板自己运行"

之前 wave225 误记: `cmd` = 老板亲自跑的 Claude Code CLI (老板本人 180s 冷却)
正确理解: `cmd` = `commandcode.ai` 的 CLI 工具 (npm 包 `@commandcode/ai`), 批处理 / 自动化

老板 2026-09-30 澄清.

---

## 2. 真值表 (6 工具)

| 工具 | 之前理解 (wave225-228) | 真值 (wave229) |
|---|---|---|
| **claude-glm** | 主力 (BigModel) | ✅ 主力 (BigModel) — 不变 |
| **claude-mm** | 兜底 (MiniMax-M3) | ✅ 兜底 (MiniMax-M3) — 不变 |
| **cmd** | ❌ 老板亲自跑 (180s 冷却) | ✅ **`@commandcode/ai` CLI** (commandcode.ai 自动化批处理, 老板不直接 spawn) |
| **agy** | 原型 / 画图 (Gemini) | ✅ 原型 / 画图 (Gemini) — 不变 |
| **copilot** | gpt5 sol 数据 / 文档 | ✅ gpt5 sol — 不变 |
| **claude-ds** | 按量 | ✅ 按量 — 不变 |

---

## 3. 改动汇总

### 3.1 `docs-coolie/TEAM-MAPPING.md`

| 段 | 改动 |
|---|---|
| 标题 | `# 老板团队 = 本地 5 员工 + 1 主 agent (wave225 + wave227 DS 责任重大)` → 加 `+ wave229 cmd 修正` |
| 顶部 wave229 注释 | 新增 wave229 修正段, 解释 cmd = `commandcode.ai` CLI, 不是老板亲自跑 |
| §1.2 5 员工档案 门神行 | `cmd (Claude Code CLI)` → `**cmd (\`@commandcode/ai\` CLI)**`; 配额状态从"老板本人执行 (180s 冷却)" → "commandcode.ai CLI 自动化执行, **老板不亲自跑** (wave229)" |
| §2 工具表 cmd 行 | `cmd (Claude Code CLI) \| 门神 \| — \| 老板本人 180s 冷却 \| 紧急 / 老板亲自跑 / 真机金标` → `cmd (\`@commandcode/ai\` CLI, commandcode.ai) \| 门神 \| — \| commandcode.ai CLI 自动化执行 \| 紧急 / 自动化批处理 / 真机金标 (wave229: 不是老板亲自跑)` |
| §4 PM 派活 SOP 门神行 | `门神: 紧急 / 老板亲自跑 → cmd` → `门神: 紧急 / 自动化批处理 → cmd (\`@commandcode/ai\` CLI, **不是老板亲自跑**)` |
| §6 复用下具 门神行 | `老板本人 spawn` → `门神 spawn (\`@commandcode/ai\` sub-agent, wave229: 不是老板 spawn)` |
| §8 索引本波撤回 | 加 `wave229 cmd = commandcode.ai CLI 修正 (非老板亲自跑)` |

### 3.2 `docs-coolie/HOW-TO-DELEGATE.md`

| 段 | 改动 |
|---|---|
| 标题 | 加 `+ wave229 cmd 修正` |
| 顶部 wave229 修正块 | 新增 4 行解释, 指向 §3 / §4 / §6 |
| §1.1 一句话模板 | 例 `"紧急, 老板自己跑, 看下 OTA manifest" — 走门神 + cmd` → `"紧急自动化批处理, 看下 OTA manifest" — 走门神 + cmd (\`@commandcode/ai\`)`; 加 wave229 注脚 |
| §1.3 急不急说明 | `急 → 门神 cmd` → `急 → 门神 cmd = \`commandcode.ai\` CLI 自动化` |
| §2.1 七步 SOP | 多处更新: 门神 quota 行去掉"老板本人是否空闲"; 紧急切门神说明更新; 老板金标验真步骤改"门神 cmd 跑通 (老板看 PM 截图 / 录屏)" |
| §3.1 路由表 | 所有 `门神 cmd` → `门神 cmd (\`@commandcode/ai\`)`; "老板金标" → "老板金标看截图 (wave229)" |
| §3.2 PM 速查流程 | 紧急切门神说明加 wave229 注 |
| §4 工具切换规则表 | 门神行改为 `commandcode.ai CLI 自动化批处理 (wave229: 老板不亲自跑, 无 180s 冷却约束)`; `~/bin/coolie-check-cmd-cooldown.sh` → `~/bin/coolie-check-cmd-quota.sh`, 加 wave229 修正段 |
| §5 派活脚本模板 | 工具枚举加 `@commandcode-ai` |
| §5 wave227 范例 | `副门神 cmd 金标` → `副门神 cmd \`@commandcode/ai\` 金标` |
| §6 紧急派活 | 整段重写: 标题改为 `紧急派活 (门神 cmd \`@commandcode/ai\` 自动化批处理)`; 正文说明门神 spawn 而非老板本人 |
| §7 验收 SOP 老板金标 | 改"老板看 PM 截图 / 录屏 (wave229: 老板不亲自跑 cmd)" |
| §8 不做什么 | 老板不直接派员工说明加 wave229 注 |

### 3.3 `docs-coolie/TOOL-USAGE.md`

| 段 | 改动 |
|---|---|
| 标题 | `工具使用规范 (wave228)` → `工具使用规范 (wave228 + wave229 cmd 修正)` |
| 顶部 wave229 修正块 | 新增 4 行解释, 指向 §1 / §2 / §5 |
| §1 6 工具矩阵 cmd 行 | `cmd \| 充裕, **老板本人 180s 冷却**` → `cmd (\`@commandcode/ai\`) \| commandcode.ai CLI 配额, **老板不亲自跑** (wave229)` |
| §1 PM 配额监控 | `coolie-check-cmd-cooldown.sh` → `coolie-check-cmd-quota.sh`, 加 wave229 注 |
| §2 派单优先级 | `1. 紧急 / 老板亲自跑 / 真机金标 → cmd` → `1. 紧急 / 自动化批处理 / 真机金标 → cmd (\`@commandcode/ai\`, 门神 spawn, **不是老板亲自跑** — wave229)`; Why 段同步更新 |
| §3 MCP 默认安装表 | cmd 行加 `(\`@commandcode/ai\`)` 注释 |
| §5 切换规则 | 门神行更新 + wave229 注 |

---

## 4. 验证

### 4.1 不动反向约束

| 反向约束 | 状态 |
|---|---|
| server / ui / clients/expo | ✅ 0 行代码改动 (`git diff --stat` 仅 3 个 .md 文件) |
| wave222 算法层 `server/src/services/agent-assign.ts` | ✅ 未改 |
| `AGENT_ROLES` enum | ✅ 未改 |
| `ROLE_MAPPING` | ✅ 未改 |
| wave226 quota (`agent ≤ 6`) | ✅ 未改 |
| wave227 DS 责任 (`Phase 2.5 / 3.5 / 5.2 / 5.3 / 5.5` 主百晓生) | ✅ 未改 |
| wave228 MCP 默认安装 | ✅ 未改 (本波只更新 wave228 描述, 脚本本体不动) |
| Coolie 工坊系统 | ✅ 未改 |
| `CMMI-EMPLOYEE-MAPPING.md` (同类 cmd 错误) | ⚠️ **未改** — 见 §5 后续 |

### 4.2 任务达成

| 任务 | 状态 |
|---|---|
| A. 修本地 6 工具规范 | ✅ 3 文档同步更新 |
| B. 修 TEAM-MAPPING.md (员工 × 工具表) | ✅ §1.2 / §2 / §6 全部更新 |
| C. 修 HOW-TO-DELEGATE.md (派活 SOP) | ✅ §1 / §2 / §3 / §4 / §5 / §6 / §7 / §8 全部更新 |
| D. 修 TOOL-USAGE.md | ✅ §1 / §2 / §3 / §5 全部更新 |
| 不动反向约束 | ✅ 0 行代码改动 |

### 4.3 旧措辞清零验证

`grep -nE 'cmd\b|commandcode|180s|老板亲自|老板本人' 3 文档` 后剩余命中:

- ✅ **全部为有意保留** (wave229 注释 / 顶部 wave-marker 引用旧错误以解释修正)
- ✅ 旧 "老板本人 180s 冷却" 出现在 wave229 修正段 (引用旧错误以解释修正)
- ✅ 旧 "180s" 仅出现在 wave229 修正段 (说明"老板不亲自跑, 无 180s 冷却约束")
- ❌ 0 处仍把 cmd 描述为"老板亲自跑" (除 wave229 注释明确指出"之前 wave225 误记"外)

---

## 5. 后续 (不在本波范围)

- **`CMMI-EMPLOYEE-MAPPING.md`** — 同类 cmd 错误 (line 50 / 52 / 71 / 72 / 79 / 81 / 131 / 141 / 152 / 165 / 191 / 216-227) 留待后续波次处理.
  本波严格按老板原话"3 文档 cmd 改 commandcode.ai"只动 3 文档, 不扩散 diff.
- **`~/bin/coolie-check-cmd-quota.sh`** — 原 `coolie-check-cmd-cooldown.sh` 是基于"老板本人 180s 冷却"假设写的,
  实际 commandcode.ai CLI 没有"老板冷却"概念. PM 后续按需重写脚本 (本波不动 shell 脚本 — 不在范围).
- **老板派活脚本示例** — `~/bin/dispatch-wave*.sh` 实际跑的命令不变 (`cmd -p "..."`),
  只是语义变了: 老板不直接跑, 门神 spawn. 脚本不需要改, 派活语义在 PM 脑中更新即可.

---

## 6. 出处与索引

- 真因: 老板 2026-09-30 澄清 — "cmd 工具是 commandcode.ai 的 CLI 工具, 不是老板自己运行"
- 改动文档:
  - [`docs-coolie/TEAM-MAPPING.md`](../../TEAM-MAPPING.md)
  - [`docs-coolie/HOW-TO-DELEGATE.md`](../../HOW-TO-DELEGATE.md)
  - [`docs-coolie/TOOL-USAGE.md`](../../TOOL-USAGE.md)
- 不动文档 (含同类 cmd 错误): `docs-coolie/CMMI-EMPLOYEE-MAPPING.md` (待 wave229+1 处理)
- 不动代码: server / ui / clients/expo / wave222 / wave226 / wave227 / wave228
- commit type: `docs(tool-cmd-correction)`
- 不发 APK (纯文档)