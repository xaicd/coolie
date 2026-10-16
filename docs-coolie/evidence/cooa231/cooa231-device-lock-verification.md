# COOA-231 · emulator-5554 真机设备串行化锁 验证记录

- 日期: 2026-10-16
- 执行: 门神 (FDSE)
- 工单: [COOA-231](/COOA/issues/COOA-231)（本工单为 PM 路由母单；实际派单 [COOA-232](/COOA/issues/COOA-232) 已 `done`）
- 交付实现: commit `b98516ff7`（COOA-232），本轮补 `COOA-231` 契约对齐 + fork 面登记 + 复核存证

## 1. 目标与验收对照

| COOA-231 验收项 | 实现 | 结果 |
| :--- | :--- | :--- |
| 两并发 `acquire` 仅一个成功，另一个得到明确「被 X 持有」错误 | `mkdir` 原子锁；败者 exit `3` + `is busy (held by <owner>, pid <pid>)` | ✅ 单测 `[0,3]` 断言 |
| 僵尸 claim（进程已死 / 超 TTL）可被回收 | TTL 过期 claim 原子接管 (`mv` 抢占，仅一个竞争者成功)；同 host 且 owner pid 已死可经 `DEVICE_CLAIM_PID_RECLAIM=1` 回收 | ✅ 单测覆盖 |
| 有单测或门禁脚本覆盖 acquire/release 竞争 | `scripts/__tests__/device-claim.test.mjs` + `check-governance-audit.mjs` §24 | ✅ 14/14 + 门禁全绿 |

> **关于「进程已死」默认策略**：进程存活检测为**显式 opt-in**（`DEVICE_CLAIM_PID_RECLAIM=1`）而非默认。
> 原因：`acquire` 作为独立进程调用后即刻退出（`$$` 死亡），若默认按 pid 判活会把刚取得的锁误判为僵尸并抢占。
> 因此默认以 **TTL 租约**为僵尸判据（15 min，`run` 包装期间正常释放），进程存活检测作为同 host 的补充手段按需开启。

## 2. 本轮补齐的缺口

1. **fork 面登记**：`b98516ff7` 新增的 3 个 `scripts/` 文件未在 `scripts/check-fork-surface.mjs` 的 `OWNED_PREFIXES` 登记，
   导致 fork 面闸门报 3 个 `NEW`（undeclared）。本轮登记后闸门 `PASS`。
2. **契约对齐**：COOA-231 正文要求 `scripts/device-claim.sh acquire|release|status <serial>` 的**位置参数** `serial` 形式。
   实现原仅支持 `--device <serial>`；本轮为 `acquire|release|status|reap` 增加位置参数 `serial`（`run` 仍保留位置参数为被包裹命令），
   两种写法等价，向后兼容。

## 3. 复核命令与输出

```
$ bash -n scripts/device-claim.sh
syntax OK

$ node --test scripts/__tests__/device-claim.test.mjs
# tests 14
# pass 14
# fail 0

$ node scripts/check-fork-surface.mjs --range=8143dc9a0..b98516ff7
PASS — 2 declared upstream file(s) within budget.

$ node scripts/check-governance-audit.mjs | tail
📵 24. 真机设备串行化锁 (device-claim) 守卫 (COOA-232):
  ✅ [PASS] 设备串行化锁实体守卫 ...
  ✅ [PASS] 原子文件锁守卫 (mkdir + owner/TTL + 默认 900s) ...
  ✅ [PASS] agent-device 驱动包装守卫 ...
  ✅ [PASS] 技能法典守卫 ...
  ✅ [PASS] CLI 快捷指令守卫 ...
  ✅ [PASS] 设备串行化锁并发竞争单测守卫 ...
🎉 全面管局审计全绿通过！
```

## 4. 交付物清单

- `scripts/device-claim.sh` — `acquire|release|status|reap|run`；`mkdir` 原子锁 + `owner/pid/host/startedAtEpoch/ttlSeconds`；默认 TTL 900s；原子接管回收僵尸；`release` 校验 owner 归属；本轮补位置参数 `serial`。
- `scripts/agent-device-locked.sh` — agent-device 驱动包装，委派 `device-claim run`（驱动前自动 acquire，完成/非零退出/SIGINT+SIGTERM 均释放）。
- `scripts/__tests__/device-claim.test.mjs` — 14 单测（并发一成一败 / TTL 僵尸回收 / 释放归属 / `run` 包装 / 位置参数）。
- `.agents/skills/agent-device-browser-automation/SKILL.md` — §1「驱动真机前必须 acquire 设备串行化锁」+ SOP 前置 acquire。
- `scripts/check-governance-audit.mjs` §24 + `package.json` `test:device-claim` — 防退化门禁。
- 真机实证: `docs-coolie/evidence/cooa232/DEVICE-CLAIM-REAL-DEVICE-PROOF.md`（真实 `emulator-5554` 上两并发 holder/contender 一成一败，未获锁者命令未执行）。

## 结论

`b98516ff7` 已在真实 `emulator-5554` 上跑通「两并发一成一败 / 未获锁者不驱动设备 / 释放后自动空闲 / 僵尸 TTL 回收」。
本轮补齐 `COOA-231` 正文所要求的位置参数 `<serial>` 契约与 fork 面登记，全部单测与门禁复绿。
