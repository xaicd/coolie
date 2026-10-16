# COOA-232 · 真机设备串行化锁 真实验证存证 (Delta / CMMI G4)

> **目的**：证明 `scripts/device-claim.sh` 在**真实** Android 模拟器 `emulator-5554` 上解决了 COOA-117-S5 与 COOA-228(e1283cba) 互抢设备、互污证据的根因。
> **环境**：Mac 宿主机 (`macdeMac-Studio.local`, Darwin arm64)；`adb` = `/Users/mac/android-sdk/platform-tools/adb`；`agent-device` = `/opt/homebrew/bin/agent-device`。

## 0. 真实设备在线

```
$ adb devices -l
List of devices attached
emulator-5554          device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64 device:emu64a transport_id:21
```

## 1. 并发竞争真机实证：一成一败，未获锁者绝不驱动设备

并发启动两个 `device-claim.sh run`：holder 取得锁后**真实**驱动 emulator-5554（`adb exec-out screencap` 截图）并持锁 3s；contender 在同一窗口发起竞争。

```
$ scripts/device-claim.sh run --owner "menshen:COOA-232:holder" --ttl 900 -- \
      bash -c "adb -s emulator-5554 exec-out screencap -p > docs-coolie/evidence/cooa232/device-holder.png; sleep 3" &
$ sleep 0.7
$ scripts/device-claim.sh run --owner "COOA-228:contender" -- \
      bash -c "echo SHOULD_NOT_RUN > docs-coolie/evidence/cooa232/contender-should-not-exist.txt"
```

结果：

```
holder exit=0
contender exit=3
--- contender stderr ---
[device-claim] emulator-5554 is busy (held by menshen:COOA-232:holder, pid 84557)
--- contender 命令是否被拦截？---
OK: contender did not run (lock held)
```

- **holder exit=0**：成功取得锁并驱动真机。
- **contender exit=3**：被拒，且其被包裹命令**未执行**（`contender-should-not-exist.txt` 不存在）。这正是根因修复：两个数字员工不再可能同时驱动同一设备。
- 释放后 `status` 返回 `emulator-5554: free`（exit 0），证明 `run` 退出时自动释放。

## 2. 真机截图不可变证据

holder 在持锁期间由**真实** `emulator-5554` 抓取的物理屏幕帧：

```
$ file docs-coolie/evidence/cooa232/device-holder.png
docs-coolie/evidence/cooa232/device-holder.png: PNG image data, 1080 x 2400, 8-bit/color RGBA, non-interlaced
-rw-r--r--  1 mac  staff  266327 ...  docs-coolie/evidence/cooa232/device-holder.png
```

截图内容为 Coolie 移动端真实运行界面（设置页，`版本与增量更新 原生: v0.6.60 · 运行时: 0.6.60`，5 槽位对称底栏 `汇览/任务/+/工坊/资产`），非白屏 / 非 boot 界面。原始 PNG 见同目录 `device-holder.png`（二进制，按 fork 政策仅本地保留，已作为 issue artifact 上传）。

## 3. 僵尸 claim 回收（TTL）

单测中以注入过期 `startedAtEpoch`（`now - 901`, `ttl=900`）模拟僵尸 claim：

```
$ scripts/device-claim.sh status --json
{"device":"emulator-5554","state":"stale",...}       # 退出 0
$ scripts/device-claim.sh acquire --owner FRESH      # 自动原子接管
exit=0 ; meta.owner == FRESH
```

## 4. 固化防退化守卫

```
$ node --test --test-reporter=tap scripts/__tests__/device-claim.test.mjs
# tests 13
# pass 13
# fail 0
```

```
$ node scripts/check-governance-audit.mjs | tail
📵 24. 真机设备串行化锁 (device-claim) 守卫 (COOA-232):
  ✅ [PASS] 设备串行化锁实体守卫 ...
  ✅ [PASS] 原子文件锁守卫 (mkdir + owner/TTL + 默认 900s) ...
  ✅ [PASS] agent-device 驱动包装守卫 (agent-device-locked.sh → device-claim run)
  ✅ [PASS] 技能法典守卫 (SKILL.md 「驱动前必须 acquire」)
  ✅ [PASS] CLI 快捷指令守卫 (package.json test:device-claim)
  ✅ [PASS] 设备串行化锁并发竞争单测守卫
🎉 全面管局审计全绿通过！
```

## 结论

真机串行化锁已在真实 `emulator-5554` 上跑通「两并发 acquire 一成一败 / 未获锁者不驱动设备 / 释放后自动空闲 / 僵尸 TTL 可回收」，并通过治理门禁第 24 节固化防退化。
