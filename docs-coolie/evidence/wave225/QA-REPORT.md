# wave225 — 本地团队规范: 1 主 + 5 员工 (QA 报告)

> **波次**: wave225
> **日期**: 2026-09-30
> **触发**: 老板原话 "本地团队规范: 主 agent Hermes; 本体五大角色, 员工默认也就五个,
> 工具可以多样 (claude-mm, claude-glm, cmd, agy, copilot), 五大角色必须要把 cmmi 中涉及的
> 所有工作分工合理分配下, 我这边通过主 agent 说话讲需求派任务, 主 agent 得知道该派给哪个
> 员工来干工作".
> **范围**: 重写 `docs-coolie/TEAM-MAPPING.md` 为 1 主 + 5 员工规范 + 新建
> `docs-coolie/HOW-TO-DELEGATE.md` (老板对 PM SOP) + 新建
> `docs-coolie/CMMI-EMPLOYEE-MAPPING.md` (5 员工 × 25 任务分工).
> **不动**: `server/src/services/agent-assign.ts` / `AGENT_ROLES` enum / wave217 / wave220 /
> UI / clients/expo / Coolie 工坊系统.

---

## 1. 范围 & 交付物

| 文件 | 状态 | 行数 | 说明 |
|---|---|---|---|
| `docs-coolie/TEAM-MAPPING.md` | M (改) | 169 | 6 CLI → 1 主 + 5 员工规范, 工具可换 |
| `docs-coolie/HOW-TO-DELEGATE.md` | A (新) | 256 | 老板对 PM 派活 SOP (速查表 + 流程) |
| `docs-coolie/CMMI-EMPLOYEE-MAPPING.md` | A (新) | 205 | 5 阶段 × 25 任务 × 5 员工分工 (含主/副 + 工具) |
| `~/bin/dispatch-wave225.sh` | (不入 git) | 130 | PM 派活脚本 — 老板本机, 仓库外 |
| `docs-coolie/evidence/wave225/QA-REPORT.md` | A (本报告) | - | 本 QA |

合计 ~ 630 行 docs, 0 行 server/ui/clients 代码改动.

---

## 2. 关键变更 (wave224 → wave225)

| 维度 | wave224 (撤) | wave225 (现) |
|---|---|---|
| 团队规模 | 6 CLI (Hermes + 5 员工 + 铁匠贰号副炉) | 1 主 + 5 员工 (Hermes 不算员工) |
| 铁匠贰号 | 独立员工 (`claude-minimax`) | **降级为铁匠的兜底工具** (claude-glm 见顶时切 claude-mm) |
| 员工粒度 | 每 CLI 一个员工 (工具 = 员工) | 工具可换, 员工岗位稳定 (5 员工 = 5 岗位) |
| 百晓生 (copilot) | 已弃用, 退出 6 员工池 | **保留岗位** (5 员工第 5 位), copilot 限 / 无额度时暂不可用 |
| CMMI 映射 | 6 CLI × 25 任务表 | 5 员工 × 25 任务表 + 算法层差异说明 (§3) |
| PM SOP | §5 内嵌于 TEAM-MAPPING.md | **独立成册** (`HOW-TO-DELEGATE.md`, 老板能看懂) |
| 老板视角 | 无独立 SOP | §1 一句话模板 + §2 七步 SOP + §3 速查表 + §4 工具切换规则 |

---

## 3. 5 员工 × CMMI 25 任务 分配 (核心)

主员工 × 25 任务分布:

| 员工 | 本体角色 | 主任务数 | 任务编号 |
|---|---|---|---|
| **铁匠 (Forge)** | `core-swe` | **13** | 1.5 / 2.2 / 2.3 / 2.4 / 3.1 / 3.2 / 3.3 / 4.1 / 4.2 / 4.4 / 5.4 |
| **兑底渊 (Operator)** | `pre-sre` | **5** | 2.1 / 3.4 / 3.5 / 4.5 / 5.1 / 5.2 (注: 5.1 主兑底渊副门神) |
| **墨斗 (Inkstick)** | `fda` | **5** | 1.1 / 1.2 / 1.4 / 2.5 / 5.5 |
| **门神 (Guardian)** | `fdse` | **2** | 4.3 / 5.3 |
| **百晓生 (Sage)** | `ds` | **0** (仅副) | 1.3 (副) / 5.5 (副) |
| **Hermes (PM, 拍板)** | - | **2** | 1.5 (拍板) / 5.5 (拍板) |

合计主任务 = 13 + 5 + 5 + 2 + 0 = **25** (Hermes 拍板位是流程角色, 不占主任务).

### 3.1 算法层 (`ROLE_MAPPING`) vs 5 员工层 差异 (3 处)

| CMMI 任务 | 算法层主角色 | 5 员工层主 | 差异原因 |
|---|---|---|---|
| 1.3 License 合规 | `ds` | 墨斗 (`fda`) | FDA 主访谈, DS 副扫描; 老板偏好墨斗主跑 |
| 2.4 工时估算 | `fdse` | 铁匠 (`core-swe`) | 老板偏好铁匠出估算, 门神验证 |
| 5.3 验收测试 | `core-swe` | 门神 (`fdse`) | 老板金标要老板亲自跑 cmd, 门神即 cmd |

> **PM 派单规则**: PM 派单按本表 (5 员工维度), 不按 `ROLE_MAPPING` (算法层维度). 算法层是
> 工坊数字员工的派活路由, 与本波本地 5 员工无关. 二者各管各的.

---

## 4. 工具 vs 员工 映射

| 工具 | 默认员工 | 兜底员工 | 配额 | 备注 |
|---|---|---|---|---|
| claude-glm (Claude GLM-5.3, BigModel) | 铁匠 (主力) | - | 2026-10-02 17:55 重置 | 主力写代码 |
| claude-mm (MiniMax-M3, 按量) | 铁匠 (兜底) | - | 长期按量, SDK 警告 | 铁匠 GLM 配额见顶切此 |
| cmd (Claude Code CLI) | 门神 | - | 老板本人 180s 冷却 | 紧急 / 老板亲自跑 / 真机金标 |
| agy (Gemini 3.8, 按量) | 墨斗 | - | 长期按量 | 选型 / 竞品 / 数据分析 |
| copilot | 百晓生 (限) | - | 2026-09-29 已弃用 | 当前无额度, 岗位保留 |
| claude-ds (Claude DeepSeek 兜底) | 兑底渊 | - | 按量 | 部署 + 监控 + 性能 |

**核心原则**: 工具是员工的"手", 员工岗位稳定. 工具可以多样, 但员工默认 5 个.

---

## 5. PM (Hermes) 派活 SOP — 核心七步

```
1. 听老板说
   ↓
2. 识别 CMMI Phase + 任务类型
   ↓
3. 查 CMMI-EMPLOYEE-MAPPING.md §1 → 主员工
   ↓
4. 看员工工具配额 (GLM 用量 / cmd 冷却 / copilot 额度)
   ↓
5. 写 brief → ~/bin/dispatch-waveXXX.sh
   ↓
6. 跑 bash ~/bin/dispatch-waveXXX.sh
   ↓
7. monitor + 验真 + 回报老板
```

完整 SOP 见 `HOW-TO-DELEGATE.md` §2.

### 5.1 紧急派活 (老板亲自跑)

```bash
cmd -p "<老板一句话需求>"
```

不经过 PM, 不经过 `~/bin/dispatch-waveXXX.sh`. PM 只负责验收.

---

## 6. 不动验证 (反向约束)

| 反向约束 | 验证 |
|---|---|
| `server/src/services/agent-assign.ts` 不动 | ✅ `git status` 无 server/ 改动 |
| `AGENT_ROLES` enum 不动 | ✅ `git status` 无 `packages/shared/src/constants.ts` 改动 |
| wave217 (QA 团队) 不动 | ✅ 13 个 qa 数字员工 bootstrap 状态不变 |
| wave220 (Ops 团队) 不动 | ✅ 9 个 ops bootstrap 状态不变 (虽然 wave220 已被 `8b909a2b6` revert, 工坊状态独立于 git) |
| wave222 (5 角色算法层) 不动 | ✅ `ROLE_MAPPING` / `pickRoleForCmmiTask` / `summarizeRoleMapping` 保持 |
| UI / clients/expo 不动 | ✅ `git status` 无 ui/ / clients/ 改动 |
| Coolie 工坊系统本体不动 | ✅ 工坊架构 / 部署 / 看板 UI 不改 |
| 不入 git: `~/.claude/settings.json` / `~/bin/*.sh` | ✅ 文档 §5 明示, 老板本地配置不上 git |

### 6.1 `git status` 验证

```
$ git status --short docs-coolie/
 M docs-coolie/TEAM-MAPPING.md
?? docs-coolie/CMMI-EMPLOYEE-MAPPING.md
?? docs-coolie/HOW-TO-DELEGATE.md
```

仅 3 处 docs-coolie/ 改动 (1 modified + 2 new). 无 server/ ui/ clients/ 改动.

---

## 7. 派活脚本模板 (~/bin/dispatch-waveXXX.sh)

PM 写 `~/bin/dispatch-waveXXX.sh` 的最小骨架 (已示范在 `~/bin/dispatch-wave225.sh`):

```bash
#!/bin/bash
# waveXXX: <老板一句话需求>
cd ~/workspace/xaicd/coolie

BRIEF=$(cat <<'BRIEF_EOF'
# waveXXX: <老板一句话需求>

## 真因（老板原话）
"<老板原话>"

## CMMI Phase + 任务
- Phase X.Y (任务名)

## 派活
- 主员工: <铁匠/门神/兑底渊/墨斗/百晓生>
- 工具: <claude-glm/cmd/claude-ds/agy/copilot>

## 验收
- <PM 自动验真标准>
- <老板金标标准>

## 不动
- server/src/services/agent-assign.ts
- AGENT_ROLES enum
- UI / clients/expo / Coolie 工坊系统
BRIEF_EOF
)

echo "=== waveXXX brief 字数 ==="
echo "    ${#BRIEF}"
echo
echo "=== 派单 ==="
cd ~/workspace/xaicd/coolie
CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT=1 \
  claude --dangerously-skip-permissions --max-turns 500 \
  -p "$BRIEF" 2>&1 | tee /tmp/waveXXX.log
```

---

## 8. QA 自检

- [x] TEAM-MAPPING.md 文档化完整 (1 主 + 5 员工规范, 工具可换, 6 CLI → 5 员工)
- [x] HOW-TO-DELEGATE.md 老板能看懂 (§1 一句话模板 + §2 七步 SOP + §3 速查表)
- [x] CMMI-EMPLOYEE-MAPPING.md 25 任务映射清晰 (主员工 × 25 行 + 算法层差异说明)
- [x] docs-coolie/evidence/wave225/QA-REPORT.md 新建 (本报告)
- [x] `git status` 验证: 仅 3 处 docs-coolie/ 改动 (1 modified + 2 new), 无 server/ui/clients
- [x] 不动 server/src/services/agent-assign.ts
- [x] 不动 AGENT_ROLES enum
- [x] 不动 UI / clients/expo / Coolie 工坊系统
- [x] 不入 git: `~/.claude/settings.json` / `~/bin/*.sh`
- [ ] 待 commit & push origin main

---

## 9. commit & push

| 步骤 | 内容 |
|---|---|
| commit (本波) | `docs(team-mapping): wave225 — 本地团队规范 (1 主 + 5 员工, 工具可换)` (待做, 3 文件 + 1 QA 报告) |
| push | `git push origin main` (待做) |

不发 APK (纯文档).

---

## 10. 出处

- wave225 brief: `~/bin/dispatch-wave225.sh` (老板原话)
- wave225 docs: `docs-coolie/TEAM-MAPPING.md` (改) + `docs-coolie/HOW-TO-DELEGATE.md` (新) + `docs-coolie/CMMI-EMPLOYEE-MAPPING.md` (新)
- wave224 撤回: `1d082995b Revert "feat(team-mapping): wave223 — 老板团队 = Coolie 工坊内置 (6 员工物理层)"` + `0a201f969 docs(team-mapping-cli): wave224 — 撤回 wave223, 6 员工 = 老板本地 CLI 维度`
- 5 角色算法层 (不动): `docs-coolie/ROLE-MAPPING.md` (wave222) + `server/src/services/agent-assign.ts`
- PM 启动手册: `docs-coolie/PM-AGENTS.md`