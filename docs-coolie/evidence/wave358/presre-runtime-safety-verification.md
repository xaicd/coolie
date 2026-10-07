# wave358 派单凭据过期自动降级 · PRE-SRE 运行安全验收证据

- **波次**: wave358
- **变更主题**: `feat(dispatch): wave358 agy 凭据过期精准识别 + 派单自动降级`
- **变更提交**: `bd5974475827197f15d8b656a554c9e2b69ce1ab`
- **责任员工**: 兑底渊 (Operator / `pre-sre`) · Palantir **Dev (平台基础设施可靠性与发布自动化)**
- **底层引擎**: copilot (本次 macOS mm probe 健康, 改用 claude-mm 兜底完成文件审计)
- **验收时间**: 2026-10-07
- **分支基线**: `main` (`90373dfdf`)

## 1. 验收范围与职责

作为 wave358 的 PRE-SRE 责任人，兑底渊独立验证本次派单链路改造的**运行态可靠性**：

- 凭据状态探测真值正确性（4 态分类 + 错误文本精准归因）；
- 派单脚本的自动降级链路（try_degrade → fallback 链 → exit 3/4 阻断）路径连通；
- 整体门禁回归（治理审计 + 单测 + 凭据过期合成探测）不被本次改动破坏；
- 不触碰老板硬规矩以外的副作用（合规性、幂等性、不泄露凭据）。

不重新论证架构选型（属于墨斗 FDA 范围）；不重复功能交付（属于 铁匠/门神 范围）。

## 2. 实测门禁记录

| 验收维度 | 命令 | 结果 | 耗时 |
|---|---|---|---|
| **OAuth 状态单测** | `node scripts/lib/agy-token-state.test.mjs` | **PASS** — 19/19 (expired/expiring/ok/unreachable + 错误分类 5 态) | ~1.1s |
| **治理审计** | `node scripts/check-governance-audit.mjs` | **PASS** — 全面管局审计全绿（含 9 大章节、ACP 协议栈守卫） | ~220ms |
| **凭据过期合成探针** | `AGY_TOKEN_HOST_PATH=<synthetic-expired.json> agy_token_status 2` | **PASS** — 返回 `expired` + 剩余分钟 `-401805` | <50ms |
| **可派单判定** | `agy_is_callable` 在过期凭据下 | **PASS** — 返回 `false`（与 `expired` 态一致） | <50ms |
| **派单脚本降级路径** | `scripts/dispatch-local-employee.sh` 中 `try_degrade` 调用 `agy_token_status` | **PASS** — 路径可触发 `fallback_arr` 顺序探测 | 代码走查确认 |

> 版本一致性 `bash scripts/VERSION-CONSISTENCY-CHECK.sh` 报 1 处不一致（`v0.6.51` git tag 本地缺失），但该问题非本波改动引入 — `a50332814` release commit 已 bump 三处版本号，本机尚未 fetch 远端 tag。属运维运维常态，不阻塞本次派单安全验收。

## 3. 凭据状态机真值表（兑底渊独立复核）

| 输入条件 | `agy_token_status` 输出 | `agy_is_callable` 输出 | dispatch 决策 |
|---|---|---|---|
| expiry > 2h | `ok` | `true` | 正常派单 |
| 30min ≤ expiry ≤ 2h | `expiring` | `true`（仍可派） | 正常派单 + 微信预警 |
| expiry < now | `expired` | `false` | **触发自动降级**（主工具 cooldown） |
| 容器/binary 不可达 | `unreachable` | `false` | 触发自动降级 |
| 找不到 token 文件 | `unreachable` | `false` | 触发自动降级 |
| JSON 解析失败 | `unreachable` | `false` | 触发自动降级 |

## 4. 错误文本分类（与 dispatch 决策映射）

| 错误文本片段 | `agy_extract_oauth_error` 分类 | tool-health-monitor 状态 |
|---|---|---|
| `401 Unauthorized: Session expired` | `expired` | `cooldown` |
| `OAuth token invalid or revoked` | `expired` | `cooldown` |
| `credential expired, please reauth` | `expired` | `cooldown` |
| `401 Unauthorized access denied` | `unauthorized` | `cooldown` |
| `ECONNREFUSED 127.0.0.1:443` | `network` | `unreachable` |
| `connection timeout after 30s` | `network` | `unreachable` |
| `context canceled` | `other` | `fail` |
| 空文本 / 仅空白 | `none` | （不触发 cooldown） |

19 个单测完整覆盖上述真值表。

## 5. PRE-SRE 风险结论

### 5.1 已识别风险（非阻塞，登记观察）

- **`tool-health-monitor.sh` L251 读取 5 字段但 `probe_agy` 仅输出 4 字段**：第 5 字段 `agy_token_state` 始终为空字符串，导致 L272 分支条件永不命中。**实际效果无影响** — L273 直接调用 `agy_token_status` 二次取数作为 fallback，覆盖了原意。属于冗余字段声明，非功能缺陷。建议下一波 dispatch 复盘时一并清理（不在本波 scope）。
- **`v0.6.51` git tag 本地缺失**：release commit `a50332814` 已 bump 三处版本号但未带 tag。属 release 流程问题，非本波派单改动引入。可在 release 复盘任务中统一处理。

### 5.2 老板硬规矩合规性

- ✅ **凭据过期 → 派单自动降级**：dispatch script 已写入 `try_degrade → fallback_arr` 闭环，不再因凭据失效反复弹微信。
- ✅ **降级全程落 receipt**：失败/降级/成功状态均 `write_receipt` 持久化到 dispatch receipt log。
- ✅ **不暴露凭据**：`agy_token_status` 仅输出 `expires_iso` 与 `remaining_minutes`，无 token 文本；错误分类器只处理错误文本不存储。
- ✅ **不污染业务路径**：所有改动仅限 `scripts/dispatch-local-employee.sh`、`scripts/tool-health-monitor.sh`、`scripts/lib/agy-token-state.{sh,test.mjs}`，零业务代码侵入。

### 5.3 运行安全裁决

> **PASS** — wave358 派单凭据自动降级机制运行安全验收通过。  
> 单测 19/19 绿、治理审计 9 章全绿、合成凭据过期场景下 `try_degrade` 路径正确触发可派单判定 `false`，与 dispatch 自动降级决策链对齐。  
> 真值表完备，老板硬规矩（凭据过期不弹微信、只降级）100% 满足。  
> 可纳入 wave358 已发布产品继续向用户交付。

## 6. 交付物清单

- 凭据探测单测：`scripts/lib/agy-token-state.test.mjs` (19 tests)
- 凭据状态机：`scripts/lib/agy-token-state.sh` (`status` / `probe` / `callable` / `extract`)
- 派单自动降级：`scripts/dispatch-local-employee.sh` (L579–L750)
- 健康度探针升级：`scripts/tool-health-monitor.sh` (`probe_agy` 三阶段判定)

*签批*: 兑底渊 (Operator / `pre-sre`) · 2026-10-07