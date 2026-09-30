# HOW-TO-DELEGATE — 老板对 PM (Hermes) 派活 SOP (wave225 + wave227 + wave229 cmd 修正)

> **目的**: 老板说需求 → Hermes (PM) 派活 → 5 员工执行. 本 SOP 老板能看懂, 5 员工能照做,
> PM (Hermes) 能按部就班派单. 老板可以直接对着本文说话, PM 收到后查 §3 路由表派单.
>
> **适用**: Coolie fork 老板陈伟 → Hermes (PM / 黑哥) → 5 员工 (铁匠/门神/兑底渊/墨斗/百晓生).
> **不动**: `server/src/services/agent-assign.ts` / Coolie 工坊系统 / UI / clients/expo.
>
> **wave227 增**: 测试/运营/风险/部署/复盘 共 5 个高频场景主员工改百晓生 (`ds`), 默认工具
> 统一改为 `claude-glm` (DS 多工具主工具), 紧急切换按任务类型定 — 见 §3.1.
>
> **wave229 修正**: `cmd` 工具 = `commandcode.ai` CLI (`@commandcode/ai`), **不是老板亲自跑**.
> 之前 wave225 误记"老板本人 180s 冷却", 老板 2026-09-30 澄清. cmd 是 commandcode.ai 的
> 自动化批处理 CLI, 派给门神 (FDSE) 在 PM 调度下跑, 老板不直接 spawn. 见 §3 / §4 / §6.

---

## 1. 老板视角: 怎么说话

### 1.1 一句话模板

老板对 Hermes 说需求, 标准句式:

```
<动词> <对象> <约束> (可选: 跑哪个工具 / 哪个员工)
```

**例**:
- "派个活修 UUID bug" — 默认走铁匠 + cmd (`@commandcode/ai` CLI, wave234 起; 旧: claude-glm)
- "紧急自动化批处理, 看下 OTA manifest" — 走门神 + cmd (`@commandcode/ai`)
- "选个 typeorm vs drizzle" — 走墨斗 + agy
- "部署 wave225, 看监控" — 走兑底渊 + claude-ds (监控主改百晓生, 兑底渊副)
- "License 扫一下" — 走百晓生 (限, 当前无额度)
- "测试一下 wave227" — wave234 起走百晓生 + claude-mm (测试主改百晓生, 门神副; 旧: claude-glm)
- "运营看监控告警" — wave234 起走百晓生 + claude-mm (运营主改百晓生, 兑底渊副; 旧: claude-glm)
- "复盘 wave227" — wave234 起走百晓生 + claude-mm (复盘主改百晓生, Hermes 拍板, 墨斗副; 旧: claude-glm)

> **wave229 注**: 老板说"紧急"不再等价于"老板亲自跑". 紧急 → 切门神 cmd (`@commandcode/ai`
> 自动化批处理), 老板只下指令, 不亲自执行 CLI.

### 1.2 老板不需知道的细节

- 不用记 5 员工名字 — PM 自己查表
- 不用记 CMMI 25 任务编号 — PM 自己识别
- 不用记工具配额 — PM 自己监控 GLM 用量
- 不用写 brief — PM 写 brief 放进 `~/bin/dispatch-waveXXX.sh`

### 1.3 老板需告诉 PM 的

- **做什么** (动词 + 对象)
- **急不急** (急 → 门神 cmd = `commandcode.ai` CLI 自动化; 不急 → 默认员工 + 默认工具)
- **在哪台跑** (老板 Mac → 本地员工; 部署到生产 → 兑底渊)
- **验收标准** (老板金标 vs PM 自动验真)

---

## 2. PM (Hermes) 视角: 怎么派活

### 2.1 七步 SOP

```
1. 听老板说
   ↓
2. 识别 CMMI Phase + 任务类型
   - 看 issue 标题 / 描述 / 老板原话
   - 关键词: 立项 / 规划 / 设计 / 开发 / 部署 → Phase 1..5
   - 25 任务关键词见 §3 路由表
   ↓
3. 查 CMMI-EMPLOYEE-MAPPING.md §1 → 主员工
   ↓
4. 看员工工具配额
   - **铁匠 (wave234 起)**: cmd (`@commandcode/ai` CLI) 队列状态; 排满时切 claude-mm (按量兜底); claude-glm 不再是铁匠主线
   - 门神: cmd (`@commandcode/ai`) CLI 配额状态, **不是老板本人空闲** (wave229)
   - 兑底渊: claude-ds 按量, 不受限
   - 墨斗: agy 按量, 不受限
   - **百晓生 (wave227 多工具, wave234 主线切 claude-mm)**: claude-mm (主线, 按量) → claude-glm (老板备用, GLM 充裕时) → copilot (限) → claude-ds (按量); 测试/运营/风险/部署/复盘 默认走 claude-mm
   ↓
5. 写 brief
   - brief = (a) 老板原话 + (b) CMMI Phase/任务 + (c) 主员工 + (d) 工具 + (e) 验收标准
   - 存到 `~/bin/dispatch-waveXXX.sh` (XXX = 波次号)
   ↓
6. 跑 `bash ~/bin/dispatch-waveXXX.sh`
   - 默认主员工 + 默认工具
   - 急 → 切门神 cmd (`@commandcode/ai` 自动化批处理, **老板不亲自跑**)
   - 配额见顶 → 切兜底工具 (铁匠 wave234: cmd → claude-mm; 百晓生 wave234: claude-mm → claude-glm 备用 → claude-ds)
   ↓
7. monitor + 验真 + 回报
   - `~/bin/monitor-waveXXX.sh` 看员工跑完没
   - PM 看 CLI 输出, 必要时让铁匠 / 兑底渊 互审
   - 老板金标验真 (1% 装真机) → 门神 cmd 跑通 (老板看 PM 截图 / 录屏)
   - 回报老板: 完成 / 阻塞 / 失败 + 原因
```

### 2.2 派活纪律 (反向约束)

PM 派活时必须遵守:

- **不写代码** — PM 是调度 / 验收, 不是开发者. 紧急例外见 `PM-DISPATCH-RULES.md`.
- **不绕过员工** — 老板直接 @Hermes, 不直接 @员工. (员工是 sub-agent, 不对外.)
- **不重复派单** — `~/bin/` 已有 `dispatch-waveXXX.sh` 的不重写, 只更新 brief.
- **不擅自切员工** — 老板说"派铁匠"就不能改派门神, 除非老板同意.
- **不擅自改工具** — 默认走主员工 + 主工具; 配额见顶才切兜底, 且回报老板.

---

## 3. 派活路由表 (Hermes 速查)

> 完整 25 任务映射见 [`CMMI-EMPLOYEE-MAPPING.md`](CMMI-EMPLOYEE-MAPPING.md), 这里给高频场景速查.

### 3.1 老板高频场景

| 老板原话 (示例) | CMMI Phase | 主员工 | 默认工具 | 紧急 → 切 |
|---|---|---|---|---|
| "派个活修 UUID bug" | Phase 4.1 / 4.3 | 铁匠 | **cmd (`@commandcode/ai`, wave234)** | 门神 cmd (`@commandcode/ai`) |
| "看下 OTA manifest" | Phase 5.1 / 5.3 | 兑底渊 | claude-ds | 门神 cmd (`@commandcode/ai`) |
| "部署 wave225" | Phase 5.1 | 兑底渊 | claude-ds | 门神 cmd (`@commandcode/ai`) |
| "选个 typeorm vs drizzle" | Phase 1.4 / 3.1 | 墨斗 | agy | 铁匠 cmd (`@commandcode/ai`, wave234) |
| "License 扫一下" | Phase 1.3 | 百晓生 (限) | copilot | 墨斗 agy |
| "写个 spec" | Phase 2.3 | 铁匠 | **cmd (`@commandcode/ai`, wave234)** | 门神 cmd (`@commandcode/ai`) |
| "代码审查" | Phase 4.3 | 门神 | cmd (`@commandcode/ai`) | 铁匠 cmd (`@commandcode/ai`, wave234) |
| "集成测试" | Phase 4.4 | 铁匠 | **cmd (`@commandcode/ai`, wave234) → claude-mm (兜底)** | 门神 cmd (`@commandcode/ai`) |
| "验收 / 跑通真机" | Phase 5.3 | **百晓生 (wave227)** | **claude-mm (wave234)** | 门神 cmd (老板金标看截图, wave229) |
| "监控告警" | Phase 5.2 | **百晓生 (wave227)** | **claude-mm (wave234)** | 兑底渊 claude-ds |
| "测试一下 / 撞机" | Phase 5.3 | **百晓生 (wave227)** | **claude-mm (wave234)** | 门神 cmd (老板金标看截图, wave229) |
| "风险评估 / 应急" | Phase 2.5 | **百晓生 (wave227)** | **claude-mm (wave234)** | 兑底渊 claude-ds |
| "部署架构" | Phase 3.5 | **百晓生 (wave227)** | **claude-mm (wave234)** | 兑底渊 claude-ds |
| "复盘" | Phase 5.5 | **百晓生 (wave227)** + Hermes (拍板) | **claude-mm (wave234)** | 门神 cmd (`@commandcode/ai`) |

### 3.2 PM 速查流程

老板说一句话, PM 按这个顺序查:

```
1. 关键词命中 → CMMI Phase?
   "立项/选型/合规/门禁" → Phase 1
   "规划/WBS/spec/工时/风险" → Phase 2
   "设计/架构/契约/schema/部署架构" → Phase 3
   "编码/单测/审查/集成/性能" → Phase 4
   "部署/监控/验收/发布/复盘" → Phase 5

2. Phase 落到 25 任务之一 → 查 CMMI-EMPLOYEE-MAPPING.md §1 表

3. 取"主员工"列 → 默认派该员工 + 默认工具
   (wave227 起, 测试/运营/风险/部署/复盘 5 项主员工为百晓生)

4. 紧急 → 切门神 cmd (`@commandcode/ai` 自动化批处理, **不是老板亲自跑** — wave229)
   监控/部署/风险类紧急 → 切兑底渊 claude-ds

5. 铁匠 / 百晓生 配额见顶 → 切 claude-mm (兜底)
   - 铁匠 (wave234): cmd 排满 → claude-mm
   - 百晓生 (wave234): claude-mm 默认按量, GLM 充裕时仍可切回 claude-glm 备用
```

---

## 4. 工具切换规则 (Hermes 配额监控)

| 员工 | 默认工具 | 兜底工具 | 切换条件 |
|---|---|---|---|
| **铁匠 (wave234 改)** | **cmd (`@commandcode/ai` CLI)** | claude-mm | cmd 排满时切 claude-mm (按量); **claude-glm 退出铁匠主线** (老板原话 "额度不够") |
| 门神 | **cmd (`@commandcode/ai` CLI)** | (无) | commandcode.ai CLI 自动化批处理 (wave229: 老板不亲自跑, 无 180s 冷却约束) |
| 兑底渊 | claude-ds | (无) | 按量不限 |
| 墨斗 | agy | (无) | 按量不限 |
| **百晓生 (wave227 多工具, wave234 主线切 claude-mm)** | **claude-mm** (主线) | claude-glm (老板备用, GLM 充裕时) → copilot (限) → claude-ds (按量) | wave227 起 DS 责任扩到 5 个主任务 (2.5/3.5/5.2/5.3/5.5); wave234 起主线从 claude-glm 切到 claude-mm, claude-glm 降为老板备用 (GLM 充裕时仍可用) |

**PM 监控命令** (PM 自己跑, 老板不看):

```bash
# 看铁匠 (wave234) cmd (`@commandcode/ai`) 队列状态
~/bin/coolie-check-cmd-quota.sh

# 看百晓生 (wave234) claude-mm 用量 + claude-glm 备用额度
~/bin/coolie-check-mm-quota.sh
~/bin/coolie-check-glm-quota.sh  # GLM 充裕时看备用额度
```

> **wave229 修正**: 原 `~/bin/coolie-check-cmd-cooldown.sh` 是基于"老板本人 180s 冷却"假设
> 写的, 实际 cmd = `commandcode.ai` 自动化 CLI, 没有"老板冷却"概念. PM 改为看 CLI 配额 /
> 队列即可.

---

## 5. 派活脚本模板 (~/bin/dispatch-waveXXX.sh)

PM 写 `~/bin/dispatch-waveXXX.sh` 的最小骨架:

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
- 工具: <claude-glm/cmd/@commandcode-ai/claude-ds/agy/copilot>

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

PM 写好脚本 → `bash ~/bin/dispatch-waveXXX.sh` 派活 → `tail -f /tmp/waveXXX.log` monitor.

**派百晓生 wave234 范例** (测试 / 运营 / 风险 / 部署架构 / 复盘, 主线 claude-mm):

```bash
#!/bin/bash
# wave234-百晓生: 测试/运营 主负责 (主线 claude-mm)
cd ~/workspace/xaicd/coolie

BRIEF=$(cat <<'BRIEF_EOF'
# wave234: 测试/运营 主改 DS (百晓生) + claude-glm 退出主力

## 真因（老板原话）
"claude-glm 额度不够, 后续主要用 cmd, claude-mm 替换"

## CMMI Phase + 任务
- Phase 5.3 验收测试 (主改百晓生, 副门神 cmd `@commandcode/ai` 金标)
- Phase 5.2 监控告警 (主改百晓生, 副兑底渊)
- Phase 5.5 复盘 (主改百晓生, Hermes 拍板, 副墨斗)
- Phase 2.5 风险评估 (主改百晓生, 副墨斗)
- Phase 3.5 部署架构 (主改百晓生, 副兑底渊)

## 派活
- 主员工: 百晓生 (Sage, ds)
- 工具: claude-mm (主线, wave234 起) — 按量, 不限额
- 备用: claude-glm (老板备用, GLM 充裕时) → copilot (限) → claude-ds (按量)

## 验收
- 5 文档更新一致: CMMI-EMPLOYEE-MAPPING.md / HOW-TO-DELEGATE.md / TEAM-MAPPING.md / EMPLOYEE-SKILLS.md / TOOL-USAGE.md
- 不动 server / ui / clients/expo (0 行代码改动)
- 报告 docs-coolie/evidence/wave234/QA-REPORT.md

## 不动
- server/src/services/agent-assign.ts (算法层 ROLE_MAPPING)
- AGENT_ROLES enum
- UI / clients/expo / Coolie 工坊系统
BRIEF_EOF
)

echo "=== wave234 brief 字数 ==="
echo "    ${#BRIEF}"
echo
echo "=== 派单 (百晓生 claude-mm) ==="
cd ~/workspace/xaicd/coolie
CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT=1 \
  claude --dangerously-skip-permissions --max-turns 500 \
  -p "$BRIEF" 2>&1 | tee /tmp/wave234.log
```

---

## 6. 紧急派活 (门神 cmd `@commandcode/ai` 自动化批处理)

老板说"紧急" → PM 切门神 cmd (`@commandcode/ai` CLI) → 门神在 Mac 终端跑:

```bash
cmd -p "<老板一句话需求>"
```

门神 cmd (`@commandcode/ai`) **不经过** `~/bin/dispatch-waveXXX.sh`, 由门神 (FDSE) 直接 spawn
commandcode.ai CLI 自动化执行. PM 只负责验收.

> **wave229 修正**: 之前 wave225 误记 cmd = 老板亲自跑, 老板 2026-09-30 澄清 — cmd 是
> `commandcode.ai` 的 npm 包 CLI, **老板不亲自执行**. 老板只下指令, 门神 spawn 自动化 CLI.

(wave227 注: Phase 5.3 验收测试的"老板金标" 走门神 cmd, 老板看 PM 截图 / 录屏验真, 不亲自跑.)

---

## 7. 验收 SOP

PM 派活后, 按这个流程验收:

```
1. monitor (~/bin/monitor-waveXXX.sh)
   ↓ 等员工跑完
2. PM 看 CLI 输出 (cat /tmp/waveXXX.log)
   ↓ 不通过 → 重派 / 让铁匠兑底渊互审
3. 老板金标 (1% 装真机)
   - 老板看 PM 截图 / 录屏 (wave229: 老板不亲自跑 cmd)
   - 或门神 cmd (`@commandcode/ai`) 跑通后报告
4. 回报老板
   - ✅ 完成: commit + push + 报告
   - ⚠️ 阻塞: 回报老板 + 等指示
   - ❌ 失败: 回报老板 + 改派 / 重试
```

---

## 8. 不做什么 (反向约束)

- **PM 不写代码** — 紧急例外见 `PM-DISPATCH-RULES.md`.
- **老板不直接派员工** — 老板只对 Hermes (PM), 不直接 @员工. (wave229: 也不直接跑 cmd —
  cmd 是 `commandcode.ai` 自动化 CLI, 由门神 spawn.)
- **员工不互派** — 5 员工之间不直接派活, 都走 PM.
- **不绕过 5 员工** — 老板要加新工具, PM 评估后挂到现有员工, 不增新员工.
- **不入 git 仓库**: `~/.claude/settings.json` / `~/bin/*.sh` — 老板本地配置.
- **不动 server/ui/clients** — 本 SOP 适用于老板 Mac 本地流程, 不触碰 Coolie 工坊系统.

---

## 9. 出处与索引

- 团队规范: [`docs-coolie/TEAM-MAPPING.md`](TEAM-MAPPING.md) (wave225 + wave227 DS 责任重大)
- CMMI 25 任务分工: [`docs-coolie/CMMI-EMPLOYEE-MAPPING.md`](CMMI-EMPLOYEE-MAPPING.md) (wave225 + wave227 测试/运营主改 DS)
- 5 角色算法层: [`docs-coolie/ROLE-MAPPING.md`](ROLE-MAPPING.md) (wave222, 不动)
- PM 启动手册: [`docs-coolie/PM-AGENTS.md`](PM-AGENTS.md) (含铁匠/门神/墨斗/副炉别名表)
- 派活纪律: [`docs-coolie/PM-DISPATCH-RULES.md`](PM-DISPATCH-RULES.md)
- 派单日志: [`docs-coolie/PM-DISPATCH-LOG-2026-09-20.md`](PM-DISPATCH-LOG-2026-09-20.md)
- 失败案例: [`docs-coolie/PM-FAILURE-CASES.md`](PM-FAILURE-CASES.md)
- 派活脚本示例: `~/bin/dispatch-wave224.sh` / `~/bin/dispatch-wave225.sh` / `~/bin/dispatch-wave227.sh` (DS 多工具)
- QA 报告: [`docs-coolie/evidence/wave227/QA-REPORT.md`](evidence/wave227/QA-REPORT.md); [`docs-coolie/evidence/wave234/QA-REPORT.md`](evidence/wave234/QA-REPORT.md)

**本波 (wave227) 变更摘要**:
- 5 个高频场景 (Phase 2.5 / 3.5 / 5.2 / 5.3 / 5.5) 主员工改百晓生, 默认工具统一 claude-glm
- §4 工具切换规则 DS 行扩到多工具 (claude-glm 主 / claude-mm 兜底 / copilot 限 / claude-ds 按量)
- §5 派活模板加 "派百晓生 wave227 范例" 完整 bash 脚本

**本波 (wave234) 变更摘要**:
- claude-glm 退出主力 (老板原话 "额度不够"). 铁匠主线 claude-glm → cmd (`@commandcode/ai` CLI,
  wave229); 百晓生主线 claude-glm → claude-mm (按量); claude-glm 降为老板备用 (GLM 充裕时仍可用)
- §1.1 例句: 铁匠默认 cmd; 百晓生默认 claude-mm
- §3.1 路由表: 5 个高频场景 (验收/监控/测试/风险/部署架构/复盘) 默认工具从 claude-glm 改 claude-mm
- §4 工具切换规则: 铁匠行从 "claude-glm / claude-mm" 改为 "cmd / claude-mm"; 百晓生行从 "claude-glm
  主线" 改为 "claude-mm 主线 / claude-glm 备用"
- §5 派活模板: "派百晓生 wave227 范例" 改为 wave234 版, 主线工具 claude-glm → claude-mm
