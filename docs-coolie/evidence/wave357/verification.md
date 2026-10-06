# wave357 验证证据 (墨斗 modou-fda)

date: 2026-10-06
base: 8241bcdeb (wave357)
券: COOA-53 [wave357] 让墨斗做下架构设计 (CMMI Phase 1.4 选型研判 / Phase 3.1 系统设计)

## 任务

对 wave357「标准 ACP 调度全协议栈与 Hermes 微信执行总线」做架构设计:
设计文档 `docs-coolie/specs/2026-10-06-wave357-acp-dispatch-architecture.md`
(§0 Echo 价值 / §2 选型研判 4 候选 / §3 系统设计 7 节 / §5 守卫军规)，
并按 Dev 反向传播要求固化防退化自动化守卫 (管局审计第 9 节)。

## 1. ACP 端到端真机握手 (L0→L5 全栈, 真 agy 容器)

```
$ acpx --timeout 150 --agent scripts/adapters/docker-agy-acp.sh exec -f acp-smoke-prompt.txt
[client] initialize (running)
[client] session/new (running)
OK
[done] end_turn
$ exit code: 0
```

JSON-RPC 2.0 stdio 全链: acpx (客户端) → docker-agy-acp.sh → docker-agy-acp.mjs
(@agentclientprotocol/sdk agent server) → docker exec agy-ubuntu-container agy。
详见 `acp-handshake-agy-smoke.txt`。

## 2. 工具矩阵与运行时

```
$ bash scripts/which-tool.sh acp     → 6 工具族 ACP 矩阵全列
$ acpx --version                     → 0.13.1
$ docker inspect agy-ubuntu-container → true (Running since 2026-09-25)
$ bash -n scripts/dispatch-local-employee.sh → 语法 OK
$ ls -l scripts/adapters/            → 8 文件全部 -rwxr-xr-x
```

详见 `acp-matrix-and-runtime.txt`。

## 3. 治理守卫 (含新增第 9 节, Dev 反向传播)

```
$ pnpm check:governance
GOV_EXIT=0   (🎉 全面管局审计全绿通过)
```

新增 `scripts/check-governance-audit.mjs` 第 9 节 6 规则全 PASS:
R1 适配器族可执行 / R2 派单 acpx 选路 / R3 控制面-脚本面并轨 /
R5 自主权限旗标 / R6 ACP 协议面 / R7 矩阵在册。
全量输出见 `governance.log`。

## 4. 交付物清单

| 交付物 | 路径 |
|---|---|
| 架构设计文档 (Phase 1.4 + 3.1) | `docs-coolie/specs/2026-10-06-wave357-acp-dispatch-architecture.md` |
| 防退化守卫 (守卫军规) | `scripts/check-governance-audit.mjs` 第 9 节 |
| 真机握手存证 | `docs-coolie/evidence/wave357/acp-handshake-agy-smoke.txt` |
| 矩阵与运行时存证 | `docs-coolie/evidence/wave357/acp-matrix-and-runtime.txt` |
| 治理守卫全量输出 | `docs-coolie/evidence/wave357/governance.log` |
