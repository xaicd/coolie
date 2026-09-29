# wave150 QA 报告 — 解并发 + push + 发 0.6.0

- 日期: 2026-09-29 (21:37–21:45 CST)
- 分支: `main` · 起点 `536fcca9f` · 发版 commit `269526f19`
- 状态: **Push 完成；0.6.0 已发出（4 护栏全 200）；3 条 ONB 测试 issue 已清。**
- 一句话: **wave147 的 7 个 commit 已 push（origin/main 从 `0cc1a63eb` → `536fcca9f`），随后按 `release-app.sh` 发出 v0.6.0（APK 74.50 MB + version.json + OTA + server 联动部署），4 护栏全绿。但 brief 里 0.6.0 声称包含的 5 项里，只有 3 项真实在包里 —— 见 §6，这是本报告最重要的一节。**

> 诚实边界: 本报告所有结论都带原始证据 (命令输出真值)。凡推理标 **[假设]**。凭证/密钥不入本报告。

---

## 1. 并发解算 (brief A)

**实测活着的 `command-code` 进程**（`ps -eo pid,etime,pcpu`，21:37:36）：

| PID | 启动 | ELAPSED | %CPU | 判定 |
|---|---|---|---|---|
| 96859 | Sep 29 21:05:16 | 32:20 | **0.0** | 空闲/停在输入（就是 21:05 写 `scripts/release-ios-*.sh` 的那个会话） |
| 56450 | Sep 28 01:40:04 | 1-19:57 | 0.4 | 隔夜长空闲 |
| 55307 | Sep 28 01:37:11 | 1-20:00 | 0.6 | 隔夜长空闲 |

- **未 kill 任何进程**（遵守 brief「不强 kill 别人 cmd」）。
- 「等 5 分钟」的实质是「确认没有活跃写盘者」。用 **mtime** 判定更准：`clients/expo` 4 文件的最后 mtime 是 **20:24–20:50**，`scripts/release-ios-*.sh` 是 **21:05**；本波在 **21:37** 操作时，这些文件已 **≥32 分钟无写入**，且三个进程 %CPU 均 ≤0.6 → **[假设] 无活跃写盘者**，故继续（未强 kill）。
- 残留进程仍在，未处理 —— 交由 boss/dispatcher 决定。

---

## 2. worktree 处理 (brief B)

起点 `git status` 有 **4 个 tracked 改动 + 一批 untracked**：

| 类别 | 路径 | 处置 |
|---|---|---|
| 别人的实质改动 | `clients/expo/{App.tsx,app.json,src/AppVersion.ts,src/screens/PrototypeSandboxScreen.tsx}` | **`git stash push --keep-index -m "wave149-v3 in-flight (do not touch)"` → `stash@{0}`**（保留，不丢） |
| 自己的工具脚本 | `scripts/release-ios-{build,cos}.sh` | **未 commit、未删**（wave149 iOS 工作，按 brief「不该混入 wave150」；untracked 不会进任何 commit） |
| e2e 工具 | `scripts/e2e/`、`docs-coolie/evidence/{e2e,wave146,wave149}/` | 同上，untracked，未动 |

**stash 前先存了原 diff 备份**（防 stash 被误丢）：
- `$COMMANDCODE_SCRATCHPAD/wave150-clients-expo-uncommitted.diff`
- sha256 `07be99d33310fc0e4bcc76327b995c20036e4b4f380bdd9011112166f35557aa`（111 insertions / 10 deletions，4 文件）

**stash 后校验**：`git status --porcelain | grep -v '^??'` = 空；`git status --porcelain -- clients/expo` = 空 → `release-app.sh` 的 `[1/9] 前置检查` 通过。

> `stash list` 里另有 `stash@{1..3}`（wave140/141、wave42、wave40 的旧 WIP），本波**未触碰**。
> 恢复方式（等 wave149 落定后）：`git stash pop stash@{0}`（或 `git stash apply`）。**本波未 pop**，按 brief「等 wave149 落定后再恢复」。

---

## 3. Push wave147 (brief C)

- `git fetch` 后真值：**ahead 7 / behind 0**（不是 brief 猜的 0）→ 是 **fast-forward**，无需 force。
- 命令：`GIT_SSH_COMMAND="ssh -o ProxyCommand=none" git push origin main`
- 结果：`0cc1a63eb..536fcca9f  main -> main` → **ahead 0 / behind 0**。
- 7 个 commit：`86580a17a` App spec 胶囊 · `1ca56ee4b` fork-surface · `43b3b6b63` 树视图 · `80f75ab28` 文档 · `8257efbe6` capability 契约 · `dfdc5fb49` QA 报告 · `536fcca9f` push 状态更正。
- **未用 `--force-with-lease`**：ahead/behind 证明是 ff，普通 push 更快且不碰别人的提交。

---

## 4. 发版 0.6.0 (brief D)

命令（brief D1 原文）：

```sh
bash scripts/release-app.sh 0.6.0 "wave146 init script + wave147 spec-driven + wave148 多对话 + wave144 board-chat 修复 + wave149 浏览器打开按钮"
```

先跑 **`--dry-run`** 确认整条流水线就绪（含 `[1/9]` 干净检查），再正式跑。**exit 0**，各步真值：

| 步 | 真值 |
|---|---|
| [0/9] DS 门 | 跳过（`COOLIE_RELEASE_COMPANY_ID` 未设） |
| [1/9] 前置 | 工作区干净；0.5.97 → 0.6.0 |
| [4/9] 发版 commit | **`269526f19`**（`3 files: app.json/package.json/CHANGELOG.md`） |
| [5/9] 原生 runtime | `expo.modules.updates.EXPO_RUNTIME_VERSION = 0.6.0`（与 app.json 一致） |
| [6/9] gradle | **BUILD SUCCESSFUL in 46s**，947 tasks（80 executed / 867 up-to-date） |
| [7/9] COS | `cos://gzbucket/coolie/app/0.6.0/coolie-release.apk`，**78,117,898 Byte (74.50 MB)** |
| [8/9] version.json | scp → `tc-coolie-claw:/opt/coolie/ui/dist/version.json` |
| [9/9] OTA | runtimeVersion `0.6.0`，bundle hash `zEWiQ_9YczD1…`，3.72 MB hbc |
| [10/10] server | rsync + `systemctl restart coolie` → `active` |

**APK 本地 sha256**：`5fd43b4436538b549075e58481d802962f9b0a99ab73bc13e7c39dd8b7022978`
（注：`release-app.sh` 的 version.json **不写 sha256** 字段——这是脚本现状，非本波 bug。）

### 4 项护栏（brief D2，实测 21:45）

| 护栏 | 命令 | 真值 |
|---|---|---|
| version.json | `curl https://xrobinai.cn/version.json` | **0.6.0** ✓ |
| ota/manifest | `curl -o /dev/null -w %{http_code}` | **200** ✓ |
| APK 直链 | `curl -r 0-15` dls…/0.6.0/coolie-release.apk | **206**（分片）✓ |
| health | `curl -o /dev/null -w %{http_code}` `/api/health` | **200** ✓（`deploymentMode: authenticated, exposure: public`） |

> 注：脚本 [10/10] 里那行 `✓ /api/health:` 打印为空——是 ssh 内 curl 的取值时机问题（部署刚重启）；**公网直测 200**（上表），已确认非真故障。

---

## 5. ONB 测试 issue 清理 (brief E)

来源 `docs-coolie/evidence/wave147/QA-REPORT.md` §3 的 3 条（公司 `onboarding-cache-test-1790227862` / `b1d6850c-…`，本地实例 `:3100`）：

| id | specKind | title | 处置 |
|---|---|---|---|
| `a4a104e5-…c47f8` | task | `[wave147-QA] 气泡回执组件` | DELETE 200 ✓ |
| `13af71c3-…e44b09` | design | `[wave147-QA] 回执渲染设计` | DELETE 200 ✓ |
| `c1c42912-…b205` | requirement | `[wave147-QA] 看板助手发送回执` | DELETE 200 ✓ |

- **顺序坑**：首轮按 requirement→design→task 删，前两条回 **409**（有子节点）。改为 **自底向上**（task→design→requirement）后全 200。
- 验证：三条 `GET /api/issues/<id>` 全 **404**；公司 issue 列表（33 条）里 `wave147-QA` 命中 **0**。

---

## 6. ⚠️ 与 brief 的偏差（最重要）

brief 说 0.6.0 应含 5 项。**逐项核对真值**：

| # | brief 声称 | 真值 | 在 0.6.0 包里? |
|---|---|---|---|
| 1 | wave146 init script (公司首启 + adapter 默认 + onboarding 向导) | **不存在**。`git log --all \| grep wave146` = **空**；全仓 grep `wave146` 只命中 4 个 evidence/doc 文件，**无任何代码**。wave146 自己的 `FINDINGS.md` 说：P0-A adapter **前提被推翻、无需执行**；P2-D App 端向导 **未做**；P2-E 示范项目 **未做** | ❌ |
| 2 | wave147 spec-driven | 已落 `main`（7 commit 已 push，`df14c27ea`…`536fcca9f`） | ✅ |
| 3 | wave148 多对话 | 已落 `main`（`32b8027f9`，此前已 push） | ✅ |
| 4 | wave144 board-chat 修复 | 已落 `main`（`078923ead`） | ✅ |
| 5 | wave149 浏览器打开按钮 (toolbar disable + 不 fallback) | **未提交**，在 `clients/expo/src/screens/PrototypeSandboxScreen.tsx`（wave146 P0-C 的客户端修法，29 行）。按 brief B 已 **stash** → **不在 0.6.0 包里** | ❌ |

**结论**：
1. **0.6.0 实际只含 3/5**（#2/#3/#4）。#1 是 brief 的**事实性错误**（该工作从未落地）；#5 被 brief 自己的 B 步排除（stash 保留，等 wave149 落定）。
2. 因此 **version.json 的 `releaseNotes` 里那两句（wave146 init script、wave149 浏览器打开按钮）名不副实**。仍按 brief 原文使用（下节），但**建议**修正——修正成本极低（重生成 + 重 scp 一行即可），或用 0.6.1。
3. brief D5 的「截图装新包验 **onboarding 向导**」**无对象可验**（App 端向导不存在）。

**未强改 brief 指定文本的原因**：`releaseNotes` 是 boss 指定的对外文案，擅改属越权；改一处需 boss 确认。此处仅**如实标注**，不改。

---

## 7. 未做 (brief D5 + 其他)

- **真机截图（brief D5）—— 未做**：本机无连接 Android 设备/模拟器，无法「装新包验」。不伪造截图。
  - 可替代证据：0.6.0 的 **OTA bundle 由 `main` 构建**（含 wave148 多对话 + wave144 board-chat），version`600`；spec-driven 三步 stepper 已由 wave147 报告在 Web 端真机验过。
  - 【建议】boss 用手机装 `https://dls.xrobinai.cn/coolie/app/0.6.0/coolie-release.apk` 走一遍 D5 清单；`onboarding 向导` 一项预期**看不到**（见 §6）。
- **iOS 发版 —— 未动**（brief 明令等凭证）。`scripts/release-ios-*.sh` 保持 untracked、未 commit、未运行。
- 未改 `PAPERCLIP_API_KEY` / `DEPLOYMENT_MODE`；未启停本地 dev 进程（3100/5173 只读访问）。

---

## 8. 回滚 / 恢复

| 目标 | 做法 |
|---|---|
| 恢复 wave149-v3 未提交改动 | `git stash pop stash@{0}`（备份 diff 见 §2） |
| 回滚发版 commit | `git reset --hard 536fcca9f`（生产已发，需另发低版本或保留；**不要 force 改已推送历史**） |
| 改 releaseNotes | 重生成 version.json 并 `scp` 到 `tc-coolie-claw:/opt/coolie/ui/dist/version.json` + `chmod 644` |

---

## 9. 纪律遵守

- 未强 kill 任何 cmd 进程；未丢任何未提交改动（stash + diff 双备份）。
- 未改 `PAPERCLIP_API_KEY` / `DEPLOYMENT_MODE`。
- push/ssh/scp 走 `GIT_SSH_COMMAND='ssh -o ProxyCommand=none'`；无 ssh 报错。
- 未启停 dev 进程；未 commit 任何别人的未提交区（发版 commit 只含 `clients/expo` 3 个发版文件）。
- 未写 README；未改其他业务接口契约；未写嵌套 `platform:{}`。
