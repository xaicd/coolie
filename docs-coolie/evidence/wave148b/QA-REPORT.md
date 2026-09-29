# wave148b QA report — 解并发 + 0.5.98 (结果: 未单独发出, 被 0.6.0 合并)

Date: 2026-09-29
Author: CommandCodeBot (wave148b, cmd PID 96859)
Boss task: 解并发 + 发 0.5.98 (含 wave144 工坊对话修复 + wave148 工坊多对话)

---

## 0. 一句话结论

**0.5.98 没有单独发出, 因为它被更新的 wave150 发布的 `0.6.0` 全额覆盖 ——
0.6.0 是 0.5.98 的严格超集 (含 wave144 + wave148), 且已在 prod 生效。
此刻再跑 `release-app.sh 0.5.98` 会把线上 `version.json` 从 0.6.0 降级到 0.5.98,
是回退事故, 不是发版。故本波不发 0.5.98, 只做并发解算 + 事实留档。**

并发**已解**: v3 退出后由其后续波次 `wave150` 用
`git stash push -m "wave149-v3 in-flight (do not touch)"` 保留了 v3 的 4 文件改动,
工作区随后干净, 0.6.0 顺利出包。

---

## 1. 并发解算 (本波核心工作)

### 1.1 会话盘点 (开工时, 实测)

`ps -eo pid,ppid,etime,command`, 按父 dispatch 脚本标识:

| PID | 父进程 | 会话 | 状态 |
|---|---|---|---|
| 57802 | `dispatch-wave149-v3.sh` (57658) | **wave149-v3** (iOS 打包) | 本波期间**自然退出** |
| 33866 | `dispatch-wave147.sh` (33734) | **wave147** (spec-driven) | 开工时仍活, 期间提交 3 个 commit 后退出 |
| 96859 | `dispatch-wave148b.sh` (96715) | **本波 (wave148b)** | — |
| (无) | — | wave149-v4 | 开工前已结束 (与 brief 一致) |

**发现: brief 只预警了 v3/v4, 实际还有第三条活会话 wave147 在写同一工作区。**
本波没有 kill 任何会话; 按 A2「等自然落定」+ 5 分钟预算轮询。

### 1.2 等待结果 (不主动 kill)

- 轮询脚本 (scratchpad, 15s 间隔) 在 **t=15s** 观察到 **v3 (57802) 已退出**;
  wave147 (33866) 继续运行, 期间继续 commit (`86580a17a` → `1ca56ee4b` → `43b3b6b63` → `8257efbe6` …),
  直至本波结束前退出。
- **没有任何会话被 kill。** wave149-v3 与 wave147 均属自然结束。

### 1.3 v3 退出时的仓区状态 (关键事实)

v3 退出时**没有**提交它改的 4 个文件, 它们仍是 un-staged 的 `M`:

```
 M clients/expo/App.tsx                            (iOS 安装卡片分支)
 M clients/expo/app.json                           (iOS bundleIdentifier → cn.xrobinai.app)
 M clients/expo/src/AppVersion.ts                  (RemoteIosBuild 接口)
 M clients/expo/src/screens/PrototypeSandboxScreen.tsx  (wave146: 外部打开按钮 disable + 不 fallback)
```

- 其中 3 个是 v3 的 iOS 发版在飞改动, 第 4 个 (`PrototypeSandboxScreen.tsx`) 注释标 `wave146`。
- `git diff --cached` 为空 → **未 staged**。
- 按本波 B2 纪律: 「只 modified 未 staged → **报告 boss 决定, 不 stash**」→ 本波**没有** stash。

### 1.4 并发升级: wave150 (超集波) 介入

开工中段发现新 dispatch `dispatch-wave150.sh` (21:34 派单, PID 33893), 其任务书目标为:
**解并发 + push + 发版 `0.6.0` (合并 wave146 init + wave147 spec-driven + wave148 多对话 + wave144 board-chat 修复 + wave149 浏览器打开按钮)。**
即 0.6.0 = 0.5.98 + 其它。wave150 采用了 brief 允许的 stash 手法:

```
git stash list
stash@{0}: On main: wave149-v3 in-flight (do not touch)   ← wave150 保住了 v3 的 4 文件
```

随后工作区干净, wave150 提交并发布了 0.6.0 (见 §2)。**0.5.98 由此被合并, 不再单独发。**

---

## 2. 0.6.0 (替代 0.5.98 的实际发布) — 实测真值

| 项 | 真值 | 来源 |
|---|---|---|
| 发版 commit | `269526f19 release: v0.6.0 — wave146 init script + wave147 spec-driven + wave148 多对话 + wave144 board-chat 修复 + wave149 浏览器打开按钮` | `git log` |
| `app.json` 版本 | `0.6.0` | `python3 -c json.load` |
| APK 产物 | `clients/expo/android/app/build/outputs/apk/release/app-release.apk` (78,117,898 B, 21:41) | `ls -la` |
| 线上 `version.json` | `{"version":"0.6.0","versionCode":600,"downloadUrl":"https://dls.xrobinai.cn/coolie/app/0.6.0/coolie-release.apk","commitSha":"269526f19…"}` | `curl https://xrobinai.cn/version.json` |
| OTA `manifest` | **HTTP 200** | `curl -o /dev/null -w %{http_code}` |
| `/api/health` | **HTTP 200** | 同上 |
| 0.5.98 APK | **HTTP 404** (从未上传) | `curl -I .../0.5.98/coolie-release.apk` |
| local vs origin/main | 本地领先 origin/main 1 个 commit (269526f19) — wave150 收尾 push 中 **[假设]** | `git log origin/main..main` |

**4 项护栏 (以 0.6.0 为准):** version.json 200 / ota 200 / health 200 / APK 直链将随后续打点; 0.5.98 直链 404 (未发)。

---

## 3. 为什么本波不发 0.5.98 (决策依据)

1. **严格超集**: 0.6.0 明确包含 wave144 (078923ead) + wave148 (32b8027f9) + wave146/147/149。
   发 0.5.98 不会带来任何 0.6.0 里没有的内容。
2. **会降级 prod**: 线上 `version.json` 已是 `0.6.0`。`release-app.sh` 的版本检查只在
   `CURRENT == VERSION` 时 abort; `0.5.98 ≠ 0.6.0` 会通过, 随后把 `version.json` 覆写成 0.5.98,
   使全量 App 收到**回退更新** —— 明确的事故。
3. **本波纪律本身就不允许强推**: 工作区不干净时 B2 要求「报告 boss, 不 stash」;
   唯一能清干净的手法 (stash 别人改动) 被 brief 明令禁止。
4. **一波一版本 / 不动他人发版**: wave150 正在发 0.6.0, 同时发 0.5.98 会抢 `app.json` /
   `version.json` / push, 直接对撞。

---

## 4. 交付物

| 路径 | 说明 |
|---|---|
| `docs-coolie/evidence/wave148b/QA-REPORT.md` | 本文件 (新文件) |
| `docs-coolie/RELEASE-HISTORY.md` | 更新 `v0.5.98` 段: 由「blocked」改为「superseded by 0.6.0」 |

**没有**产生 0.5.98 的 APK / COS 对象 / tag / version.json 改动 (未发即不应有)。

---

## 5. 纪律 / 诚实标注

- **未 kill** 任何会话 (v3 / wave147 均自然退出)。
- **未 stash** 别人改动 (B2 纪律); 4 文件由 wave150 以 stash 保留, 未丢。
- **未动 iOS 发版** (等 boss 凭证, 见 wave149 QA-REPORT-v3/v4/v5)。
- **未改** `PAPERCLIP_API_KEY` / `DEPLOYMENT_MODE`; **未启停** dev 进程。
- 本报告全部真值来自 `ps` / `git` / `curl` / `ls`, 推理处标 **[假设]**。
- **[假设]** wave150 尚在收尾 (push / server 联动部署), §2 的 origin/main 领先值为读时快照。
