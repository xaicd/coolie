# wave236 QA 报告 — agy 恢复 + claude-ds 退出 (5 docs-coolie/*.md)

> **真因 (老板原话 2 条, 2026-09-30)**:
> - "agy 恢复了应该可以用" — agy (Gemini 3.8) 2026-09-23 配额耗尽, ~7 天后 2026-09-30 恢复.
> - "claude-ds 也不能用, 换 cmd, claude-mm" — claude-ds 配额紧 (PM 之前漏改).
>
> **本波 5 员工 × 工具 最终映射**:
> | 员工 | 之前 (wave234) | 新 (wave236) |
> |---|---|---|
> | 铁匠 (Core SWE) | cmd + claude-mm | cmd + claude-mm (不变) |
> | 门神 (FDSE) | cmd | cmd (不变) |
> | **兑底渊 (PRE-SRE)** | claude-ds | **cmd + claude-mm** (替换 claude-ds) |
> | **墨斗 (FDA)** | cmd | **agy 主 / cmd 兜底** (agy 恢复!) |
> | 百晓生 (DS) | claude-mm | claude-mm (不变) |
>
> **范围**: 5 个 docs-coolie/*.md (纯文档), 不动 server / ui / clients/expo / wave222 算法层 / AGENT_ROLES enum / wave234 / wave235 改动 (除 agy + claude-ds 段).

---

## 1. 改动清单 (5 文件)

| # | 文件 | 改动点 |
|---|---|---|
| 1 | `docs-coolie/TEAM-MAPPING.md` | §1 (wave236 真因) + §1.2 表头 + §1.2 兑底渊/墨斗行 + §2 cmd/agy/claude-ds 工具表 + §4 PM SOP 路由树 + §6 下具表 + §7 不做 (新增 wave236 约束) + §8 出处/索引 |
| 2 | `docs-coolie/HOW-TO-DELEGATE.md` | §1 标题 + 头部 wave236 真因 + §1.1 例句 (选 typeorm / 部署 / 画原型) + §2.1 SOP step 4 + §3.1 路由表 (OTA manifest / 部署 / 选 typeorm / 画原型) + §3.2 紧急路由 + §4 工具切换规则 + §9 出处/索引/本波摘要 |
| 3 | `docs-coolie/CMMI-EMPLOYEE-MAPPING.md` | 头部 wave236 真因 + §1 25 任务表 (Phase 1.1/1.2/1.3/1.4 墨斗 agy; Phase 2.1/3.4/4.5/5.1 兑底渊 claude-ds → cmd) + §4 工具矩阵 兑底渊/墨斗行 + §4.1 MCP 注释 + §8 出处/索引/本波摘要 |
| 4 | `docs-coolie/EMPLOYEE-SKILLS.md` | §1 标题 + 头部 wave236 真因 + §1.3 兑底渊 subhead + 加载路径 + §1.4 墨斗 subhead + 加载路径 + agy 现状注释 + §7 QA 入口 |
| 5 | `docs-coolie/TOOL-USAGE.md` | §1 标题 + 头部 wave236 真因 + §1 6 工具矩阵 agy/claude-ds 行 + §2 派单优先级 (step 4 部署 / step 5 agy / step 7 claude-ds 注释) + §5 切换规则 + §6 DS 责任范围 (2.5 agy / 3.5 cmd) + §8 出处/索引 |

**未改** (反向约束):
- `server/src/services/agent-assign.ts` (wave222 算法层) — 不动
- `AGENT_ROLES` enum (5 个 fork 角色 + 12 个上游) — 不动
- `ui/` / `clients/expo/` / Coolie 工坊系统 — 不动
- `docs-coolie/ROLE-MAPPING.md` (wave222) — 不动
- wave234 / wave235 已有的非 agy/claude-ds 改动 — 不动
- `script/` / `server/` / `packages/` — 不动 (0 行代码改动)

---

## 2. QA grep 4 项必检

### ✅ Check 1: 墨斗 工具列 含 agy

```
docs-coolie/TEAM-MAPPING.md:69: 工具: agy (Gemini 3.8, wave236 恢复) (主线) / cmd (紧急兜底)
docs-coolie/HOW-TO-DELEGATE.md:38: "选个 typeorm vs drizzle" — 走墨斗 + agy (wave236 恢复)
docs-coolie/HOW-TO-DELEGATE.md:40: "画个原型 / 竞品图" — 走墨斗 + agy (wave236 恢复, 原型 / 画图主跑)
docs-coolie/CMMI-EMPLOYEE-MAPPING.md:48-51: Phase 1.1/1.2/1.3/1.4 墨斗 agy (wave236 恢复)
docs-coolie/CMMI-EMPLOYEE-MAPPING.md:176: 墨斗 (wave236 恢复) | agy (Gemini 3.8) | cmd (紧急兜底)
docs-coolie/EMPLOYEE-SKILLS.md:198: §1.4 墨斗 subhead — agy (Gemini 3.8 按量, wave236 恢复) + cmd 紧急兜底
docs-coolie/TOOL-USAGE.md:42: agy 默认员工 = 墨斗 (FDA, wave236 恢复 主线)
```

**PASS** — 5 文件全含墨斗 + agy (wave236 恢复) 标注.

### ✅ Check 2: 兑底渊 工具列 不含 claude-ds 作主线

```
docs-coolie/TEAM-MAPPING.md:68: 兑底渊工具 = cmd (`@commandcode/ai` CLI, wave236 改, 替换 claude-ds) + claude-mm 兜底
docs-coolie/HOW-TO-DELEGATE.md:39: 部署 wave225 走兑底渊 + cmd (wave236 改, 替换 claude-ds) + claude-mm 兜底
docs-coolie/HOW-TO-DELEGATE.md:171: 兑底渊默认工具 = cmd (`@commandcode/ai` CLI); claude-ds 退出兑底渊主线
docs-coolie/CMMI-EMPLOYEE-MAPPING.md:58/71/82/88: 兑底渊 4 主任务 (2.1/3.4/4.5/5.1) 默认工具 = cmd + claude-mm
docs-coolie/CMMI-EMPLOYEE-MAPPING.md:175: 兑底渊矩阵行 = cmd + claude-mm
docs-coolie/EMPLOYEE-SKILLS.md:163/165: §1.3 兑底渊 subhead — cmd 主线 + claude-mm 兜底
docs-coolie/TOOL-USAGE.md:44: claude-ds = 不可作任何员工主线 (wave236)
docs-coolie/TOOL-USAGE.md:147: 兑底渊默认工具 = cmd; claude-ds 退出
```

**PASS** — 5 文件全含兑底渊 = cmd + claude-mm (claude-ds 仅在"退出"标注里出现).

### ✅ Check 3: claude-ds 标"不可用"或"退出"

```
docs-coolie/TEAM-MAPPING.md:30: claude-ds 标"不可用, 配额紧" — 不是任何员工主线
docs-coolie/TEAM-MAPPING.md:98: ⚠️ wave236 退出员工主线 (配额紧) | 仅百晓生 SRE 临时按量兜底
docs-coolie/HOW-TO-DELEGATE.md:20: claude-ds 标"不可用, 配额紧"
docs-coolie/HOW-TO-DELEGATE.md:82: claude-ds 退出兑底渊主线 (配额紧)
docs-coolie/HOW-TO-DELEGATE.md:171: claude-ds 退出兑底渊主线 (老板原话 "claude-ds 不能用", 配额紧)
docs-coolie/CMMI-EMPLOYEE-MAPPING.md:20: claude-ds 标"不可用, 配额紧"
docs-coolie/CMMI-EMPLOYEE-MAPPING.md:175: claude-ds 退出兑底渊主线 (wave236, 配额紧)
docs-coolie/CMMI-EMPLOYEE-MAPPING.md:202: wave236 起 claude-ds 仅 SRE 临时按量兜底
docs-coolie/EMPLOYEE-SKILLS.md:23/165: claude-ds 标"不可用, 配额紧" — 仅百晓生 SRE 临时大任务按量兜底
docs-coolie/TOOL-USAGE.md:15: claude-ds 标"不可用, 配额紧"
docs-coolie/TOOL-USAGE.md:44: claude-ds = 配额紧, 不可作主线 | 仅百晓生 SRE 临时大任务按量兜底
```

**PASS** — 5 文件全标"不可用"或"退出"或"配额紧"; claude-ds 仅存作"百晓生 SRE 临时按量兜底".

### ✅ Check 4: agy 标"恢复"或"主线"

```
docs-coolie/TEAM-MAPPING.md:26: agy 2026-09-23 配额耗尽, ~7 天后恢复 (09-30 配额可用)
docs-coolie/TEAM-MAPPING.md:62: wave236 起 agy 恢复 (墨斗主线)
docs-coolie/TEAM-MAPPING.md:69: agy (Gemini 3.8, wave236 恢复) (主线)
docs-coolie/TEAM-MAPPING.md:96: agy 默认员工 = 墨斗 (主线, wave236 恢复) | 2026-09-30 ~7 天后恢复
docs-coolie/TEAM-MAPPING.md:141: 墨斗 (主线, wave236 恢复): 选型 / 原型 / 画图 / 数据 → agy (Gemini 3.8, 2026-09-30 恢复)
docs-coolie/TEAM-MAPPING.md:180: 墨斗 (agy, wave236 恢复)
docs-coolie/HOW-TO-DELEGATE.md:38/40: 墨斗 + agy (wave236 恢复)
docs-coolie/CMMI-EMPLOYEE-MAPPING.md:19: agy (Gemini 3.8) 2026-09-30 ~7 天后恢复
docs-coolie/CMMI-EMPLOYEE-MAPPING.md:48-51: Phase 1 墨斗 agy (wave236 恢复)
docs-coolie/CMMI-EMPLOYEE-MAPPING.md:176: 墨斗 (wave236 恢复) | agy (Gemini 3.8)
docs-coolie/CMMI-EMPLOYEE-MAPPING.md:306-307: 本波 (wave236) 变更摘要: agy 恢复
docs-coolie/EMPLOYEE-SKILLS.md:198/200: §1.4 墨斗 subhead — agy (Gemini 3.8 按量, wave236 恢复)
docs-coolie/TOOL-USAGE.md:42: agy 默认员工 = 墨斗 (FDA, wave236 恢复 主线) | 2026-09-30 ~7 天后恢复
docs-coolie/TOOL-USAGE.md:64: 选型 / 原型 / 竞品 / 业务访谈 → agy (墨斗, wave236 恢复)
```

**PASS** — 5 文件全标"恢复"或"主线".

---

## 3. 真因 / 出处引用

- **老板原话 1**: "agy 恢复了应该可以用" — agy (Gemini 3.8) 2026-09-23 配额耗尽, ~7 天后 2026-09-30 恢复.
  → 墨斗 (FDA) 默认切回 agy; 选型 / 原型 / 画图 / 业务访谈都用 agy; 偶尔用 cmd (紧急).
- **老板原话 2**: "claude-ds 也不能用, 换 cmd, claude-mm" — claude-ds 配额紧 (PM 之前漏改).
  → 兑底渊 (PRE-SRE) 工具改 cmd + claude-mm (替换 claude-ds). claude-ds 标"不可用, 配额紧".

---

## 4. 不做什么 (反向约束, 验证)

| 不动项 | 状态 | 证据 |
|---|---|---|
| `server/src/services/agent-assign.ts` (wave222 算法层) | ✅ 未动 | `git status server/` 空 |
| `AGENT_ROLES` enum | ✅ 未动 | `git status packages/shared/` 空 |
| `ui/` | ✅ 未动 | `git status ui/` 空 |
| `clients/expo/` | ✅ 未动 (除预先 wave235 残留) | 仅有 wave235 的预存 M (与本波无关) |
| `packages/db/` / `packages/adapters/` / `packages/adapter-utils/` / `packages/plugins/` | ✅ 未动 | `git status` 空 |
| `docs-coolie/ROLE-MAPPING.md` (wave222) | ✅ 未动 | `git status docs-coolie/ROLE-MAPPING.md` 无 |
| wave234 / wave235 已有的非 agy/claude-ds 段 | ✅ 未动 | 仅本波改动的 5 docs-coolie/*.md |
| Coolie 工坊系统 | ✅ 未动 | 不在本波 scope |

---

## 5. 验收

- [x] 5 docs-coolie/*.md 改动一致 (TEAM-MAPPING / HOW-TO-DELEGATE / CMMI-EMPLOYEE-MAPPING / EMPLOYEE-SKILLS / TOOL-USAGE)
- [x] 墨斗默认 agy, 兑底渊默认 cmd + claude-mm (替换 claude-ds)
- [x] claude-ds 仅百晓生 SRE 临时按量兜底
- [x] 不动 server / ui / clients/expo / wave222 算法层 / AGENT_ROLES enum
- [x] 0 行代码改动
- [x] commit type: `docs(tool-agy-recover-claude-ds-exit)`

---

## 6. 发版

- **不发 APK** (纯文档改动, 无 APK 变更)
- commit type: `docs(tool-agy-recover-claude-ds-exit)`
- push origin main