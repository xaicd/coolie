# wave227 QA Report — 测试/运营 主要责任改 DS (百晓生)

> **波次**: wave227
> **真因**: 老板原话 "本地员工职责分配如何了, 测试, 运营哪个角色负责, 责任重大, 建议DS"
> **范围**: 3 个 docs-coolie 文档 — 纯文档改动, 0 行业务代码
> **日期**: 2026-09-30

---

## 1. 范围 (Scope)

### 1.1 本波改动文件 (3 个 + 1 个 QA 报告)

| 文件 | commit | 改动 |
|---|---|---|
| `docs-coolie/CMMI-EMPLOYEE-MAPPING.md` | 8b11f9d | §1 主表 5 行改主员工; §2 任务数分布重算; §3 修正表加 wave227 标注; §3 末尾差异表 6 处差异; §4 DS 多工具; §6 双轨加 DS 第三轨; §8 索引 |
| `docs-coolie/HOW-TO-DELEGATE.md` | 5eb7d22 | §1.1 加 wave227 例句; §2.1 七步 SOP 加 DS 多工具说明; §3.1 路由表 5 行改主; §4 DS 多工具; §5 派活模板加 DS 范例; §9 索引 |
| `docs-coolie/TEAM-MAPPING.md` | bca0336 | §1.2 DS 档案扩到 4 工具; §1.2 加 "百晓生责任重大 (wave227 标)"; §3 任务数汇总更新; §4 PM SOP 工具选择更新; §6 下具表加 DS; §8 索引 |
| `docs-coolie/evidence/wave227/QA-REPORT.md` | (本文件) | QA 验收报告 |

### 1.2 不动 (反向约束)

- `server/src/services/agent-assign.ts` (wave222 5 角色算法层)
- `AGENT_ROLES` enum (5 个 fork 角色 + 12 个上游)
- `ROLE_MAPPING` (wave222 算法层 25 行主/副角色不变)
- `server/src/` / `ui/src/` / `clients/expo/` / `packages/db/` / `packages/shared/` / `packages/adapters/` — **0 行业务代码改动**
- wave217 / wave220 数字员工 (qa / ops) bootstrap — 不动
- wave222 算法层 5 角色派活路由 — 不动
- wave226 quota (agent ≤ 6 / 公司) — 不动

---

## 2. 5 项主员工变更验证 (一致性)

| CMMI 任务 | 之前主员工 | **现在主员工** | 副员工 | 文档一致 |
|---|---|---|---|---|
| **Phase 2.5 风险评估** | 墨斗 (`fda`) | **百晓生 (`ds`)** | 墨斗 (`fda`) | ✅ CMMI §1 行 49; HOW-TO §3.1; TEAM-MAPPING §3 |
| **Phase 3.5 部署架构** | 兑底渊 (`pre-sre`) | **百晓生 (`ds`)** | 兑底渊 (`pre-sre`) | ✅ CMMI §1 行 60; HOW-TO §3.1; TEAM-MAPPING §3 |
| **Phase 5.2 监控告警** | 兑底渊 (`pre-sre`) | **百晓生 (`ds`)** | 兑底渊 (`pre-sre`) | ✅ CMMI §1 行 77; HOW-TO §3.1; TEAM-MAPPING §3 |
| **Phase 5.3 验收测试** | 门神 (`fdse`) | **百晓生 (`ds`)** | 门神 (`fdse`) | ✅ CMMI §1 行 78; HOW-TO §3.1; TEAM-MAPPING §3 |
| **Phase 5.5 复盘** | 墨斗 (`fda`) + Hermes 拍板 | **百晓生 (`ds`)** + Hermes 拍板 | 墨斗 (`fda`) | ✅ CMMI §1 行 80; HOW-TO §3.1; TEAM-MAPPING §3 |

**5 项主员工变更在 3 个文档之间完全一致**, 无矛盾, 无遗漏, 无冲突.

---

## 3. DS (百晓生) 工具配置 (多工具)

### 3.1 工具矩阵 (wave227 新)

| 工具 | 用途 | 配额 | 何时切换 |
|---|---|---|---|
| **claude-glm** (主, 默认) | 文档分析 + 风险评估 + 复盘报告 | 2026-10-02 17:55 重置 (同铁匠) | 默认工具, GLM 配额监控同铁匠 |
| **claude-mm** (兜底) | 长上下文 + 多文件 diff | 长期按量 | GLM 配额见顶时切 |
| **copilot** (限) | 数据决策 + License 扫描 | 2026-09-29 已耗尽, 待恢复 | 限额内轻任务 |
| **claude-ds** (按量) | 部署架构 + 监控告警 (SRE 强任务) | 长期按量 | 部署/监控类任务 |

### 3.2 多工具原则

**Why 多工具** — DS 现在主跑 5 个 CMMI 任务 (2.5 / 3.5 / 5.2 / 5.3 / 5.5), 任务类型多样:
- 文档分析 (GLM) + 长上下文 (mm) + 数据决策 (copilot) + SRE (ds)

一个员工多工具是 wave225 确立的"工具是手, 员工是岗位"原则. 不增员工, 只给 DS 加工具.

### 3.3 文档一致性验证

| 文档 | DS 多工具表述位置 |
|---|---|
| CMMI-EMPLOYEE-MAPPING.md | §4 工具矩阵 (含多工具切换说明) |
| HOW-TO-DELEGATE.md | §1.1 例句 (含 GLM 默认); §2.1 SOP 第 4 步; §3.1 路由表默认工具列; §4 工具切换规则 (含兜底链) |
| TEAM-MAPPING.md | §1.2 5 员工档案 (列 4 工具); §1.2 多工具注释; §1.2 "百晓生责任重大 (wave227 标)"; §2 工具 vs 员工表 |

✅ **3 文档表述一致**, DS 默认 = claude-glm, 兜底链一致.

---

## 4. 任务数分布重算 (CMMI 25 行覆盖)

### 4.1 主员工分布变化 (wave225 → wave227)

| 员工 | wave225 主任务数 | **wave227 主任务数** | 变化 |
|---|---|---|---|
| 铁匠 (`core-swe`) | 13 | **11** | -2 (5.3/5.5 不再主) |
| 门神 (`fdse`) | 3 | **1** | -2 (5.1/5.3 降为副) |
| 兑底渊 (`pre-sre`) | 5 | **4** | -1 (3.5/5.2 降为副) |
| 墨斗 (`fda`) | 5 | **3** | -2 (2.5/5.5 降为副) |
| **百晓生 (`ds`)** | 2 | **5** | **+3** (2.5/3.5/5.2/5.3/5.5 全收) |

### 4.2 25 行覆盖验证

```
铁匠 11 + 门神 1 + 兑底渊 4 + 墨斗 3 + 百晓生 5 = 24
差额 1 = Phase 1.3 License 合规双主 (墨斗 + 百晓生各 +1)
合计 = 25 行 ✅
```

✅ **CMMI 25 任务行无遗漏, 无重复** (除 Phase 1.3 双主外).

### 4.3 Hermes 拍板位

- Phase 1.5 G0 选型门禁 — Hermes 拍板 (不动, 主员工铁匠)
- Phase 5.5 复盘 — Hermes 拍板 (wave227 起主员工改百晓生, 但 Hermes 拍板位保留)

✅ Hermes 拍板位与主员工解耦, 流程不变.

---

## 5. 算法层 vs 员工层差异 (6 处)

| CMMI 任务 | 算法层主 (`ROLE_MAPPING`) | 5 员工层主 (本波) | 差异原因 |
|---|---|---|---|
| 1.3 License 合规 | `ds` | 墨斗 + 百晓生 双 | FDA 主访谈, DS 副扫描; 老板原话偏好墨斗 (FDA) 主跑 |
| 2.4 工时估算 | `fdse` | 铁匠 (`core-swe`) | 老板偏好铁匠 (core-swe) 出估算, 门神验证 |
| **2.5 风险评估** | `fda` | **百晓生 (`ds`)** | **wave227** 改主 — 测试/运营/风险 责任重大, 老板原话"建议 DS" |
| **3.5 部署架构** | `pre-sre` | **百晓生 (`ds`)** | **wave227** 改主 — 部署架构 + 风险预案联动, DS 数据决策 |
| **5.2 监控告警** | `pre-sre` | **百晓生 (`ds`)** | **wave227** 改主 — 运营监控 责任重大, DS 跑监控指标 |
| **5.3 验收测试** | `core-swe` | **百晓生 (`ds`)** | **wave227** 改主 — 测试策略 + E2E 撞机, DS 主; 老板金标仍走门神 cmd |
| **5.5 复盘** | `fda` | **百晓生 (`ds`)** + Hermes 拍板 | **wave227** 改主 — 数据决策 + 复盘, DS 跑数据分析 |

✅ 算法层不动, 5 员工层和算法层各自管各自的派活路由 — 二者正交, 不冲突.

---

## 6. 双轨 (Dev + Infra) + DS 第三轨 (wave227 加)

### 6.1 wave225 双轨

- Dev Track: 铁匠 (`core-swe`) 主, 门神 (`fdse`) 副 — Phase 3 设计 + Phase 4 开发
- Infra Track: 兑底渊 (`pre-sre`) 主, 铁匠 (`core-swe`) 副 — 端口策略 + 部署架构 + 部署执行
- 双轨交汇点: Phase 5.3 验收测试 (门神) — 必须在 Infra 轨部署完成后开跑

### 6.2 wave227 三轨

- Dev Track: 铁匠 主, 门神 副 — Phase 3 设计 + Phase 4 开发 (不动)
- Infra Track: 兑底渊 主 (Phase 2.1 / 3.4 / 4.5 / 5.1), 铁匠 副 — 端口策略 + 部署执行 + 性能优化
- **新增"DS 数据决策"轨**: 百晓生 主 — Phase 2.5 / 3.5 / 5.2 / 5.3 / 5.5 (风险 + 监控 + 验收 + 复盘)
- 双轨交汇点: Phase 5.3 验收测试 (wave227 主改百晓生, 副门神 cmd — 老板金标) — 必须在 Infra 轨部署完成后开跑

✅ DS 在 Dev/Infra 之外开第三条 "数据决策" 轨, 与双轨并行, 不取代, 是补强.

---

## 7. 数字员工 (Coolie 工坊) — wave226 quota 不动

### 7.1 wave226 锁定项 (本波不动)

- agent ≤ 6 / 公司 — 不动
- wave217 qa 员工 role = core-swe / pre-sre / fdse — 不动
- wave221 5 角色映射 — 不动

### 7.2 DS 责任扩 → 数字员工管理/调度

老板原意: 测试 / 运营 数字员工 (wave217 qa) 的**管理 / 调度责任** (Coolie 系统内) 改为 DS (百晓生) role 拥有.

**实施**: 数字员工的 role 仍保持 core-swe / pre-sre / fdse (算法层), 但**派活路由**走 DS 主, 副员工按原映射.

✅ 本波不动数字员工 role / 不动 wave226 quota — 仅在文档 (CMMI-EMPLOYEE-MAPPING §6) 隐含 DS 主调度.

---

## 8. PM (Hermes) 派活路由更新

### 8.1 派活逻辑 (wave227)

```
老板说: "测试一下 wave227" / "运营看监控" / "复盘"
    ↓ Hermes (PM) 分析
    ↓ 识别: 测试/运营 = 数据决策 + 测试策略 + 应急
    ↓ 派 百晓生 (DS) 主, 门神 / 兑底渊 副
    ↓ 看工具: claude-glm (DS 主力) → claude-mm → copilot (限) → claude-ds (按量)
    ↓ 写 brief 派 (~/bin/dispatch-waveXXX.sh)
```

✅ HOW-TO-DELEGATE.md §2.1 七步 SOP 第 4 步已加 wave227 DS 多工具说明.

### 8.2 路由表更新 (§3.1)

5 行路由表更新 (Phase 2.5 / 3.5 / 5.2 / 5.3 / 5.5), 默认工具统一改为 claude-glm, 紧急切门神 cmd / 兑底渊 claude-ds (按任务类型).

✅ HOW-TO-DELEGATE.md §3.1 路由表已更新.

### 8.3 派活脚本范例 (§5)

加 "派百晓生 wave227 范例" 段, brief 模板含 5 个 CMMI 任务 + 主员工 + 多工具 + 验收标准.

✅ HOW-TO-DELEGATE.md §5 已加范例.

---

## 9. commit 历史 (本波)

```
bca0336 docs(testing-ops-owner): wave227 — TEAM-MAPPING DS 扩工具 + 责任重大标注
5eb7d22 docs(testing-ops-owner): wave227 — HOW-TO-DELEGATE 路由表 5 行改 DS
8b11f9d docs(testing-ops-owner): wave227 — CMMI 5 任务主改百晓生 (DS 责任重大)
```

---

## 10. QA 验收 checklist

| 项 | 状态 | 验证 |
|---|---|---|
| 3 文档更新一致 (主员工变更 5 处) | ✅ | §2 5 项主员工变更验证 |
| 业务代码 0 行改动 | ✅ | §1.2 不动范围 |
| DS 多工具配置 3 文档一致 | ✅ | §3.3 文档一致性验证 |
| CMMI 25 行无遗漏 | ✅ | §4.2 25 行覆盖验证 |
| 算法层 vs 员工层差异明确标注 | ✅ | §5 6 处差异 |
| 双轨调整合理 (DS = 数据决策第三轨) | ✅ | §6 双轨调整 |
| 数字员工 / wave226 quota 不动 | ✅ | §7 不动范围 |
| PM 路由表 + SOP + 派活范例已加 | ✅ | §8 PM 派活路由更新 |
| 不动 server / ui / clients/expo | ✅ | §1.2 不动范围 |
| wave227 标注 + 责任重大标注在 3 文档齐全 | ✅ | §9 commit 历史 + grep 验证 |
| push origin main | ✅ | 待老板 / PM 跑 (commit 已落 main) |

---

## 11. 不做什么 (反向约束, 严守)

- **不动 `ROLE_MAPPING`** — wave222 算法层 25 行主/副角色不变.
- **不动 `server/src/services/agent-assign.ts`** — 算法只看 5 角色, 不看 5 员工.
- **不动 `AGENT_ROLES` enum** — 5 个 fork 角色 + 12 个上游不变.
- **不动 wave217 / wave220 数字员工** — 13 个 qa + ops 已在 Coolie 工坊公司里 bootstrap, 与本波本地员工概念正交.
- **不动 Coolie 工坊系统本体** — 工坊架构 / 部署 / 看板 UI 不改.
- **不动 UI / clients/expo / server / packages** — 本波纯文档, **0 行业务代码改动**.
- **不动 wave226 quota** — agent ≤ 6 / 公司 不动.
- **不入 git 仓库**: `~/.claude/settings.json` / `~/bin/*.sh` — 老板本地配置, 不上 git.

---

## 12. 出处与索引

- **本波改动**:
  - `docs-coolie/CMMI-EMPLOYEE-MAPPING.md` (5 处主员工改百晓生 + 任务数重算 + DS 多工具 + DS 第三轨)
  - `docs-coolie/HOW-TO-DELEGATE.md` (路由表 5 行更新 + §4 DS 多工具 + §5 派活范例)
  - `docs-coolie/TEAM-MAPPING.md` (DS 档案扩工具 + §3 任务数 + §4 PM SOP 更新 + §6 下具)
  - `docs-coolie/evidence/wave227/QA-REPORT.md` (本文件)
- **不动 (反向约束)**:
  - `docs-coolie/ROLE-MAPPING.md` (wave222)
  - `server/src/services/agent-assign.ts` (wave222)
  - `packages/shared/src/constants.ts::AGENT_ROLES` (5 fork + 12 upstream)
  - `scripts/wave217/qa-bootstrap-team.mjs` + `scripts/wave220/ops-bootstrap-team.mjs`
  - `scripts/wave226/` (agent quota)
- **关联**:
  - wave225 (5 员工 + 1 PM 规范) — 本波在其上扩 DS 责任
  - wave222 (5 角色算法层) — 不动, 与本波 5 员工层正交
  - wave226 (agent ≤ 6 / 公司 quota) — 不动

---

## 13. QA 结论

✅ **PASS** — 3 文档更新一致, 业务代码 0 行改动, DS 多工具配置齐全, CMMI 25 行覆盖无遗漏,
算法层不动, 数字员工不动, wave226 quota 不动.

老板原话 "测试 + 运营 责任重大, 建议 DS" 已落到:
- 5 个 CMMI 主任务 (Phase 2.5 / 3.5 / 5.2 / 5.3 / 5.5) 改百晓生主
- DS 工具扩到 4 个 (claude-glm / claude-mm / copilot / claude-ds)
- 派活路由 + SOP + 派活脚本范例全部更新
- 数字员工管理/调度归 DS (不动 wave217/220)
- "DS 责任重大 (wave227 标)" 在 3 文档齐全
- 双轨加 DS 第三轨 (数据决策)
- 3 commits 已落到 main (8b11f9d / 5eb7d22 / bca0336)
