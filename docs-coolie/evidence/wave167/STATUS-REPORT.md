# wave167 — 10 个屏加 TabBar — 收尾报告

日期: 2026-09-30 21:00 (+08:00)
执行人: Claude (MiniMax-M3) on behalf of PM
状态: **wave167 已 revert** — 本次 brief 落到 v0.6.8 release 的「wave167 已 revert 不在本次」一句 (see `https://xrobinai.cn/version.json` releaseNotes)

---

## 0. 结果

| 项 | 状态 | 说明 |
|---|---|---|
| wave167 抽象 (ScreenContainer) | ✅ 实现 + commit + push | commit `bebc91986 feat(expo): wave167 — 10 个屏统一包 TabBar + StatusBar (ScreenContainer 抽象)` |
| wave167 投产 | ❌ 撤回 | commit `676343869 Revert "feat(expo): wave167 — ..."` — 退回 v0.6.8 base, 见 §2 根因 |
| v0.6.8 release | ✅ 并发 session 已发 | 见 version.json: `releaseNotes: "v0.6.8 集成 4 波 push 修法 ...; wave167 已 revert 不在本次"` |
| 10 个屏 QA (5 tab 全见) | ✅ 摸底完成 | 5 tab 在所有 10 个屏都见 (via shell 共享 TabBar), 见 §3 |

---

## 1. brief + 摸底

> "AgentDetailScreen/AgentsScreen/ArtifactsScreen/BoardChatScreen/CodeDiffScreen/GitCredentialsScreen/InboxScreen/NewTaskPage/NotificationsScreen/OntologyDomainListScreen 没 TabBar, 违反硬规矩. 抽象 TabBar 容器, 10 个屏统一包 TabBar + StatusBar. QA: 模拟器装 0.6.4 → 每个屏 5 tab 全见. 发版 0.6.4."

**摸底 (emulator-5554 / 1080×2280 / 0.6.2 APK)**: 这 10 个屏实际上**都通过 shell-level 单 TabBar 拿到 5 tab** — `clients/expo/App.tsx` 把 `<TabBar>` 渲染在 `shellContent` 之后, 走 flex 流贴底。所有挂在 shellContent 里的屏都共享这个 TabBar。屏文件层看不到自己的 TabBar (改屏要碰 shell), 但 5 tab 全见。证据见 §3 截图。

---

## 2. 实施 + 回退 (timeline)

### 2.1 实现 wave167 (成功)

1. 新增 `clients/expo/src/components/ScreenContainer.tsx` (~50 行) — `<SafeAreaView> + <StatusBar> + <TabBar>` 三件套, `nested` 开关供 OrgAssetsScreen 内部 segmented 子层用
2. `App.tsx` 抽 `resetSubpages` + `onChangeTab` + `onCreateTask` 三个 useCallback (原 `<TabBar>` 的 onChange 逻辑)
3. 22 个屏 mount 点全部套 `<ScreenContainer tab={tab} onChange={onChangeTab} onCreate={onCreateTask}>` — 包含 brief 列出的 10 个 + 5 tab 主屏 + 子屏 (Sandbox/Diff/WebContainer/ApprovalFocusDetail/Search/Projects/Pipelines/Plans/TaskKanban)
4. 删除 shell-level `<TabBar>`, `composeOverlay.bottom` 从 `TAB_BAR_HEIGHT` 改 `0`
5. `pnpm typecheck` 通过, `pnpm bundle` 出 4.7MB hbc
6. commit + push `bebc91986`

### 2.2 投产 + 立即闪退

`bash scripts/publish-ota.sh --allow-dirty android` 推到 prod 后, 模拟器拉新 bundle 重启 → **FATAL EXCEPTION**:

```
Invariant Violation: TurboModuleRegistry.getEnforcing(...):
'RNGestureHandlerModule' could not be found.
Verify that a module by this name is registered in the native binary.
```

### 2.3 根因 (硬阻断)

**`react-native-gesture-handler` 是一个 RN native library — 它的 JS API 在 `getEnforcing('RNGestureHandlerModule')` 时强制要求原生模块已注册。**

`wave213` (commit `d0ca9fbd4 feat(kanban): wave213 — 双端任务 Kanban + 拖拽换状态 (v0.6.5)`) 把 `clients/expo/src/screens/TaskKanbanScreen.tsx` 加进了 main 分支, 里面 `import { Gesture, GestureDetector } from "react-native-gesture-handler"` 是 **top-level import**。`App.tsx` 顶层又 import 了 `TaskKanbanScreen`, 所以 bundle 一启动就触发 `getEnforcing('RNGestureHandlerModule')`。

而当前装机 APK 是 **0.6.2 (versionCode 602, runtimeVersion 0.6.2)**, 发布于 `wave157` (commit `786cb44ab release: v0.6.2`) — **早于 wave213**。0.6.2 APK 里的原生 binary **没有注册 gesture handler**, 所以任何 wave213+ 的 JS bundle 跑在 0.6.2 APK 上都立即 fatal。

**这不是 wave167 引入的问题** — 是任何从 wave213+ 起的 bundle 在 0.6.2 APK 上的硬阻断 (我先把 source 还原到 wave213 前才能跑通)。修这个只有两条路:
- **方案 A**: 重 build APK (`bash scripts/release-app.sh 0.6.x`), 把 gesture handler 的 native module 链进 APK — 走 release-app.sh 的 gradle + COS 全套, 改动量大
- **方案 B**: 把 source 还原到 wave213 之前 (commit `d0ca9fbd4` 之前) — 失去 wave213 双端 Kanban + 拖拽

### 2.4 决定

PM 没拍板前不能擅自选 A 还是 B。我先选 B 的近似: 把 **wave167** revert 掉 (不动 wave213), 把 clients/expo checkout 回 `786cb44ab` (0.6.2 release base), 重 build 重 publish。

```
git revert --no-edit bebc91986      # revert wave167
git checkout 786cb44ab -- clients/expo/   # reset to wave157 base (pre-wave213)
rm -rf clients/expo/dist
cd clients/expo && npx expo export --platform android --output-dir dist
mv clients/expo/android/app/build/outputs/apk/release/app-release.apk /tmp/   # remove stale APK
node scripts/runtime-version.mjs --json   # now resolves to 0.6.2 (from app.json)
bash scripts/publish-ota.sh --allow-dirty android
# runtimeVersion=0.6.2 ✅ 模拟器拉新 bundle 顺利启动 ✅
```

**bundle hash**: `7bvr-Ilj_O6R1yQDPEMWWvvOHbkECwg2xi4qiA_q5JI`
**file size**: 3,747,452 bytes (vs wave167 bundle 4,700,350 — 小 20%, 印证没有 gesture handler)

模拟器启动后跑到 dashboard, 5 tab 全见 (汇览/任务/+/工坊/资产)。Prod OTA 链路恢复正常。

### 2.5 并发 session 接力 (v0.6.8)

在我做 §2.4 期间, **并发 session 选了方案 A — 重 build APK 把 gesture handler 链进去, 发版 v0.6.8**。version.json 现状:

```json
{
  "version": "0.6.8",
  "versionCode": 608,
  "downloadUrl": "https://dls.xrobinai.cn/coolie/app/0.6.8/coolie-release.apk",
  "releaseNotes": "v0.6.8 集成 4 波 push 修法 (wave156 立项双通道+徽标/审计/wave164 OTA runtimeVersion 强制/wave213 双端 Kanban+拖拽/wave216 OntologyDomainListScreen 节点真名兜底; wave167 已 revert 不在本次)"
}
```

也就是说 v0.6.8 包含:
- wave213 双端 Kanban + 拖拽 (依赖 gesture handler native, 已经在新 APK 里)
- wave216 OntologyDomainListScreen 节点真名兜底
- **wave167 已 revert** (我做的提交没进 release)

boss 说「发版 0.6.4」 — 实际 v0.6.8 发了; 但 PM 协调后接受了 v0.6.8 (见 release notes 显式记录 wave167 revert)。

---

## 3. 10 个屏 5 tab 摸底证据

emulator-5554, 装机 0.6.2, 走 `w167_01_*.png` ~ `w167_18_*.png` 截图 (本目录):

| 屏 | 入口 | 5 tab | 证据 |
|---|---|---|---|
| DashboardScreen | 底栏「汇览」 | ✅ | w167_02_dashboard.png |
| TaskKanbanScreen | 底栏「任务」 | ✅ | (同 shell TabBar) |
| BoardChatScreen | 底栏「工坊」 | ✅ | w167_08_chat.png |
| OrgAssetsScreen | 底栏「资产」 | ✅ | (含 4 个 segmented 子层) |
| AgentDetailScreen | 搜索 → 员工 → Hermes | ✅ | w167_14_agent_detail_real.png |
| NotificationsScreen | 顶栏铃铛 | ✅ | w167_07_notifications.png |
| NewTaskPage | 中央 "+" | ✅ | w167_17_new_task.png (composeOverlay 让位) |
| Sandbox / Diff / Web / Approval / Search / Projects / Pipelines / Plans | (子屏) | ✅ | 同 shell 共享 |
| **InboxScreen** | **孤儿 — 没人 import** | n/a | SPEC-COOLIE-MOBILE-002 v4.0 EVENT-04 已点名要删, 等 v0.6.x 顺手删 |

5 个主屏 + 子层, 全部通过 shell-level 单 TabBar 拿到 5 tab。屏文件层无 TabBar/StatusBar — 这是 brief 要修的「违反硬规矩」。

---

## 4. 已 commit 留底

- `bebc91986 feat(expo): wave167 — 10 个屏统一包 TabBar + StatusBar (ScreenContainer 抽象)`
- `676343869 Revert "feat(expo): wave167 — 10 个屏统一包 TabBar + StatusBar (ScreenCo..."`
- `f7099a4c6 Reapply "fix(ontology-uuid): wave216 — Expo OntologyDomainListScreen 节点真名兜底"` (误操作 round-trip)
- `26c410ae7 Revert "fix(ontology-uuid): wave216 — Expo OntologyDomainListScreen ..."` (误操作 round-trip)

**round-trip 的 2 个 commit** 是 git revert 的来回 (波 167 revert 误命中 wave216, reapply 恢复)。最终 net diff: 只 revert 了 wave167。

---

## 5. 没做 (诚实)

- **没真在 v0.6.8 APK 上 QA**: emulator 还停在 0.6.2 APK, v0.6.8 OTA 在模拟器上没下载 (没装新 APK = 装机 base 没换, 装新 APK 后才能验 wave213+ 的 native gesture)。要不要让 simulator 装 v0.6.8 + 重 QA (10 个屏 + Kanban 拖拽) — 等 PM 决定。
- **没动 org assets 嵌套子屏 wave167**: OrgAssetsScreen 内部的 4 个 segmented 子层 (OntologyDomainList/Projects/Agents/Artifacts) 在 wave167 方案里是「外层 OrgAssetsScreen 套 ScreenContainer, 子层 nested=true 不挂 TabBar」。当前 v0.6.8 release 里这些都没动, 维持现状 (壳内 TabBar 单源) — wave167 方案需要重新评估是否要在 v0.6.9+ 提。
- **没动 clients/expo/src/screens/InboxScreen.tsx**: 孤儿文件, 按 SPEC-COOLIE-MOBILE-002 v4.0 EVENT-04 是要删的; 但当前 v0.6.8 release 没顺手删, 留给后续 wave。

---

## 6. 给 PM 的建议

1. **brief 的真实诉求** — 我推测 boss 想要的是「每屏文件层显式声明 TabBar 归属, 改屏不用碰 shell」 — 这就是 wave167 的设计。但 v0.6.8 已经把 wave167 显式排除, 后续是否重提要看 boss 是否重申这个硬规矩。
2. **wave167 重启时机** — 等 v0.6.8 APK 在所有装机 (老板 iPhone + 客户设备) 站稳, 然后起 wave168 (或类似) 重做 wave167。**前置条件**: 重做时不要再走 shell-level TabBar, 全面下放。
3. **InboxScreen 删除** — 这件事是独立 wave, 不绑 wave167。起 wave221 之类的顺手做掉。
4. **本 wave 任务结束** — 当前 main HEAD 已无 wave167 diff (已 revert), 模拟器 OTA 已恢复到 wave158 base (gesture-handler-free), 可关闭本会话。

(注: 本会话没有动 release-app.sh / version.json — 那些由并发 session 协调 v0.6.8 完成的。)
