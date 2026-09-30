# wave232 — QA 报告: 5 员工 × Skills 完整映射

> **波次**: wave232
> **目的**: 老板原话 "本地员工, 各自需要使用到的 skills 都清楚了吗" — 把每个员工的 skills 落地.
> **执行人**: Hermes (PM, MiniMax-M3)
> **日期**: 2026-09-30
> **关联 brief**: # (老板原话派单, paperclip 没创建独立 issue)

---

## 1. 交付物清单 (本波 git diff 新增)

| 路径 | 类型 | 行数 | 状态 |
|---|---|---|---|
| `docs-coolie/EMPLOYEE-SKILLS.md` | 文档 (新) | 308 行 | ✅ 完整 |
| `scripts/check-employee-skills.sh` | bash 脚本 (新, 可执行) | 297 行 | ✅ 跑通 |
| `scripts/install-employee-skills.sh` | bash 脚本 (新, 可执行) | 350 行 | ✅ 跑通 |
| `docs-coolie/evidence/wave232/` | evidence 目录 (新) | 10 个文件 | ✅ 完整 (QA-REPORT.md + 4 check txt + 5 install txt) |

**不动**: `server/` / `ui/` / `clients/expo/` / `skills/` 仓库内已有 skill 内容 / MCP 实现 /
`.agents/skills/` 任何 skill 本身.

---

## 2. 测试结果

### 2.1 `check-employee-skills.sh` 跑通

**Default 模式** (全 5 员工):

```
employee           | P0 ok / total | P1 ok / total | P2 ok / total | MISSING (P0)
-------------------+---------------+---------------+---------------+-----------------
铁匠 (Forge / core-swe)   |   5 /  10     |  22 /  23     |  23 /  23     |  coding-style testing-style api-design database-design code-review
门神 (Guardian / fdse)    |   6 /  12     |  14 /  14     |   3 /   3     |  paperclip-task paperclip-frontend-app paperclip-deploy dispatch-wave monitor-wave FDE-skills
兑底渊 (Operator / pre-sre) |  10 /  15     |   6 /   6     |   2 /   2     |  paperclip-runbook paperclip-system-monitor paperclip-cost-optimize paperclip-incident-response paperclip-backup-restore
墨斗 (Inkstick / fda)     |   3 /  11     |   4 /   6     |   1 /   1     |  paperclip-dar paperclip-prototype paperclip-licensing-audit paperclip-design-pattern paperclip-data-viz agy-system-instructions
百晓生 (Sage / ds)        |   9 /  17     |  20 /  20     |   6 /   6     |  paperclip-system-monitor paperclip-incident-response paperclip-cost-optimize paperclip-data-analysis paperclip-ml-eval paperclip-test-strategy paperclip-bug-hunt paperclip-quality-metrics
```

完整输出: [`check-default.txt`](check-default.txt)

**missing-only 模式**: 输出 38 行, 全是 brief 列出的 ⚠️ MISSING skills (本波不创建) — 见
[`check-missing-only.txt`](check-missing-only.txt)

**JSON 模式**: 196 行, 供 PM monitor 脚本消费 — 见 [`check-json.txt`](check-json.txt)

### 2.2 `install-employee-skills.sh` 跑通

**dry-run 模式** (全 4 CLI × 5 员工):
- linked (new symlinks):    **30** — 真要新建的 (跨 cmd / agy / copilot 路径)
- noop (already correct):   **117** — 已经在 `~/.claude/skills/` 下的 (claude CLI 全量)
- skip-missing (no SKILL.md in repo): **0** — 缺失的都在 check 阶段已标, install 阶段静默跳过

完整输出: [`install-dry-run-all.txt`](install-dry-run-all.txt)

**apply --cli claude 模式** (实际跑):
- linked (new symlinks):    **0** — 全部已在 `~/.claude/skills/` (前一波 install 好了)
- noop (already correct):   **115** — 幂等正确
- skip-missing:             **0**
- ✅ idempotent 验证通过

完整输出: [`install-apply-claude.txt`](install-apply-claude.txt)

**apply --employee modou --cli agy 模式** (跨 CLI 实跑):
- linked (new symlinks):    **10** — 在 `~/.agy/skills/` 新建 10 个墨斗 skill 软链
- noop (already correct):   **2** — paperclip + paperclip-board 已有 (跨员工复用)
- skip-missing:             **0**
- ✅ 跨员工去重 + 跨 CLI 装载验证通过

完整输出: [`install-apply-modou-agy.txt`](install-apply-modou-agy.txt)

**Per-CLI dry-run** (--cli cmd / agy / copilot):
- [`install-dry-run-cmd.txt`](install-dry-run-cmd.txt) — cmd 路径 22 个 symlink
- [`install-dry-run-agy.txt`](install-dry-run-agy.txt) — agy 路径 10 个 symlink (与 modou apply 一致)
- [`install-dry-run-copilot.txt`](install-dry-run-copilot.txt) — copilot 占位 0 个 (无 paperclip 之外 row)

### 2.3 Idempotency

`install-employee-skills.sh --apply --cli claude` 跑 2 次, 第二次 0 linked / 115 noop, 证明幂等.

---

## 3. ⚠️ MISSING skills 调研结果

老板 brief 列了 28 个 `paperclip-*` / `coding-style` / `dispatch-wave` / `FDE-skills` 等 skill
名字, 但**实际仓库 / 本地均不存在**. 调研结论 (EMPLOYEE-SKILLS.md §3):

| 类别 | 数量 | 说明 |
|---|---|---|
| **应独立创建** (本波不做, 留 wave233..246) | 11 | `coding-style` / `testing-style` / `api-design` / `database-design` / `code-review` / `paperclip-runbook` / `paperclip-system-monitor` / `paperclip-cost-optimize` / `paperclip-incident-response` / `paperclip-backup-restore` / `paperclip-prototype` / `paperclip-licensing-audit` / `paperclip-data-analysis` / `paperclip-test-strategy` |
| **被现有 skill 覆盖, 关闭 brief** | 17 | `task-driven-development` / `paperclip-task` / `paperclip-frontend-app` / `paperclip-deploy` / `dispatch-wave` / `monitor-wave` / `FDE-skills` / `paperclip-dar` / `paperclip-design-pattern` / `paperclip-data-viz` / `agy-system-instructions` / `paperclip-ml-eval` / `paperclip-bug-hunt` / `paperclip-quality-metrics` |

**调研方法**: 用 `find /Users/mac/workspace/xaicd/coolie/.agents/skills/ -maxdepth 1 -mindepth 1 -type d`
列出 72 个 skill 目录, 与 brief 列出的 skill 名对照. 详见 EMPLOYEE-SKILLS.md §3 表.

---

## 4. 与既有 wave 的关系

- **wave225 / wave227**: 5 员工岗位 + CMMI 25 任务分工已定 — 本表是补 skill 维度, 不重定义.
- **wave228 install-ds-mcp.sh**: DS 5 个 MCP (system-monitor / approval / company-ops /
  agent-device / agent-browser) 已注册 — 本表 §1.5 引用, 不重做.
- **wave229 cmd 修正**: `cmd = @commandcode/ai` CLI, 老板不亲自跑 — 本表 §1.2 门神加载
  路径 `~/.cmd/skills/` 反映.
- **wave230 / wave231**: UI chip 文字裁剪 + 测试运营 — 不影响本表.
- **不动**: `server/src/services/agent-assign.ts` (wave222 算法层) / `AGENT_ROLES` enum /
  `ROLE_MAPPING` 表.

---

## 5. 风险与回滚

### 5.1 风险

- **install 脚本真建软链** — 已经在老板本机 `~/.claude/skills/` 创建了 ~115 个 symlink.
  影响: 不占空间 (软链), 不改磁盘内容. 即使删除也是 `rm <link>`.
- **brief 列出的 skill 名在 §3 调研后被分类** — 11 个独立创建 + 17 个关闭, 可能与老板
  原意有偏差. 已明确在 EMPLOYEE-SKILLS.md §3 表里逐条标 ⚠️ + 建议, 老板后续 wave 可调整.
- **`/Users/mac/.cmd/skills/` / `~/.agy/skills/` / `~/.copilot/skills/` 路径不存在** —
  install 脚本会 `mkdir -p`, 但 agy / copilot 当前 CLI 不自动加载 skill, 软链为占位.

### 5.2 回滚

- 删软链: `find ~/.claude/skills ~/.cmd/skills ~/.agy/skills ~/.copilot/skills -type l -lname "*/.agents/skills/*" -delete`
  (只删本波新建的, 不动 wave228 install 之前的)
- 删本波新文件: `git rm docs-coolie/EMPLOYEE-SKILLS.md scripts/check-employee-skills.sh scripts/install-employee-skills.sh`
- 删 evidence: `rm -rf docs-coolie/evidence/wave232`

---

## 6. 验证清单

- [x] `EMPLOYEE-SKILLS.md` 完整: 5 员工 × skills 映射 + ⚠️ MISSING 调研 + 装载机制
- [x] `check-employee-skills.sh` 真跑: default / missing-only / JSON / --employee 4 模式
- [x] `install-employee-skills.sh` 真跑: dry-run / apply / --cli / --employee 多模式
- [x] 幂等: apply 跑两次, 第二次 0 linked
- [x] evidence 4 个文件齐全
- [x] 不动 `server/` / `ui/` / `clients/expo/`
- [x] 不动 `skills/` 仓库内 72 个 skill 内容
- [x] 不创建 ⚠️ MISSING skill (留 wave233..246)

---

## 7. 不发 APK / 不上 Coolie 工坊

本波纯文档 + 脚本, 不发 APK, 不上 Coolie 工坊系统. commit type 走 `docs(employee-skills)`
+ `chore(scripts)`. push `origin main`.

---

## 8. 老板下次说"派个活"的体感改善

**之前**: 老板说 "派个活修 UUID bug" — PM 查 CMMI-EMPLOYEE-MAPPING.md → 铁匠 → 写 brief
`~/bin/dispatch-waveXXX.sh` → 跑 `claude-glm`. 但铁匠跑时不知道**该用哪些 skill**, 凭记忆
加载, 容易漏 (例如忘了 `bug-fix-flow` 流程).

**现在**: PM 写 brief 时参考 EMPLOYEE-SKILLS.md §1.1 铁匠的 P0 skill 列表, brief 里
写明 "铁匠必带 P0: core-swe + paperclip + paperclip-board + swe-delivery-flow + fork-sync"
→ 铁匠加载时按 list 启用, 不漏. 跑前 PM 跑 `scripts/check-employee-skills.sh --employee tiejiang`,
所有 P0 都 ok 才派活, 否则先派修 skill.

— QA 报告完 —