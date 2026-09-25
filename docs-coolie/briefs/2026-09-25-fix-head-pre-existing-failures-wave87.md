# Brief: wave 87 — 修 HEAD 既有问题 (18 失败测试 + adapter-utils 7 TS error, boss 27:22 派)

PM: Jason
Worker: claude

## 0. Boss 09-23 27:22 OOB 「派」

老板让 PM 派. wave86 claude 揭露全仓 vitest 12501 过 / 18 败 (agent-hire 7/37 失败 + adapter-utils 7 TS error, HEAD 既有, boss 今日 commit 引入).

## 1. PM 老实盘点 (boss 今日 commit 引入的真问题)

```
boss 今日 commit 改动真值:
- 6c480bf14 feat(expo): QQ browser + external apps
- 032dde072 feat(deliverables): disk/git/oss multi-storage backends
- 29412d8b4 feat(cmmi): role governance baseline
- 7dddab170 feat(ontology): workshop enterprise context
- 378e4128c feat(ontology): auto-seed enterprise core
- 682860bb5 feat(ontology): approval authority matrix
- 50ba8014f feat(ontology): enterprise core context + CMDB
- 30c4b09a2 feat(ontology): schema version 锚定
- 7d1c0d324 feat(ui): sync to business system button
- 059d3503a docs(terminology): 五层导航
- e91213eeb feat(template): ruoyi-all-next
- 063fabdba feat(board): 任务派发通知铁律
- 6387fe54f feat(board): 主 Agent 总调度
- 6ac8dadea feat(board): Hermes Palantir 5 角色派活
- 77d46ef52 feat(skills): Anthropic skills 矩阵
- 6124ff9fe docs(fork-surface): paperclip-board 派活预算
- 6ac8dadea feat(board): Hermes 注入
- 29412d8b4 feat(cmmi): role governance
- 50ba8014f feat(ontology): enterprise
- 30c4b09a2 feat(ontology): schema version

这些 commit 改了 plugin-ontology/ enterprise + CMMI + board 派活 + ruoyi-all-next + disk/git/oss backend, 引入 7 个 adapter-utils TS error + 18 失败测试 (agent-hire 7 个)
```

## 2. 目标

**Coolie工坊 0.5.61** 修 HEAD 既有 18 失败测试 + 7 TS error:

A. adapter-utils 7 TS error (从真验看 typecheck 输出)
B. agent-hire 7 vitest 失败
C. 其他 11 vitest 失败 (待查)
D. 全仓 vitest 0 失败 + pnpm -r typecheck 0 error
E. bump 0.5.60 → 0.5.61 (clients/expo/{app.json,package.json,CHANGELOG.md}, versionCode 560 → 561)
F. gradle build + APK + coscli + publish-ota + adb 验 + commit + push

## 3. 任务 (5 步)

### 3.1 看真值 (boss 今日 commit 引入的失败)

1. cd ~/workspace/xaicd/coolie
2. pnpm -r typecheck 2>&1 | tee /tmp/typecheck.log | tail -30 (看 TS error 详情)
3. pnpm test:run 2>&1 | tee /tmp/vitest.log | tail -30 (看 vitest 失败列表)
4. 找具体失败文件 + 错误原因 (agent-hire 7 + 其他 11)

### 3.2 修 adapter-utils 7 TS error

1. cd packages/adapter-utils
2. grep .ts errors (grep -E "error TS" /tmp/typecheck.log | head -10)
3. 修每个 TS error (类型不匹配 / 缺 import / 缺 type / 缺 export)
4. typecheck 验证 0 error

### 3.3 修 agent-hire 7 vitest 失败

1. cd packages/agents 或 server/src/plugins/agent-hire
2. grep 失败测试文件 (find . -name "*.test.ts" | head)
3. 跑 pnpm test --filter=agent-hire 看真值
4. 修每个失败 (mock 不对 / 期待值过期 / 状态变化)

### 3.4 修其他 11 vitest 失败

按 pnpm test 输出逐个修

### 3.5 bump + 真发版 + commit + push

1. bump clients/expo/{app.json,package.json,CHANGELOG.md} 0.5.60 → 0.5.61, versionCode 560 → 561
2. cd clients/expo && npx expo prebuild --platform android --clean
3. cd clients/expo && ./android/gradlew -p android clean assembleRelease -x lint --no-daemon
4. coscli cp → cos://gzbucket/coolie/app/0.5.61/coolie-release.apk
5. version.json: commitSha 当前 HEAD
6. scp version.json → tc-coolie-claw
7. bash scripts/publish-ota.sh android 'wave87 修 HEAD 既有 18 失败测试 + 7 TS error'
8. adb install + 模拟器验 (versionCode=561)
9. git add + commit + push (SSH proxy bypass)

## 4. Constraints

- ❌ DON'T 用 agy (本地员工)
- ❌ DON'T 改 PAPERCLIP_API_KEY / PAPERCLIP_DEPLOYMENT_MODE
- ❌ DON'T bump 0.5.61 之外
- ❌ DON'T 改 boss Claude 21 commit (Sep 25) / wave84 release / wave85 release / wave86 release
- ✅ DO 修 HEAD 既有问题
- ✅ DO 用 zsh-safe single quotes

## 5. semver + PM-CHECKLIST

- 当前 0.5.60
- 修 HEAD 既有 = patch bump → 0.5.61
- PM-CHECKLIST 32 项: J1-J3 + I1 + I2

## 6. Done definition

5 步全完 + adapter-utils 0 TS error + 18 vitest 全过 + bump 0.5.61 + 真发版 + 模拟器验 + commit + push + 发版:

```
Coolie工坊 0.5.61: https://dls.xrobinai.cn/coolie/app/0.5.61/coolie-release.apk    ← NEW (修 HEAD 既有 18 失败 + 7 TS error)
OTA manifest: runtimeVersion 0.5.61
```