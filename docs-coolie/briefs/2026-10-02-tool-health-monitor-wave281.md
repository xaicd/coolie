# wave281: 每 2 小时工具探测 + 套餐到期监控 + 员工体系接入 (老板原话 wave281, 2026-10-02)

## 老板原话 (本会话新加, 微信实证)
> "**每两小时 工具探测一下, 工具 可以用性 要加入到 员工 体系中, claude-glm, claude-mm, agy-gemini3.8, cmd, copilot, kiro-cli 这些工具 本身 都是我充值的套餐, 都有可能到期**"

## 真值源 (改这里 = 改全部)
- `docs-coolie/PM-WECHAT-NOTIFY.md` v2.1 (本档输出格式真值)
- `docs-coolie/EMPLOYEE-OBJECTS.md §-4` (5 员工 × 必跑脚本真值)
- `docs-coolie/TOOLS.md` (7 工具池真值, wave272)
- `scripts/which-tool.sh` (现有 CLI 可执行性检查, wave272 + wave280 修正)
- `scripts/daily-tool-probe.sh` (现有每天 8:00 一次真跑, wave277 + wave279 真跑 OK)

## CMMI Phase + 任务
- Phase 4.1 编码 (铁匠主线)
- 4.2 单元测试
- 5.4 发布说明 (发版前)

## 派活
- **主员工**: 铁匠 (Core-SWE) — Claude Code CLI + claude-glm (GLM-5.3)
- **副员工**: 百晓生 (DS) — claude-mm (套餐到期监控分析)
- **时间窗**: 上午 9-12 (铁匠独占), 不撞 wave280 (已落 brief 2026-10-02-event-trigger-wave280.md)

---

## A. 新增 `scripts/tool-health-monitor.sh` (核心, 每 2 小时探测)

**Why 老板原话**: "**每两小时 工具探测一下**" — 现有 daily-tool-probe.sh 只每天 8:00 一次, 间隔 16 小时太长。**7 工具是老板充值套餐, 有可能到期**(quota 耗尽 / key 过期 / API 改版)。

### A.1 功能 (4 块)

1. **CLI 可执行性** (沿用 which-tool.sh): 7 工具的 `which` 检查
2. **真跑 OK 探测** (沿用 daily-tool-probe.sh): `cmd -p "回复 OK"` 等真跑真答
3. **套餐状态探测** (**新, 核心**): 7 工具 quota / key 过期 / 月度配额
4. **输出 → 员工体系** (**新, 老板原话 "加入到 员工 体系中"**): 状态自动写入 `agents` 表 (DB) / `cron-team-status.sh` 可读

### A.2 接口

```bash
bash scripts/tool-health-monitor.sh --check      # 7 工具全跑 (5-10 秒, 不缓存)
bash scripts/tool-health-monitor.sh --print     # 同上, 表格输出
bash scripts/tool-health-monitor.sh --json      # JSON 输出 (供 cron-team-status.sh 消费)
bash scripts/tool-health-monitor.sh --register # 注册 cron (每 2 小时)
bash scripts/tool-health-monitor.sh --unregister
bash scripts/tool-health-monitor.sh --help
```

### A.3 输出格式 (3 段 5 行, 跟 PM-WECHAT-NOTIFY.md 一致)

```
【📋日常·14:30】
跑: 铁匠 claude-glm (40m50s, claude-glm) ✅ quota 78%
卡: 兑底渊 copilot ⚠️ 月度配额 95% (剩 5%, 1 号 8:00 重置)
完: claude-mm ✅ quota 23% | agy ✅ 容器 up | cmd ✅ OK | kiro-cli ✅ OK
```

### A.4 7 工具套餐状态探测规则

| 工具 | 探测方法 | 配额源 | 老板套餐 |
|---|---|---|---|
| **agy-gemini3.8** | `docker exec agy-ubuntu-container agy -p "回复 OK"` | Antigravity 账号 | 月度配额 (老板充值) |
| **claude-glm** | `claude -p "回复 OK" -m MiniMax-M3` | BigModel GLM-5.3 Coding Plan | 每日 22:55 重置 |
| **claude-mm** | `claude -p "回复 OK"` | MiniMax-M3 SDK | 按量, 长期不限 |
| **cmd `@commandcode/ai`** | `cmd -p "回复 OK"` | commandcode.ai CLI 配额 | 套餐, 可能到期 |
| **copilot** | `copilot -p "回复 OK"` | GitHub Copilot CLI 月度配额 | 月度, 1 号 8:00 重置 (cron 已注册) |
| **Hermes** | 老板本机是否响应 (PM 自身) | 老板账号 | 不限 (但要测) |
| **kiro-cli** | `kiro-cli -p "回复 OK"` | AWS Kiro CLI | 老板备用, 可能到期 |

---

## B. cron 注册 (`*/120 * * * *` 每 2 小时)

**改 crontab** (PM 不动老板本机, 写 brief 给铁匠告诉老板怎么加):

```
*/120 * * * * ~/bin/tool-health-monitor.sh --print >> /tmp/tool-health.log 2>&1 # wave281-tool-health
```

**注**: 老板现有 cron 2 行:
- `*/30 * * * * bash scripts/cron-team-status.sh --print` (wave276)
- `0 8 * * * ~/bin/daily-tool-probe.sh` (wave277)

**新加 1 行** (每 2 小时), 保留 daily-tool-probe.sh (每天 8:00 早起详细探测).

### B.1 老板原话 "套餐到期" 推送

**套餐到期前 3 天** → 推 ⚡重要 (老板微信 + 老板问响应)

**当天到期** → 推 🔥金标 (P0 真修级)

**到期后** → 推 ⚡重要 (该工具不可用, 切兜底工具)

---

## C. 接入员工体系 (老板原话 "加入到 员工 体系中")

**Why**: 老板原话 "工具可用性要加入到员工体系中" — 工具状态不能孤立, 必须**绑员工角色**。老板想知道: "派铁匠前, claude-glm quota 还有多少?"

### C.1 数据流

```
tool-health-monitor.sh --json
  ↓
输出 JSON:
{
  "timestamp": "2026-10-02T14:30:00+08:00",
  "tools": {
    "agy-gemini3.8": {"status": "✅", "quota_pct": 67, "employee": "墨斗"},
    "claude-glm": {"status": "✅", "quota_pct": 78, "reset_at": "2026-10-02T22:55", "employee": "铁匠"},
    "claude-mm": {"status": "✅", "quota_pct": 23, "employee": "百晓生+铁匠贰号"},
    "cmd": {"status": "✅", "quota_pct": null, "employee": "门神"},
    "copilot": {"status": "⚠️", "quota_pct": 95, "reset_at": "2026-11-01T08:00", "employee": "兑底渊"},
    "Hermes": {"status": "✅", "employee": "掌柜"},
    "kiro-cli": {"status": "✅", "employee": "老板备用"}
  }
}
  ↓
写入 DB `tool_health` 表 (新表, 见 §D)
  ↓
cron-team-status.sh 5 字段 cron 推送时, 工具列加 quota% 显示
```

### C.2 老板微信 5 字段推送 (更新 cron-team-status.sh)

| 员工 | 任务 | 多长时间 | 工具 | 状态 |
|---|---|---|---|---|
| 掌柜 | wave281 | 1h23m | Hermes ✅ | 跑 |
| 铁匠 | wave281 | 40m | claude-glm ⚠️ 78% | 跑 |
| 墨斗 | - | - | agy ✅ 67% | 等派活 |

**工具列加 quota% 标记**, 让老板微信一屏看完"谁在用什么工具, 配额剩多少"。

---

## D. 新增 DB 表 `tool_health` (复用现有 schema 风格)

```sql
-- packages/db/src/migrations/9024_tool_health.sql
CREATE TABLE tool_health (
  id BIGSERIAL PRIMARY KEY,
  tool_name TEXT NOT NULL,                  -- 'agy-gemini3.8' / 'claude-glm' / ...
  status TEXT NOT NULL,                     -- '✅' / '⚠️' / '❌'
  quota_pct NUMERIC(5,2),                  -- NULL=不限 / 0-100
  reset_at TIMESTAMPTZ,                     -- 配额重置时间 (GLM 22:55 / copilot 1 号 8:00 / ...)
  expires_at TIMESTAMPTZ,                   -- 套餐到期时间 (老板充值套餐, 可能到期)
  last_check_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_check_output TEXT,                    -- 真跑探测的输出片段 (例 "OK 5s")
  CONSTRAINT chk_tool CHECK (tool_name IN ('agy-gemini3.8', 'claude-mm', 'claude-glm', 'cmd', 'copilot', 'Hermes', 'kiro-cli'))
);
CREATE INDEX idx_tool_health_name_time ON tool_health (tool_name, last_check_at DESC);
```

**PM 不写 migration SQL** (铁匠写, 老板 review)。

### D.1 7 工具 × 套餐到期日 (老板可手动填, PM 不写)

| 工具 | 套餐平台 | 充值账号 | 到期日 (示例) |
|---|---|---|---|
| agy-gemini3.8 | Antigravity | 老板 Antigravity 账号 | 老板填 (月度) |
| claude-glm | BigModel | 老板 BigModel Coding Plan | 老板填 (每日 22:55 重置) |
| claude-mm | MiniMax | 老板 MiniMax-M3 SDK | 老板填 (按量, 不限) |
| cmd | commandcode.ai | 老板 commandcode.ai CLI | 老板填 (套餐, 可能到期) |
| copilot | GitHub Copilot | 老板 GitHub Copilot CLI | 老板填 (月度, 1 号 8:00 重置) |
| Hermes | 老板账号 | 老板账号 | 不限 |
| kiro-cli | AWS Kiro | 老板 AWS 账号 | 老板备用, 可能到期 |

**填法**: 老板微信 "**agygemini38 套餐 11 月 1 日到期**" → PM 写进 `tool_health.expires_at` 列 → 11 月 1 日前 3 天自动推 ⚡重要。

---

## E. 接入 PM-WECHAT-NOTIFY.md §-5.5 compact 输出

**更新 cron 推送输出格式**, 5 字段表新增 quota%:

```
【📋日常·14:30】
跑: 掌柜 wave281 (1h23m, Hermes ✅ 不限)
跑: 铁匠 wave281 (40m50s, claude-glm ⚠️ 78%, 剩 22:55 重置)
跑: 兑底渊 wave281 (12m, copilot ⚠️ 95%, 剩 11/1 重置)
完: wave281 落仓 <commit> | APK 0.6.21 200 OK
```

老板微信一屏看到:
- 谁在跑什么 (员工 + 任务 + 时长)
- 用什么工具 (默认 + quota%)
- 老板套餐状态 (✅ / ⚠️ / ❌ + 重置时间)

---

## F. 不动 (反向约束)

- `server/src/services/agent-assign.ts` / `AGENT_ROLES` enum / `ROLE_MAPPING` (算法层)
- 5 角色 / 13 数字员工 (已删)
- `ui/` / `clients/expo/` / 业务代码
- wave270-280 / v0.6.20 tag / v0.6.21 tag / v0.6.22 (wave275)
- 8 份派活权威档
- 老板本机 `~/.hermes/scripts/wave-progress-notify.sh` (老板手动同步)
- 老板 7 工具的**账号/密码/key** (不在仓库, 在 `~/secure/` 或 `scripts/e2e/.env.local`)

---

## G. 不要顺手改

- 不动 wave280 (已经派 brief, 不冲突)
- 不动 daily-tool-probe.sh (每天 8:00 早起详细探测, 跟 wave281 每 2 小时是**互补**不冲突)
- 不动 which-tool.sh (CLI 可执行性, wave281 复用其逻辑)
- 不动 AGENT_ROLES enum / ROLE_MAPPING
- 不动 8 份派活权威档
- 不动 5 字段定义

---

## H. QA (门禁)

- `bash scripts/tool-health-monitor.sh --check` 输出 7 工具状态, 0 错
- `bash scripts/tool-health-monitor.sh --json` 输出 JSON, 含 employee 字段
- `bash scripts/tool-health-monitor.sh --register` 注册 cron 成功
- 套餐到期前 3 天推 ⚡重要 (老板微信)
- 当天到期推 🔥金标
- DB `tool_health` 表 schema 校验通过 (`pnpm -r typecheck`)
- 报告 `docs-coolie/evidence/wave281/QA-REPORT.md`

---

## I. 发版

- **不发 APK** (纯脚本 + migration + 文档)
- **入 git**: `scripts/tool-health-monitor.sh` (新增) / `docs-coolie/briefs/2026-10-02-tool-health-monitor-wave281.md` / `docs-coolie/evidence/wave281/QA-REPORT.md`
- **commit**: 1 commit `feat(tool-health): wave281 — 每 2 小时工具探测 + 套餐到期监控 + 员工体系接入`
- **不 bump 版本号** (纯脚本)

---

## J. 下一步 (wave282+)

- 老板派 wave282: 给 7 工具填**真实套餐到期日** (老板原话 "都有可能到期")
- 推 wave283: 实施 PM-WECHAT-NOTIFY.md §6 扩展点 (卡死行动建议 / 派活预告 / 配额快照 / 工具故障 / 老板金标 1%)
- 真值源锁定: `EMPLOYEE-OBJECTS.md §-4` (5 员工 × 必跑脚本) + `TOOLS.md` (7 工具池) + `PM-WECHAT-NOTIFY.md` v2.1

---

## PM 反讲真值 (Compact 形式)

```
【compact ·14:45 ·wave281】
老板: 每 2 小时工具探测 + 套餐到期监控 + 员工体系接入
主线: 老板聚焦"7 工具套餐别断, 员工体系用上"
本会话: 11 份权威 + 1 INDEX + 3 调研档 + 5 历史 + brief 2 份 = 22 份
下一步:
  1. 铁匠 wave281 写 tool-health-monitor.sh + DB migration + 接入 cron
  2. 老板微信填 7 工具真实套餐到期日
  3. 真值源: PM-WECHAT-NOTIFY §5.5 + EMPLOYEE-OBJECTS §-4 + TOOLS.md
```
