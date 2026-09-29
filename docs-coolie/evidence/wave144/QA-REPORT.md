# wave144 · board-chat 两个真坑修复 — 证据报告

- 日期: 2026-09-29
- 范围: 工坊对话 (board chat) 后端 relay + Expo App 屏
- 状态: **代码已改 / 单测已过 / 未发版、未部署、无真机截图** (见 §5 诚实边界)

## 1. 症状 → 我实际查到什么

| boss 描述 | 我验证到的 |
|---|---|
| 每次发问都死, `hermes chat --yolo` 子进程 exit 130 (SIGINT) | 本机 `hermes` 存在 (v0.21.3), `chat` 支持 `--oneshot/--quiet/--query-file -/--yolo/--max-turns/--provider/-m` → 排除 127 (adapter 缺失) 与 flag 不支持。**exit 130 本身未在本地复现** (复现要真发一次问, 会消耗模型额度, 且生产才是主现场)。 |
| 失败显示 `[hermes-error] Board assistant failed (exit 130)` | 这是**历史**痕迹: `docs-coolie/evidence/wave129/QA-REPORT.md:106` 已经记过一次 exit 130。 |
| 前端一直转圈, 输入框 disable, 底部 tab 不能切 | 输入框 disable **已确证是代码**: `ChatInput` 的 `editable={canEdit}`, 而 `canEdit = !sending && !disabled` → 发问期间输入框不可编辑 (40% 透明度)。tab bar 本身**没有**被发送状态 gating (`TabBar.onChange` 无 `sending` 判断), 但发问期间切 tab 会卸载工坊屏 (`App.tsx:1046` 条件渲染), 局部 `sending/streamingText` 一起清零 —— 切回来看见空白, 观感就是"卡死/锁页"。 |

### 顺带挖到的一个真 bug (服务端)
`server/src/routes/board-chat.ts` 的 `proc.on("close", async (exitCode) => …)` **丢掉了第二个参数 `signal`**。

- 被信号杀死的子进程, Node 给的是 `code === null` + `signal === "SIGINT"`;
- 旧代码只看 `exitCode`, 于是 `(exitCode ?? 0) !== 0` 为 false, 一个被 SIGINT 杀掉的子进程**只能靠"输出为空"这条兜底判成失败**, 消息里永远看不到是哪个信号。
- 即: boss 说的 "SIGINT 主动 kill" 在服务端是不可见的。这才是 `exit 130 / 被 kill 分辨不出来` 的代码根因。

## 2. 改了什么

### A. 服务端 `server/src/routes/board-chat.ts`
1. **信号可见**: `proc.on("close", (exitCode, signal) => …)`;新增 `signalled` 判定, 被信号终止**本身即失败**;错误消息/落库评论/SSE 事件都带上 `signal` (`exit ? (signal SIGINT)`), SSE `error` 事件新增 `signal` 字段。
2. **首 token 看门狗** (新): 子进程在 `PAPERCLIP_BOARD_CHAT_FIRST_TOKEN_TIMEOUT_MS` (默认 30s) 内**一个字节都没写**, 就 `SIGTERM` 掉它并给出可重试的错误 —— 不再让房间干等到 180s 总超时。
3. **SIGTERM→SIGKILL 升级**: `killChild()` 先 SIGTERM, 5s 后仍未退出补 SIGKILL。卡在 provider SDK 里的子进程不再挂住 SSE 流。
4. **SSE 心跳**: 每 5s 写一帧 `: ping` 注释保活 (客户端解析器只读 `data:` 行, UI 不可见)。
5. **spawn 即上报**: 子进程起来立刻发一条 `status` (`会话助手已启动, 正在等待模型…`), 把"已开始"和"什么都没开始"分开。
6. `detached: false` 显式写出 (保持默认; 写成 true 会把 hermes 放进独立进程组, 我们发的信号就到不了它的孙进程)。
7. **取消 ≠ 故障**: 客户端断开 (老板点停止 / 掉线) 时是我们主动 SIGTERM 子进程的。加了 `stoppedByClient` 判定 —— 这种情况**不写** `[hermes-error] … SIGTERM`, 有可用正文就按部分回复留下, 没有就安静收场。否则每次取消都会往常驻 issue 的历史里堆一条假错误 (wave129 老板正好抱怨过这类文本)。

### B. 前端
- `clients/api-client/src/types.ts`: `BoardChatStreamEvent` 的 `error` 事件补 `signal?` / `timedOut?`(纯增量)。
- `clients/expo/src/components/ChatInput.tsx`: **发问期间输入框可编辑** (`editable={!disabled}`; 只有外部 `disabled` 才禁用)。发送键在 `sending` 时本来就被"停止"键替换, 不会重复发送。
- `clients/expo/src/screens/BoardChatScreen.tsx`:
  - **首 token 超时 30s**: 30s 没有任何 token → `AbortController.abort()` → 显示可重试的错误气泡 (不再静默返回)。
  - **错误气泡**: 失败不再是底部一条 inline, 而是像助手气泡一样留在流里, 带 `[重试] [复制]`。
  - **切 tab 不丢进度**: 把"正在进行的这一次发问"镜像到模块作用域 (`publishLiveBoardChat`), 重新挂载时恢复转圈与已到的正文; abort controller 也放模块上, 所以切走又切回来后"取消"仍能中止原流。已结束的不恢复 (回复已由服务端落库, `loadHistory` 会拿到, 不会重复)。

## 3. 我实际跑过的验证

```
npx vitest run server/src/__tests__/board-chat-route-feature-flag.test.ts   → 14 passed
pnpm --filter @paperclipai/server typecheck                                → EXIT=0
pnpm --filter @coolie/api-client typecheck                                 → EXIT=0
cd clients/expo && npx tsc --noEmit                                        → EXIT=0
pnpm test (全仓 vitest)                                                    → 见 §3.1
```

新增三个服务端用例:
- `reports a signalled exit (SIGINT) as an error and names the signal` — 覆盖 §1 的 signal 丢失 bug。
- `aborts a run with no first token and reports it honestly` — 覆盖首 token 看门狗。
- `treats a client cancel as a stop, not as [hermes-error]` — 覆盖 §2.A.7 的取消语义。

### 3.1 全仓测试结果 (pnpm test, 2102s)

```
Test Files  3 failed | 706 passed | 4 skipped (713)
     Tests  10 failed | 13466 passed | 84 skipped (13560)
```

隔离复跑 (npx vitest run 那两个文件) 确认可单独复现, 与环境/顺序无关:
- `src/__tests__/ai-connections.test.ts` — 7 failed / 44, 全部 `422 Project authentication settings conflict with the selected AI connection` (期望 200), 抛点 `services/ai-connection-runtime.ts:154 assertManagedAiProjectAuth`。
- `src/__tests__/project-repositories-persistence.test.ts` — 2 failed / 6, 全部 `422 Workspace directory must be inside an allowed project root`, 抛点 `services/workspace-path-policy.ts:66`。

= 9 例; 全仓那轮还有第 3 个文件的 1 例 (我的 `tail -60` 把这行截掉了, 没有回头复现, 不冒充知道它是什么)。

我的改动只碰了: `server/src/routes/board-chat.ts`、它的单测、`clients/api-client/src/types.ts`、两个 expo 文件。
这两处失败走的是 `ai-connection-runtime` / `workspace-path-policy`, 不 import 上述任何文件 —— 与本次改动无因果关系。

**诚实边界**: 我**没有**在干净的 HEAD 上复跑这些用例来确证它们本来就红 (boss 明令"不上 stash"), 也没有追查那第 10 例是谁。所以结论只能是"与本次改动无因果关系", 不是"已证明本来就是红的"。这 3 个文件需要单独收口。

## 4. 真机验收 (boss 待跑, 我这边无法执行)

产融项目 `4cafeb9a` 公司, App 内:
1. 发 `生成一个欢迎页` → 30s 内出成功气泡 **或** 错误气泡 + `[重试]`。
2. 发问期间点底部「汇览」→ 可切; 切回「工坊」→ 转圈/已到正文仍在 (`publishLiveBoardChat` 恢复)。
3. 发问期间点「■ 停止」→ SSE 立刻 abort, 助手气泡不再转。
4. 点 `[重试]` → 真重发 (无幂等缓存: 服务端每次都新 spawn + 新写一条用户评论)。
5. 期望的错误气泡文案: 被信号杀死 → 带 `(signal SIGINT)`; 30s 干等 → `助手在 30 秒内没有返回任何内容…`。

## 5. 诚实边界 (未做 / 未验证)

1. **没有发版 0.5.98、没有出 APK、没有 web 重建、没有部署**。`release-app.sh` / `deploy-coolie.sh` / `publish-ota.sh` 都要 ssh 到生产机 + gradle 出包 + 上传 COS; 本轮纪律明确"不启停任何服务", 且部署属不可逆的共享状态操作。`version.json` 仍是 `0.5.97`。
2. **没有真机截图**: 无设备, 故 §4 是待办清单而不是已验结论。`docs-coolie/evidence/wave144/` 下目前只有本报告。
3. **exit 130 未本地复现**: 需要用真实模型额度跑一次; 我改的是"信号无论来自谁都能被看清"这一层, 不是"让 exit 130 不再发生"。(若根因是 hermes 之外的额度/凭证问题, 现在至少会显示真话而不是空白。)
4. **没做 `[hero]` 直连降级**: 本仓没有直连 hermes SDK/HTTP 的路径 (`requestHermesOneShot` 也是 spawn 同一个 CLI, 会一起挂)。按"不包容报错"的要求, 我没有编一个假回复兜底, 而是走"明确超时错误 + 重试"。
5. **30s 首 token 的权衡**: `--quiet` 下 hermes 只在最后吐正文, 一次**合法但慢**的多轮工具调用可能 >30s 无输出, 会被看门狗截断。已留 `PAPERCLIP_BOARD_CHAT_FIRST_TOKEN_TIMEOUT_MS` 环境变量; 若线上发现正常长任务被截, 把它调大 (如 90000)。
6. **h5 / ui(web) 未改**: 本轮按 boss 指定只动 expo 屏 + 共享 api-client。h5 的 BoardChatScreen 发送键本来就 `disabled={!draft.trim()}` (不锁输入框), 但**它没有**首 token 超时。
7. **tab 状态保留未真机验证**: 逻辑是"被动镜像 + 挂载时恢复", 主流程 (停留在工坊屏) 行为未变; 但"切走再切回"这条路径我只能靠推理, 没有设备点过。
